import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AppShell from '../components/AppShell';
import {
  adminAccessApi,
  ApiError,
  type PermissionDefinition,
  type TeamUser,
} from '../lib/api';
import { istDateTime } from '../lib/format';

type UserForm = {
  clientId: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  permissions: string[];
};

const blankForm = (): UserForm => ({
  clientId: '',
  name: '',
  email: '',
  phone: '',
  password: '',
  permissions: [],
});

export default function AdminUserAccess() {
  const { token } = useAuth();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [permissions, setPermissions] = useState<PermissionDefinition[]>([]);
  const [auditEntries, setAuditEntries] = useState<Array<{
    id: number;
    subject: string;
    subjectName: string | null;
    action: string;
    detail: string | null;
    actor: string;
    at: string;
  }>>([]);
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [setup, setSetup] = useState<{ clientId: string; totpSecret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [userResult, auditResult] = await Promise.all([
      adminAccessApi.users(token),
      adminAccessApi.audit(token),
    ]);
    setUsers(userResult.users);
    setAuditEntries(auditResult.entries);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    adminAccessApi.permissions(token)
      .then((result) => setPermissions(result.permissions))
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Could not load permissions.'));
    refresh().catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Could not load team users.'));
  }, [token, refresh]);

  const grouped = useMemo(() => Object.entries(
    permissions.reduce<Record<string, PermissionDefinition[]>>((groups, permission) => {
      (groups[permission.module] ??= []).push(permission);
      return groups;
    }, {}),
  ), [permissions]);

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

  const startEdit = (user: TeamUser) => {
    setEditing(user);
    setSetup(null);
    setForm({
      clientId: user.clientId,
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      password: '',
      permissions: user.permissions,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (!token || !form) return;
      if (editing) {
        await adminAccessApi.update(token, editing.id, {
          name: form.name,
          email: form.email,
          phone: form.phone,
          permissions: form.permissions,
        });
        if (form.password.trim()) {
          await adminAccessApi.resetPassword(token, editing.id, form.password);
        }
      } else {
        const result = await adminAccessApi.create(token, form);
        setSetup({ clientId: result.user.clientId, totpSecret: result.totpSecret });
      }
      await refresh();
      setForm(null);
      setEditing(null);
    }, editing ? 'User access updated.' : 'Team user created.');
  };

  const togglePermission = (key: string) => {
    if (!form) return;
    setForm({
      ...form,
      permissions: form.permissions.includes(key)
        ? form.permissions.filter((entry) => entry !== key)
        : [...form.permissions, key],
    });
  };

  return (
    <AppShell tabs={['User access']} withWatchlist={false}>
      <div className="notice info">
        Team users see only assigned administrative pages. Customer trading accounts and their data remain isolated.
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {flash && <div className="notice info" role="status">{flash}</div>}
      {setup && (
        <div className="notice dev" role="status">
          <b>Authenticator setup for {setup.clientId}</b>
          <span>Share this secret securely once: <span className="num">{setup.totpSecret}</span></span>
        </div>
      )}

      <section className="panel access-user-table">
        <div className="panel-head">
          <span className="panel-title">Team members</span>
          <span className="panel-count num">({users.length})</span>
          <div className="panel-actions">
            <Link className="chip" to="/admin/transactions">Transaction review</Link>
            <button className="chip" onClick={() => { setEditing(null); setSetup(null); setForm(blankForm()); }}>+ Create user</button>
          </div>
        </div>
        <div className="thead">
          <span style={{ flex: 1 }}>USER</span>
          <span style={{ width: 220 }}>EMAIL</span>
          <span style={{ width: 110 }}>STATUS</span>
          <span style={{ width: 100 }}>SCREENS</span>
          <span style={{ width: 250, textAlign: 'right' }}>ACTIONS</span>
        </div>
        {users.length === 0 ? <div className="stub" style={{ padding: '44px 0' }}><span>No team users created</span></div> : users.map((user) => (
          <div className="trow" key={user.id} style={{ minHeight: 48 }}>
            <div className="tname" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span>{user.name}</span><span className="num" style={{ fontSize: 9, color: 'var(--dim)' }}>{user.clientId}</span>
            </div>
            <span style={{ width: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>
            <span style={{ width: 110 }}><span className="badge status" style={user.status === 'disabled' ? { color: 'var(--down)' } : undefined}>{user.status.toUpperCase()}</span></span>
            <span className="num" style={{ width: 100 }}>{user.permissions.length}</span>
            <div style={{ width: 250, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="chip" onClick={() => startEdit(user)}>Permissions</button>
              <button className="chip" disabled={busy} onClick={() => run(async () => {
                await adminAccessApi.update(token!, user.id, { status: user.status === 'active' ? 'disabled' : 'active' });
                await refresh();
              }, user.status === 'active' ? 'User disabled.' : 'User activated.')}>{user.status === 'active' ? 'Disable' : 'Enable'}</button>
            </div>
          </div>
        ))}
      </section>

      {form && (
        <section className="panel access-user-form">
          <div className="panel-head"><span className="panel-title">{editing ? `Access for ${editing.clientId}` : 'Create team user'}</span><div className="panel-actions"><button className="chip" onClick={() => { setForm(null); setEditing(null); }}>Cancel</button></div></div>
          <form onSubmit={submit}>
            <div className="access-user-fields">
              <label><span className="tile-label">USER ID</span><div className="field"><input value={form.clientId} disabled={!!editing} onChange={(event) => setForm({ ...form, clientId: event.target.value.toUpperCase() })} placeholder="OPS001" /></div></label>
              <label><span className="tile-label">FULL NAME</span><div className="field"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div></label>
              <label><span className="tile-label">EMAIL</span><div className="field"><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div></label>
              <label><span className="tile-label">MOBILE</span><div className="field"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div></label>
              <label><span className="tile-label">{editing ? 'NEW PASSWORD · OPTIONAL' : 'TEMPORARY PASSWORD'}</span><div className="field"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" /></div></label>
            </div>
            <div className="access-permissions">
              <div><strong>Screen permissions</strong><span>Assign only the pages required for this responsibility.</span></div>
              <div className="access-permission-groups">
                {grouped.map(([module, entries]) => <fieldset key={module}>
                  <legend>{module}</legend>
                  {(entries ?? []).map((permission) => <label key={permission.key}>
                    <input type="checkbox" checked={form.permissions.includes(permission.key)} onChange={() => togglePermission(permission.key)} />
                    <span><strong>{permission.label}</strong><small>{permission.path}</small></span>
                  </label>)}
                </fieldset>)}
              </div>
            </div>
            <div className="tfoot access-user-submit"><span>{form.permissions.length} screen permission{form.permissions.length === 1 ? '' : 's'} selected</span><button className="btn primary" disabled={busy || !form.clientId || !form.name || !form.email || (!editing && !form.password)}>{busy ? 'Saving…' : editing ? 'Save permissions' : 'Create user'}</button></div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><span className="panel-title">Recent access changes</span></div>
        {auditEntries.length === 0 ? <div className="stub" style={{ padding: '28px 0' }}><span>No access changes recorded</span></div> : auditEntries.slice(0, 20).map((entry) => (
          <div className="trow sm" key={entry.id} style={{ minHeight: 34 }}>
            <span className="num" style={{ width: 180, fontSize: 10 }}>{istDateTime(entry.at)}</span>
            <span className="num" style={{ width: 90, color: 'var(--amber)' }}>{entry.actor}</span>
            <span style={{ width: 100 }}>{entry.action}</span>
            <span style={{ width: 110 }}>{entry.subject}</span>
            <span style={{ flex: 1, color: 'var(--text-3)' }}>{entry.detail}</span>
          </div>
        ))}
      </section>
    </AppShell>
  );
}