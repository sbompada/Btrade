import { db } from './db.js';

const SEED = {
  MN7315: [
    { code: 'INF109K01Z48', name: 'ICICI Prudential Bluechip Fund - Direct Growth', category: 'Large Cap', folio: '10984521/77', units: 842.316, avgNav: 78.42, nav: 91.67, day: 0.31 },
    { code: 'INF200K01T51', name: 'SBI Nifty Index Fund - Direct Growth', category: 'Index', folio: '22419063/18', units: 1260.442, avgNav: 183.15, nav: 208.84, day: 0.08 },
    { code: 'INF179K01VY8', name: 'HDFC Mid-Cap Opportunities - Direct Growth', category: 'Mid Cap', folio: '66720419/02', units: 534.728, avgNav: 142.7, nav: 176.35, day: -0.24 },
    { code: 'INF247L01544', name: 'Motilal Oswal Nasdaq 100 FOF - Direct Growth', category: 'International', folio: '83019642/55', units: 1735.19, avgNav: 28.62, nav: 36.48, day: 0.56 },
  ],
  AB1042: [
    { code: 'INF109K01Z48', name: 'ICICI Prudential Bluechip Fund - Direct Growth', category: 'Large Cap', folio: '76519824/11', units: 2200, avgNav: 72.15, nav: 91.67, day: 0.31 },
    { code: 'INF200K01T51', name: 'SBI Nifty Index Fund - Direct Growth', category: 'Index', folio: '31884402/91', units: 3500, avgNav: 170.4, nav: 208.84, day: 0.08 },
  ],
  RK8891: [],
  ADMIN01: [],
};

export function seedMutualFunds() {
  const users = db.prepare('SELECT id, client_id FROM users').all();
  const exists = db.prepare('SELECT 1 FROM mutual_funds WHERE user_id = ? LIMIT 1');
  const insert = db.prepare(`
    INSERT INTO mutual_funds
      (user_id, scheme_code, scheme_name, category, folio, units, avg_nav, current_nav, day_change_pct, nav_as_of)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const navAsOf = '2026-09-11';
  let created = 0;

  for (const user of users) {
    if (exists.get(user.id)) continue;
    for (const fund of SEED[user.client_id] ?? []) {
      insert.run(user.id, fund.code, fund.name, fund.category, fund.folio, fund.units, fund.avgNav, fund.nav, fund.day, navAsOf);
      created += 1;
    }
  }
  return created;
}

export const mutualFundsFor = (userId) => db
  .prepare('SELECT * FROM mutual_funds WHERE user_id = ? ORDER BY scheme_name')
  .all(userId)
  .map((row) => ({
    schemeCode: row.scheme_code,
    name: row.scheme_name,
    category: row.category,
    folio: row.folio,
    units: row.units,
    avgNav: row.avg_nav,
    currentNav: row.current_nav,
    dayChangePct: row.day_change_pct,
    navAsOf: row.nav_as_of,
  }));