import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import {
  ApiError,
  adminApi,
  canAccess,
  type Channel,
  type DriverSpec,
  type Provider,
} from '../lib/api';
import { istDateTime } from '../lib/format';

const TABS: { tab: string; channel: Channel; label: string; senderHint: string }[] = [
  { tab: 'Email providers', channel: 'email', label: 'Email', senderHint: 'no-reply@yourdomain.com' },
  { tab: 'SMS providers', channel: 'sms', label: 'SMS', senderHint: 'NTDBRK' },
  {
    tab: 'WhatsApp providers',
    channel: 'whatsapp',
    label: 'WhatsApp',
    senderHint: '+91 90000 00000',
  },
];

type FormState = {
  driver: string;
  name: string;
  fromIdentity: string;
  values: Record<string, string>;
};

const blankForm = (driver: string): FormState => ({
  driver,
  name: '',
  fromIdentity: '',
  values: {},
});

export default function AdminProviders() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState(TABS[0].tab);
  const active = TABS.find((t) => t.tab === tab)!;
  const channel = active.channel;

  const [catalogue, setCatalogue] = useState<Record<Channel, DriverSpec[]> | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [keyIsEphemeral, setKeyIsEphemeral] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<Provider | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const specs = catalogue?.[channel] ?? [];
  const spec = useMemo(
    () => specs.find((s) => s.driver === form?.driver) ?? specs[0],
    [specs, form?.driver],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const { providers: rows, keyIsEphemeral: ephemeral } = await adminApi.list(token);
    setProviders(rows);
    setKeyIsEphemeral(ephemeral);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    adminApi
      .catalogue(token)
      .then(({ catalogue: c }) => setCatalogue(c))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the catalogue.'));
    refresh().catch((e) =>
      setError(e instanceof ApiError ? e.message : 'Could not load providers.'),
    );
  }, [token, refresh]);

  const run = async (fn: () => Promise<void>, success?: string) => {
    setError(null);
    setFlash(null);
    setBusy(true);
    try {
      await fn();
      if (success) setFlash(success);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const startCreate = () => {
    setEditing(null);
    setForm(blankForm(specs[0]?.driver ?? ''));
  };

  const startEdit = (provider: Provider) => {
    setEditing(provider);
    setForm({
      driver: provider.driver,
      name: provider.name,
      fromIdentity: provider.fromIdentity ?? '',
      values: Object.fromEntries(
        Object.entries(provider.settings).map(([k, v]) => [k, String(v)]),
      ),
    });
  };

  const submit = () =>
    run(async () => {
      if (!token || !form || !spec) return;
      if (editing) {
        await adminApi.update(token, editing.id, {
          name: form.name,
          fromIdentity: form.fromIdentity,
          values: form.values,
        });
      } else {
        await adminApi.create(token, {
          channel,
          driver: form.driver,
          name: form.name,
          fromIdentity: form.fromIdentity,
          values: form.values,
        });
      }
      await refresh();
      setForm(null);
      setEditing(null);
    }, editing ? 'Provider updated.' : 'Provider added.');

  const rows = providers.filter((p) => p.channel === channel);

  return (
    <AppShell tabs={TABS.map((t) => t.tab)} activeTab={tab} onTabChange={setTab} withWatchlist={false}>
      {keyIsEphemeral && (
        <div className="notice dev">
          <b>Development key</b>
          <span>
            NTD_MASTER_KEY is not set, so credentials are encrypted with a fixed development key.
            Set a real key before storing anything live.
          </span>
        </div>
      )}

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {flash && (
        <div className="notice info" role="status">
          {flash}
        </div>
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{active.label} providers</span>
          <span className="panel-count num">({rows.length})</span>
          <div className="panel-actions">
            {canAccess(user, 'admin.payment_integrations') && <Link className="chip" to="/admin/payment-integrations">Payment integrations</Link>}
            <button className="chip" onClick={startCreate} disabled={!specs.length}>
              + Add provider
            </button>
          </div>
        </div>

        <div className="thead">
          <span style={{ flex: 1 }}>NAME</span>
          <span style={{ width: 120 }}>TYPE</span>
          <span style={{ width: 220 }}>SENDER</span>
          <span style={{ width: 130 }}>CREDENTIALS</span>
          <span style={{ width: 90 }}>STATUS</span>
          <span style={{ width: 210, textAlign: 'right' }}>ACTIONS</span>
        </div>

        {rows.length === 0 ? (
          <div className="stub" style={{ padding: '44px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No {active.label} provider yet</span>
            <span style={{ fontSize: 11 }}>
              Add one so password resets and user-ID recovery have somewhere to send from.
            </span>
          </div>
        ) : (
          rows.map((p) => {
            const secretKeys = Object.keys(p.secrets);
            const hasAll = secretKeys.every((k) => p.secrets[k]);
            return (
              <div className="trow" key={p.id} style={{ height: 44 }}>
                <div className="tname" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span>{p.name}</span>
                  {p.lastTestedAt && (
                    <span
                      className="num"
                      style={{ fontSize: 9, color: p.lastTestOk ? 'var(--up)' : 'var(--down)' }}
                    >
                      {p.lastTestOk ? 'checked' : 'failed'} {istDateTime(p.lastTestedAt)}
                    </span>
                  )}
                </div>
                <span style={{ width: 120, fontSize: 11, color: 'var(--text-3)' }}>{p.driverLabel}</span>
                <span
                  style={{
                    width: 220,
                    fontSize: 11,
                    color: 'var(--text-2)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.fromIdentity ?? '—'}
                </span>
                <span
                  className="num"
                  style={{ width: 130, fontSize: 10, color: hasAll ? 'var(--text-3)' : 'var(--down)' }}
                >
                  {secretKeys.length === 0 ? '—' : hasAll ? 'stored' : 'missing'}
                </span>
                <div style={{ width: 90, display: 'flex', gap: 4 }}>
                  {p.isDefault && <span className="badge status">DEFAULT</span>}
                  {!p.isActive && (
                    <span className="badge product" style={{ color: 'var(--down)' }}>
                      OFF
                    </span>
                  )}
                </div>
                <div style={{ width: 210, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button className="chip" onClick={() => startEdit(p)}>
                    Edit
                  </button>
                  <button
                    className="chip"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const res = await adminApi.test(token!, p.id);
                        await refresh();
                        setFlash(res.message);
                      })
                    }
                  >
                    Test
                  </button>
                  {!p.isDefault && (
                    <button
                      className="chip"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await adminApi.setDefault(token!, p.id);
                          await refresh();
                        }, `${p.name} is now the default.`)
                      }
                    >
                      Default
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>

      {form && spec && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">
              {editing ? `Edit ${editing.name}` : `New ${active.label} provider`}
            </span>
            <div className="panel-actions">
              <button className="chip" onClick={() => { setForm(null); setEditing(null); }}>
                Cancel
              </button>
            </div>
          </div>

          <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            {!editing && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="tile-label">PROVIDER TYPE</span>
                <select
                  className="field"
                  style={{ color: 'var(--text)', fontSize: 12 }}
                  value={form.driver}
                  onChange={(e) => setForm({ ...blankForm(e.target.value) })}
                >
                  {specs.map((s) => (
                    <option key={s.driver} value={s.driver} style={{ background: 'var(--panel)' }}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="tile-label">DISPLAY NAME</span>
              <div className="field">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`e.g. ${active.label} primary`}
                />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="tile-label">{spec.identityLabel.toUpperCase()}</span>
              <div className="field">
                <input
                  value={form.fromIdentity}
                  onChange={(e) => setForm({ ...form, fromIdentity: e.target.value })}
                  placeholder={active.senderHint}
                />
              </div>
            </label>

            {spec.fields.map((field) => (
              <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="tile-label">
                  {field.label.toUpperCase()}
                  {field.secret && <span style={{ color: 'var(--amber)' }}> · ENCRYPTED</span>}
                </span>
                {field.type === 'boolean' ? (
                  <button
                    type="button"
                    className={form.values[field.key] === 'true' ? 'toggle on' : 'toggle'}
                    onClick={() =>
                      setForm({
                        ...form,
                        values: {
                          ...form.values,
                          [field.key]: form.values[field.key] === 'true' ? 'false' : 'true',
                        },
                      })
                    }
                  >
                    <div />
                  </button>
                ) : (
                  <div className="field">
                    <input
                      type={field.secret ? 'password' : 'text'}
                      inputMode={field.type === 'number' ? 'numeric' : undefined}
                      value={form.values[field.key] ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, values: { ...form.values, [field.key]: e.target.value } })
                      }
                      placeholder={
                        field.secret && editing?.secrets[field.key]
                          ? `${editing.secrets[field.key]} — leave blank to keep`
                          : field.placeholder ?? ''
                      }
                      autoComplete="off"
                    />
                  </div>
                )}
              </label>
            ))}
          </div>

          <div className="tfoot" style={{ justifyContent: 'space-between', height: 52 }}>
            <span style={{ fontSize: 10, color: 'var(--dim)' }}>
              Fields marked ENCRYPTED are stored with AES-256-GCM and never sent back to the browser.
            </span>
            <button className="btn primary" onClick={submit} disabled={busy || !form.name.trim()}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add provider'}
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Recent changes</span>
          <span style={{ marginLeft: 'auto', color: 'var(--faint)', display: 'flex' }}>
            <Icon.Clock />
          </span>
        </div>
        <AuditList token={token} />
      </section>
    </AppShell>
  );
}

function AuditList({ token }: { token: string | null }) {
  const [entries, setEntries] = useState<
    { id: number; channel: string; action: string; detail: string | null; actor: string; at: string }[]
  >([]);

  useEffect(() => {
    if (!token) return;
    adminApi
      .auditLog(token)
      .then(({ entries: e }) => setEntries(e))
      .catch(() => setEntries([]));
  }, [token]);

  if (!entries.length) {
    return (
      <div className="stub" style={{ padding: '28px 0' }}>
        <span style={{ fontSize: 11 }}>No changes recorded yet.</span>
      </div>
    );
  }

  return (
    <div>
      {entries.slice(0, 8).map((e) => (
        <div className="trow sm" key={e.id} style={{ height: 32 }}>
          <span className="num" style={{ width: 150, fontSize: 10, color: 'var(--text-3)' }}>
            {istDateTime(e.at)}
          </span>
          <span className="num" style={{ width: 80, fontSize: 10, color: 'var(--amber)' }}>
            {e.actor}
          </span>
          <span style={{ width: 90, fontSize: 11, color: 'var(--text-2)' }}>{e.action}</span>
          <span style={{ width: 60, fontSize: 10, color: 'var(--dim)' }}>{e.channel}</span>
          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-3)' }}>{e.detail}</span>
        </div>
      ))}
    </div>
  );
}
