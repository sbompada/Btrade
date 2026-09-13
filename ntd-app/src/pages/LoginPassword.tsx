import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthFooter from '../components/AuthFooter';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';

/** Returning-user screen: the client ID comes from the last successful sign-in on this device. */
export default function LoginPassword() {
  const navigate = useNavigate();
  const { lastClientId } = useAuth();
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Nothing remembered on this device, so there is no account to greet.
  if (!lastClientId) return <Navigate to="/login" replace />;

  const initials = lastClientId.slice(0, 2).toUpperCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.login(lastClientId, password);
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
      <form className="auth-card centered" onSubmit={submit}>
        <div className="auth-avatar">
          <span className="num">{initials}</span>
        </div>

        <span className="num" style={{ marginTop: 16, fontSize: 18, fontWeight: 500, letterSpacing: '0.04em' }}>
          {lastClientId}
        </span>
        <Link to="/login" style={{ marginTop: 6, fontSize: 11 }}>
          Change user
        </Link>

        {error && (
          <div className="notice error" style={{ marginTop: 16, width: '100%' }} role="alert">
            {error}
          </div>
        )}

        <div className="field" style={{ marginTop: error ? 12 : 24, width: '100%' }}>
          <input
            type={reveal ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
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

        <button
          className="btn primary block"
          style={{ marginTop: 12 }}
          type="submit"
          disabled={busy || !password}
        >
          {busy ? 'Checking…' : 'Login'}
        </button>

        <Link to="/forgot-password" className="auth-back">
          Forgot user ID or password?
        </Link>
      </form>

      <AuthFooter />
    </div>
  );
}
