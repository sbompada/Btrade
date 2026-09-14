import { db } from './db.js';
import { istDateKey } from './time.js';
import { placeOrder } from './orders.js';
import { parseInstrument } from './margin.js';

const KINDS = new Set(['gtt', 'basket', 'sip', 'alert']);
const LIMITS = { basket: 50, sip: 50, alert: 200 };
const upper = (value) => String(value ?? '').trim().toUpperCase();
const toolRow = (userId, id) => db.prepare('SELECT * FROM order_tools WHERE id = ? AND user_id = ?').get(id, userId);
const saveConfig = (id, config, status = null) => db.prepare(
  `UPDATE order_tools SET config_json = ?, status = COALESCE(?, status), updated_at = datetime('now') WHERE id = ?`,
).run(JSON.stringify(config), status, id);
const conditionMet = (condition, target, price) => condition === 'ABOVE' ? price >= target : price <= target;
const oneYearFromNow = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString();
};

function basketLegs(body) {
  if (Array.isArray(body.legs)) return body.legs.map((leg) => ({
    symbol: upper(leg.symbol),
    side: upper(leg.side || 'BUY'),
    product: upper(leg.product || 'CNC'),
    qty: Number(leg.qty || 1),
  }));
  return [...new Set(String(body.symbols ?? '').split(',').map(upper).filter(Boolean))]
    .map((symbol) => ({ symbol, side: 'BUY', product: 'CNC', qty: 1 }));
}

function validateLegs(legs, knownSymbols) {
  if (!legs.length || legs.length > 20) return { error: 'invalid_legs', message: 'Add between 1 and 20 basket orders.' };
  const invalid = legs.find((leg) => !knownSymbols.has(leg.symbol) || !['BUY', 'SELL'].includes(leg.side) || !['CNC', 'MIS', 'NRML'].includes(leg.product) || !Number.isInteger(leg.qty) || leg.qty < 1 || leg.qty > 100000);
  return invalid ? { error: 'invalid_leg', message: `Check the basket order for ${invalid.symbol || 'the selected instrument'}.` } : null;
}

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
  if (LIMITS[kind]) {
    const count = db.prepare('SELECT COUNT(*) AS count FROM order_tools WHERE user_id = ? AND kind = ?').get(userId, kind).count;
    if (count >= LIMITS[kind]) return { error: 'tool_limit', message: `A maximum of ${LIMITS[kind]} ${kind === 'basket' ? 'baskets' : kind === 'sip' ? 'SIPs' : 'alerts'} can be created.` };
  }
  const symbol = upper(body.symbol);
  const validateSymbol = (value) => knownSymbols.has(value) ? null : { error: 'unknown_instrument', message: `No market instrument found for ${value || 'that symbol'}.` };
  let name;
  let config;

  if (kind === 'basket') {
    name = String(body.name ?? '').trim();
    const legs = basketLegs(body);
    if (name.length < 2 || name.length > 40) return { error: 'invalid_name', message: 'Enter a basket name between 2 and 40 characters.' };
    const legError = validateLegs(legs, knownSymbols);
    if (legError) return legError;
    config = { legs, results: [] };
  } else {
    if (kind === 'gtt') {
      const symbolError = validateSymbol(symbol);
      if (symbolError) return symbolError;
      name = symbol;
      const triggerType = upper(body.triggerType || 'SINGLE');
      const side = upper(body.side);
      const condition = upper(body.condition);
      const triggerPrice = Number(body.triggerPrice);
      const limitPrice = Number(body.limitPrice || triggerPrice);
      const stopTrigger = Number(body.stopTrigger);
      const stopLimit = Number(body.stopLimit || stopTrigger);
      const targetTrigger = Number(body.targetTrigger);
      const targetLimit = Number(body.targetLimit || targetTrigger);
      const qty = Number(body.qty);
      if (!['SINGLE', 'OCO'].includes(triggerType) || !Number.isInteger(qty) || qty < 1 || qty > 100000) return { error: 'invalid_values', message: 'Choose a trigger type and valid quantity.' };
      if (triggerType === 'OCO') {
        if (side !== 'SELL' || ![stopTrigger, stopLimit, targetTrigger, targetLimit].every((value) => Number.isFinite(value) && value > 0) || stopTrigger >= targetTrigger) return { error: 'invalid_oco', message: 'Sell OCO requires a lower stop and higher target.' };
        config = { symbol, triggerType, side, qty, stopTrigger, stopLimit, targetTrigger, targetLimit, expiresAt: oneYearFromNow() };
      } else {
        if (!['BUY', 'SELL'].includes(side) || !['ABOVE', 'BELOW'].includes(condition) || !Number.isFinite(triggerPrice) || triggerPrice <= 0 || !Number.isFinite(limitPrice) || limitPrice <= 0) return { error: 'invalid_trigger', message: 'Choose valid single-trigger prices.' };
        config = { symbol, triggerType, side, condition, triggerPrice, limitPrice, qty, expiresAt: oneYearFromNow() };
      }
    } else if (kind === 'sip') {
      const basketId = Number(body.basketId);
      const frequency = upper(body.frequency);
      const nextDate = String(body.nextDate ?? '');
      const preferredTime = String(body.preferredTime ?? '09:30');
      name = String(body.name ?? '').trim();
      const basket = toolRow(userId, basketId);
      if (!basket || basket.kind !== 'basket') return { error: 'invalid_basket', message: 'Choose one of your baskets.' };
      const basketConfig = JSON.parse(basket.config_json);
      if (!basketConfig.legs?.every((leg) => leg.product === 'CNC' && knownSymbols.has(leg.symbol))) return { error: 'invalid_sip_basket', message: 'Stock SIP baskets can contain only CNC cash-equity orders.' };
      if (name.length < 2 || name.length > 40) return { error: 'invalid_name', message: 'Enter a SIP name between 2 and 40 characters.' };
      if (!['WEEKLY', 'MONTHLY'].includes(frequency)) return { error: 'invalid_frequency', message: 'Choose weekly or monthly.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate < istDateKey()) return { error: 'invalid_date', message: 'Choose today or a future execution date.' };
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) return { error: 'invalid_time', message: 'Choose a valid preferred time.' };
      config = { basketId, basketName: basket.name, frequency, nextDate, preferredTime, runs: [] };
    } else {
      const symbolError = validateSymbol(symbol);
      if (symbolError) return symbolError;
      name = String(body.name ?? symbol).trim();
      const condition = upper(body.condition);
      const property = upper(body.property || 'LTP');
      const price = Number(body.price);
      if (name.length < 2 || name.length > 40 || !['LTP', 'CHANGE_PCT'].includes(property) || !['ABOVE', 'BELOW'].includes(condition) || !Number.isFinite(price)) return { error: 'invalid_alert', message: 'Enter a valid alert name, property, condition, and value.' };
      config = { symbol, property, condition, price };
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

export function basketMargin(userId, id, quoteFor) {
  const row = toolRow(userId, id);
  if (!row || row.kind !== 'basket') return null;
  const config = JSON.parse(row.config_json);
  const legs = config.legs ?? [];
  const estimates = legs.map((leg) => {
    const quote = quoteFor(leg.symbol);
    if (!quote) return { ...leg, margin: null };
    const notional = leg.qty * quote.ltp;
    const kind = parseInstrument(leg.symbol).kind;
    const rate = leg.product === 'CNC' || (kind === 'option' && leg.side === 'BUY') ? 1 : leg.product === 'MIS' && kind === 'equity' ? 0.2 : 0.18;
    return { ...leg, margin: Number((notional * rate).toFixed(2)) };
  });
  return { legs: estimates, required: Number(estimates.reduce((sum, leg) => sum + (leg.margin ?? 0), 0).toFixed(2)), model: 'DEVELOPMENT_ESTIMATE' };
}

export function executeBasket(userId, id, quoteFor, onlyRejected = false) {
  const row = toolRow(userId, id);
  if (!row || row.kind !== 'basket') return { error: 'not_found', message: 'Basket not found.' };
  const config = JSON.parse(row.config_json);
  const previousRejected = new Set((config.results ?? []).filter((result) => result.status === 'REJECTED').map((result) => result.symbol));
  const legs = onlyRejected ? config.legs.filter((leg) => previousRejected.has(leg.symbol)) : config.legs;
  if (!legs.length) return { error: 'nothing_to_retry', message: 'No rejected basket orders to retry.' };
  const results = legs.map((leg) => {
    const quote = quoteFor(leg.symbol);
    if (!quote) return { symbol: leg.symbol, status: 'REJECTED', message: 'No replay quote.' };
    try {
      const order = placeOrder(userId, { ...leg, instrument: leg.symbol, exchange: quote.exchange, price: quote.ltp, variety: 'REGULAR', orderType: 'MARKET', isAmo: false, validity: 'DAY' });
      return { symbol: leg.symbol, status: order.status, orderId: order.id };
    } catch (error) {
      return { symbol: leg.symbol, status: 'REJECTED', message: error.message };
    }
  });
  config.results = results;
  config.lastExecutedAt = new Date().toISOString();
  saveConfig(id, config);
  return { tool: present(toolRow(userId, id)), results };
}

export function cloneBasket(userId, id) {
  const row = toolRow(userId, id);
  if (!row || row.kind !== 'basket') return { error: 'not_found', message: 'Basket not found.' };
  const count = db.prepare("SELECT COUNT(*) AS count FROM order_tools WHERE user_id = ? AND kind = 'basket'").get(userId).count;
  if (count >= LIMITS.basket) return { error: 'tool_limit', message: `A maximum of ${LIMITS.basket} baskets can be created.` };
  const config = JSON.parse(row.config_json);
  config.results = [];
  delete config.lastExecutedAt;
  const result = db.prepare('INSERT INTO order_tools (user_id, kind, name, config_json) VALUES (?, ?, ?, ?)').run(userId, 'basket', `${row.name} copy`.slice(0, 40), JSON.stringify(config));
  return { tool: present(toolRow(userId, Number(result.lastInsertRowid))) };
}

export function processOrderTools(tick, quoteFor) {
  const rows = db.prepare("SELECT * FROM order_tools WHERE status = 'ACTIVE' AND kind IN ('gtt', 'alert', 'sip') ORDER BY id").all();
  for (const row of rows) {
    const config = JSON.parse(row.config_json);
    if (row.kind === 'gtt' && config.expiresAt && new Date(tick.ts) >= new Date(config.expiresAt)) {
      config.expiredAt = new Date(tick.ts).toISOString();
      saveConfig(row.id, config, 'PAUSED');
      continue;
    }
    if (row.kind === 'alert' && config.symbol === tick.symbol) {
      const value = config.property === 'CHANGE_PCT' ? tick.changePct : tick.ltp;
      if (conditionMet(config.condition, config.price, value)) {
        config.triggeredAt = new Date(tick.ts).toISOString();
        config.triggeredValue = value;
        saveConfig(row.id, config, 'PAUSED');
      }
    }
    if (row.kind === 'gtt' && config.symbol === tick.symbol) {
      const leg = config.triggerType === 'OCO'
        ? tick.ltp <= config.stopTrigger ? { name: 'STOP', trigger: config.stopTrigger, limit: config.stopLimit } : tick.ltp >= config.targetTrigger ? { name: 'TARGET', trigger: config.targetTrigger, limit: config.targetLimit } : null
        : conditionMet(config.condition, config.triggerPrice, tick.ltp) ? { name: 'SINGLE', trigger: config.triggerPrice, limit: config.limitPrice } : null;
      if (leg) {
        const order = placeOrder(row.user_id, { side: config.side, instrument: config.symbol, exchange: tick.exchange, product: 'CNC', qty: config.qty, price: tick.ltp, variety: 'REGULAR', orderType: 'LIMIT', limitPrice: leg.limit, isAmo: false, validity: 'DAY' });
        config.triggeredAt = new Date(tick.ts).toISOString();
        config.triggeredLeg = leg.name;
        config.orderId = order.id;
        saveConfig(row.id, config, 'PAUSED');
      }
    }
    if (row.kind === 'sip') {
      const due = `${config.nextDate}T${config.preferredTime}:00+05:30`;
      if (new Date(tick.ts) < new Date(due)) continue;
      const result = executeBasket(row.user_id, config.basketId, quoteFor);
      config.runs = [...(config.runs ?? []), { at: new Date(tick.ts).toISOString(), ok: !result.error }].slice(-12);
      const next = new Date(`${config.nextDate}T12:00:00Z`);
      if (config.frequency === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7);
      else next.setUTCMonth(next.getUTCMonth() + 1);
      config.nextDate = next.toISOString().slice(0, 10);
      saveConfig(row.id, config);
    }
  }
}