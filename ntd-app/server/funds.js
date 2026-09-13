import { db } from './db.js';
import { randomUUID } from 'node:crypto';
import { computeMargin } from './margin.js';

/**
 * Funds are per-user account state from the back office — not market data.
 * Only `span`/`exposure` move intraday (margin is recomputed against current
 * prices); everything else changes on a money movement or at start of day.
 *
 * Used and available are always DERIVED here, never stored, so they cannot
 * drift from their components the way hand-entered totals do.
 */

const SEGMENTS = ['equity', 'commodity'];

/** Opening balances differ per account so the screens prove they are per-user. */
const SEED = {
  MN7315: {
    equity: { opening_balance: 324585.75, span: 48320, exposure: 22855 },
    commodity: { opening_balance: 61330, span: 9180, exposure: 3250 },
  },
  AB1042: {
    equity: { opening_balance: 918400.5, span: 126400, exposure: 58200, collateral_equity: 250000 },
    commodity: { opening_balance: 0 },
  },
  RK8891: {
    equity: { opening_balance: 47210.25, span: 0, exposure: 0, payin: 25000 },
    commodity: { opening_balance: 18900, span: 4100, exposure: 1650 },
  },
  ADMIN01: {
    equity: { opening_balance: 0 },
    commodity: { opening_balance: 0 },
  },
};

export function seedFunds() {
  const users = db.prepare('SELECT id, client_id FROM users').all();
  const exists = db.prepare('SELECT id FROM funds WHERE user_id = ? AND segment = ?');
  const insert = db.prepare(`
    INSERT INTO funds (user_id, segment, opening_balance, payin, payout, span,
                       delivery_margin, exposure, options_premium,
                       collateral_liquid, collateral_equity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let created = 0;
  for (const user of users) {
    for (const segment of SEGMENTS) {
      if (exists.get(user.id, segment)) continue;
      // A new account opens with nothing until funds are added.
      const row = SEED[user.client_id]?.[segment] ?? {};
      insert.run(
        user.id,
        segment,
        row.opening_balance ?? 0,
        row.payin ?? 0,
        row.payout ?? 0,
        row.span ?? 0,
        row.delivery_margin ?? 0,
        row.exposure ?? 0,
        row.options_premium ?? 0,
        row.collateral_liquid ?? 0,
        row.collateral_equity ?? 0,
      );
      created += 1;
    }
  }
  return created;
}

export function seedFundTransactions() {
  const rows = db.prepare('SELECT * FROM funds').all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO fund_transactions
      (user_id, segment, kind, amount, reference, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let created = 0;
  for (const row of rows) {
    const date = row.updated_at ?? new Date().toISOString().replace('T', ' ').slice(0, 19);
    if (row.opening_balance > 0) {
      created += Number(insert.run(row.user_id, row.segment, 'OPENING', row.opening_balance, `OPENING-${row.segment}`, 'Opening balance', date).changes);
    }
    if (row.payin > 0) {
      created += Number(insert.run(row.user_id, row.segment, 'PAYIN', row.payin, `LEGACY-PAYIN-${row.segment}`, 'Funds added', date).changes);
    }
    if (row.payout > 0) {
      created += Number(insert.run(row.user_id, row.segment, 'PAYOUT', row.payout, `LEGACY-PAYOUT-${row.segment}`, 'Funds withdrawn', date).changes);
    }
  }
  return created;
}

const usedMargin = (r) => r.span + r.delivery_margin + r.exposure + r.options_premium;
const totalCollateral = (r) => r.collateral_liquid + r.collateral_equity;

const round = (n) => Number(n.toFixed(2));

export const presentSegment = (row) => ({
  segment: row.segment,
  openingBalance: round(row.opening_balance),
  payin: round(row.payin),
  payout: round(row.payout),
  span: round(row.span),
  deliveryMargin: round(row.delivery_margin),
  exposure: round(row.exposure),
  optionsPremium: round(row.options_premium),
  collateralLiquid: round(row.collateral_liquid),
  collateralEquity: round(row.collateral_equity),
  // Derived, never stored.
  usedMargin: round(usedMargin(row)),
  totalCollateral: round(totalCollateral(row)),
  availableMargin: round(row.opening_balance + row.payin - row.payout - usedMargin(row) + totalCollateral(row)),
  availableCash: round(row.opening_balance + row.payin - row.payout - usedMargin(row)),
  updatedAt: row.updated_at,
});

/**
 * Margin is derived from the open book at current prices, so the stored
 * span/exposure/premium columns are only a fallback for accounts with no
 * positions. A written option or a future makes these move as spot moves.
 */
export function fundsFor(userId, { positions = [], quoteFor = () => undefined } = {}) {
  const rows = db.prepare('SELECT * FROM funds WHERE user_id = ? ORDER BY segment DESC').all(userId);

  // Equity and F&O share the equity segment's margin in this model; commodity
  // positions would be split out here once MCX contracts are tradeable.
  const equityPositions = positions.filter((p) => p.exchange !== 'MCX');
  const commodityPositions = positions.filter((p) => p.exchange === 'MCX');

  const withMargin = (row) => {
    const forSegment = row.segment === 'commodity' ? commodityPositions : equityPositions;
    const margin = computeMargin(forSegment, quoteFor);
    return presentSegment({
      ...row,
      span: margin.span,
      exposure: margin.exposure,
      options_premium: margin.optionsPremium,
      delivery_margin: margin.deliveryMargin,
    });
  };

  const bySegment = Object.fromEntries(rows.map((r) => [r.segment, withMargin(r)]));
  return {
    equity: bySegment.equity ?? null,
    commodity: bySegment.commodity ?? null,
  };
}

export function transferFunds(userId, segment, direction, amount) {
  const column = direction === 'add' ? 'payin' : 'payout';
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare(`
      UPDATE funds
      SET ${column} = ${column} + ?, updated_at = datetime('now')
      WHERE user_id = ? AND segment = ?
    `).run(amount, userId, segment);
    if (result.changes !== 1) throw new Error('Fund segment not found.');
    db.prepare(`
      INSERT INTO fund_transactions (user_id, segment, kind, amount, reference, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      segment,
      direction === 'add' ? 'PAYIN' : 'PAYOUT',
      amount,
      `FT-${randomUUID()}`,
      direction === 'add' ? 'Funds added via UPI' : 'Withdrawal to registered bank',
    );
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function fundStatementsFor(userId) {
  return db.prepare(`
    SELECT * FROM fund_transactions
    WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 500
  `).all(userId).map((row) => ({
    id: row.id,
    date: row.created_at,
    segment: row.segment,
    kind: row.kind,
    description: row.description,
    reference: row.reference,
    debit: row.kind === 'PAYOUT' ? row.amount : 0,
    credit: row.kind === 'PAYOUT' ? 0 : row.amount,
  }));
}
