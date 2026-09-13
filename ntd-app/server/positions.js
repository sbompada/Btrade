import { db } from './db.js';

/**
 * Open positions are account state, like funds — the server owns them so that
 * margin can be computed from something the client cannot edit.
 *
 * Deliberately no LTP or P&L here: the browser already has a live tick stream,
 * so it merges these records with current prices itself. Returning a price with
 * the record would be stale the moment it was sent.
 */

const SEED = {
  MN7315: [
    { instrument: 'NIFTY AUG 24250 CE', exchange: 'NFO', product: 'NRML', qty: 75, avg_price: 96.4 },
    { instrument: 'NIFTY AUG 24150 PE', exchange: 'NFO', product: 'NRML', qty: 75, avg_price: 131.2 },
    { instrument: 'BANKNIFTY AUG 52000 PE', exchange: 'NFO', product: 'NRML', qty: 30, avg_price: 264.8 },
    { instrument: 'NIFTY AUG 24350 CE', exchange: 'NFO', product: 'NRML', qty: 150, avg_price: 58.15 },
  ],
  // A written option, so at least one account shows margin that moves with spot.
  AB1042: [
    { instrument: 'NIFTY AUG 24400 CE', exchange: 'NFO', product: 'NRML', qty: -75, avg_price: 38.5 },
    { instrument: 'NIFTY AUG 24250 CE', exchange: 'NFO', product: 'NRML', qty: 75, avg_price: 104.25 },
  ],
  RK8891: [],
  ADMIN01: [],
};

export function seedPositions() {
  const users = db.prepare('SELECT id, client_id FROM users').all();
  const exists = db.prepare('SELECT 1 FROM open_positions WHERE user_id = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT INTO open_positions (user_id, instrument, exchange, product, qty, avg_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let created = 0;
  for (const user of users) {
    if (exists.get(user.id)) continue;
    for (const p of SEED[user.client_id] ?? []) {
      insert.run(user.id, p.instrument, p.exchange, p.product, p.qty, p.avg_price);
      created += 1;
    }
  }
  return created;
}

export const positionRowsFor = (userId) =>
  db.prepare('SELECT * FROM open_positions WHERE user_id = ? ORDER BY id').all(userId);

export const presentPosition = (row) => ({
  instrument: row.instrument,
  exchange: row.exchange,
  product: row.product,
  qty: row.qty,
  avg: row.avg_price,
});
