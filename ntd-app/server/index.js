import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  db,
  DB_PATH,
  findByClientId,
  findByEmail,
  findByPhone,
  isMobileShaped,
  normalisePhone,
  publicUser,
  recordAttempt,
  seed,
} from './db.js';
import {
  currentTotp,
  decryptSecret,
  hashPassword,
  MASTER_KEY_IS_EPHEMERAL,
  randomToken,
  secondsIntoStep,
  sha256,
  verifyPassword,
  verifyTotp,
} from './crypto.js';
import { hub } from './marketdata/hub.js';
import { flushAll, history, isRange } from './marketdata/candles.js';
import { fundStatementsFor, fundsFor, seedFunds, seedFundTransactions, transferFunds } from './funds.js';
import { positionRowsFor, presentPosition, seedPositions } from './positions.js';
import { ordersFor, placeMarketOrder } from './orders.js';
import { createTool, deleteTool, setToolStatus, toolsFor } from './order-tools.js';
import { holdingRowsFor, presentHolding, seedHoldings } from './holdings.js';
import { mutualFundsFor, seedMutualFunds } from './mutual-funds.js';
import { calendarFor, seedCalendar } from './calendar.js';
import { bidBookFor, cancelBid, placeBid } from './bids.js';
import {
  ageOn,
  completeApplication,
  contactTaken,
  createApplication,
  findApplication,
  isPan,
  issueOtp,
  OTP_MINUTES,
  publicApplication,
  storePan,
  verifyOtp,
} from './signup.js';
import {
  audit,
  CATALOGUE,
  driverSpec,
  isChannel,
  listProviders,
  mergeSecrets,
  partitionFields,
  presentProvider,
  requiredSecretsMissing,
} from './providers.js';

const PORT = Number(process.env.NTD_API_PORT ?? 5181);
const IS_PROD = process.env.NODE_ENV === 'production';
/** Dev helpers expose reset tokens and live TOTP codes so the flow is testable without email or an authenticator app. */
const DEV_HELPERS = !IS_PROD && process.env.NTD_DEV_HELPERS !== 'off';

/**
 * Two tiers. The per-IP lock is tight and stops someone guessing at a single
 * account. The account-wide lock is deliberately loose: locking on 5 attempts
 * let anyone who knew a client ID take that account offline at will.
 */
const MAX_PASSWORD_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const MAX_ACCOUNT_ATTEMPTS = 30;
const ACCOUNT_LOCKOUT_MINUTES = 60;
const MAX_TOTP_ATTEMPTS = 5;
const CHALLENGE_MINUTES = 5;
const RESET_MINUTES = 30;
const SESSION_DAYS = 7;

const app = express();
app.use(express.json({ limit: '16kb' }));
app.disable('x-powered-by');

/* ---------------- helpers ---------------- */

const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString().replace('T', ' ').slice(0, 19);
const inDays = (d) => new Date(Date.now() + d * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
const isPast = (iso) => !!iso && new Date(`${iso}Z`).getTime() < Date.now();
const ipOf = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;

/** Coarse in-memory throttle. A real deployment would use a shared store. */
const buckets = new Map();
function throttle(limit, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}:${ipOf(req)}`;
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= limit) {
      return res.status(429).json({ error: 'too_many_requests', message: 'Too many attempts. Try again shortly.' });
    }
    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}

const GENERIC_CREDS = {
  error: 'invalid_credentials',
  message: 'The user ID or password is incorrect.',
};

const maskEmail = (email) => {
  const [user, domain] = String(email).split('@');
  if (!domain) return '•••';
  const head = user.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(user.length - 2, 2))}@${domain}`;
};

const maskClientId = (id) => `${id.slice(0, 2)}${'•'.repeat(Math.max(id.length - 4, 2))}${id.slice(-2)}`;

const maskPhone = (phone) => {
  const digits = normalisePhone(phone);
  return digits.length === 10 ? `+91 •••••${digits.slice(-5)}` : '•••';
};

function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password must be at least 10 characters.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

/* ---------------- login: password stage ---------------- */

app.post('/api/auth/login', throttle(20, 60_000), (req, res) => {
  const clientId = String(req.body?.clientId ?? '').trim().toUpperCase();
  const password = String(req.body?.password ?? '');
  const ip = ipOf(req);

  if (!clientId || !password) {
    return res.status(400).json({ error: 'missing_fields', message: 'Enter your user ID and password.' });
  }

  const user = findByClientId(clientId);

  // No such user: same shape and cost profile as a wrong password, so the response can't be used to enumerate IDs.
  if (!user) {
    recordAttempt(clientId, ip, 'password', false, 'unknown_user');
    return res.status(401).json(GENERIC_CREDS);
  }

  if (user.status !== 'active') {
    recordAttempt(clientId, ip, 'password', false, 'inactive');
    return res.status(403).json({ error: 'account_inactive', message: 'This account is not active. Contact support.' });
  }

  const pairLock = db
    .prepare('SELECT * FROM login_locks WHERE client_id = ? AND ip = ?')
    .get(clientId, ip ?? '');

  if (pairLock?.locked_until && !isPast(pairLock.locked_until)) {
    recordAttempt(clientId, ip, 'password', false, 'locked_ip');
    return res.status(423).json({
      error: 'account_locked',
      message: `Too many failed attempts. Try again after ${LOCKOUT_MINUTES} minutes.`,
    });
  }

  if (user.locked_until && !isPast(user.locked_until)) {
    recordAttempt(clientId, ip, 'password', false, 'locked_account');
    return res.status(423).json({
      error: 'account_locked',
      message: 'This account is temporarily locked. Contact support if it persists.',
    });
  }

  if (!verifyPassword(password, user.password_hash)) {
    const pairAttempts = (pairLock?.failed_attempts ?? 0) + 1;
    const pairLocked = pairAttempts >= MAX_PASSWORD_ATTEMPTS;
    db.prepare(
      `INSERT INTO login_locks (client_id, ip, failed_attempts, locked_until, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (client_id, ip) DO UPDATE
       SET failed_attempts = excluded.failed_attempts,
           locked_until = excluded.locked_until,
           updated_at = datetime('now')`,
    ).run(clientId, ip ?? '', pairLocked ? 0 : pairAttempts, pairLocked ? inMinutes(LOCKOUT_MINUTES) : null);

    const accountAttempts = user.failed_attempts + 1;
    const accountLocked = accountAttempts >= MAX_ACCOUNT_ATTEMPTS;
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(
      accountLocked ? 0 : accountAttempts,
      accountLocked ? inMinutes(ACCOUNT_LOCKOUT_MINUTES) : null,
      user.id,
    );

    recordAttempt(clientId, ip, 'password', false, pairLocked ? 'locked_out' : 'bad_password');
    if (pairLocked || accountLocked) {
      return res.status(423).json({
        error: 'account_locked',
        message: `Too many failed attempts. Try again after ${LOCKOUT_MINUTES} minutes.`,
      });
    }
    // Deliberately no attempts-remaining count: including it for known IDs only
    // would make this response an account-enumeration oracle.
    return res.status(401).json(GENERIC_CREDS);
  }

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM login_locks WHERE client_id = ? AND ip = ?').run(clientId, ip ?? '');

  const challengeId = randomUUID();
  db.prepare('INSERT INTO totp_challenges (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    challengeId,
    user.id,
    inMinutes(CHALLENGE_MINUTES),
  );
  recordAttempt(clientId, ip, 'password', true, null);

  res.json({
    stage: 'totp',
    challengeId,
    expiresInSeconds: CHALLENGE_MINUTES * 60,
    secondsIntoStep: secondsIntoStep(),
    user: { clientId: user.client_id, initials: publicUser(user).initials },
    ...(DEV_HELPERS ? { devCode: currentTotp(user.totp_secret) } : {}),
  });
});

/* ---------------- login: TOTP stage ---------------- */

app.post('/api/auth/totp', throttle(30, 60_000), (req, res) => {
  const challengeId = String(req.body?.challengeId ?? '');
  const code = String(req.body?.code ?? '');
  const ip = ipOf(req);

  const challenge = db.prepare('SELECT * FROM totp_challenges WHERE id = ?').get(challengeId);
  if (!challenge || challenge.consumed_at || isPast(challenge.expires_at)) {
    return res.status(410).json({ error: 'challenge_expired', message: 'That login attempt expired. Sign in again.' });
  }
  if (challenge.attempts >= MAX_TOTP_ATTEMPTS) {
    return res.status(429).json({ error: 'too_many_attempts', message: 'Too many codes tried. Sign in again.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(challenge.user_id);

  if (!verifyTotp(user.totp_secret, code)) {
    db.prepare('UPDATE totp_challenges SET attempts = attempts + 1 WHERE id = ?').run(challengeId);
    recordAttempt(user.client_id, ip, 'totp', false, 'bad_code');
    return res.status(401).json({
      error: 'invalid_code',
      message: 'That code is not valid.',
      attemptsLeft: MAX_TOTP_ATTEMPTS - (challenge.attempts + 1),
    });
  }

  db.prepare('UPDATE totp_challenges SET consumed_at = ? WHERE id = ?').run(nowIso(), challengeId);

  const token = randomToken();
  db.prepare('INSERT INTO sessions (user_id, token_hash, ip, expires_at) VALUES (?, ?, ?, ?)').run(
    user.id,
    sha256(token),
    ip,
    inDays(SESSION_DAYS),
  );
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), user.id);
  recordAttempt(user.client_id, ip, 'totp', true, null);

  res.json({ token, user: publicUser(user) });
});

/* ---------------- session ---------------- */

function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });

  const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!session || session.revoked_at || isPast(session.expires_at)) {
    return res.status(401).json({ error: 'session_expired' });
  }
  req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
  req.sessionId = session.id;
  next();
}

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

app.patch('/api/auth/profile', authenticate, throttle(10, 60_000), (req, res) => {
  const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'invalid_name', message: 'Enter a name between 2 and 80 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) return res.status(400).json({ error: 'invalid_email', message: 'Enter a valid email address.' });
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?').get(email, req.user.id);
  if (existing) return res.status(409).json({ error: 'email_taken', message: 'This email address is already in use.' });
  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

app.post('/api/auth/logout', authenticate, (req, res) => {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), req.sessionId);
  res.json({ ok: true });
});

/* ---------------- forgot user ID ---------------- */

/** You can't look up a user ID by user ID, so only the contact channels apply here. */
const USERID_METHODS = ['email', 'mobile'];

app.post('/api/auth/forgot-userid', throttle(10, 60_000), (req, res) => {
  // `email` is the pre-mobile request shape; still accepted.
  const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim();
  const requested = String(req.body?.method ?? '').trim();

  if (!identifier) {
    return res.status(400).json({
      error: 'missing_identifier',
      message: 'Enter your registered email or mobile number.',
    });
  }
  if (requested && !USERID_METHODS.includes(requested)) {
    return res.status(400).json({ error: 'invalid_method', message: 'Unsupported recovery method.' });
  }

  const methodKey = requested || (isMobileShaped(identifier) ? 'mobile' : 'email');
  const method = RECOVERY_METHODS[methodKey];

  if (!method.valid(identifier)) {
    return res.status(400).json({ error: 'invalid_identifier', message: method.invalidMessage });
  }

  const found = method.find(identifier);
  // Same reasoning as the password reset: admin identities are not disclosed here.
  const user = found && (found.role ?? 'user') === 'admin' ? null : found;
  const sentTo = user
    ? methodKey === 'mobile'
      ? maskPhone(user.phone)
      : maskEmail(user.email)
    : null;

  if (user) {
    db.prepare(
      'INSERT INTO userid_recoveries (user_id, email, method, sent_to) VALUES (?, ?, ?, ?)',
    ).run(user.id, user.email, methodKey, sentTo);
    console.log(`[userid] ${user.client_id} sent via ${methodKey} to ${sentTo}`);
  }

  // Always the same answer, so this can't be used to discover which contacts hold accounts.
  res.json({
    ok: true,
    method: methodKey,
    message: `If an account matches that ${method.label}, the user ID has been sent to it.`,
    ...(DEV_HELPERS && user
      ? { devClientId: user.client_id, devHint: maskClientId(user.client_id), devSentTo: sentTo }
      : {}),
  });
});

/* ---------------- forgot / reset password ---------------- */

const RECOVERY_METHODS = {
  clientId: {
    label: 'user ID',
    valid: (v) => /^[A-Za-z0-9]{4,16}$/.test(v),
    invalidMessage: 'Enter a valid user ID.',
    find: findByClientId,
  },
  email: {
    label: 'email',
    valid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    invalidMessage: 'Enter a valid email address.',
    find: findByEmail,
  },
  mobile: {
    label: 'mobile number',
    valid: isMobileShaped,
    invalidMessage: 'Enter a valid 10-digit Indian mobile number.',
    find: findByPhone,
  },
};

/** Older clients sent just an identifier; keep inferring one for them. */
const inferMethod = (value) => {
  if (value.includes('@')) return 'email';
  if (isMobileShaped(value)) return 'mobile';
  return 'clientId';
};

app.post('/api/auth/forgot-password', throttle(10, 60_000), (req, res) => {
  const identifier = String(req.body?.identifier ?? '').trim();
  const requested = String(req.body?.method ?? '').trim();

  if (!identifier) {
    return res.status(400).json({
      error: 'missing_identifier',
      message: 'Enter your user ID, email or mobile number.',
    });
  }
  if (requested && !RECOVERY_METHODS[requested]) {
    return res.status(400).json({ error: 'invalid_method', message: 'Unsupported recovery method.' });
  }

  const methodKey = requested || inferMethod(identifier);
  const method = RECOVERY_METHODS[methodKey];

  // Shape is checked before lookup so a typo reads as a format problem, not a missing account.
  if (!method.valid(identifier)) {
    return res.status(400).json({ error: 'invalid_identifier', message: method.invalidMessage });
  }

  const found = method.find(identifier);

  // Admins recover only through the server-side CLI. If a reset could be mailed,
  // control of one inbox would mean control of the console. The response below is
  // byte-identical either way, so this never reveals which accounts are admins.
  const user = found && (found.role ?? 'user') === 'admin' ? null : found;
  if (found && !user) {
    console.log(`[reset] refused for admin ${found.client_id} — use: npm run admin:recover`);
  }

  let devToken;
  if (user) {
    const token = randomToken();
    devToken = token;
    db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
      user.id,
      sha256(token),
      inMinutes(RESET_MINUTES),
    );
    console.log(`[reset] ${user.client_id} -> /reset-password?token=${token}`);
  }

  const channel = methodKey === 'mobile' ? 'mobile number' : 'email';

  res.json({
    ok: true,
    method: methodKey,
    message: `If an account matches that ${method.label}, a reset link has been sent to its registered ${channel}.`,
    expiresInMinutes: RESET_MINUTES,
    ...(DEV_HELPERS && user
      ? {
          devToken,
          devSentTo: methodKey === 'mobile' ? maskPhone(user.phone) : maskEmail(user.email),
        }
      : {}),
  });
});

app.post('/api/auth/reset-password', throttle(20, 60_000), (req, res) => {
  const token = String(req.body?.token ?? '');
  const password = String(req.body?.password ?? '');

  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: 'weak_password', message: problem });

  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(token));
  if (!row || row.used_at || isPast(row.expires_at)) {
    return res.status(400).json({ error: 'invalid_token', message: 'That reset link is invalid or has expired.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (verifyPassword(password, user.password_hash)) {
    return res.status(400).json({ error: 'password_reused', message: 'Choose a password you have not used before.' });
  }

  db.prepare(
    `UPDATE users SET password_hash = ?, password_changed_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?`,
  ).run(hashPassword(password), nowIso(), user.id);
  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowIso(), row.id);
  // A password change invalidates every existing session.
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(
    nowIso(),
    user.id,
  );

  res.json({ ok: true, message: 'Password updated. Sign in with your new password.' });
});

/* ---------------- funds ---------------- */

/** Account state, so authenticated and scoped to the caller — never a shared constant. */
app.get('/api/funds', authenticate, (req, res) => {
  const positions = positionRowsFor(req.user.id);
  const quoteFor = (symbol) => hub.latest.get(symbol);
  res.json({ funds: fundsFor(req.user.id, { positions, quoteFor }) });
});

app.get('/api/funds/statements', authenticate, (req, res) => {
  res.json({ statements: fundStatementsFor(req.user.id) });
});

app.post('/api/funds/transfer', authenticate, throttle(20, 60_000), (req, res) => {
  const direction = String(req.body?.direction ?? '').toLowerCase();
  const segment = String(req.body?.segment ?? '').toLowerCase();
  const amount = Number(req.body?.amount);

  if (!['add', 'withdraw'].includes(direction)) {
    return res.status(400).json({ error: 'invalid_direction', message: 'Choose add funds or withdraw.' });
  }
  if (!['equity', 'commodity'].includes(segment)) {
    return res.status(400).json({ error: 'invalid_segment', message: 'Choose a valid account segment.' });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000 || Math.round(amount * 100) !== amount * 100) {
    return res.status(400).json({ error: 'invalid_amount', message: 'Enter an amount between ₹0.01 and ₹1,00,00,000.' });
  }

  const positions = positionRowsFor(req.user.id);
  const quoteFor = (symbol) => hub.latest.get(symbol);
  const current = fundsFor(req.user.id, { positions, quoteFor });
  const account = current[segment];
  if (!account) {
    return res.status(404).json({ error: 'segment_not_found', message: 'This account segment is not available.' });
  }
  if (direction === 'withdraw' && amount > account.availableCash) {
    return res.status(400).json({ error: 'insufficient_cash', message: 'Withdrawal exceeds the available cash balance.' });
  }

  transferFunds(req.user.id, segment, direction, amount);
  res.json({ funds: fundsFor(req.user.id, { positions, quoteFor }) });
});

/** IPO and event calendar. Status is derived from today, so it cannot go stale. */
app.get('/api/calendar', (_req, res) => res.json(calendarFor()));

app.get('/api/bids', authenticate, (req, res) => res.json(bidBookFor(req.user.id)));

app.post('/api/bids', authenticate, throttle(20, 60_000), (req, res) => {
  const result = placeBid(req.user.id, Number(req.body?.issueId), Number(req.body?.lots), Number(req.body?.price));
  if (result.error) return res.status(result.error === 'not_found' ? 404 : 400).json(result);
  res.status(201).json(result);
});

app.delete('/api/bids/:id', authenticate, throttle(20, 60_000), (req, res) => {
  const result = cancelBid(req.user.id, Number(req.params.id));
  if (result.error) return res.status(result.error === 'not_found' ? 404 : 400).json(result);
  res.json(result);
});

/** Settled demat stock. Records only, same reasoning as positions. */
app.get('/api/holdings', authenticate, (req, res) => {
  res.json({ holdings: holdingRowsFor(req.user.id).map(presentHolding) });
});

app.get('/api/mutual-funds', authenticate, (req, res) => {
  res.json({ mutualFunds: mutualFundsFor(req.user.id) });
});

/** Records only — the browser merges these with its own live tick stream. */
app.get('/api/positions', authenticate, (req, res) => {
  res.json({ positions: positionRowsFor(req.user.id).map(presentPosition) });
});

app.get('/api/orders', authenticate, (req, res) => {
  res.json({ orders: ordersFor(req.user.id) });
});

app.get('/api/order-tools/:kind', authenticate, (req, res) => {
  const tools = toolsFor(req.user.id, req.params.kind);
  if (!tools) return res.status(404).json({ error: 'invalid_kind', message: 'Unknown order tool.' });
  res.json({ tools });
});

app.post('/api/order-tools/:kind', authenticate, throttle(30, 60_000), (req, res) => {
  const result = createTool(req.user.id, req.params.kind, req.body ?? {}, new Set(hub.latest.keys()));
  if (result.error) return res.status(result.error === 'unknown_instrument' ? 404 : 400).json(result);
  res.status(201).json(result);
});

app.patch('/api/order-tools/:id', authenticate, throttle(30, 60_000), (req, res) => {
  const result = setToolStatus(req.user.id, Number(req.params.id), String(req.body?.status ?? '').toUpperCase());
  if (result.error) return res.status(result.error === 'not_found' ? 404 : 400).json(result);
  res.json(result);
});

app.delete('/api/order-tools/:id', authenticate, throttle(30, 60_000), (req, res) => {
  const result = deleteTool(req.user.id, Number(req.params.id));
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

app.post('/api/orders', authenticate, throttle(60, 60_000), (req, res) => {
  const instrument = String(req.body?.instrument ?? '').trim();
  const side = String(req.body?.side ?? '').toUpperCase();
  const product = String(req.body?.product ?? '').toUpperCase();
  const qty = Number(req.body?.qty);
  const quote = hub.latest.get(instrument);

  if (!quote) return res.status(404).json({ error: 'unknown_instrument', message: 'No market quote is available.' });
  if (!['BUY', 'SELL'].includes(side)) return res.status(400).json({ error: 'invalid_side', message: 'Choose buy or sell.' });
  if (!['CNC', 'MIS', 'NRML'].includes(product)) return res.status(400).json({ error: 'invalid_product', message: 'Choose a valid product.' });
  if (!Number.isInteger(qty) || qty < 1 || qty > 100_000) {
    return res.status(400).json({ error: 'invalid_quantity', message: 'Quantity must be between 1 and 100,000.' });
  }

  const order = placeMarketOrder(req.user.id, {
    side,
    instrument,
    exchange: quote.exchange,
    product,
    qty,
    price: quote.ltp,
  });
  res.status(201).json({ order });
});

/* ---------------- market data ---------------- */

app.get('/api/market/history', (req, res) => {
  const symbol = String(req.query.symbol ?? '');
  const range = String(req.query.range ?? '1D').toUpperCase();
  if (!isRange(range)) return res.status(400).json({ error: 'invalid_range' });
  const result = history(symbol, range);
  if (!result) return res.status(404).json({ error: 'not_found' });
  res.json(result);
});

app.get('/api/market/snapshot', (_req, res) => {
  res.json({ ...hub.status, quotes: hub.snapshot() });
});

/**
 * Server-sent events: one server-side feed subscription fanned out to every
 * client. SSE rather than WebSocket because this direction is one-way and
 * browsers reconnect on their own.
 */
app.get('/api/market/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Without this, a reverse proxy will happily buffer the stream into silence.
    'X-Accel-Buffering': 'no',
  });

  res.write(`event: snapshot\ndata: ${JSON.stringify(hub.snapshot())}\n\n`);
  const remove = hub.addClient(res);

  // Comment frames keep intermediaries from closing an idle connection.
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    remove();
  });
});

/* ---------------- signup: open an account ---------------- */

app.post('/api/signup/start', throttle(8, 60_000), (req, res) => {
  const mobile = String(req.body?.mobile ?? '').trim();
  if (!isMobileShaped(mobile)) {
    return res.status(400).json({
      error: 'invalid_mobile',
      message: 'Enter a valid 10-digit Indian mobile number.',
    });
  }

  // An application is created whether or not this number already has an account.
  // Saying "already registered" here would turn signup into a customer-list oracle;
  // it is disclosed after the OTP proves the person controls the number.
  const application = createApplication(mobile, ipOf(req));
  const code = issueOtp(application.id);
  console.log(`[signup] OTP for +91 ${normalisePhone(mobile)} is ${code}`);

  res.status(201).json({
    reference: application.reference,
    expiresInMinutes: OTP_MINUTES,
    ...(DEV_HELPERS ? { devOtp: code } : {}),
  });
});

app.post('/api/signup/resend-otp', throttle(5, 60_000), (req, res) => {
  const application = findApplication(req.body?.reference);
  if (!application || isPast(application.expires_at) || application.status === 'completed') {
    return res.status(410).json({ error: 'expired', message: 'Start the application again.' });
  }

  const code = issueOtp(application.id);
  console.log(`[signup] OTP resent for +91 ${application.mobile_digits} is ${code}`);
  res.json({ ok: true, expiresInMinutes: OTP_MINUTES, ...(DEV_HELPERS ? { devOtp: code } : {}) });
});

app.post('/api/signup/verify-otp', throttle(20, 60_000), (req, res) => {
  const application = findApplication(req.body?.reference);
  if (!application || isPast(application.expires_at) || application.status === 'completed') {
    return res.status(410).json({ error: 'expired', message: 'Start the application again.' });
  }

  const result = verifyOtp(application.id, String(req.body?.code ?? ''));
  if (!result.ok) {
    const messages = {
      expired: 'That code has expired. Ask for a new one.',
      too_many: 'Too many incorrect codes. Start the application again.',
      invalid: 'That code is not correct.',
    };
    return res.status(result.reason === 'invalid' ? 401 : 410).json({
      error: result.reason,
      message: messages[result.reason],
      attemptsLeft: result.attemptsLeft,
    });
  }

  db.prepare(
    "UPDATE signup_applications SET mobile_verified = 1, status = 'mobile_verified', updated_at = datetime('now') WHERE id = ?",
  ).run(application.id);

  // Now that control of the number is proven, it is safe to say an account exists.
  const taken = contactTaken(application.mobile_digits, null);
  res.json({
    ok: true,
    alreadyRegistered: taken.mobile,
    message: taken.mobile
      ? 'This mobile number already has an NTD account. Sign in instead, or recover your user ID.'
      : 'Mobile number verified.',
  });
});

app.post('/api/signup/details', throttle(20, 60_000), (req, res) => {
  const application = findApplication(req.body?.reference);
  if (!application || isPast(application.expires_at)) {
    return res.status(410).json({ error: 'expired', message: 'Start the application again.' });
  }
  if (!application.mobile_verified) {
    return res.status(403).json({ error: 'unverified', message: 'Verify your mobile number first.' });
  }
  if (application.status === 'completed') {
    return res.status(409).json({ error: 'completed', message: 'This application is already complete.' });
  }

  const fullName = String(req.body?.fullName ?? '').trim();
  const email = String(req.body?.email ?? '').trim();
  const pan = String(req.body?.pan ?? '').toUpperCase().trim();
  const dob = String(req.body?.dob ?? '').trim();

  if (fullName.length < 3) {
    return res.status(400).json({ error: 'invalid_name', message: 'Enter your full name as on your PAN.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email', message: 'Enter a valid email address.' });
  }
  if (!isPan(pan)) {
    return res.status(400).json({ error: 'invalid_pan', message: 'PAN must look like ABCDE1234F.' });
  }

  const age = ageOn(dob);
  if (age === null) {
    return res.status(400).json({ error: 'invalid_dob', message: 'Enter your date of birth.' });
  }
  if (age < 18) {
    // SEBI does not permit a trading account for a minor in their own name.
    return res.status(400).json({
      error: 'underage',
      message: 'You must be 18 or older to open a trading account.',
    });
  }
  if (age > 120) {
    return res.status(400).json({ error: 'invalid_dob', message: 'Check the date of birth.' });
  }

  if (findByEmail(email)) {
    return res.status(409).json({
      error: 'email_taken',
      message: 'That email already has an NTD account. Sign in instead.',
    });
  }

  const { cipher, last4 } = storePan(pan);
  db.prepare(
    `UPDATE signup_applications
     SET full_name = ?, email = ?, pan_cipher = ?, pan_last4 = ?, dob = ?, status = 'details',
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(fullName, email, cipher, last4, dob, application.id);

  res.json({ ok: true, application: publicApplication(findApplication(application.reference)) });
});

app.post('/api/signup/complete', throttle(20, 60_000), (req, res) => {
  const application = findApplication(req.body?.reference);
  if (!application || isPast(application.expires_at)) {
    return res.status(410).json({ error: 'expired', message: 'Start the application again.' });
  }
  if (application.status === 'completed') {
    return res.status(409).json({ error: 'completed', message: 'This application is already complete.' });
  }
  if (!application.mobile_verified || !application.email || !application.pan_cipher) {
    return res.status(400).json({ error: 'incomplete', message: 'Finish the earlier steps first.' });
  }

  const password = String(req.body?.password ?? '');
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: 'weak_password', message: problem });

  // Re-check at the last moment: another application could have taken these since.
  if (findByEmail(application.email) || findByPhone(application.mobile_digits)) {
    return res.status(409).json({
      error: 'contact_taken',
      message: 'An account now exists for this mobile or email. Sign in instead.',
    });
  }

  const { clientId, totpSecret } = completeApplication(application, password);
  const otpauthUri = `otpauth://totp/NTD:${encodeURIComponent(clientId)}?secret=${totpSecret}&issuer=NTD&algorithm=SHA1&digits=6&period=30`;

  console.log(`[signup] account opened: ${clientId}`);
  res.status(201).json({ clientId, totpSecret, otpauthUri });
});

app.get('/api/signup/:reference', (req, res) => {
  const application = findApplication(req.params.reference);
  if (!application || isPast(application.expires_at)) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json({ application: publicApplication(application) });
});

/* ---------------- admin: notification provider master ---------------- */

function requireAdmin(req, res, next) {
  if ((req.user.role ?? 'user') !== 'admin') {
    // Deliberately 404, not 403: a non-admin learns nothing about what lives here.
    return res.status(404).json({ error: 'not_found' });
  }
  next();
}

const admin = [authenticate, requireAdmin];

app.get('/api/admin/providers/catalogue', admin, (_req, res) => res.json({ catalogue: CATALOGUE }));

app.get('/api/admin/providers', admin, (req, res) => {
  const channel = req.query.channel;
  if (channel && !isChannel(channel)) {
    return res.status(400).json({ error: 'invalid_channel', message: `Channel must be one of: ${Object.keys(CATALOGUE).join(", ")}.` });
  }
  res.json({ providers: listProviders(channel), keyIsEphemeral: MASTER_KEY_IS_EPHEMERAL });
});

app.post('/api/admin/providers', admin, (req, res) => {
  const { channel, driver, name, fromIdentity, values } = req.body ?? {};

  if (!isChannel(channel)) {
    return res.status(400).json({ error: 'invalid_channel', message: `Channel must be one of: ${Object.keys(CATALOGUE).join(", ")}.` });
  }
  const spec = driverSpec(channel, driver);
  if (!spec) {
    return res.status(400).json({ error: 'unknown_driver', message: 'That provider type is not supported.' });
  }
  if (!String(name ?? '').trim()) {
    return res.status(400).json({ error: 'missing_name', message: 'Give this provider a name.' });
  }

  const { settings, secrets, missing } = partitionFields(spec, values);
  const missingSecrets = requiredSecretsMissing(spec, secrets, null);
  if (missing.length || missingSecrets.length) {
    return res.status(400).json({
      error: 'missing_fields',
      message: `Required: ${[...missing, ...missingSecrets].join(', ')}.`,
    });
  }

  const isFirst = !db
    .prepare('SELECT 1 FROM notification_providers WHERE channel = ?')
    .get(channel);

  const info = db
    .prepare(
      `INSERT INTO notification_providers
         (channel, name, driver, from_identity, settings_json, secret_cipher, is_default, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      channel,
      String(name).trim(),
      driver,
      String(fromIdentity ?? '').trim() || null,
      JSON.stringify(settings),
      mergeSecrets(null, secrets),
      isFirst ? 1 : 0,
      req.user.id,
      req.user.id,
    );

  audit(Number(info.lastInsertRowid), channel, 'created', `${driver} · ${name}`, req.user);
  res.status(201).json({ provider: presentProvider(
    db.prepare('SELECT * FROM notification_providers WHERE id = ?').get(info.lastInsertRowid),
  ) });
});

app.patch('/api/admin/providers/:id', admin, (req, res) => {
  const row = db.prepare('SELECT * FROM notification_providers WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });

  const spec = driverSpec(row.channel, row.driver);
  const { name, fromIdentity, values, isActive } = req.body ?? {};
  const { settings, secrets, missing } = partitionFields(spec, values ?? {});

  // Only validate settings the caller actually sent; omitted secrets keep their stored value.
  if (values && missing.length) {
    return res.status(400).json({ error: 'missing_fields', message: `Required: ${missing.join(', ')}.` });
  }

  db.prepare(
    `UPDATE notification_providers
     SET name = ?, from_identity = ?, settings_json = ?, secret_cipher = ?, is_active = ?,
         updated_by = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    String(name ?? row.name).trim(),
    fromIdentity === undefined ? row.from_identity : String(fromIdentity).trim() || null,
    values ? JSON.stringify(settings) : row.settings_json,
    Object.keys(secrets).length ? mergeSecrets(row.secret_cipher, secrets) : row.secret_cipher,
    isActive === undefined ? row.is_active : isActive ? 1 : 0,
    req.user.id,
    row.id,
  );

  const changed = Object.keys(secrets).length ? 'settings and credentials' : 'settings';
  audit(row.id, row.channel, 'updated', changed, req.user);
  res.json({ provider: presentProvider(
    db.prepare('SELECT * FROM notification_providers WHERE id = ?').get(row.id),
  ) });
});

app.post('/api/admin/providers/:id/default', admin, (req, res) => {
  const row = db.prepare('SELECT * FROM notification_providers WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (!row.is_active) {
    return res.status(400).json({ error: 'inactive', message: 'Activate this provider before making it default.' });
  }

  // Clear first: the unique index allows only one default per channel.
  db.prepare('UPDATE notification_providers SET is_default = 0 WHERE channel = ?').run(row.channel);
  db.prepare("UPDATE notification_providers SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(row.id);

  audit(row.id, row.channel, 'set_default', row.name, req.user);
  res.json({ providers: listProviders(row.channel) });
});

app.post('/api/admin/providers/:id/test', admin, (req, res) => {
  const row = db.prepare('SELECT * FROM notification_providers WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });

  const spec = driverSpec(row.channel, row.driver);
  const stored = row.secret_cipher ? JSON.parse(decryptSecret(row.secret_cipher) ?? '{}') : {};
  const settings = JSON.parse(row.settings_json ?? '{}');

  const missing = spec.fields
    .filter((f) => f.required)
    .filter((f) => (f.secret ? !stored[f.key] : settings[f.key] === undefined))
    .map((f) => f.label);

  // Nothing is actually delivered yet — this checks the record is complete and decryptable.
  const ok = missing.length === 0 && !!row.from_identity;
  const message = ok
    ? 'Configuration is complete and credentials decrypt correctly. No message was sent — no gateway is wired up yet.'
    : `Incomplete: ${[...missing, ...(row.from_identity ? [] : ['sender identity'])].join(', ')}.`;

  db.prepare(
    "UPDATE notification_providers SET last_tested_at = datetime('now'), last_test_ok = ?, last_test_message = ? WHERE id = ?",
  ).run(ok ? 1 : 0, message, row.id);

  audit(row.id, row.channel, 'tested', ok ? 'passed' : 'failed', req.user);
  res.json({ ok, message, provider: presentProvider(
    db.prepare('SELECT * FROM notification_providers WHERE id = ?').get(row.id),
  ) });
});

app.delete('/api/admin/providers/:id', admin, (req, res) => {
  const row = db.prepare('SELECT * FROM notification_providers WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.is_default) {
    return res.status(400).json({
      error: 'is_default',
      message: 'Make another provider the default for this channel first.',
    });
  }

  db.prepare('DELETE FROM notification_providers WHERE id = ?').run(row.id);
  audit(null, row.channel, 'deleted', `${row.driver} · ${row.name}`, req.user);
  res.json({ ok: true });
});

app.get('/api/admin/providers/audit', admin, (_req, res) => {
  res.json({
    entries: db
      .prepare('SELECT * FROM provider_audit ORDER BY id DESC LIMIT 50')
      .all()
      .map((e) => ({
        id: e.id,
        channel: e.channel,
        action: e.action,
        detail: e.detail,
        actor: e.actor_client_id,
        at: e.created_at,
      })),
  });
});

/* ---------------- dev helper ---------------- */

if (DEV_HELPERS) {
  app.get('/api/dev/totp/:clientId', (req, res) => {
    const user = findByClientId(req.params.clientId);
    if (!user) return res.status(404).json({ error: 'not_found' });
    res.json({
      clientId: user.client_id,
      code: currentTotp(user.totp_secret),
      validForSeconds: 30 - secondsIntoStep(),
    });
  });

  app.get('/api/dev/users', (_req, res) => {
    res.json({
      users: db
        .prepare('SELECT client_id, name, email, status, last_login_at FROM users ORDER BY id')
        .all(),
    });
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, db: DB_PATH }));

/* ---------------- start ---------------- */

const created = seed();
const fundRows = seedFunds();
const fundTransactionRows = seedFundTransactions();
const positionRows = seedPositions();
const holdingRows = seedHoldings();
const mutualFundRows = seedMutualFunds();
const calendarRows = seedCalendar();
await hub.start();
const server = app.listen(PORT, () => {
  console.log(`NTD auth API on http://localhost:${PORT}`);
  console.log(`database: ${DB_PATH}`);
  if (created.length) {
    console.log('\nseeded demo accounts (password shown once, stored only as a scrypt hash):');
    for (const account of created) {
      console.log(`  ${account.clientId}  ${account.password}   TOTP secret ${account.secret}`);
    }
    console.log('');
  }
  if (fundRows) console.log('seeded ' + fundRows + ' fund rows');
  if (fundTransactionRows) console.log('seeded ' + fundTransactionRows + ' fund transaction rows');
  if (positionRows) console.log('seeded ' + positionRows + ' position rows');
  if (holdingRows) console.log('seeded ' + holdingRows + ' holding rows');
  if (mutualFundRows) console.log('seeded ' + mutualFundRows + ' mutual fund rows');
  if (calendarRows) console.log('seeded ' + calendarRows + ' calendar rows');
  if (DEV_HELPERS) console.log('dev helpers ON — /api/dev/totp/:clientId returns live codes\n');
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down`);
  server.close();
  await hub.stop();
  flushAll();
  db.close();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
