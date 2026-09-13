import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import AuthFooter from '../components/AuthFooter';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';

const LENGTH = 6;

type ChallengeState = {
  challengeId: string;
  clientId: string;
  initials: string;
  devCode?: string;
};

export default function LoginTotp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const state = location.state as ChallengeState | null;

  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const tick = () => setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Reached directly without completing the password stage.
  if (!state?.challengeId) return <Navigate to="/login" replace />;

  const code = digits.join('');

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      // Pasting the whole code into one box fills the rest.
      for (let i = 0; i < clean.length && index + i < LENGTH; i += 1) next[index + i] = clean[i];
      return next;
    });
    const landed = Math.min(index + clean.length, LENGTH - 1);
    inputs.current[landed]?.focus();
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.verifyTotp(state.challengeId, code);
      signIn(token, user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setError(apiErr?.message ?? 'Could not reach the server.');
      if (apiErr && (apiErr.code === 'challenge_expired' || apiErr.code === 'too_many_attempts')) {
        setTimeout(() => navigate('/login', { replace: true }), 1800);
      }
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="auth-card centered" onSubmit={submit}>
        <div className="auth-avatar sm">
          <span className="num">{state.initials}</span>
        </div>
        <span className="num" style={{ marginTop: 12, fontSize: 14, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
          {state.clientId}
        </span>

        <span style={{ marginTop: 20, fontSize: 15, fontWeight: 500 }}>Two-factor authentication</span>
        <span
          style={{
            marginTop: 6,
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--muted)',
            textAlign: 'center',
            textWrap: 'pretty',
          }}
        >
          Enter the 6-digit code from your authenticator app.
        </span>

        {error && (
          <div className="notice error" style={{ marginTop: 16, width: '100%' }} role="alert">
            {error}
          </div>
        )}

        <div className="otp" style={{ marginTop: error ? 14 : 22 }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              aria-label={`Digit ${i + 1}`}
              autoFocus={i === 0}
            />
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--dim)' }}>
          <Icon.Clock />
          <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>
            Code refreshes in {secondsLeft}s
          </span>
        </div>

        {state.devCode && (
          <div className="notice dev" style={{ marginTop: 14, width: '100%' }}>
            <b>Dev helper</b>
            <span>
              Current code {state.devCode} — shown only because the API is in development mode.
            </span>
          </div>
        )}

        <button
          className="btn primary block"
          style={{ marginTop: 18 }}
          type="submit"
          disabled={busy || code.length !== LENGTH}
        >
          {busy ? 'Verifying…' : 'Continue'}
        </button>

        <button
          type="button"
          className="auth-back"
          onClick={() => navigate('/login', { replace: true })}
        >
          Back to sign in
        </button>
      </form>

      <AuthFooter />
    </div>
  );
}
