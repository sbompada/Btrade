import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useMarket } from '../market/MarketDataContext';
import { indices } from '../data/market';
import { num, signedPct, toneOf } from '../lib/format';
import * as Icon from './Icons';
import { api, ApiError, canAccess, firstAllowedPath } from '../lib/api';

const NAV = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Orders', to: '/orders' },
  { label: 'Holdings', to: '/holdings' },
  { label: 'Positions', to: '/positions' },
  { label: 'IPO', to: '/ipo' },
  { label: 'Funds', to: '/funds' },
];

type MenuDialog = 'profile' | 'invite' | 'shortcuts' | null;

function Dialog({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="order-ticket menu-dialog" role="dialog" aria-modal="true" aria-labelledby="menu-dialog-title"><div className="order-ticket-head"><div><strong id="menu-dialog-title">{title}</strong><span>{subtitle}</span></div><button onClick={onClose} aria-label="Close dialog">×</button></div>{children}</section></div>;
}

function AccountMenu({ onClose, onDialog }: { onClose: () => void; onDialog: (dialog: MenuDialog) => void }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [privacy, setPrivacy] = useState(() => localStorage.getItem('ntd.privacy') === 'on');
  const [dark, setDark] = useState(() => localStorage.getItem('ntd.theme') !== 'light');
  const adminScreens = [
    ...(user?.role === 'admin' ? [{ label: 'User access', path: '/admin/access' }] : []),
    ...(canAccess(user, 'admin.transactions') ? [{ label: 'Transaction review', path: '/admin/transactions' }] : []),
    ...(canAccess(user, 'admin.market_data') ? [{ label: 'Market data', path: '/admin/market-data' }] : []),
    ...(canAccess(user, 'admin.payment_integrations') ? [{ label: 'Payment integrations', path: '/admin/payment-integrations' }] : []),
    ...(canAccess(user, 'admin.notification_providers') ? [{ label: 'Notification providers', path: '/admin/providers' }] : []),
  ];

  const togglePrivacy = () => {
    const next = !privacy;
    setPrivacy(next);
    localStorage.setItem('ntd.privacy', next ? 'on' : 'off');
    document.documentElement.classList.toggle('privacy-mode', next);
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('ntd.theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('light-theme', !next);
  };

  return (
    <div className="menu" role="menu">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '14px 14px 13px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="auth-avatar sm" style={{ width: 34, height: 34, fontSize: 12, flex: 'none' }}>
          <span className="num">{user?.initials}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{user?.name}</span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>{user?.email}</span>
        </div>
        <button aria-label="Edit profile" onClick={() => { onDialog('profile'); onClose(); }} style={{ flex: 'none', color: 'var(--dim)' }}>
          <Icon.Pencil />
        </button>
      </div>

      {adminScreens.length > 0 && <div className="menu-section">
        {adminScreens.map((screen) => <button key={screen.path} className="menu-item" onClick={() => { navigate(screen.path); onClose(); }}>
          <Icon.Terminal /> {screen.label}
        </button>)}
      </div>}

      {user?.role !== 'team' && <div className="menu-section">
        <button className="menu-item" onClick={togglePrivacy} aria-pressed={privacy}>
          <span style={{ flex: 1 }}>Privacy mode</span>
          <div className={privacy ? 'toggle on' : 'toggle'}>
            <div />
          </div>
        </button>
        <button className="menu-item" onClick={toggleTheme} aria-pressed={!dark}>
          <span style={{ flex: 1 }}>
            Theme <span style={{ color: 'var(--dim)' }}>· {dark ? 'Dark' : 'Light'}</span>
          </span>
          <div className={dark ? 'toggle on' : 'toggle'}>
            <div />
          </div>
        </button>
      </div>}

      <div className="menu-section">
        <button className="menu-item" onClick={() => { navigate('/reports'); onClose(); }}>
          <Icon.Terminal /> Reports
        </button>
        <button className="menu-item" onClick={() => { navigate('/mutual-funds'); onClose(); }}>
          <Icon.Rupee /> Mutual funds
        </button>
        <button className="menu-item" onClick={() => { navigate('/support'); onClose(); }}>
          <Icon.LifeBuoy /> Support
        </button>
        <button className="menu-item" onClick={() => { onDialog('invite'); onClose(); }}>
          <Icon.UserPlus /> Invite friends
        </button>
      </div>

      <div className="menu-section">
        <button className="menu-item" onClick={() => { onDialog('shortcuts'); onClose(); }}>
          <Icon.Keyboard />
          <span style={{ flex: 1 }}>Keyboard shortcuts</span>
          <span className="kbd num">?</span>
        </button>
        <button className="menu-item" onClick={() => { navigate('/manual'); onClose(); }}>
          <Icon.Book /> User manual
        </button>
      </div>

      <div className="menu-section">
        <button
          className="menu-item"
          style={{ color: 'var(--down)' }}
          onClick={async () => {
            onClose();
            await signOut();
            navigate('/login', { replace: true });
          }}
        >
          <Icon.Logout /> Logout
        </button>
      </div>
    </div>
  );
}

export default function TopBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { quotes, source } = useMarket();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<MenuDialog>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === '?' && !target?.closest('input, textarea, select, [contenteditable="true"]')) {
        setMenuOpen(false);
        setDialog('shortcuts');
      }
    };
    document.addEventListener('keydown', openShortcuts);
    return () => document.removeEventListener('keydown', openShortcuts);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="topbar" style={{ position: 'relative' }}>
      <div className="brand">
        <Icon.Logo />
        <span className="brand-word">uni-share</span>
      </div>

      <div className="ticker">
        {source === 'replay' && <span className="feed-badge">REPLAY</span>}
        {indices.map((i) => {
          // Live quote when the feed has one; the seeded value until it does.
          const q = quotes.get(i.label);
          const value = q?.ltp ?? i.value;
          const pct = q?.changePct ?? i.changePct;
          return (
            <div className="tick" key={i.label}>
              <span className="tick-label">{i.label}</span>
              <span className="tick-val num">{num(value)}</span>
              <span className={`tick-chg num ${toneOf(pct)}`}>{signedPct(pct)}</span>
            </div>
          );
        })}
      </div>

      <div className="topbar-right" ref={wrapRef}>
        <nav className="nav">
          {user?.role !== 'team' && NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
          {(user?.role === 'admin' || user?.role === 'team') && (
            <NavLink
              to={firstAllowedPath(user)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              Admin
            </NavLink>
          )}
        </nav>
        <div className="divider-v" />
        {user?.role !== 'team' && <button className="iconbtn" aria-label="Basket" onClick={() => navigate('/orders/baskets')}>
          <Icon.Cart />
        </button>}
        {user?.role !== 'team' && <button className="iconbtn" aria-label="Alerts" onClick={() => navigate('/orders/alerts')}>
          <Icon.Bell />
        </button>}
        <button
          className={menuOpen ? 'acct open' : 'acct'}
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <span className="acct-avatar num">{user?.initials}</span>
          <span className="acct-id num">{user?.clientId}</span>
        </button>
        {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} onDialog={setDialog} />}
      </div>
      {dialog === 'profile' && <ProfileDialog onClose={() => setDialog(null)} />}
      {dialog === 'invite' && <InviteDialog onClose={() => setDialog(null)} />}
      {dialog === 'shortcuts' && <Dialog title="Keyboard shortcuts" subtitle="Available throughout the trading workspace" onClose={() => setDialog(null)}><div className="shortcut-list"><div><kbd>Ctrl K</kbd><span>Focus instrument search</span></div><div><kbd>Esc</kbd><span>Close the active dialog</span></div><div><kbd>?</kbd><span>Open this shortcut reference</span></div></div></Dialog>}
    </div>
  );
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { token, user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSaving(true); setError(null);
    try { const result = await api.updateProfile(token, { name, email }); updateUser(result.user); onClose(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not update your profile.'); }
    finally { setSaving(false); }
  };
  return <Dialog title="Edit profile" subtitle={user?.clientId ?? ''} onClose={onClose}><form onSubmit={submit}><div className="order-fields"><label><span>Name</span><input aria-label="Profile name" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></label><label><span>Email</span><input aria-label="Profile email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="btn primary block" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></form></Dialog>;
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const invite = `${location.origin}/signup?ref=${encodeURIComponent(user?.clientId ?? '')}`;
  const [copied, setCopied] = useState(false);
  const copyInvite = async () => {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(invite);
    else {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Invite link"]');
      input?.select();
      document.execCommand('copy');
    }
    setCopied(true);
  };
  return <Dialog title="Invite friends" subtitle="Share your personal signup link" onClose={onClose}><div className="invite-dialog"><input aria-label="Invite link" value={invite} readOnly /><button className="btn primary" onClick={copyInvite}>{copied ? 'Copied' : 'Copy link'}</button></div></Dialog>;
}
