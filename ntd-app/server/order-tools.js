import { db } from './db.js';

const KINDS = new Set(['gtt', 'basket', 'sip', 'alert']);
const upper = (value) => String(value ?? '').trim().toUpperCase();

const present = (row) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  config: JSON.parse(row.config_json),
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function toolsFor(userId, kind) {
  if (!KINDS.has(kind)) return null;
  return db.prepare('SELECT * FROM order_tools WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC, id DESC').all(userId, kind).map(present);
}

export function createTool(userId, kind, body, knownSymbols) {
  if (!KINDS.has(kind)) return { error: 'invalid_kind', message: 'Unknown order tool.' };
  const symbol = upper(body.symbol);
  const validateSymbol = (value) => knownSymbols.has(value) ? null : { error: 'unknown_instrument', message: `No market instrument found for ${value || 'that symbol'}.` };
  let name;
  let config;

  if (kind === 'basket') {
    name = String(body.name ?? '').trim();
    const symbols = [...new Set(String(body.symbols ?? '').split(',').map(upper).filter(Boolean))];
    if (name.length < 2 || name.length > 40) return { error: 'invalid_name', message: 'Enter a basket name between 2 and 40 characters.' };
    if (!symbols.length || symbols.length > 20) return { error: 'invalid_symbols', message: 'Add between 1 and 20 comma-separated instruments.' };
    const unknown = symbols.find((value) => !knownSymbols.has(value));
    if (unknown) return validateSymbol(unknown);
    config = { symbols };
  } else {
    const symbolError = validateSymbol(symbol);
    if (symbolError) return symbolError;
    name = symbol;
    if (kind === 'gtt') {
      const side = upper(body.side);
      const condition = upper(body.condition);
      const triggerPrice = Number(body.triggerPrice);
      const qty = Number(body.qty);
      if (!['BUY', 'SELL'].includes(side) || !['ABOVE', 'BELOW'].includes(condition)) return { error: 'invalid_trigger', message: 'Choose a valid side and trigger condition.' };
      if (!Number.isFinite(triggerPrice) || triggerPrice <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 100000) return { error: 'invalid_values', message: 'Enter a valid trigger price and quantity.' };
      config = { symbol, side, condition, triggerPrice, qty };
    } else if (kind === 'sip') {
      const amount = Number(body.amount);
      const frequency = upper(body.frequency);
      const nextDate = String(body.nextDate ?? '');
      if (!Number.isFinite(amount) || amount < 100 || amount > 1_000_000) return { error: 'invalid_amount', message: 'SIP amount must be between ₹100 and ₹10,00,000.' };
      if (!['WEEKLY', 'MONTHLY'].includes(frequency)) return { error: 'invalid_frequency', message: 'Choose weekly or monthly.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate < new Date().toISOString().slice(0, 10)) return { error: 'invalid_date', message: 'Choose today or a future execution date.' };
      config = { symbol, amount, frequency, nextDate };
    } else {
      const condition = upper(body.condition);
      const price = Number(body.price);
      if (!['ABOVE', 'BELOW'].includes(condition) || !Number.isFinite(price) || price <= 0) return { error: 'invalid_alert', message: 'Choose a valid condition and target price.' };
      config = { symbol, condition, price };
    }
  }

  const result = db.prepare('INSERT INTO order_tools (user_id, kind, name, config_json) VALUES (?, ?, ?, ?)').run(userId, kind, name, JSON.stringify(config));
  return { tool: present(db.prepare('SELECT * FROM order_tools WHERE id = ? AND user_id = ?').get(Number(result.lastInsertRowid), userId)) };
}

export function setToolStatus(userId, id, status) {
  if (!['ACTIVE', 'PAUSED'].includes(status)) return { error: 'invalid_status', message: 'Choose active or paused.' };
  const result = db.prepare("UPDATE order_tools SET status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(status, id, userId);
  return result.changes ? { ok: true } : { error: 'not_found', message: 'Order tool not found.' };
}

export function deleteTool(userId, id) {
  const result = db.prepare('DELETE FROM order_tools WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes ? { ok: true } : { error: 'not_found', message: 'Order tool not found.' };
}