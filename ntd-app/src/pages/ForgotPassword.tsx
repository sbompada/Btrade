import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import AuthFooter from '../components/AuthFooter';
import { ApiError, api } from '../lib/api';
import { MethodField, MethodTabs, specsFor, type MethodSpec } from '../lib/recoveryMethods';

const SPECS = specsFor(['clientId', 'email', 'mobile']);

export default function ForgotPassword() {
  const [method, setMethod] = useState<MethodSpec>(SPECS[0]);
  const [value, setValue] = useState('');
  const [sent, setSent] = useState<{
    message: string;
    devToken?: string;
    devSentTo?: string;
    expires: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chooseMethod = (spec: MethodSpec) => {
    setMethod(spec);
    setValue('');
    setError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.forgotPassword(value, method.key);
      setSent({
        message: result.message,
        devToken: result.devToken,
        devSentTo: result.devSentTo,
        expires: result.expiresInMinutes,
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
        <span style={{ fontSize: 17, fontWeight: 500 }}>Reset your password</span>
        <span style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: 'var(--muted)' }}>
          Choose how you&rsquo;d like us to find your account. The reset link expires shortly.
        </span>

        {error && (
          <div className="notice error" style={{ marginTop: 16 }} role="alert">
            {error}
          </div>
        )}

        {sent ? (
          <>
            <div className="notice info" style={{ marginTop: 18 }} role="status">
              {sent.message} The link is valid for {sent.expires} minutes.
            </div>
            {sent.devToken && (
              <div className="notice dev" style={{ marginTop: 10 }}>
                <b>Dev helper</b>
                <span>In production this goes to {sent.devSentTo}. Here you can follow it directly:</span>
                <Link to={`/reset-password?token=${sent.devToken}`} style={{ fontSize: 11 }}>
                  Open the reset link →
                </Link>
              </div>
            )}
            <button
              type="button"
              className="btn ghost block"
              style={{ marginTop: 16 }}
              onClick={() => {
                setSent(null);
                setValue('');
              }}
            >
              Try another method
            </button>
            <Link to="/login" className="auth-back">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <MethodTabs
              specs={SPECS}
              active={method.key}
              onChange={chooseMethod}
              style={{ marginTop: error ? 12 : 20 }}
            />

            <MethodField spec={method} value={value} onChange={setValue} />

            <button
              className="btn primary block"
              style={{ marginTop: 14 }}
              type="submit"
              disabled={busy || !method.valid(value)}
            >
              {busy ? 'Sending…' : 'Send reset link'}
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
