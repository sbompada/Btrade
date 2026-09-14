import { db } from './db.js';
import { istDateKey } from './time.js';

/**
 * Demat holdings — settled stock, as opposed to intraday/F&O positions.
 *
 * Like positions, these are records only: quantity and average cost. Current
 * value, P&L and day change are all price-dependent, so the browser derives
 * them from the live feed rather than trusting a number the server sent a
 * moment ago.
 *
 * Average cost is what the investor actually paid, so it is never recalculated
 * from market data — only a buy, a sell or a corporate action changes it.
 */

const SEED = {
  MN7315: [
    { symbol: 'RELIANCE', qty: 120, avg_cost: 1105.4 },
    { symbol: 'HDFCBANK', qty: 150, avg_cost: 642.8 },
    { symbol: 'TCS', qty: 40, avg_cost: 2410.0 },
    { symbol: 'INFY', qty: 100, avg_cost: 945.25 },
    { symbol: 'ICICIBANK', qty: 90, avg_cost: 1180.6 },
    { symbol: 'SBIN', qty: 200, avg_cost: 812.35, pledged_qty: 100 },
    { symbol: 'ITC', qty: 400, avg_cost: 274.1 },
    { symbol: 'AXISBANK', qty: 75, avg_cost: 1092.4 },
    { symbol: 'LT', qty: 25, avg_cost: 3480.9 },
    { symbol: 'BHARTIARTL', qty: 60, avg_cost: 1605.75 },
    { symbol: 'ADANIENT', qty: 30, avg_cost: 2890.25 },
    { symbol: 'TATAMOTORS', qty: 100, avg_cost: 745.6 },
  ],
  AB1042: [
    { symbol: 'RELIANCE', qty: 500, avg_cost: 1188.2 },
    { symbol: 'LT', qty: 120, avg_cost: 3702.55 },
    { symbol: 'BHARTIARTL', qty: 200, avg_cost: 1742.9 },
    { symbol: 'ITC', qty: 1200, avg_cost: 245.3, pledged_qty: 600 },
  ],
  RK8891: [],
  ADMIN01: [],
};

export function seedHoldings() {
  const users = db.prepare('SELECT id, client_id FROM users').all();
  const exists = db.prepare('SELECT 1 FROM holdings WHERE user_id = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT INTO holdings (user_id, symbol, exchange, qty, avg_cost, pledged_qty)
    VALUES (?, ?, 'NSE', ?, ?, ?)
  `);

  let created = 0;
  for (const user of users) {
    if (exists.get(user.id)) continue;
    for (const h of SEED[user.client_id] ?? []) {
      insert.run(user.id, h.symbol, h.qty, h.avg_cost, h.pledged_qty ?? 0);
      created += 1;
    }
  }
  return created;
}

export const holdingRowsFor = (userId) =>
  db.prepare('SELECT * FROM holdings WHERE user_id = ? ORDER BY symbol').all(userId);

export const presentHolding = (row) => ({
  symbol: row.symbol,
  exchange: row.exchange,
  qty: row.qty,
  avgCost: row.avg_cost,
  pledgedQty: row.pledged_qty,
});

export const unsettledHoldingsFor = (userId) => db.prepare(`
  SELECT instrument, exchange, qty, avg_price, opened_at
  FROM open_positions
  WHERE user_id = ? AND product = 'CNC' AND qty > 0
  ORDER BY opened_at DESC, instrument
`).all(userId).map((row) => ({
  symbol: row.instrument,
  exchange: row.exchange,
  qty: row.qty,
  avgCost: row.avg_price,
  openedAt: row.opened_at,
  settlementStatus: istDateKey(new Date(`${row.opened_at.replace(' ', 'T')}Z`)) === istDateKey() ? 'TODAY' : 'T1',
}));
