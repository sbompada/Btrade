/**
 * Turns an exchange bhavcopy into the feed's seed file.
 *
 *   npm run market:import -- --file BhavCopy_NSE_CM_0_0_0_20260911_F_0000.csv
 *   npm run market:import -- --file EQ_ISINCODE_110926.CSV --exchange BSE
 *   npm run market:import -- --file <equities.csv> --indices ind_close_all_11092026.csv
 *
 * Download the file yourself from nseindia.com or bseindia.com (daily reports /
 * market data) — this reads a local path rather than fetching, because the
 * archive URL formats change periodically and a silently broken download is a
 * worse failure than an obvious manual step.
 *
 * Columns are matched by name, not position, so both the legacy and the newer
 * UDiFF layouts work without a flag.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = resolve(here, 'seed.json');

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    indices: { type: 'string' },
    exchange: { type: 'string', default: 'NSE' },
    series: { type: 'string' },
    symbols: { type: 'string' },
    out: { type: 'string' },
    limit: { type: 'string' },
    replace: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

if (values.help || !values.file) {
  console.log(`
  Bhavcopy -> seed.json

    --file <path>       equity bhavcopy CSV (required)
    --indices <path>    index close file, e.g. NSE ind_close_all_DDMMYYYY.csv
    --exchange NSE|BSE  defaults to NSE
    --series EQ         instrument series to keep (default EQ for NSE, A,B for BSE)
    --symbols A,B,C     only these; defaults to whatever seed.json already tracks
    --limit N           after filtering, keep the N most traded
    --replace           drop existing seed instruments instead of merging
    --out <path>        defaults to server/marketdata/seed.json
`);
  process.exit(values.help ? 0 : 1);
}

/* ---------------- CSV ---------------- */

/** Minimal RFC-4180 parse: handles quoted fields containing commas and quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) die('The file is empty.');
  const header = rows[0].map((h) => h.trim().toUpperCase());
  return rows.slice(1)
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** First present alias wins — this is what makes both layouts work. */
const pick = (row, ...aliases) => {
  for (const a of aliases) if (row[a] !== undefined && row[a] !== '') return row[a];
  return undefined;
};

const toNumber = (value) => {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/* ---------------- mapping ---------------- */

const FIELDS = {
  symbol: ['SYMBOL', 'TCKRSYMB', 'SC_NAME', 'SC_CODE'],
  series: ['SERIES', 'SCTYSRS', 'SC_GROUP'],
  open: ['OPEN', 'OPNPRIC', 'OPEN_PRICE'],
  high: ['HIGH', 'HGHPRIC', 'HIGH_PRICE'],
  low: ['LOW', 'LWPRIC', 'LOW_PRICE'],
  close: ['CLOSE', 'CLSPRIC', 'CLOSE_PRICE'],
  prevClose: ['PREVCLOSE', 'PRVSCLSGPRIC', 'PREV_CLOSE'],
  // TTL_TRD_QNTY / DATE1 are the sec_bhavdata_full layout, whose headers also
  // carry leading spaces — the CSV reader trims them before these are matched.
  volume: ['TOTTRDQTY', 'TTLTRADGVOL', 'TTL_TRD_QNTY', 'NO_OF_SHRS', 'VOLUME'],
  tradedOn: ['TIMESTAMP', 'TRADDT', 'TRADING_DATE', 'DATE1', 'DATE'],
  instrumentType: ['FININSTRMTP'],
};

/**
 * Per-tick step size, derived from the day's high-low range so a volatile
 * instrument visibly moves more than a calm one.
 *
 * The divisor is tuned for legible movement on screen, not taken from the
 * session tick count — spreading the range over ~11k ticks is arithmetically
 * honest but leaves every instrument pinned at the floor and looking frozen.
 * This is a display heuristic; it preserves the relative ordering between
 * instruments and nothing more.
 */
const RANGE_TO_TICK = 20;

function volatilityFrom(high, low, close) {
  if (!high || !low || !close) return 0.002;
  const range = (high - low) / close;
  return Math.min(Math.max(range / RANGE_TO_TICK, 0.0002), 0.02);
}

const tickSizeFor = (price) => (price >= 10000 ? 1 : 0.05);

/* ---------------- read ---------------- */

const exchange = values.exchange.toUpperCase();
if (!['NSE', 'BSE'].includes(exchange)) die('--exchange must be NSE or BSE.');

/** A wrong path is the most likely mistake here; say so in one line. */
function readCsvOrDie(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      die(
        `No ${label} at:\n    ${resolve(path)}\n\n` +
          '  Check the file has finished downloading and that the path is right.\n' +
          '  On Windows, dragging the file into the terminal pastes its exact path.',
      );
    }
    if (err.code === 'EISDIR') die(`${resolve(path)} is a folder — point --file at the .csv inside it.`);
    if (err.code === 'EACCES') die(`No permission to read ${resolve(path)}.`);
    die(`Could not read the ${label}: ${err.message}`);
  }
}

if (values.file.toLowerCase().endsWith('.zip')) {
  die('That is a .zip — extract it first and point --file at the .csv inside.');
}

const rows = parseCsv(readCsvOrDie(values.file, 'bhavcopy file'));
if (!rows.length) die('No data rows found.');

const seriesFilter = (values.series ?? (exchange === 'BSE' ? 'A,B' : 'EQ'))
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const existing = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
const wanted = values.symbols
  ? new Set(values.symbols.split(',').map((s) => s.trim().toUpperCase()))
  : new Set(existing.instruments.map((i) => i.symbol.toUpperCase()));

let skippedSeries = 0;
let skippedPrice = 0;
const parsed = [];

for (const row of rows) {
  const symbol = pick(row, ...FIELDS.symbol)?.toUpperCase();
  if (!symbol) continue;

  // UDiFF files carry derivatives in the same layout; equities only here.
  const instrumentType = pick(row, ...FIELDS.instrumentType);
  if (instrumentType && !['STK', 'EQ'].includes(instrumentType.toUpperCase())) continue;

  const series = pick(row, ...FIELDS.series)?.toUpperCase();
  if (series && seriesFilter.length && !seriesFilter.includes(series)) {
    skippedSeries += 1;
    continue;
  }

  const close = toNumber(pick(row, ...FIELDS.close));
  if (!close || close <= 0) {
    skippedPrice += 1;
    continue;
  }

  const high = toNumber(pick(row, ...FIELDS.high));
  const low = toNumber(pick(row, ...FIELDS.low));

  parsed.push({
    symbol,
    exchange,
    // The feed opens at the previous close; today's close becomes tomorrow's.
    prevClose: Number(close.toFixed(2)),
    tickSize: tickSizeFor(close),
    volatility: Number(volatilityFrom(high, low, close).toFixed(5)),
    volume: toNumber(pick(row, ...FIELDS.volume)) ?? 0,
    tradedOn: pick(row, ...FIELDS.tradedOn),
    // Kept for the daily candle; stripped before the seed is written.
    bar: { open: toNumber(pick(row, ...FIELDS.open)), high, low, close },
  });
}

if (!parsed.length) {
  die(
    `Parsed ${rows.length} rows but kept none. Headers seen: ${Object.keys(rows[0]).slice(0, 12).join(', ')}. ` +
      'Check --exchange and --series.',
  );
}

let selected = parsed.filter((p) => wanted.has(p.symbol));
const matched = selected.length;

if (values.limit) {
  const extra = parsed
    .filter((p) => !wanted.has(p.symbol))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, Math.max(Number(values.limit) - selected.length, 0));
  selected = [...selected, ...extra];
}

if (!selected.length) die('None of the tracked symbols appear in this file. Use --symbols or --limit.');

/* ---------------- index file ---------------- */

/** NSE's own names for indices differ from the ones the app displays. */
const INDEX_ALIASES = {
  'NIFTY BANK': 'BANK NIFTY',
  'NIFTY BANK INDEX': 'BANK NIFTY',
};

const indices = [];
if (values.indices) {
  for (const row of parseCsv(readCsvOrDie(values.indices, 'index file'))) {
    // The PR bundle's pd<date>.csv mixes indices and securities in one file;
    // IND_SEC marks the index rows. Other layouts have no such column.
    if (row.IND_SEC !== undefined && row.IND_SEC.toUpperCase() !== 'Y') continue;

    const raw = pick(row, 'INDEX NAME', 'INDEXNAME', 'INDEX_NAME', 'SECURITY')?.toUpperCase();
    const close = toNumber(
      pick(row, 'CLOSING INDEX VALUE', 'CLOSING_INDEX_VALUE', 'CLOSE_PRICE', 'CLOSE'),
    );
    if (!raw || !close) continue;

    const name = INDEX_ALIASES[raw] ?? raw;
    // NSE publishes hundreds of sector indices; keep only the tracked ones.
    if (!wanted.has(name)) continue;

    const high = toNumber(pick(row, 'HIGH INDEX VALUE', 'HIGH_PRICE', 'HIGH'));
    const low = toNumber(pick(row, 'LOW INDEX VALUE', 'LOW_PRICE', 'LOW'));

    indices.push({
      symbol: name,
      exchange: 'IDX',
      prevClose: Number(close.toFixed(2)),
      tickSize: 0.05,
      volatility: Number(volatilityFrom(high, low, close).toFixed(5)),
      bar: { open: toNumber(pick(row, 'OPEN INDEX VALUE', 'OPEN_PRICE', 'OPEN')), high, low, close },
    });
  }
}

/* ---------------- write ---------------- */

const clean = ({ volume: _v, tradedOn: _t, bar: _b, ...rest }) => rest;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "11-Sep-2026" or "2026-09-11" -> "2026-09-11"; anything else -> null. */
function normaliseDay(value) {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toUpperCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Instruments the file cannot supply — F&O contracts, indices without an index
// file — keep their existing values rather than vanishing from the app.
const bySymbol = new Map();
if (!values.replace) for (const inst of existing.instruments) bySymbol.set(inst.symbol, inst);
for (const inst of indices) bySymbol.set(inst.symbol, inst);
for (const inst of selected) bySymbol.set(inst.symbol, clean(inst));

const tradingDay = selected.find((s) => s.tradedOn)?.tradedOn ?? existing.tradingDay;

const output = {
  tradingDay,
  source: `bhavcopy:${exchange}`,
  importedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  note: 'Previous-day closes imported from an exchange bhavcopy. Not a live feed.',
  instruments: [...bySymbol.values()],
};

const outPath = values.out ?? SEED_PATH;
writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);

/**
 * Each import also lays down one daily candle per instrument, so the longer
 * chart ranges gain a real data point per file rather than staying empty.
 * Only when writing the live seed — a --out dry run leaves the database alone.
 */
let candlesWritten = 0;
if (!values.out) {
  const { writeDailyCandle } = await import('./candles.js');
  const day = normaliseDay(tradingDay);
  if (day) {
    for (const row of [...selected, ...indices]) {
      writeDailyCandle(row.symbol, day, { ...row.bar, close: row.prevClose });
      candlesWritten += 1;
    }
  } else {
    console.warn(`  (could not read a date from "${tradingDay}" — no daily candles written)`);
  }
}

console.log(`
  Read      ${rows.length} rows from ${values.file}
  Kept      ${parsed.length} after series/price filters${skippedSeries ? ` (${skippedSeries} wrong series)` : ''}${skippedPrice ? ` (${skippedPrice} no price)` : ''}
  Matched   ${matched} of ${wanted.size} tracked symbols${values.limit ? `, topped up to ${selected.length} by volume` : ''}
  Indices   ${indices.length}${values.indices ? '' : ' (no --indices file; existing index values kept)'}
  Wrote     ${output.instruments.length} instruments to ${outPath}
  Candles   ${candlesWritten} daily candles stored
  Day       ${tradingDay}

  Restart the API to pick it up.
`);
