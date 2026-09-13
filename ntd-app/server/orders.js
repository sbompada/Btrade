import { db } from './db.js';

const findPosition = db.prepare(
  'SELECT * FROM open_positions WHERE user_id = ? AND instrument = ? AND product = ?',
);
const insertPosition = db.prepare(
  `INSERT INTO open_positions (user_id, instrument, exchange, product, qty, avg_price)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
const updatePosition = db.prepare('UPDATE open_positions SET qty = ?, avg_price = ? WHERE id = ?');
const deletePosition = db.prepare('DELETE FROM open_positions WHERE id = ?');
const insertOrder = db.prepare(
  `INSERT INTO orders (user_id, side, instrument, exchange, product, qty, price)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

function applyFill(userId, { side, instrument, exchange, product, qty, price }) {
  const signedQty = side === 'BUY' ? qty : -qty;
  const existing = findPosition.get(userId, instrument, product);

  if (!existing) {
    insertPosition.run(userId, instrument, exchange, product, signedQty, price);
    return;
  }

  const nextQty = existing.qty + signedQty;
  if (nextQty === 0) {
    deletePosition.run(existing.id);
    return;
  }

  let nextAverage = existing.avg_price;
  if (Math.sign(existing.qty) === Math.sign(signedQty)) {
    nextAverage =
      (Math.abs(existing.qty) * existing.avg_price + Math.abs(signedQty) * price) /
      Math.abs(nextQty);
  } else if (Math.sign(existing.qty) !== Math.sign(nextQty)) {
    nextAverage = price;
  }

  updatePosition.run(nextQty, nextAverage, existing.id);
}

export function placeMarketOrder(userId, order) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = insertOrder.run(
      userId,
      order.side,
      order.instrument,
      order.exchange,
      order.product,
      order.qty,
      order.price,
    );
    applyFill(userId, order);
    db.exec('COMMIT');
    return orderFor(userId, Number(result.lastInsertRowid));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function orderFor(userId, orderId) {
  return presentOrder(db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, userId));
}

export function ordersFor(userId) {
  return db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 200')
    .all(userId)
    .map(presentOrder);
}

function presentOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    time: `${row.created_at.slice(11, 19)} UTC`,
    side: row.side,
    instrument: row.instrument,
    exchange: row.exchange,
    product: row.product,
    filled: row.qty,
    qty: row.qty,
    avgPrice: row.price,
    status: row.status,
  };
}