import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64, saltLen: 32 };

/** Stored as scrypt$N$r$p$saltHex$hashHex — self-describing so params can change later. */
export function hashPassword(password) {
  const salt = randomBytes(SCRYPT.saltLen);
  const hash = scryptSync(password, salt, SCRYPT.keyLen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('hex');

/** Reset and session tokens live in the DB only as digests, so a DB leak is not a key ring. */
export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* ---------------- secret-at-rest encryption (AES-256-GCM) ---------------- */

/**
 * Provider credentials are encrypted before they touch the database, so a stolen
 * .db file does not hand over working API keys. The key lives outside the DB.
 */
const masterKey = (() => {
  const hex = process.env.NTD_MASTER_KEY;
  if (hex) {
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('NTD_MASTER_KEY must be 64 hex characters (32 bytes).');
    }
    return Buffer.from(hex, 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NTD_MASTER_KEY is required in production — refusing to start.');
  }
  console.warn(
    '[crypto] NTD_MASTER_KEY not set — using a fixed development key. Never run production this way.',
  );
  return scryptSync('ntd-development-master-key', 'ntd-dev-salt', 32);
})();

export const MASTER_KEY_IS_EPHEMERAL = !process.env.NTD_MASTER_KEY;

/** Returns iv.tag.ciphertext, all base64, in one string. */
export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(blob) {
  if (!blob) return null;
  try {
    const [ivB64, tagB64, dataB64] = String(blob).split('.');
    const decipher = createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or tampered row — treat as unusable rather than crashing the request.
    return null;
  }
}

/** What the UI shows in place of a stored credential. Never the real value. */
export function maskSecret(blob) {
  const value = decryptSecret(blob);
  if (!value) return null;
  const tail = value.slice(-4);
  return `${'•'.repeat(Math.min(Math.max(value.length - 4, 4), 20))}${tail}`;
}

export const generateMasterKey = () => randomBytes(32).toString('hex');

/* ---------------- TOTP (RFC 6238, SHA-1, 6 digits, 30s step) ---------------- */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20) {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(secret) {
  const clean = secret.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const idx = B32.indexOf(char);
    if (idx === -1) throw new Error('Invalid base32 character in TOTP secret');
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpAt(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export const currentTotp = (secret, step = 30) =>
  totpAt(secret, Math.floor(Date.now() / 1000 / step));

/** Accepts the previous and next step too, so clock skew doesn't lock people out. */
export function verifyTotp(secret, code, { step = 30, window = 1 } = {}) {
  const clean = String(code).replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let drift = -window; drift <= window; drift += 1) {
    if (safeEqual(totpAt(secret, counter + drift), clean)) return true;
  }
  return false;
}

export const secondsIntoStep = (step = 30) => Math.floor(Date.now() / 1000) % step;
