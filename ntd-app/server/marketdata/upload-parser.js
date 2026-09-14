import readXlsxFile from 'read-excel-file/node';

const MAX_ROWS = 100_000;

const aliases = {
  symbol: ['SYMBOL', 'TCKRSYMB', 'SCNAME', 'SCCODE'],
  date: ['TIMESTAMP', 'TRADDT', 'TRADINGDATE', 'DATE1', 'DATE'],
  open: ['OPEN', 'OPNPRIC', 'OPENPRICE'],
  high: ['HIGH', 'HGHPRIC', 'HIGHPRICE'],
  low: ['LOW', 'LWPRIC', 'LOWPRICE'],
  close: ['CLOSE', 'CLSPRIC', 'CLOSEPRICE'],
};

const normaliseHeader = (value) => String(value ?? '').replace(/^\uFEFF/, '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof value === 'number' && value > 20_000 && value < 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  }

  const text = String(value ?? '').trim();
  let match = /^(\d{4})[-/]([01]\d)[-/]([0-3]\d)/.exec(text);
  if (match) return validDate(match[1], match[2], match[3]);
  match = /^([0-3]?\d)[-\/]([01]?\d)[-\/](\d{4})$/.exec(text);
  if (match) return validDate(match[3], match[2], match[1]);

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function validDate(yearValue, monthValue, dayValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${yearValue.padStart(4, '0')}-${monthValue.padStart(2, '0')}-${dayValue.padStart(2, '0')}`;
}

const numberOf = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
};

export async function parseMarketUpload(buffer, extension) {
  const matrix = extension === 'xlsx'
    ? await readXlsxFile(buffer)
    : parseCsv(buffer.toString('utf8'));

  if (!matrix.length) throw new Error('The file is empty.');
  if (matrix.length - 1 > MAX_ROWS) throw new Error(`A file can contain at most ${MAX_ROWS.toLocaleString('en-IN')} data rows.`);

  const headers = matrix[0].map(normaliseHeader);
  const positions = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [
    field,
    headers.findIndex((header) => names.includes(header)),
  ]));
  const missing = Object.entries(positions).filter(([, index]) => index < 0).map(([field]) => field);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

  const rows = [];
  const errors = [];
  let rejectedRows = 0;
  for (let index = 1; index < matrix.length; index += 1) {
    const source = matrix[index];
    if (!source.some((value) => String(value ?? '').trim())) continue;

    const symbol = String(source[positions.symbol] ?? '').trim().toUpperCase();
    const date = isoDate(source[positions.date]);
    const open = numberOf(source[positions.open]);
    const high = numberOf(source[positions.high]);
    const low = numberOf(source[positions.low]);
    const close = numberOf(source[positions.close]);
    const prices = [open, high, low, close];
    const validPrices = prices.every((price) => price !== null && price > 0)
      && high >= Math.max(open, close)
      && low <= Math.min(open, close);

    if (!symbol || !date || !validPrices) {
      rejectedRows += 1;
      if (errors.length < 5) errors.push(`Row ${index + 1}: invalid symbol, date, or OHLC values.`);
      continue;
    }
    rows.push({ symbol, date, open, high, low, close });
  }

  if (!rows.length) throw new Error(errors[0] ?? 'The file contains no valid market rows.');
  return { rows, totalRows: matrix.length - 1, rejectedRows, errors };
}