import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AppShell from '../components/AppShell';
import {
  adminPaymentApi,
  ApiError,
  canAccess,
  type DriverSpec,
  type PaymentIntegration,
  type PaymentIntegrationKind,
} from '../lib/api';
import { istDateTime } from '../lib/format';

const TABS: Array<{
  tab: string;
  kind: PaymentIntegrationKind;
  label: string;
  identityHint: string;
}> = [
  { tab: 'Bank accounts', kind: 'bank', label: 'Bank account', identityHint: 'Legal account holder name' },
  { tab: 'UPI gateways', kind: 'upi', label: 'UPI gateway', identityHint: 'Merchant ID or VPA' },
];

type FormState = {
  driver: string;
  name: string;
  accountIdentity: string;
  values: Record<string, string>;
};

const blankForm = (driver: string): FormState => ({
  driver,
  name: '',
  accountIdentity: '',
  values: {},
});

export default function AdminPaymentIntegrations() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState(TABS[0].tab);
  const active = TABS.find((entry) => entry.tab === tab)!;
  const [catalogue, setCatalogue] = useState<Record<PaymentIntegrationKind, DriverSpec[]> | null>(null);
  const [integrations, setIntegrations] = useState<PaymentIntegration[]>([]);
  const [keyIsEphemeral, setKeyIsEphemeral] = useState(false);
  const [editing, setEditing] = useState<PaymentIntegration | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const specs = useMemo(() => catalogue?.[active.kind] ?? [], [catalogue, active.kind]);
  const spec = useMemo(
    () => specs.find((entry) => entry.driver === form?.driver) ?? specs[0],
    [specs, form?.driver],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const result = await adminPaymentApi.list(token);
    setIntegrations(result.integrations);
    setKeyIsEphemeral(result.keyIsEphemeral);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    adminPaymentApi.catalogue(token)
      .then((result) => setCatalogue(result.catalogue))
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Could not load integration types.'));
    refresh().catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Could not load integrations.'));
  }, [token, refresh]);

  const run = async (operation: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await operation();
      if (success) setFlash(success);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    setEditing(null);
    setForm(blankForm(specs[0]?.driver ?? ''));
  };

  const startEdit = (integration: PaymentIntegration) => {
    setEditing(integration);
    setForm({
      driver: integration.driver,
      name: integration.name,
      accountIdentity: integration.accountIdentity,
      values: Object.fromEntries(
        Object.entries(integration.settings).map(([key, value]) => [key, String(value)]),
      ),
    });
  };

  const submit = () => run(async () => {
    if (!token || !form || !spec) return;
    if (editing) {
      await adminPaymentApi.update(token, editing.id, {
        name: form.name,
        accountIdentity: form.accountIdentity,
        values: form.values,
      });
    } else {
      await adminPaymentApi.create(token, {
        kind: active.kind,
        driver: form.driver,
        name: form.name,
        accountIdentity: form.accountIdentity,
        values: form.values,
      });
    }
    await refresh();
    setEditing(null);
    setForm(null);
  }, editing ? 'Integration updated.' : 'Integration added.');

  const rows = integrations.filter((integration) => integration.kind === active.kind);

  return (
    <AppShell tabs={TABS.map((entry) => entry.tab)} activeTab={tab} onTabChange={(next) => {
      setTab(next);
      setEditing(null);
      setForm(null);
    }} withWatchlist={false}>
      {keyIsEphemeral && (
        <div className="notice dev">
          <b>Development key</b>
          <span>Set NTD_MASTER_KEY before storing live bank or gateway credentials.</span>
        </div>
      )}
      {active.kind === 'upi' && (
        <div className="notice info">
          Google Pay, PhonePe, Paytm, and other UPI apps are supported through an enabled UPI payment gateway.
        </div>
      )}
      {error && <div className="notice error" role="alert">{error}</div>}
      {flash && <div className="notice info" role="status">{flash}</div>}

      <section className="panel payment-integration-table">
        <div className="panel-head">
          <span className="panel-title">{active.label} master</span>
          <span className="panel-count num">({rows.length})</span>
          <div className="panel-actions">
            {canAccess(user, 'admin.notification_providers') && <Link className="chip" to="/admin/providers">Notification providers</Link>}
            {canAccess(user, 'admin.market_data') && <Link className="chip" to="/admin/market-data">Market data</Link>}
            <button className="chip" onClick={startCreate} disabled={!specs.length}>+ Add integration</button>
          </div>
        </div>

        <div className="thead">
          <span style={{ flex: 1 }}>NAME</span>
          <span style={{ width: 190 }}>TYPE</span>
          <span style={{ width: 190 }}>ACCOUNT / MERCHANT</span>
          <span style={{ width: 100 }}>STATUS</span>
          <span style={{ width: 300, textAlign: 'right' }}>ACTIONS</span>
        </div>

        {rows.length === 0 ? (
          <div className="stub" style={{ padding: '44px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No {active.label.toLowerCase()} configured</span>
          </div>
        ) : rows.map((integration) => (
          <div className="trow" key={integration.id} style={{ height: 48 }}>
            <div className="tname" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span>{integration.name}</span>
              {integration.lastTestedAt && (
                <span className="num" style={{ fontSize: 9, color: integration.lastTestOk ? 'var(--up)' : 'var(--down)' }}>
                  {integration.lastTestOk ? 'configuration checked' : 'check failed'} {istDateTime(integration.lastTestedAt)}
                </span>
              )}
            </div>
            <span style={{ width: 190, fontSize: 11, color: 'var(--text-3)' }}>{integration.driverLabel}</span>
            <span style={{ width: 190, fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {integration.accountIdentity}
            </span>
            <div style={{ width: 100, display: 'flex', gap: 4 }}>
              {integration.isDefault && <span className="badge status">DEFAULT</span>}
              {!integration.isActive && <span className="badge product" style={{ color: 'var(--down)' }}>OFF</span>}
            </div>
            <div style={{ width: 300, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="chip" onClick={() => startEdit(integration)}>Edit</button>
              <button className="chip" disabled={busy} onClick={() => run(async () => {
                const result = await adminPaymentApi.test(token!, integration.id);
                await refresh();
                setFlash(result.message);
              })}>Check</button>
              {!integration.isDefault && <button className="chip" disabled={busy || !integration.isActive} onClick={() => run(async () => {
                await adminPaymentApi.setDefault(token!, integration.id);
                await refresh();
              }, `${integration.name} is now the default.`)}>Default</button>}
              <button className="chip" disabled={busy || (integration.isDefault && integration.isActive)} onClick={() => run(async () => {
                await adminPaymentApi.update(token!, integration.id, { isActive: !integration.isActive });
                await refresh();
              }, integration.isActive ? 'Integration disabled.' : 'Integration enabled.')}>
                {integration.isActive ? 'Disable' : 'Enable'}
              </button>
              {!integration.isDefault && <button className="chip" disabled={busy} onClick={() => {
                if (!window.confirm(`Delete ${integration.name}?`)) return;
                void run(async () => {
                  await adminPaymentApi.remove(token!, integration.id);
                  await refresh();
                }, 'Integration deleted.');
              }}>Delete</button>}
            </div>
          </div>
        ))}
      </section>

      {form && spec && (
        <section className="panel payment-integration-form">
          <div className="panel-head">
            <span className="panel-title">{editing ? `Edit ${editing.name}` : `New ${active.label.toLowerCase()}`}</span>
            <div className="panel-actions"><button className="chip" onClick={() => { setEditing(null); setForm(null); }}>Cancel</button></div>
          </div>
          <div className="payment-integration-fields" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            {!editing && <Field label="INTEGRATION TYPE">
              <select className="field" style={{ color: 'var(--text)', fontSize: 12 }} value={form.driver} onChange={(event) => setForm(blankForm(event.target.value))}>
                {specs.map((entry) => <option key={entry.driver} value={entry.driver} style={{ background: 'var(--panel)' }}>{entry.label}</option>)}
              </select>
            </Field>}
            <Field label="DISPLAY NAME"><div className="field"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={`${active.label} primary`} /></div></Field>
            <Field label={spec.identityLabel.toUpperCase()}><div className="field"><input value={form.accountIdentity} onChange={(event) => setForm({ ...form, accountIdentity: event.target.value })} placeholder={active.identityHint} /></div></Field>
            {spec.fields.map((field) => <Field key={field.key} label={`${field.label.toUpperCase()}${field.secret ? ' · ENCRYPTED' : ''}`} encrypted={field.secret}>
              {field.type === 'boolean' ? (
                <button type="button" className={form.values[field.key] === 'true' ? 'toggle on' : 'toggle'} onClick={() => setForm({ ...form, values: { ...form.values, [field.key]: form.values[field.key] === 'true' ? 'false' : 'true' } })}><div /></button>
              ) : (
                <div className="field"><input type={field.secret ? 'password' : 'text'} inputMode={field.type === 'number' ? 'numeric' : undefined} value={form.values[field.key] ?? ''} onChange={(event) => setForm({ ...form, values: { ...form.values, [field.key]: event.target.value } })} placeholder={field.secret && editing?.secrets[field.key] ? `${editing.secrets[field.key]} · leave blank to keep` : field.placeholder ?? ''} autoComplete="off" /></div>
              )}
            </Field>)}
          </div>
          <div className="tfoot" style={{ justifyContent: 'space-between', height: 52 }}>
            <span style={{ fontSize: 10, color: 'var(--dim)' }}>Checks validate stored configuration only. They do not initiate a payment.</span>
            <button className="btn primary" onClick={submit} disabled={busy || !form.name.trim() || !form.accountIdentity.trim()}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add integration'}</button>
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Field({ label, encrypted, children }: { label: string; encrypted?: boolean; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <span className="tile-label" style={encrypted ? { color: 'var(--amber)' } : undefined}>{label}</span>
    {children}
  </label>;
}