import { db } from './db.js';
import { istDateKey } from './time.js';
import { ipoModificationOpen } from './market-timings.js';

const today = () => istDateKey();

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
  isCutoff: Boolean(row.is_cutoff),
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

export function placeBid(userId, issueId, lots, price, isCutoff = false, at = new Date()) {
  const issue = db.prepare('SELECT * FROM ipos WHERE id = ?').get(issueId);
  if (!issue) return { error: 'not_found', message: 'IPO issue not found.' };
  if (statusOf(issue) !== 'open') return { error: 'issue_not_open', message: 'This IPO is not open for bidding.' };
  if (!issue.lot_size || !issue.price_low || !issue.price_high) return { error: 'terms_unavailable', message: 'Bidding terms are not available yet.' };
  const existing = db.prepare('SELECT status FROM ipo_bids WHERE user_id = ? AND ipo_id = ?').get(userId, issue.id);
  if (existing?.status === 'SUBMITTED' && !ipoModificationOpen(at)) return { error: 'modification_closed', message: 'IPO applications can be modified between 10:00 AM and 4:30 PM IST on trading days.' };
  if (!Number.isInteger(lots) || lots < 1 || lots > 50) return { error: 'invalid_lots', message: 'Enter between 1 and 50 lots.' };
  const bidPrice = isCutoff ? issue.price_high : price;
  if (!Number.isFinite(bidPrice) || bidPrice < issue.price_low || bidPrice > issue.price_high || Math.round(bidPrice * 100) !== bidPrice * 100) {
    return { error: 'invalid_price', message: `Enter a price between ₹${issue.price_low} and ₹${issue.price_high}.` };
  }
  const quantity = lots * issue.lot_size;
  const amount = Number((quantity * bidPrice).toFixed(2));
  if (amount > 500_000) return { error: 'amount_limit', message: 'The application amount cannot exceed ₹5,00,000.' };

  db.prepare(`
    INSERT INTO ipo_bids (user_id, ipo_id, lots, quantity, price, is_cutoff, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, ipo_id) DO UPDATE SET
      lots = excluded.lots, quantity = excluded.quantity, price = excluded.price,
      is_cutoff = excluded.is_cutoff, amount = excluded.amount,
      status = 'SUBMITTED', updated_at = datetime('now')
  `).run(userId, issue.id, lots, quantity, bidPrice, isCutoff ? 1 : 0, amount);
  return { bid: bidBookFor(userId).bids.find((bid) => bid.issueId === issue.id) };
}

export function cancelBid(userId, bidId, at = new Date()) {
  const row = db.prepare(`
    SELECT b.*, i.open_date, i.close_date FROM ipo_bids b
    JOIN ipos i ON i.id = b.ipo_id WHERE b.id = ? AND b.user_id = ?
  `).get(bidId, userId);
  if (!row) return { error: 'not_found', message: 'Bid application not found.' };
  if (statusOf(row) !== 'open') return { error: 'issue_closed', message: 'This application can no longer be cancelled.' };
  if (!ipoModificationOpen(at)) return { error: 'cancellation_closed', message: 'IPO applications can be cancelled between 10:00 AM and 4:30 PM IST on trading days.' };
  db.prepare("UPDATE ipo_bids SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(row.id);
  return { ok: true };
}