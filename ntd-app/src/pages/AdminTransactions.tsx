import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AppShell from '../components/AppShell';
import { adminTransactionsApi, ApiError, type AdminTransaction } from '../lib/api';
import { istDateTime, num } from '../lib/format';

export default function AdminTransactions() {
  const { token, user } = useAuth();
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    adminTransactionsApi.list(token)
      .then((result) => setTransactions(result.transactions))
      .catch((reason) => setError(reason instanceof ApiError ? reason.message : 'Could not load transactions.'));
  }, [token]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return transactions;
    return transactions.filter((entry) => [entry.clientId, entry.userName, entry.reference, entry.method, entry.status].some((value) => String(value).toLowerCase().includes(needle)));
  }, [transactions, query]);

  return (
    <AppShell tabs={['Transactions']} withWatchlist={false}>
      {error && <div className="notice error" role="alert">{error}</div>}
      <section className="panel admin-transactions">
        <div className="panel-head">
          <span className="panel-title">Integrated fund transactions</span>
          <span className="panel-count num">({rows.length})</span>
          <div className="panel-actions">
            {user?.role === 'admin' && <Link className="chip" to="/admin/access">User access</Link>}
            <div className="chip input"><input aria-label="Search transactions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="User, reference, method" /></div>
          </div>
        </div>
        <div className="thead">
          <span style={{ width: 180 }}>DATE (IST)</span><span style={{ width: 150 }}>USER</span><span style={{ width: 90 }}>TYPE</span><span style={{ width: 100 }}>METHOD</span><span style={{ flex: 1 }}>REFERENCE</span><span style={{ width: 100 }}>STATUS</span><span style={{ width: 130, textAlign: 'right' }}>AMOUNT</span>
        </div>
        {rows.length === 0 ? <div className="stub" style={{ padding: '44px 0' }}><span>No matching transactions</span></div> : rows.map((entry) => (
          <div className="trow" key={entry.id} style={{ minHeight: 42 }}>
            <span className="num" style={{ width: 180, fontSize: 10 }}>{istDateTime(entry.date)}</span>
            <span style={{ width: 150 }}><strong>{entry.clientId}</strong><small style={{ display: 'block', color: 'var(--dim)' }}>{entry.userName}</small></span>
            <span style={{ width: 90 }}>{entry.kind}</span><span style={{ width: 100 }}>{entry.method}</span><span className="num" style={{ flex: 1 }}>{entry.reference}</span><span style={{ width: 100 }}><span className="badge status">{entry.status}</span></span><span className="num" style={{ width: 130, textAlign: 'right', color: entry.kind === 'PAYOUT' ? 'var(--down)' : 'var(--up)' }}>{entry.kind === 'PAYOUT' ? '−' : '+'}₹{num(entry.amount)}</span>
          </div>
        ))}
      </section>
    </AppShell>
  );
}