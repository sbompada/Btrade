import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { db } from '../db.js';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_FOLDER_FILES = 500;
const GITHUB_API = 'https://api.github.com';

const githubHeaders = () => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'uni-share-market-importer',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

function githubError(response, fallback) {
  if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
    return new Error('GitHub API rate limit reached. Set GITHUB_TOKEN on the API server or try again later.');
  }
  if (response.status === 404) return new Error('GitHub repository, branch, or folder was not found.');
  return new Error(`${fallback} GitHub returned HTTP ${response.status}.`);
}

export function parseGitHubFolderUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('Enter a valid GitHub folder URL.');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
    throw new Error('Only https://github.com repository folder URLs are supported.');
  }

  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length < 5 || parts[2] !== 'tree') {
    throw new Error('Use a GitHub folder URL containing /tree/<branch>/<folder>.');
  }
  const [owner, repository, , branch, ...pathParts] = parts;
  if (!owner || !repository || !branch || !pathParts.length) {
    throw new Error('The GitHub URL must identify a repository branch and folder.');
  }
  return {
    owner,
    repository,
    branch,
    path: pathParts.join('/'),
    repositoryKey: `${owner}/${repository}`,
    url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tree/${encodeURIComponent(branch)}/${pathParts.map(encodeURIComponent).join('/')}`,
  };
}

const symbolFromFilename = (filename) => {
  const prefix = filename.split('__')[0] ?? '';
  return prefix.replace(/_MINUTE\.csv$/i, '').trim().toUpperCase();
};

export async function discoverGitHubMinuteFiles(folderUrl) {
  const source = parseGitHubFolderUrl(folderUrl);
  const encodedPath = source.path.split('/').map(encodeURIComponent).join('/');
  const apiUrl = `${GITHUB_API}/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/contents/${encodedPath}?ref=${encodeURIComponent(source.branch)}`;
  const response = await fetch(apiUrl, { headers: githubHeaders(), signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw githubError(response, 'Could not inspect the folder.');

  const entries = await response.json();
  if (!Array.isArray(entries)) throw new Error('The GitHub URL points to a file, not a folder.');
  const files = entries
    .filter((entry) => entry.type === 'file' && /(?:__|_)MINUTE\.csv$/i.test(entry.name))
    .slice(0, MAX_FOLDER_FILES)
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      symbol: symbolFromFilename(entry.name),
      size: entry.size,
      supported: entry.size > 0 && entry.size <= MAX_FILE_BYTES,
    }));

  return {
    source: {
      url: source.url,
      repository: source.repositoryKey,
      branch: source.branch,
      path: source.path,
    },
    files,
    maximumFileBytes: MAX_FILE_BYTES,
  };
}

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted && character === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      fields.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  fields.push(value);
  return fields;
}

const normaliseHeader = (value) => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase();
const priceOf = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
};

function minuteBucket(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 16);
}

const presentImport = (row) => ({
  id: row.id,
  repository: row.repository,
  branch: row.branch,
  path: row.source_path,
  filename: row.filename,
  symbol: row.symbol,
  totalRows: row.total_rows,
  importedMinuteRows: row.imported_minute_rows,
  duplicateMinuteRows: row.duplicate_minute_rows,
  importedDailyRows: row.imported_daily_rows,
  rejectedRows: row.rejected_rows,
  importedBy: row.imported_by_client_id,
  importedAt: row.imported_at,
});

export function listGitHubMinuteImports() {
  return db.prepare(`
    SELECT imports.*, users.client_id AS imported_by_client_id
    FROM github_minute_imports imports
    JOIN users ON users.id = imports.imported_by
    ORDER BY imports.imported_at DESC, imports.id DESC
    LIMIT 50
  `).all().map(presentImport);
}

export async function importGitHubMinuteFile({ folderUrl, filePath, userId }) {
  const discovery = await discoverGitHubMinuteFiles(folderUrl);
  const selected = discovery.files.find((file) => file.path === filePath);
  if (!selected) throw new Error('The selected minute CSV is not present in that GitHub folder.');
  if (!selected.supported) throw new Error('The selected file is empty or larger than 100 MB.');

  const source = parseGitHubFolderUrl(folderUrl);
  const rawPath = selected.path.split('/').map(encodeURIComponent).join('/');
  const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/${encodeURIComponent(source.branch)}/${rawPath}`;
  const response = await fetch(rawUrl, { headers: githubHeaders(), signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body) throw githubError(response, 'Could not download the selected file.');

  const insertMinute = db.prepare(`
    INSERT OR IGNORE INTO candles (symbol, interval, bucket, open, high, low, close)
    VALUES (?, '1m', ?, ?, ?, ?, ?)
  `);
  const insertDaily = db.prepare(`
    INSERT OR IGNORE INTO candles (symbol, interval, bucket, open, high, low, close)
    VALUES (?, '1d', ?, ?, ?, ?, ?)
  `);
  const daily = new Map();
  let positions;
  let totalRows = 0;
  let validRows = 0;
  let importedMinuteRows = 0;
  let rejectedRows = 0;

  db.exec('BEGIN IMMEDIATE');
  try {
    const lines = createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!positions) {
        const headers = parseCsvLine(line).map(normaliseHeader);
        positions = Object.fromEntries(['timestamp', 'open', 'high', 'low', 'close'].map((field) => [field, headers.indexOf(field)]));
        const missing = Object.entries(positions).filter(([, index]) => index < 0).map(([field]) => field);
        if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);
        continue;
      }
      if (!line.trim()) continue;
      totalRows += 1;
      const fields = parseCsvLine(line);
      const timestamp = String(fields[positions.timestamp] ?? '').trim();
      const bucket = minuteBucket(timestamp);
      const day = /^(\d{4}-\d{2}-\d{2})/.exec(timestamp)?.[1] ?? null;
      const open = priceOf(fields[positions.open]);
      const high = priceOf(fields[positions.high]);
      const low = priceOf(fields[positions.low]);
      const close = priceOf(fields[positions.close]);
      const validPrices = [open, high, low, close].every((price) => price !== null && price > 0)
        && high >= Math.max(open, close)
        && low <= Math.min(open, close);
      if (!bucket || !day || !validPrices) {
        rejectedRows += 1;
        continue;
      }

      validRows += 1;
      importedMinuteRows += insertMinute.run(selected.symbol, bucket, open, high, low, close).changes;
      const aggregate = daily.get(day);
      if (!aggregate) daily.set(day, { open, high, low, close });
      else {
        aggregate.high = Math.max(aggregate.high, high);
        aggregate.low = Math.min(aggregate.low, low);
        aggregate.close = close;
      }
    }
    if (!positions) throw new Error('The selected file is empty.');
    if (!validRows) throw new Error('The selected file contains no valid minute rows.');

    let importedDailyRows = 0;
    for (const [day, candle] of daily) {
      importedDailyRows += insertDaily.run(
        selected.symbol,
        day,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
      ).changes;
    }

    db.prepare(`
      INSERT INTO github_minute_imports
        (repository, branch, source_path, filename, symbol, total_rows,
         imported_minute_rows, duplicate_minute_rows, imported_daily_rows, rejected_rows, imported_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (repository, branch, source_path) DO UPDATE SET
        total_rows = excluded.total_rows,
        imported_minute_rows = excluded.imported_minute_rows,
        duplicate_minute_rows = excluded.duplicate_minute_rows,
        imported_daily_rows = excluded.imported_daily_rows,
        rejected_rows = excluded.rejected_rows,
        imported_by = excluded.imported_by,
        imported_at = datetime('now')
    `).run(
      discovery.source.repository,
      discovery.source.branch,
      selected.path,
      selected.name,
      selected.symbol,
      totalRows,
      importedMinuteRows,
      validRows - importedMinuteRows,
      importedDailyRows,
      rejectedRows,
      userId,
    );
    db.exec('COMMIT');

    return listGitHubMinuteImports().find((item) => item.path === selected.path
      && item.repository === discovery.source.repository
      && item.branch === discovery.source.branch);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}