import { db } from './db.js';
import { istDateKey, istTime } from './time.js';

const findPosition = db.prepare(
  'SELECT * FROM open_positions WHERE user_id = ? AND instrument = ? AND product = ?',
);
const insertPosition = db.prepare(
  `INSERT INTO open_positions (user_id, instrument, exchange, product, qty, avg_price, conversion_blocked)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);
const updatePosition = db.prepare('UPDATE open_positions SET qty = ?, avg_price = ?, conversion_blocked = ? WHERE id = ?');
const deletePosition = db.prepare('DELETE FROM open_positions WHERE id = ?');
const insertOrder = db.prepare(
  `INSERT INTO orders
   (user_id, side, instrument, exchange, product, qty, price, variety, trigger_price,
    order_type, limit_price, is_amo, iceberg_legs, filled_qty, status,
    validity, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertFill = db.prepare(
  'INSERT INTO order_fills (order_id, user_id, quantity, price) VALUES (?, ?, ?, ?)',
);

function applyFill(userId, { side, instrument, exchange, product, qty, price, variety }) {
  const signedQty = side === 'BUY' ? qty : -qty;
  const existing = findPosition.get(userId, instrument, product);

  if (!existing) {
    insertPosition.run(userId, instrument, exchange, product, signedQty, price, variety === 'CO' ? 1 : 0);
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

  updatePosition.run(nextQty, nextAverage, existing.conversion_blocked || variety === 'CO' ? 1 : 0, existing.id);
}

function canFill(order, price) {
  if (order.orderType === 'MARKET') return true;
  if (order.orderType === 'LIMIT') return order.side === 'BUY' ? price <= order.limitPrice : price >= order.limitPrice;
  const triggered = order.side === 'BUY' ? price >= order.triggerPrice : price <= order.triggerPrice;
  if (order.orderType === 'SL-M') return triggered;
  const marketable = order.side === 'BUY' ? price <= order.limitPrice : price >= order.limitPrice;
  return triggered && marketable;
}

function insert(userId, order, status, filledQty, price) {
  return insertOrder.run(
    userId,
    order.side,
    order.instrument,
    order.exchange,
    order.product,
    order.qty,
    price,
    order.variety,
    order.triggerPrice ?? null,
    order.orderType,
    order.limitPrice ?? null,
    order.isAmo ? 1 : 0,
    order.icebergLegs ?? null,
    filledQty,
    status,
    order.validity ?? 'DAY',
    order.expiresAt ?? null,
  );
}

export function placeOrder(userId, order) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const fillsNow = !order.isAmo && canFill(order, order.price);
    const firstFill = fillsNow
      ? order.icebergLegs
        ? Math.min(order.qty, Math.ceil(order.qty / order.icebergLegs))
        : order.qty
      : 0;
    const status = order.isAmo
      ? 'AMO PENDING'
      : fillsNow && firstFill === order.qty
        ? 'COMPLETE'
        : fillsNow
          ? 'OPEN'
        : order.validity === 'IOC'
          ? 'CANCELLED'
        : order.orderType.startsWith('SL')
          ? 'TRIGGER PENDING'
          : 'OPEN';
    const result = insert(userId, order, status, firstFill, firstFill ? order.price : 0);
    if (firstFill) {
      insertFill.run(result.lastInsertRowid, userId, firstFill, order.price);
      applyFill(userId, { ...order, qty: firstFill });
    }
    db.exec('COMMIT');
    return orderFor(userId, Number(result.lastInsertRowid));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function processPendingOrders(tick) {
  const rows = db.prepare(
    "SELECT * FROM orders WHERE instrument = ? AND status IN ('OPEN', 'TRIGGER PENDING', 'AMO PENDING') ORDER BY id",
  ).all(tick.symbol);
  for (const row of rows) {
    if (row.expires_at && Date.now() >= new Date(`${row.expires_at}Z`).getTime()) {
      db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(row.id);
      continue;
    }
    const order = {
      ...row,
      orderType: row.order_type,
      limitPrice: row.limit_price,
      triggerPrice: row.trigger_price,
    };
    if (row.status === 'AMO PENDING') {
      const createdDay = istDateKey(new Date(`${row.created_at.replace(' ', 'T')}Z`));
      const tickDay = istDateKey(new Date(tick.ts));
      if (tickDay <= createdDay) continue;
      order.isAmo = false;
      row.status = order.orderType.startsWith('SL') ? 'TRIGGER PENDING' : 'OPEN';
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(row.status, row.id);
    }
    if (!canFill(order, tick.ltp)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      const remaining = row.qty - row.filled_qty;
      const fillQty = row.iceberg_legs ? Math.min(remaining, Math.ceil(row.qty / row.iceberg_legs)) : remaining;
      const nextFilled = row.filled_qty + fillQty;
      const averagePrice = ((row.price * row.filled_qty) + (tick.ltp * fillQty)) / nextFilled;
      const status = nextFilled === row.qty ? 'COMPLETE' : 'OPEN';
      const changed = db.prepare(
        "UPDATE orders SET status = ?, filled_qty = ?, price = ? WHERE id = ? AND status IN ('OPEN', 'TRIGGER PENDING', 'AMO PENDING')",
      ).run(status, nextFilled, averagePrice, row.id);
      if (changed.changes) {
        insertFill.run(row.id, row.user_id, fillQty, tick.ltp);
        applyFill(row.user_id, { ...row, qty: fillQty, price: tick.ltp });
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function cancelOrder(userId, orderId) {
  const result = db.prepare(
    "UPDATE orders SET status = 'CANCELLED' WHERE id = ? AND user_id = ? AND status IN ('OPEN', 'TRIGGER PENDING', 'AMO PENDING')",
  ).run(orderId, userId);
  return result.changes ? orderFor(userId, orderId) : null;
}

export function modifyOrder(userId, orderId, changes) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare(
      "SELECT * FROM orders WHERE id = ? AND user_id = ? AND status IN ('OPEN', 'TRIGGER PENDING', 'AMO PENDING')",
    ).get(orderId, userId);
    if (!current) {
      db.exec('ROLLBACK');
      return null;
    }
    if (changes.qty <= current.filled_qty) {
      db.exec('ROLLBACK');
      return { error: 'invalid_quantity', message: `Quantity must exceed the ${current.filled_qty} shares already filled.` };
    }
    if (current.iceberg_legs && changes.qty < current.iceberg_legs) {
      db.exec('ROLLBACK');
      return { error: 'invalid_iceberg', message: 'Quantity must be at least the number of iceberg legs.' };
    }
    const result = db.prepare(`
      UPDATE orders
      SET qty = ?, limit_price = ?, trigger_price = ?, validity = ?, expires_at = ?, modified_at = datetime('now')
      WHERE id = ? AND user_id = ? AND status IN ('OPEN', 'TRIGGER PENDING', 'AMO PENDING')
    `).run(changes.qty, changes.limitPrice, changes.triggerPrice, changes.validity, changes.expiresAt, orderId, userId);
    if (!result.changes) {
      db.exec('ROLLBACK');
      return null;
    }
    db.exec('COMMIT');
    return orderFor(userId, orderId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function exitPositions(userId, exits) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const ids = [];
    for (const exit of exits) {
      const position = findPosition.get(userId, exit.instrument, exit.product);
      if (!position || position.qty === 0) throw new Error(`Position not found: ${exit.instrument} / ${exit.product}`);
      const order = {
        side: position.qty > 0 ? 'SELL' : 'BUY',
        instrument: position.instrument,
        exchange: position.exchange,
        product: position.product,
        qty: Math.abs(position.qty),
        price: exit.price,
        variety: 'REGULAR',
        orderType: 'MARKET',
        isAmo: false,
      };
      const result = insert(userId, order, 'COMPLETE', order.qty, order.price);
      insertFill.run(result.lastInsertRowid, userId, order.qty, order.price);
      applyFill(userId, order);
      ids.push(Number(result.lastInsertRowid));
    }
    db.exec('COMMIT');
    return ids.map((id) => orderFor(userId, id));
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

export function tradesFor(userId) {
  return db.prepare(`
    SELECT f.*, o.side, o.instrument, o.exchange, o.product
    FROM order_fills f JOIN orders o ON o.id = f.order_id
    WHERE f.user_id = ? ORDER BY f.id DESC LIMIT 500
  `).all(userId).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    time: istTime(row.filled_at),
    side: row.side,
    instrument: row.instrument,
    exchange: row.exchange,
    product: row.product,
    quantity: row.quantity,
    price: row.price,
    value: Number((row.quantity * row.price).toFixed(2)),
  }));
}

function presentOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    modifiedAt: row.modified_at,
    time: istTime(row.created_at),
    side: row.side,
    instrument: row.instrument,
    exchange: row.exchange,
    product: row.product,
    variety: row.variety ?? 'REGULAR',
    triggerPrice: row.trigger_price,
    orderType: row.order_type ?? 'MARKET',
    limitPrice: row.limit_price,
    isAmo: !!row.is_amo,
    icebergLegs: row.iceberg_legs,
    validity: row.validity ?? 'DAY',
    expiresAt: row.expires_at,
    filled: row.filled_qty ?? row.qty,
    qty: row.qty,
    avgPrice: row.price,
    status: row.status,
  };
}

export function exitHolding(userId, symbol, quantity, price) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const holding = db.prepare('SELECT * FROM holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol);
    if (!holding) throw new Error('Holding not found.');
    const available = holding.qty - holding.pledged_qty;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) throw new Error(`Only ${available} unpledged shares are available to sell.`);
    const order = { side: 'SELL', instrument: symbol, exchange: holding.exchange, product: 'CNC', qty: quantity, price, variety: 'REGULAR', orderType: 'MARKET', isAmo: false, validity: 'DAY' };
    const result = insert(userId, order, 'COMPLETE', quantity, price);
    insertFill.run(result.lastInsertRowid, userId, quantity, price);
    applyFill(userId, order);
    if (quantity === holding.qty) db.prepare('DELETE FROM holdings WHERE id = ?').run(holding.id);
    else db.prepare("UPDATE holdings SET qty = qty - ?, updated_at = datetime('now') WHERE id = ?").run(quantity, holding.id);
    db.exec('COMMIT');
    return { order: orderFor(userId, Number(result.lastInsertRowid)), holdings: db.prepare('SELECT * FROM holdings WHERE user_id = ? ORDER BY symbol').all(userId) };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}