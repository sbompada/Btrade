import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthFooter from '../components/AuthFooter';
import * as Icon from '../components/Icons';
import { ApiError, api } from '../lib/api';

const rules = (password: string) => [
  { label: 'At least 10 characters', ok: password.length >= 10 },
  { label: 'Contains a letter', ok: /[A-Za-z]/.test(password) },
  { label: 'Contains a number', ok: /\d/.test(password) },
];

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const checks = rules(password);
  const allOk = checks.every((c) => c.ok);
  const matches = password.length > 0 && password === confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="auth">
        <div className="auth-card">
          <span style={{ fontSize: 17, fontWeight: 500 }}>Reset link missing</span>
          <div className="notice error" style={{ marginTop: 16 }}>
            This page needs a reset token. Request a new link and follow it from your email.
          </div>
          <Link to="/forgot-password" className="btn primary block" style={{ marginTop: 16 }}>
            Request a new link
          </Link>
        </div>
        <AuthFooter />
      </div>
    );
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <span style={{ fontSize: 17, fontWeight: 500 }}>Choose a new password</span>
        <span style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: 'var(--muted)' }}>
          Signing in again will be required on every device.
        </span>

        {error && (
          <div className="notice error" style={{ marginTop: 16 }} role="alert">
            {error}
          </div>
        )}

        {done ? (
          <div className="notice info" style={{ marginTop: 18 }} role="status">
            Password updated. Taking you to sign in…
          </div>
        ) : (
          <>
            <div className="field" style={{ marginTop: error ? 12 : 22 }}>
              <span style={{ color: 'var(--dim)', display: 'flex' }}>
                <Icon.Lock />
              </span>
              <input
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                style={{ color: reveal ? 'var(--amber)' : 'var(--dim)', display: 'flex' }}
                aria-label={reveal ? 'Hide password' : 'Show password'}
              >
                <Icon.Eye />
              </button>
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <span style={{ color: 'var(--dim)', display: 'flex' }}>
                <Icon.Lock />
              </span>
              <input
                type={reveal ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {checks.map((c) => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      background: c.ok ? 'var(--up)' : 'var(--faint)',
                    }}
                  />
                  <span style={{ fontSize: 11, color: c.ok ? 'var(--up)' : 'var(--muted)' }}>
                    {c.label}
                  </span>
                </div>
              ))}
              {confirm.length > 0 && !matches && (
                <span style={{ fontSize: 11, color: 'var(--down)' }}>Passwords do not match.</span>
              )}
            </div>

            <button
              className="btn primary block"
              style={{ marginTop: 16 }}
              type="submit"
              disabled={busy || !allOk || !matches}
            >
              {busy ? 'Updating…' : 'Update password'}
            </button>

            <Link to="/login" className="auth-back">
              Back to sign in
            </Link>
          </>
        )}
      </form>

      <AuthFooter />
    </div>
  );
}
