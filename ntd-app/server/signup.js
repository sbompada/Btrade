import { randomBytes, randomInt } from 'node:crypto';
import { db, findByEmail, findByPhone, normalisePhone } from './db.js';
import { encryptSecret, generateTotpSecret, hashPassword, safeEqual, sha256 } from './crypto.js';

export const OTP_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 5;
export const APPLICATION_HOURS = 24;

/** Regulator-facing identifiers deserve strict shapes, not "looks about right". */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const isPan = (value) => PAN_PATTERN.test(String(value ?? '').toUpperCase().trim());

export function ageOn(dob, when = new Date()) {
  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  let age = when.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = when.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && when.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

export const newReference = () => randomBytes(16).toString('hex');

const stamp = (minutes) =>
  new Date(Date.now() + minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19);

export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const isPast = (iso) => !!iso && new Date(`${iso}Z`).getTime() < Date.now();

export const findApplication = (reference) =>
  db.prepare('SELECT * FROM signup_applications WHERE reference = ?').get(String(reference ?? ''));

export function createApplication(mobile, ip) {
  const reference = newReference();
  const info = db
    .prepare(
      `INSERT INTO signup_applications (reference, mobile_digits, ip, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(reference, normalisePhone(mobile), ip ?? null, stamp(APPLICATION_HOURS * 60));
  return db.prepare('SELECT * FROM signup_applications WHERE id = ?').get(info.lastInsertRowid);
}

/** OTPs are stored hashed — a database read should not hand over a live code. */
export function issueOtp(applicationId) {
  db.prepare(
    "UPDATE signup_otps SET consumed_at = datetime('now') WHERE application_id = ? AND consumed_at IS NULL",
  ).run(applicationId);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(
    'INSERT INTO signup_otps (application_id, code_hash, expires_at) VALUES (?, ?, ?)',
  ).run(applicationId, sha256(code), stamp(OTP_MINUTES));
  return code;
}

export function verifyOtp(applicationId, code) {
  const row = db
    .prepare(
      'SELECT * FROM signup_otps WHERE application_id = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1',
    )
    .get(applicationId);

  if (!row || isPast(row.expires_at)) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_OTP_ATTEMPTS) return { ok: false, reason: 'too_many' };

  if (!safeEqual(row.code_hash, sha256(String(code)))) {
    db.prepare('UPDATE signup_otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return { ok: false, reason: 'invalid', attemptsLeft: MAX_OTP_ATTEMPTS - (row.attempts + 1) };
  }

  db.prepare('UPDATE signup_otps SET consumed_at = ? WHERE id = ?').run(now(), row.id);
  return { ok: true };
}

/** Whether this contact already has an account — only ever revealed after OTP. */
export const contactTaken = (mobileDigits, email) => ({
  mobile: !!findByPhone(mobileDigits),
  email: email ? !!findByEmail(email) : false,
});

export const panTaken = (pan) => {
  const digest = sha256(String(pan).toUpperCase());
  return !!db
    .prepare("SELECT 1 FROM signup_applications WHERE pan_last4 = ? AND status = 'completed' AND reference != ''")
    .get(digest.slice(-4));
};

/** Initials plus digits, retried until unique. */
export function generateClientId(fullName) {
  const letters =
    String(fullName ?? '')
      .toUpperCase()
      .replace(/[^A-Z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .padEnd(2, 'X') || 'NT';

  const exists = db.prepare('SELECT 1 FROM users WHERE client_id = ?');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = `${letters}${String(randomInt(1000, 10000))}`;
    if (!exists.get(candidate)) return candidate;
  }
  throw new Error('Could not allocate a client ID');
}

export function completeApplication(application, password) {
  const clientId = generateClientId(application.full_name);
  const totpSecret = generateTotpSecret();

  db.prepare(
    `INSERT INTO users (client_id, name, email, phone, phone_digits, password_hash, totp_secret, role, password_changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'user', datetime('now'))`,
  ).run(
    clientId,
    application.full_name,
    application.email,
    `+91 ${application.mobile_digits.slice(0, 5)} ${application.mobile_digits.slice(5)}`,
    application.mobile_digits,
    hashPassword(password),
    totpSecret,
  );

  db.prepare(
    "UPDATE signup_applications SET status = 'completed', client_id = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(clientId, application.id);

  return { clientId, totpSecret };
}

export const storePan = (pan) => ({
  cipher: encryptSecret(String(pan).toUpperCase()),
  last4: String(pan).toUpperCase().slice(-4),
});

export const publicApplication = (row) => ({
  reference: row.reference,
  status: row.status,
  mobile: `+91 •••••${row.mobile_digits.slice(-5)}`,
  mobileVerified: !!row.mobile_verified,
  fullName: row.full_name,
  email: row.email,
  panLast4: row.pan_last4,
  clientId: row.client_id,
});
