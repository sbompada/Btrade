import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthFooter from '../components/AuthFooter';
import * as Icon from '../components/Icons';
import { ApiError, api } from '../lib/api';

export default function LoginUserId() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.login(clientId, password);
      navigate('/login/2fa', {
        state: {
          challengeId: result.challengeId,
          clientId: result.user.clientId,
          initials: result.user.initials,
          devCode: result.devCode,
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <span style={{ fontSize: 17, fontWeight: 500 }}>Sign in to NTD</span>
        <span style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
          Use the client ID from your welcome email.
        </span>

        {error && (
          <div className="notice error" style={{ marginTop: 16 }} role="alert">
            {error}
          </div>
        )}

        <div className="field" style={{ marginTop: error ? 12 : 22 }}>
          <span style={{ color: 'var(--dim)', display: 'flex' }}>
            <Icon.User />
          </span>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="User ID"
            autoComplete="username"
            autoFocus
          />
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <span style={{ color: 'var(--dim)', display: 'flex' }}>
            <Icon.Lock />
          </span>
          <input
            type={reveal ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
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

        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          type="submit"
          disabled={busy || !clientId || !password}
        >
          {busy ? 'Checking…' : 'Login'}
        </button>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 12, fontSize: 11 }}>
          <Link to="/forgot-userid" style={{ color: 'var(--text-3)' }}>
            Forgot user ID?
          </Link>
          <span style={{ color: 'var(--faint)' }}>·</span>
          <Link to="/forgot-password" style={{ color: 'var(--text-3)' }}>
            Forgot password?
          </Link>
        </div>
      </form>

      <AuthFooter />
    </div>
  );
}
