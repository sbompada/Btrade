import { db } from './db.js';

const today = () => new Date().toISOString().slice(0, 10);

const statusOf = (issue) => {
  const date = today();
  if (!issue.open_date || !issue.close_date) return 'announced';
  if (date < issue.open_date) return 'upcoming';
  if (date > issue.close_date) return 'closed';
  return 'open';
};

const presentIssue = (row) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  exchange: row.exchange,
  status: statusOf(row),
  openDate: row.open_date,
  closeDate: row.close_date,
  priceLow: row.price_low,
  priceHigh: row.price_high,
  lotSize: row.lot_size,
});

const presentBid = (row) => ({
  id: row.id,
  issueId: row.ipo_id,
  code: row.code,
  name: row.name,
  exchange: row.exchange,
  lots: row.lots,
  quantity: row.quantity,
  price: row.price,
  amount: row.amount,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export function bidBookFor(userId) {
  const issues = db.prepare(`
    SELECT * FROM ipos
    WHERE close_date IS NULL OR close_date >= ?
    ORDER BY open_date IS NULL, open_date, name
  `).all(today()).map(presentIssue);
  const bids = db.prepare(`
    SELECT b.*, i.code, i.name, i.exchange
    FROM ipo_bids b JOIN ipos i ON i.id = b.ipo_id
    WHERE b.user_id = ? ORDER BY b.updated_at DESC, b.id DESC
  `).all(userId).map(presentBid);
  return { issues, bids };
}

export function placeBid(userId, issueId, lots, price) {
  const issue = db.prepare('SELECT * FROM ipos WHERE id = ?').get(issueId);
  if (!issue) return { error: 'not_found', message: 'IPO issue not found.' };
  if (statusOf(issue) !== 'open') return { error: 'issue_not_open', message: 'This IPO is not open for bidding.' };
  if (!issue.lot_size || !issue.price_low || !issue.price_high) return { error: 'terms_unavailable', message: 'Bidding terms are not available yet.' };
  if (!Number.isInteger(lots) || lots < 1 || lots > 50) return { error: 'invalid_lots', message: 'Enter between 1 and 50 lots.' };
  if (!Number.isFinite(price) || price < issue.price_low || price > issue.price_high || Math.round(price * 100) !== price * 100) {
    return { error: 'invalid_price', message: `Enter a price between ₹${issue.price_low} and ₹${issue.price_high}.` };
  }
  const quantity = lots * issue.lot_size;
  const amount = Number((quantity * price).toFixed(2));
  if (amount > 500_000) return { error: 'amount_limit', message: 'The application amount cannot exceed ₹5,00,000.' };

  db.prepare(`
    INSERT INTO ipo_bids (user_id, ipo_id, lots, quantity, price, amount)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, ipo_id) DO UPDATE SET
      lots = excluded.lots, quantity = excluded.quantity, price = excluded.price,
      amount = excluded.amount, status = 'SUBMITTED', updated_at = datetime('now')
  `).run(userId, issue.id, lots, quantity, price, amount);
  return { bid: bidBookFor(userId).bids.find((bid) => bid.issueId === issue.id) };
}

export function cancelBid(userId, bidId) {
  const row = db.prepare(`
    SELECT b.*, i.open_date, i.close_date FROM ipo_bids b
    JOIN ipos i ON i.id = b.ipo_id WHERE b.id = ? AND b.user_id = ?
  `).get(bidId, userId);
  if (!row) return { error: 'not_found', message: 'Bid application not found.' };
  if (statusOf(row) !== 'open') return { error: 'issue_closed', message: 'This application can no longer be cancelled.' };
  db.prepare("UPDATE ipo_bids SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(row.id);
  return { ok: true };
}