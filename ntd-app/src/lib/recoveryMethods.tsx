import type { ReactElement } from 'react';
import * as Icon from '../components/Icons';
import type { RecoveryMethod } from './api';

export type MethodSpec = {
  key: RecoveryMethod;
  tab: string;
  placeholder: string;
  hint: string;
  prefix?: string;
  inputMode?: 'text' | 'email' | 'numeric';
  maxLength?: number;
  autoComplete?: string;
  mono?: boolean;
  icon: () => ReactElement;
  /** Normalises as the user types, so pasted values in other formats still work. */
  sanitise: (raw: string) => string;
  valid: (value: string) => boolean;
};

export const METHOD_SPECS: Record<RecoveryMethod, MethodSpec> = {
  clientId: {
    key: 'clientId',
    tab: 'User ID',
    placeholder: 'User ID',
    hint: 'The client ID on your welcome email, e.g. MN7315.',
    autoComplete: 'username',
    icon: () => <Icon.User />,
    sanitise: (raw) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16),
    valid: (v) => /^[A-Z0-9]{4,16}$/.test(v),
  },
  email: {
    key: 'email',
    tab: 'Email',
    placeholder: 'Registered email',
    hint: 'The email address registered on your account.',
    inputMode: 'email',
    autoComplete: 'email',
    icon: () => <Icon.User />,
    sanitise: (raw) => raw.trim(),
    valid: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  },
  mobile: {
    key: 'mobile',
    tab: 'Mobile',
    placeholder: '10-digit mobile number',
    hint: 'The mobile number registered on your account.',
    prefix: '+91',
    inputMode: 'numeric',
    maxLength: 10,
    autoComplete: 'tel',
    mono: true,
    icon: () => <Icon.Phone size={14} />,
    // Drops +91 / leading 0 / spaces / dashes so a pasted number in any common format lands clean.
    sanitise: (raw) => raw.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '').slice(0, 10),
    valid: (v) => /^[6-9]\d{9}$/.test(v),
  },
};

export const specsFor = (keys: RecoveryMethod[]) => keys.map((k) => METHOD_SPECS[k]);

export function MethodTabs({
  specs,
  active,
  onChange,
  style,
}: {
  specs: MethodSpec[];
  active: RecoveryMethod;
  onChange: (spec: MethodSpec) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="segmented" style={style} role="tablist">
      {specs.map((spec) => (
        <button
          key={spec.key}
          type="button"
          role="tab"
          aria-selected={spec.key === active}
          className={spec.key === active ? 'active' : ''}
          onClick={() => onChange(spec)}
        >
          {spec.tab}
        </button>
      ))}
    </div>
  );
}

export function MethodField({
  spec,
  value,
  onChange,
}: {
  spec: MethodSpec;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <>
      <div className="field" style={{ marginTop: 12 }}>
        <span style={{ color: 'var(--dim)', display: 'flex' }}>{spec.icon()}</span>
        {spec.prefix && <span className="field-prefix num">{spec.prefix}</span>}
        <input
          key={spec.key}
          value={value}
          onChange={(e) => onChange(spec.sanitise(e.target.value))}
          placeholder={spec.placeholder}
          inputMode={spec.inputMode}
          maxLength={spec.maxLength}
          autoComplete={spec.autoComplete}
          className={spec.mono ? 'num' : undefined}
          autoFocus
        />
      </div>
      <span style={{ marginTop: 8, fontSize: 10, color: 'var(--dimmer)' }}>{spec.hint}</span>
    </>
  );
}
