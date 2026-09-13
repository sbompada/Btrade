import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ordersApi, type OrderRecord } from '../lib/api';
import { orders } from '../data/market';
import { num } from '../lib/format';
import { ORDER_PATHS, ORDER_TABS, type OrderTab } from './orderNavigation';

type HistoryRange = 'today' | '7d' | 'all';

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function downloadFile(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const COLS = {
  time: 84,
  type: 64,
  product: 84,
  qty: 120,
  price: 110,
  status: 104,
};

export default function Orders() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [placed, setPlaced] = useState<OrderRecord[]>([]);
  const [executedOpen, setExecutedOpen] = useState(true);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>('all');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => ordersApi.list(token).then(({ orders: next }) => !cancelled && setPlaced(next)).catch(() => undefined);
    load();
    window.addEventListener('ntd:portfolio-change', load);
    return () => {
      cancelled = true;
      window.removeEventListener('ntd:portfolio-change', load);
    };
  }, [token]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...placed, ...orders];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return all.filter((order) => {
      const createdAt = order.createdAt ? new Date(`${order.createdAt.replace(' ', 'T')}Z`) : null;
      const inRange = historyRange === 'all'
        || !createdAt
        || (historyRange === 'today'
          ? createdAt.toDateString() === new Date().toDateString()
          : createdAt >= cutoff);
      const searchable = [order.instrument, order.exchange, order.side, order.product, order.status, order.time]
        .join(' ')
        .toLowerCase();
      return inRange && (!q || searchable.includes(q));
    });
  }, [query, placed, historyRange]);

  const downloadCsv = () => {
    const body = rows.map((order) => [order.time, order.side, order.instrument, order.exchange, order.product, order.filled, order.qty, order.avgPrice, order.status]);
    const csv = [['Time', 'Type', 'Instrument', 'Exchange', 'Product', 'Filled', 'Quantity', 'Average price', 'Status'], ...body]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');
    downloadFile(csv, 'text/csv;charset=utf-8', `ntd-orders-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadContractNote = () => {
    const turnover = rows.reduce((total, order) => total + order.filled * order.avgPrice, 0);
    const tableRows = rows.map((order) => `<tr><td>${escapeHtml(order.time)}</td><td>${escapeHtml(order.side)}</td><td>${escapeHtml(order.instrument)}</td><td>${escapeHtml(order.exchange)}</td><td>${escapeHtml(order.product)}</td><td class="number">${order.filled}</td><td class="number">₹${num(order.avgPrice)}</td><td>${escapeHtml(order.status)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>NTD Contract Note</title><style>body{font:13px Arial,sans-serif;color:#15191e;margin:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #15191e;padding-bottom:16px}h1{font-size:20px;margin:0}p{line-height:1.6}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border-bottom:1px solid #d7dce1;padding:8px;text-align:left}th{font-size:11px;text-transform:uppercase}.number{text-align:right}footer{margin-top:24px;color:#59616b}</style></head><body><header><div><h1>NTD Contract Note</h1><p>Trade date: ${new Date().toLocaleDateString('en-IN')}</p></div><p>Client: ${escapeHtml(user?.name ?? '')}<br>Client ID: ${escapeHtml(user?.clientId ?? '')}</p></header><table><thead><tr><th>Time</th><th>Type</th><th>Instrument</th><th>Exchange</th><th>Product</th><th class="number">Qty</th><th class="number">Price</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table><footer>${rows.length} executed orders · Gross turnover ₹${num(turnover)}<br>This development contract note is generated from the orders currently shown in NTD.</footer></body></html>`;
    downloadFile(html, 'text/html;charset=utf-8', `ntd-contract-note-${new Date().toISOString().slice(0, 10)}.html`);
  };

  return (
    <AppShell tabs={[...ORDER_TABS]} activeTab="Orders" onTabChange={(tab) => navigate(ORDER_PATHS[tab as OrderTab])}>
      <section className="panel">
        <div className="panel-head">
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-3)' }}
            onClick={() => setExecutedOpen((v) => !v)}
          >
            <Icon.Chevron dir={executedOpen ? 'up' : 'down'} />
            <span className="panel-title">Executed</span>
            <span className="panel-count num">({rows.length})</span>
          </button>

          <div className="panel-actions">
            <div className="chip input" style={{ cursor: 'text' }}>
              <Icon.Search size={12} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search orders"
                style={{
                  width: 92,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  font: 'inherit',
                  color: 'var(--text)',
                }}
              />
            </div>
            <button className="chip" onClick={downloadContractNote} disabled={!rows.length}>
              <Icon.Doc /> Contract note
            </button>
            <button className={historyOpen || historyRange !== 'all' ? 'chip range active' : 'chip'} onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen}>
              <Icon.Clock /> History
            </button>
            <button className="chip" onClick={downloadCsv} disabled={!rows.length}>
              <Icon.Download /> Download
            </button>
          </div>
        </div>

        {historyOpen && (
          <div className="order-history-bar">
            <span>Order period</span>
            {([['today', 'Today'], ['7d', 'Last 7 days'], ['all', 'All orders']] as [HistoryRange, string][]).map(([value, label]) => (
              <button key={value} className={historyRange === value ? 'chip range active' : 'chip range'} onClick={() => setHistoryRange(value)}>{label}</button>
            ))}
            <span className="num">{rows.length} results</span>
          </div>
        )}

        {executedOpen && (
          <>
            <div className="thead">
              <span style={{ width: COLS.time }}>TIME</span>
              <span style={{ width: COLS.type }}>TYPE</span>
              <span style={{ flex: 1, minWidth: 0 }}>INSTRUMENT</span>
              <span style={{ width: COLS.product }}>PRODUCT</span>
              <span style={{ width: COLS.qty, textAlign: 'right' }}>QTY</span>
              <span style={{ width: COLS.price, textAlign: 'right' }}>AVG. PRICE</span>
              <span style={{ width: COLS.status, textAlign: 'right' }}>STATUS</span>
            </div>

            <div>
              {rows.map((o) => (
                <div className="trow" key={`${o.time}-${o.instrument}-${o.side}`}>
                  <span className="num" style={{ width: COLS.time, fontSize: 11, color: 'var(--text-3)' }}>
                    {o.time}
                  </span>
                  <div style={{ width: COLS.type }}>
                    <span className={o.side === 'BUY' ? 'badge buy' : 'badge sell'}>{o.side}</span>
                  </div>
                  <div className="tname">
                    <span>{o.instrument}</span>
                    <span className="wl-exch">{o.exchange}</span>
                  </div>
                  <span style={{ width: COLS.product, fontSize: 11, color: 'var(--text-3)' }}>
                    {o.product}
                  </span>
                  <span
                    className="num"
                    style={{ width: COLS.qty, textAlign: 'right', fontSize: 11, color: 'var(--text-2)' }}
                  >
                    {o.filled} / {o.qty}
                  </span>
                  <span
                    className="num"
                    style={{ width: COLS.price, textAlign: 'right', fontSize: 11, color: 'var(--text-2)' }}
                  >
                    {num(o.avgPrice)}
                  </span>
                  <div style={{ width: COLS.status, display: 'flex', justifyContent: 'flex-end' }}>
                    <span className="badge status">{o.status}</span>
                  </div>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="stub" style={{ padding: '48px 0' }}>
                  <span style={{ fontSize: 11 }}>No orders match “{query}”.</span>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <button
          className="panel-head"
          style={{ gap: 7, width: '100%', borderBottom: tradesOpen ? '1px solid var(--border)' : 'none' }}
          onClick={() => setTradesOpen((v) => !v)}
        >
          <Icon.Chevron dir={tradesOpen ? 'up' : 'down'} />
          <span className="panel-title">Trades</span>
          <span className="panel-count num">({rows.length})</span>
        </button>
        {tradesOpen && (
          <div className="stub" style={{ padding: '32px 0' }}>
            <span style={{ fontSize: 11 }}>Trade-level breakdown is not designed yet.</span>
          </div>
        )}
      </section>
    </AppShell>
  );
}
