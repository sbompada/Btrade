/**
 * Break-glass recovery. Authenticated by access to this machine, not by a password —
 * which is the point: it works when email, SMS and 2FA do not.
 *
 *   npm run admin:recover -- list
 *   npm run admin:recover -- unlock         --client ADMIN01
 *   npm run admin:recover -- reset-password --client ADMIN01 [--password '...']
 *   npm run admin:recover -- reset-totp     --client ADMIN01
 *   npm run admin:recover -- promote        --client MN7315
 *   npm run admin:recover -- demote         --client MN7315
 */
import { parseArgs } from 'node:util';
import { hostname, userInfo } from 'node:os';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { generateTotpSecret, hashPassword } from './crypto.js';

const ACTIONS = ['list', 'unlock', 'reset-password', 'reset-totp', 'promote', 'demote'];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    client: { type: 'string' },
    password: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const action = positionals[0];
const operator = `${userInfo().username}@${hostname()}`;

const die = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const usage = () => {
  console.log(`
  NTD break-glass recovery — run on the server, no login required.

    list                              show every account, role and lock state
    unlock         --client <ID>      clear password lockouts
    reset-password --client <ID>      set a new password (generated unless --password)
    reset-totp     --client <ID>      issue a new 2FA secret and print the enrolment URI
    promote        --client <ID>      grant admin
    demote         --client <ID>      revoke admin

  Every action is written to recovery_audit with the operating-system user.
`);
};

if (values.help || !action) {
  usage();
  process.exit(values.help ? 0 : 1);
}
if (!ACTIONS.includes(action)) die(`Unknown action "${action}". One of: ${ACTIONS.join(', ')}`);

const record = (clientId, act, detail) =>
  db
    .prepare('INSERT INTO recovery_audit (client_id, action, detail, performed_by) VALUES (?, ?, ?, ?)')
    .run(clientId, act, detail ?? null, operator);

/* ---------- list ---------- */

if (action === 'list') {
  const rows = db
    .prepare('SELECT client_id, name, email, role, status, failed_attempts, locked_until, last_login_at FROM users ORDER BY role DESC, client_id')
    .all();

  console.log('');
  for (const r of rows) {
    const pairLocks = db
      .prepare("SELECT COUNT(*) AS n FROM login_locks WHERE client_id = ? AND locked_until > datetime('now')")
      .get(r.client_id).n;
    const flags = [
      r.role === 'admin' ? 'ADMIN' : null,
      r.status !== 'active' ? r.status.toUpperCase() : null,
      r.locked_until ? 'ACCOUNT-LOCKED' : null,
      pairLocks ? `IP-LOCKED(${pairLocks})` : null,
    ].filter(Boolean);
    console.log(
      `  ${r.client_id.padEnd(9)} ${r.name.padEnd(24)} ${r.email.padEnd(28)} ${flags.join(' ') || '—'}`,
    );
  }
  console.log('');
  process.exit(0);
}

/* ---------- everything below needs a client ---------- */

if (!values.client) die('--client <ID> is required for this action.');

const clientId = values.client.trim().toUpperCase();
const user = db.prepare('SELECT * FROM users WHERE client_id = ?').get(clientId);
if (!user) die(`No account with client ID "${clientId}".`);

if (action === 'unlock') {
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
  const cleared = db.prepare('DELETE FROM login_locks WHERE client_id = ?').run(clientId);
  record(clientId, 'unlock', `cleared ${cleared.changes} ip lock(s)`);
  console.log(`\n  ${clientId} unlocked — ${cleared.changes} per-IP lock(s) cleared.\n`);
  process.exit(0);
}

if (action === 'reset-password') {
  // 18 random bytes in base64url: no wordlist, no ambiguity about strength.
  const password = values.password ?? `${randomBytes(12).toString('base64url')}A1`;
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    die('Password must be at least 10 characters and contain a letter and a number.');
  }

  db.prepare(
    `UPDATE users SET password_hash = ?, password_changed_at = datetime('now'),
                      failed_attempts = 0, locked_until = NULL WHERE id = ?`,
  ).run(hashPassword(password), user.id);
  db.prepare('DELETE FROM login_locks WHERE client_id = ?').run(clientId);
  // A password change invalidates every live session, exactly as the web flow does.
  const revoked = db
    .prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL")
    .run(user.id);
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(user.id);

  record(clientId, 'reset-password', values.password ? 'operator-supplied' : 'generated');
  console.log(`\n  Password for ${clientId} set to:\n\n      ${password}\n`);
  console.log(`  ${revoked.changes} session(s) revoked. Change it after signing in — this was printed to a terminal.\n`);
  process.exit(0);
}

if (action === 'reset-totp') {
  const secret = generateTotpSecret();
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);
  db.prepare("UPDATE totp_challenges SET consumed_at = datetime('now') WHERE user_id = ? AND consumed_at IS NULL").run(user.id);
  db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(user.id);

  const uri = `otpauth://totp/uni-share:${encodeURIComponent(clientId)}?secret=${secret}&issuer=uni-share&algorithm=SHA1&digits=6&period=30`;
  record(clientId, 'reset-totp', 'new secret issued');
  console.log(`\n  New 2FA secret for ${clientId}:\n\n      ${secret}\n`);
  console.log(`  Enrol with:\n\n      ${uri}\n`);
  console.log('  The old authenticator entry no longer works. All sessions revoked.\n');
  process.exit(0);
}

if (action === 'promote' || action === 'demote') {
  const target = action === 'promote' ? 'admin' : 'user';
  if ((user.role ?? 'user') === target) die(`${clientId} is already ${target}.`);

  if (action === 'demote') {
    const admins = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    // Leaving zero admins would make the console unreachable except through this CLI.
    if (admins <= 1) die('Refusing to remove the last admin. Promote someone else first.');
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(target, user.id);
  record(clientId, action, `role -> ${target}`);
  console.log(`\n  ${clientId} is now ${target}.\n`);

  if (action === 'promote') {
    console.log('  Reminder: keep at least two admins so a lost device is not an incident.\n');
  }
  process.exit(0);
}
