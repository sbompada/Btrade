import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthFooter from '../components/AuthFooter';
import * as Icon from '../components/Icons';
import { ApiError, signupApi } from '../lib/api';

type Step = 'mobile' | 'otp' | 'details' | 'password' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'mobile', label: 'Mobile' },
  { key: 'otp', label: 'Verify' },
  { key: 'details', label: 'Details' },
  { key: 'password', label: 'Password' },
];

const OTP_LENGTH = 6;

const passwordRules = (value: string) => [
  { label: 'At least 10 characters', ok: value.length >= 10 },
  { label: 'Contains a letter', ok: /[A-Za-z]/.test(value) },
  { label: 'Contains a number', ok: /\d/.test(value) },
];

function Progress({ step }: { step: Step }) {
  const index = STEPS.findIndex((s) => s.key === step);
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
      {STEPS.map((s, i) => (
        <div key={s.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: i <= index ? 'var(--amber)' : 'var(--rule)',
            }}
          />
          <span style={{ fontSize: 9, color: i <= index ? 'var(--amber)' : 'var(--dimmer)' }}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('mobile');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mobile, setMobile] = useState('');
  const [devOtp, setDevOtp] = useState<string | undefined>();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpInputs = useRef<(HTMLInputElement | null)[]>([]);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [pan, setPan] = useState('');
  const [dob, setDob] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);

  const [result, setResult] = useState<{ clientId: string; totpSecret: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (step !== 'otp' || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const mobileValid = /^[6-9]\d{9}$/.test(mobile);
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const detailsValid = fullName.trim().length >= 3 && emailValid && panValid && !!dob;
  const checks = passwordRules(password);
  const passwordValid = checks.every((c) => c.ok) && password === confirm;
  const code = digits.join('');

  const submitMobile = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await signupApi.start(mobile);
      setReference(res.reference);
      setDevOtp(res.devOtp);
      setSecondsLeft(res.expiresInMinutes * 60);
      setStep('otp');
    });
  };

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < clean.length && index + i < OTP_LENGTH; i += 1) next[index + i] = clean[i];
      return next;
    });
    otpInputs.current[Math.min(index + clean.length, OTP_LENGTH - 1)]?.focus();
  };

  const submitOtp = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await signupApi.verifyOtp(reference, code);
      if (res.alreadyRegistered) {
        setAlreadyRegistered(true);
        return;
      }
      setStep('details');
    });
  };

  const submitDetails = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await signupApi.details(reference, { fullName, email, pan, dob });
      setStep('password');
    });
  };

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await signupApi.complete(reference, password);
      setResult({ clientId: res.clientId, totpSecret: res.totpSecret });
      setStep('done');
    });
  };

  if (alreadyRegistered) {
    return (
      <div className="auth">
        <div className="auth-card">
          <span style={{ fontSize: 17, fontWeight: 500 }}>You already have an account</span>
          <div className="notice info" style={{ marginTop: 16 }}>
            This mobile number is already registered with uni-share. Sign in, or recover your user ID if
            you&rsquo;ve forgotten it.
          </div>
          <Link to="/login" className="btn primary block" style={{ marginTop: 16 }}>
            Go to sign in
          </Link>
          <Link to="/forgot-userid" className="auth-back">
            Forgot your user ID?
          </Link>
        </div>
        <AuthFooter />
      </div>
    );
  }

  if (step === 'done' && result) {
    return (
      <div className="auth">
        <div className="auth-card">
          <span style={{ fontSize: 17, fontWeight: 500 }}>Your account is open</span>
          <span style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: 'var(--muted)' }}>
            Save these now. The 2FA secret is shown once and is required every time you sign in.
          </span>

          <div
            style={{
              marginTop: 18,
              padding: 14,
              background: 'var(--input)',
              border: '1px solid var(--border-soft)',
              borderRadius: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="tile-label">YOUR USER ID</span>
              <span className="num" style={{ fontSize: 20, fontWeight: 500, letterSpacing: '0.04em' }}>
                {result.clientId}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="tile-label">AUTHENTICATOR SECRET</span>
              <span className="num" style={{ fontSize: 13, color: 'var(--amber)', wordBreak: 'break-all' }}>
                {result.totpSecret}
              </span>
            </div>
          </div>

          <div className="notice info" style={{ marginTop: 12 }}>
            Add the secret to an authenticator app (Google Authenticator, Authy, 1Password) before
            signing in — you&rsquo;ll be asked for a 6-digit code.
          </div>

          <button
            className="btn primary block"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/login')}
          >
            Sign in now
          </button>
        </div>
        <AuthFooter />
      </div>
    );
  }

  return (
    <div className="auth">
      <form
        className="auth-card"
        onSubmit={
          step === 'mobile'
            ? submitMobile
            : step === 'otp'
              ? submitOtp
              : step === 'details'
                ? submitDetails
                : submitPassword
        }
      >
        <span style={{ fontSize: 17, fontWeight: 500 }}>Open a uni-share account</span>
        <span style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: 'var(--muted)' }}>
          {step === 'mobile' && 'Free to open. You’ll need your PAN and a mobile number.'}
          {step === 'otp' && 'We’ve sent a 6-digit code to your mobile number.'}
          {step === 'details' && 'Enter your details exactly as they appear on your PAN card.'}
          {step === 'password' && 'Last step — choose a password for your account.'}
        </span>

        <Progress step={step} />

        {error && (
          <div className="notice error" style={{ marginTop: 16 }} role="alert">
            {error}
          </div>
        )}

        {step === 'mobile' && (
          <>
            <div className="field" style={{ marginTop: 16 }}>
              <span style={{ color: 'var(--dim)', display: 'flex' }}>
                <Icon.Phone size={14} />
              </span>
              <span className="field-prefix num">+91</span>
              <input
                className="num"
                value={mobile}
                onChange={(e) =>
                  setMobile(e.target.value.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '').slice(0, 10))
                }
                placeholder="10-digit mobile number"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel"
                autoFocus
              />
            </div>
            <button className="btn primary block" style={{ marginTop: 14 }} type="submit" disabled={busy || !mobileValid}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <div className="otp" style={{ marginTop: 16, alignSelf: 'center' }}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpInputs.current[i] = el;
                  }}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digits[i] && i > 0) otpInputs.current[i - 1]?.focus();
                  }}
                  inputMode="numeric"
                  aria-label={`Digit ${i + 1}`}
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="num" style={{ fontSize: 10, color: 'var(--dimmer)' }}>
                {secondsLeft > 0
                  ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                  : 'Code expired'}
              </span>
              <button
                type="button"
                style={{ fontSize: 11, color: 'var(--amber)' }}
                onClick={() =>
                  run(async () => {
                    const res = await signupApi.resendOtp(reference);
                    setDevOtp(res.devOtp);
                    setSecondsLeft(res.expiresInMinutes * 60);
                    setDigits(Array(OTP_LENGTH).fill(''));
                  })
                }
              >
                Resend code
              </button>
            </div>

            {devOtp && (
              <div className="notice dev" style={{ marginTop: 12 }}>
                <b>Dev helper</b>
                <span>Code {devOtp} — shown because no SMS provider is wired up yet.</span>
              </div>
            )}

            <button className="btn primary block" style={{ marginTop: 14 }} type="submit" disabled={busy || code.length !== OTP_LENGTH}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </>
        )}

        {step === 'details' && (
          <>
            <div className="field" style={{ marginTop: 16 }}>
              <span style={{ color: 'var(--dim)', display: 'flex' }}>
                <Icon.User />
              </span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name as on PAN" autoFocus />
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoComplete="email" />
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <input
                className="num"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="PAN (ABCDE1234F)"
                maxLength={10}
              />
            </div>

            <label style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, color: 'var(--dimmer)' }}>Date of birth</span>
              <div className="field">
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </label>

            <button className="btn primary block" style={{ marginTop: 14 }} type="submit" disabled={busy || !detailsValid}>
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </>
        )}

        {step === 'password' && (
          <>
            <div className="field" style={{ marginTop: 16 }}>
              <span style={{ color: 'var(--dim)', display: 'flex' }}>
                <Icon.Lock />
              </span>
              <input
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
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
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {checks.map((c) => (
                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 3, background: c.ok ? 'var(--up)' : 'var(--faint)' }} />
                  <span style={{ fontSize: 11, color: c.ok ? 'var(--up)' : 'var(--muted)' }}>{c.label}</span>
                </div>
              ))}
              {confirm.length > 0 && password !== confirm && (
                <span style={{ fontSize: 11, color: 'var(--down)' }}>Passwords do not match.</span>
              )}
            </div>

            <button className="btn primary block" style={{ marginTop: 16 }} type="submit" disabled={busy || !passwordValid}>
              {busy ? 'Opening account…' : 'Open my account'}
            </button>
          </>
        )}

        <Link to="/login" className="auth-back">
          Already have an account? Sign in
        </Link>
      </form>

      <AuthFooter />
    </div>
  );
}
