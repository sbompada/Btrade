import { db } from '../db.js';

/**
 * Candle store.
 *
 * Minute candles are built from the live feed as it runs, so a 1D chart is real
 * history rather than a drawn line. Daily candles come from bhavcopy imports —
 * one row per instrument per trading day — so longer ranges fill in as more
 * files are imported.
 *
 * Nothing here invents data. A range with too few candles returns what exists
 * and says so; the chart shows that honestly instead of drawing a plausible
 * shape nobody measured.
 */

const RANGES = {
  '1D': { interval: '1m', days: 1 },
  '1W': { interval: '1d', days: 7 },
  '1M': { interval: '1d', days: 31 },
  '1Y': { interval: '1d', days: 366 },
  '5Y': { interval: '1d', days: 1827 },
};

export const isRange = (r) => Object.hasOwn(RANGES, r);

/** Open candles live in memory and are written once the minute closes. */
const building = new Map();

const minuteKey = (ts) => new Date(ts).toISOString().slice(0, 16);

const upsert = db.prepare(`
  INSERT INTO candles (symbol, interval, bucket, open, high, low, close)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (symbol, interval, bucket) DO UPDATE SET
    high = max(high, excluded.high),
    low = min(low, excluded.low),
    close = excluded.close
`);

export function recordTick(tick) {
  const bucket = minuteKey(tick.ts);
  const open = building.get(tick.symbol);

  if (!open || open.bucket !== bucket) {
    if (open) flushOne(tick.symbol, open);
    building.set(tick.symbol, {
      bucket,
      open: tick.ltp,
      high: tick.ltp,
      low: tick.ltp,
      close: tick.ltp,
    });
    return;
  }

  open.high = Math.max(open.high, tick.ltp);
  open.low = Math.min(open.low, tick.ltp);
  open.close = tick.ltp;
}

function flushOne(symbol, candle) {
  upsert.run(symbol, '1m', candle.bucket, candle.open, candle.high, candle.low, candle.close);
}

/** Write every open candle — call before shutdown so the last minute is not lost. */
export function flushAll() {
  for (const [symbol, candle] of building) flushOne(symbol, candle);
}

export const writeMinuteCandle = (symbol, bucket, { open, high, low, close }) =>
  upsert.run(symbol, '1m', bucket, open, high, low, close);

export const writeDailyCandle = (symbol, date, { open, high, low, close }) =>
  upsert.run(symbol, '1d', date, open ?? close, high ?? close, low ?? close, close);

export function history(symbol, range) {
  const spec = RANGES[range];
  if (!spec) return null;

  const since = new Date(Date.now() - spec.days * 86_400_000)
    .toISOString()
    .slice(0, spec.interval === '1m' ? 16 : 10);

  const rows = db
    .prepare(
      `SELECT bucket, open, high, low, close FROM candles
       WHERE symbol = ? AND interval = ? AND bucket >= ?
       ORDER BY bucket`,
    )
    .all(symbol, spec.interval, since);

  // The candle still being built is not in the table yet, but the chart should
  // reach the current price rather than stopping a minute short.
  const open = building.get(symbol);
  if (spec.interval === '1m' && open && (!rows.length || rows.at(-1).bucket !== open.bucket)) {
    rows.push({ bucket: open.bucket, open: open.open, high: open.high, low: open.low, close: open.close });
  }

  return {
    symbol,
    range,
    interval: spec.interval,
    candles: rows,
    /** Two points is a line, not a chart — below this the UI says so. */
    sufficient: rows.length >= 5,
  };
}
