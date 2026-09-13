import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotpSecret, hashPassword } from './crypto.js';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.NTD_DB_PATH ?? resolve(here, '../data/ntd.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id       TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    email           TEXT    NOT NULL UNIQUE,
    phone           TEXT,
    password_hash   TEXT    NOT NULL,
    totp_secret     TEXT    NOT NULL,
    totp_enabled    INTEGER NOT NULL DEFAULT 1,
    status          TEXT    NOT NULL DEFAULT 'active',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    password_changed_at TEXT,
    last_login_at   TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id  TEXT    NOT NULL,
    ip         TEXT,
    stage      TEXT    NOT NULL,
    success    INTEGER NOT NULL,
    reason     TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS totp_challenges (
    id         TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempts   INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT    NOT NULL,
    consumed_at TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT    NOT NULL UNIQUE,
    ip         TEXT,
    expires_at TEXT    NOT NULL,
    revoked_at TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    used_at    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS userid_recoveries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email      TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS candles (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol   TEXT NOT NULL,
    interval TEXT NOT NULL CHECK (interval IN ('1m', '1d')),
    -- '2026-09-13T09:15' for a minute, '2026-09-11' for a day.
    bucket   TEXT NOT NULL,
    open     REAL NOT NULL,
    high     REAL NOT NULL,
    low      REAL NOT NULL,
    close    REAL NOT NULL,
    UNIQUE (symbol, interval, bucket)
  );

  CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(symbol, interval, bucket);

  CREATE TABLE IF NOT EXISTS ipos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    code        TEXT    NOT NULL UNIQUE,
    exchange    TEXT    NOT NULL DEFAULT 'NSE',
    -- Status is never stored: it is whether today falls inside this window.
    open_date   TEXT,
    close_date  TEXT,
    price_low   REAL,
    price_high  REAL,
    lot_size    INTEGER,
    listing_date TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ipo_bids (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ipo_id     INTEGER NOT NULL REFERENCES ipos(id) ON DELETE CASCADE,
    lots       INTEGER NOT NULL CHECK (lots > 0),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    price      REAL    NOT NULL CHECK (price > 0),
    amount     REAL    NOT NULL CHECK (amount > 0),
    status     TEXT    NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'CANCELLED')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, ipo_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ipo_bids_user_updated ON ipo_bids(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS calendar_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL CHECK (kind IN ('economic', 'earnings')),
    event_date TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    detail     TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_date ON calendar_events(event_date);

  CREATE TABLE IF NOT EXISTS holdings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol     TEXT    NOT NULL,
    exchange   TEXT    NOT NULL DEFAULT 'NSE',
    isin       TEXT,
    qty        INTEGER NOT NULL,
    avg_cost   REAL    NOT NULL,
    -- Shares pledged as collateral still show in holdings but cannot be sold.
    pledged_qty INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, symbol)
  );

  CREATE TABLE IF NOT EXISTS mutual_funds (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scheme_code    TEXT    NOT NULL,
    scheme_name    TEXT    NOT NULL,
    category       TEXT    NOT NULL,
    folio          TEXT    NOT NULL,
    units          REAL    NOT NULL,
    avg_nav        REAL    NOT NULL,
    current_nav    REAL    NOT NULL,
    day_change_pct REAL    NOT NULL DEFAULT 0,
    nav_as_of      TEXT    NOT NULL,
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, scheme_code, folio)
  );

  CREATE TABLE IF NOT EXISTS open_positions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instrument  TEXT    NOT NULL,
    exchange    TEXT    NOT NULL,
    product     TEXT    NOT NULL,
    -- Negative quantity is a short. Margin treatment differs entirely by sign.
    qty         INTEGER NOT NULL,
    avg_price   REAL    NOT NULL,
    opened_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, instrument, product)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    side        TEXT    NOT NULL CHECK (side IN ('BUY', 'SELL')),
    instrument  TEXT    NOT NULL,
    exchange    TEXT    NOT NULL,
    product     TEXT    NOT NULL CHECK (product IN ('CNC', 'MIS', 'NRML')),
    qty         INTEGER NOT NULL CHECK (qty > 0),
    price       REAL    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'COMPLETE',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS order_tools (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT    NOT NULL CHECK (kind IN ('gtt', 'basket', 'sip', 'alert')),
    name        TEXT    NOT NULL,
    config_json TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_order_tools_user_kind ON order_tools(user_id, kind, updated_at DESC);

  CREATE TABLE IF NOT EXISTS funds (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    segment            TEXT    NOT NULL CHECK (segment IN ('equity', 'commodity')),
    opening_balance    REAL    NOT NULL DEFAULT 0,
    payin              REAL    NOT NULL DEFAULT 0,
    payout             REAL    NOT NULL DEFAULT 0,
    span               REAL    NOT NULL DEFAULT 0,
    delivery_margin    REAL    NOT NULL DEFAULT 0,
    exposure           REAL    NOT NULL DEFAULT 0,
    options_premium    REAL    NOT NULL DEFAULT 0,
    collateral_liquid  REAL    NOT NULL DEFAULT 0,
    collateral_equity  REAL    NOT NULL DEFAULT 0,
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, segment)
  );

  CREATE TABLE IF NOT EXISTS fund_transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    segment     TEXT    NOT NULL CHECK (segment IN ('equity', 'commodity')),
    kind        TEXT    NOT NULL CHECK (kind IN ('OPENING', 'PAYIN', 'PAYOUT')),
    amount      REAL    NOT NULL CHECK (amount >= 0),
    reference   TEXT    NOT NULL,
    description TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, reference)
  );

  CREATE INDEX IF NOT EXISTS idx_fund_transactions_user_created
    ON fund_transactions(user_id, created_at DESC, id DESC);

  CREATE TABLE IF NOT EXISTS login_locks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id       TEXT    NOT NULL,
    ip              TEXT    NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TEXT,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (client_id, ip)
  );

  CREATE TABLE IF NOT EXISTS signup_applications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    reference       TEXT    NOT NULL UNIQUE,
    mobile_digits   TEXT    NOT NULL,
    mobile_verified INTEGER NOT NULL DEFAULT 0,
    full_name       TEXT,
    email           TEXT,
    pan_cipher      TEXT,
    pan_last4       TEXT,
    dob             TEXT,
    status          TEXT    NOT NULL DEFAULT 'started',
    client_id       TEXT,
    ip              TEXT,
    expires_at      TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS signup_otps (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES signup_applications(id) ON DELETE CASCADE,
    code_hash      TEXT    NOT NULL,
    attempts       INTEGER NOT NULL DEFAULT 0,
    expires_at     TEXT    NOT NULL,
    consumed_at    TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_signup_ref    ON signup_applications(reference);
  CREATE INDEX IF NOT EXISTS idx_signup_mobile ON signup_applications(mobile_digits);

  CREATE TABLE IF NOT EXISTS recovery_audit (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id    TEXT    NOT NULL,
    action       TEXT    NOT NULL,
    detail       TEXT,
    performed_by TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_login_locks     ON login_locks(client_id, ip);
  CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_resets_token     ON password_resets(token_hash);
  CREATE INDEX IF NOT EXISTS idx_attempts_client  ON login_attempts(client_id, created_at);
`);

/**
 * Phone lookup needs a canonical form, so numbers are also stored as bare digits.
 * Added by migration because the users table shipped before mobile recovery existed.
 */
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('phone_digits')) {
  db.exec('ALTER TABLE users ADD COLUMN phone_digits TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_digits)');
  for (const row of db.prepare('SELECT id, phone FROM users WHERE phone IS NOT NULL').all()) {
    db.prepare('UPDATE users SET phone_digits = ? WHERE id = ?').run(normalisePhone(row.phone), row.id);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS notification_providers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    channel       TEXT    NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
    name          TEXT    NOT NULL,
    driver        TEXT    NOT NULL,
    from_identity TEXT,
    settings_json TEXT    NOT NULL DEFAULT '{}',
    secret_cipher TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    is_default    INTEGER NOT NULL DEFAULT 0,
    last_tested_at   TEXT,
    last_test_ok     INTEGER,
    last_test_message TEXT,
    created_by    INTEGER REFERENCES users(id),
    updated_by    INTEGER REFERENCES users(id),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS provider_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER,
    channel     TEXT,
    action      TEXT    NOT NULL,
    detail      TEXT,
    actor_id    INTEGER REFERENCES users(id),
    actor_client_id TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_providers_channel ON notification_providers(channel);
  CREATE INDEX IF NOT EXISTS idx_provider_audit    ON provider_audit(provider_id, created_at);
`);

/**
 * The channel CHECK constraint can't be altered in place, so widening it for
 * WhatsApp means rebuilding the table. Existing rows are carried across intact.
 */
const providersSql =
  db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notification_providers'")
    .get()?.sql ?? '';

if (providersSql && !providersSql.includes('whatsapp')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    BEGIN;
    CREATE TABLE notification_providers_rebuilt (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      channel       TEXT    NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
      name          TEXT    NOT NULL,
      driver        TEXT    NOT NULL,
      from_identity TEXT,
      settings_json TEXT    NOT NULL DEFAULT '{}',
      secret_cipher TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      is_default    INTEGER NOT NULL DEFAULT 0,
      last_tested_at   TEXT,
      last_test_ok     INTEGER,
      last_test_message TEXT,
      created_by    INTEGER REFERENCES users(id),
      updated_by    INTEGER REFERENCES users(id),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO notification_providers_rebuilt
      SELECT id, channel, name, driver, from_identity, settings_json, secret_cipher,
             is_active, is_default, last_tested_at, last_test_ok, last_test_message,
             created_by, updated_by, created_at, updated_at
      FROM notification_providers;
    DROP TABLE notification_providers;
    ALTER TABLE notification_providers_rebuilt RENAME TO notification_providers;
    COMMIT;
  `);
  db.exec('PRAGMA foreign_keys = ON');
  console.log('[db] notification_providers rebuilt to allow the whatsapp channel');
}

/** At most one default per channel, enforced by the database rather than by hand. */
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_providers_channel ON notification_providers(channel);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_one_default
  ON notification_providers(channel) WHERE is_default = 1
`);

if (!userColumns.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

/** User-ID recovery can now go to a mobile as well as an email, so record which channel was used. */
const recoveryColumns = db.prepare('PRAGMA table_info(userid_recoveries)').all().map((c) => c.name);
if (!recoveryColumns.includes('method')) {
  db.exec("ALTER TABLE userid_recoveries ADD COLUMN method TEXT NOT NULL DEFAULT 'email'");
  db.exec('ALTER TABLE userid_recoveries ADD COLUMN sent_to TEXT');
}

/** Last 10 digits — tolerates +91, 0 prefixes, spaces and dashes. */
export function normalisePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export const isMobileShaped = (input) => /^[6-9]\d{9}$/.test(normalisePhone(input));

/** Seeded demo accounts. Passwords are hashed on insert — the plaintext never reaches the DB. */
const SEED = [
  {
    client_id: 'MN7315',
    name: 'Muralidhar Patnaikuni',
    email: 'muralidhar.p@example.com',
    phone: '+91 90000 00001',
    password: 'Terminal@2026',
  },
  {
    client_id: 'AB1042',
    name: 'Ananya Balakrishnan',
    email: 'ananya.b@example.com',
    phone: '+91 90000 00002',
    password: 'Options@2026',
  },
  {
    client_id: 'RK8891',
    name: 'Rahul Kulkarni',
    email: 'rahul.k@example.com',
    phone: '+91 90000 00003',
    password: 'Futures@2026',
  },
  {
    client_id: 'ADMIN01',
    name: 'Priya Nair',
    email: 'priya.n@example.com',
    phone: '+91 90000 00009',
    password: 'Console@2026',
    role: 'admin',
  },
];

export function seed() {
  const exists = db.prepare('SELECT id FROM users WHERE client_id = ?');
  const insert = db.prepare(`
    INSERT INTO users (client_id, name, email, phone, phone_digits, password_hash, totp_secret, role, password_changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const created = [];
  for (const user of SEED) {
    if (exists.get(user.client_id)) continue;
    const secret = generateTotpSecret();
    insert.run(
      user.client_id,
      user.name,
      user.email,
      user.phone,
      normalisePhone(user.phone),
      hashPassword(user.password),
      secret,
      user.role ?? 'user',
    );
    created.push({
      clientId: user.client_id,
      password: user.password,
      secret,
      role: user.role ?? 'user',
    });
  }
  return created;
}

export const findByClientId = (clientId) =>
  db.prepare('SELECT * FROM users WHERE client_id = ?').get(String(clientId).toUpperCase().trim());

export const findByEmail = (email) =>
  db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());

export const findByPhone = (phone) => {
  const digits = normalisePhone(phone);
  if (digits.length !== 10) return undefined;
  return db.prepare('SELECT * FROM users WHERE phone_digits = ?').get(digits);
};

export const publicUser = (row) => ({
  clientId: row.client_id,
  name: row.name,
  email: row.email,
  role: row.role ?? 'user',
  initials: row.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
  lastLoginAt: row.last_login_at,
});

export const recordAttempt = (clientId, ip, stage, success, reason) =>
  db
    .prepare(
      'INSERT INTO login_attempts (client_id, ip, stage, success, reason) VALUES (?, ?, ?, ?, ?)',
    )
    .run(String(clientId ?? '').slice(0, 64), ip ?? null, stage, success ? 1 : 0, reason ?? null);
