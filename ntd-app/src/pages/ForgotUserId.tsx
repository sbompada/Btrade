import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import AuthFooter from '../components/AuthFooter';
import { ApiError, api } from '../lib/api';
import { MethodField, MethodTabs, specsFor, type MethodSpec } from '../lib/recoveryMethods';

const SPECS = specsFor(['email', 'mobile']);

export default function ForgotUserId() {
  const [method, setMethod] = useState<MethodSpec>(SPECS[0]);
  const [value, setValue] = useState('');
  const [sent, setSent] = useState<{
    message: string;
    devClientId?: string;
    devSentTo?: string;
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
      const result = await api.forgotUserId(value, method.key as 'email' | 'mobile');
      setSent({
        message: result.message,
        devClientId: result.devClientId,
        devSentTo: result.devSentTo,
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
        <span style={{ fontSize: 17, fontWeight: 500 }}>Find your user ID</span>
        <span style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: 'var(--muted)' }}>
          Tell us how to reach you and we&rsquo;ll send your client ID there.
        </span>

        {error && (
          <div className="notice error" style={{ marginTop: 16 }} role="alert">
            {error}
          </div>
        )}

        {sent ? (
          <>
            <div className="notice info" style={{ marginTop: 18 }} role="status">
              {sent.message}
            </div>
            {sent.devClientId && (
              <div className="notice dev" style={{ marginTop: 10 }}>
                <b>Dev helper</b>
                <span>
                  User ID for that account: <strong>{sent.devClientId}</strong>
                  {sent.devSentTo ? ` — would be sent to ${sent.devSentTo}.` : '.'} In production this
                  is never returned to the browser.
                </span>
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
              {busy ? 'Sending…' : 'Send my user ID'}
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
