import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError, ordersApi, type OrderRecord, type TradeRecord } from '../lib/api';
import { orders } from '../data/market';
import { istDate, istDateKey, num, timestampDate } from '../lib/format';
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
  status: 184,
};

function ModifyOrderDialog({ order, onClose, onComplete }: { order: OrderRecord; onClose: () => void; onComplete: (order: OrderRecord) => void }) {
  const { token } = useAuth();
  const [qty, setQty] = useState(order.qty);
  const [limitPrice, setLimitPrice] = useState(order.limitPrice ?? 0);
  const [triggerPrice, setTriggerPrice] = useState(order.triggerPrice ?? 0);
  const [validity, setValidity] = useState<'DAY' | 'MINUTES'>(order.validity === 'MINUTES' ? 'MINUTES' : 'DAY');
  const [validityMinutes, setValidityMinutes] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLimit = ['LIMIT', 'SL'].includes(order.orderType);
  const hasTrigger = order.variety === 'CO' || ['SL', 'SL-M'].includes(order.orderType);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await ordersApi.modify(token, order.id, {
        qty,
        limitPrice: hasLimit ? limitPrice : undefined,
        triggerPrice: hasTrigger ? triggerPrice : undefined,
        validity,
        validityMinutes: validity === 'MINUTES' ? validityMinutes : undefined,
      });
      onComplete(result.order);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not modify the order.');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="order-ticket" role="dialog" aria-modal="true" aria-labelledby="modify-order-title">
      <div className="order-ticket-head"><div><strong id="modify-order-title">Modify {order.instrument}</strong><span>{order.side} · {order.product} · {order.orderType}</span></div><button onClick={onClose} aria-label="Close modify order">×</button></div>
      <form onSubmit={submit}>
        <div className="order-fields">
          <label><span>Quantity</span><input aria-label="Modify quantity" type="number" min={order.filled + 1} max="100000" value={qty} onChange={(event) => setQty(Number(event.target.value))} autoFocus /></label>
          {hasLimit && <label><span>Limit price</span><input aria-label="Modify limit price" type="number" min="0.05" step="0.05" value={limitPrice} onChange={(event) => setLimitPrice(Number(event.target.value))} /></label>}
          {hasTrigger && <label><span>Trigger price</span><input aria-label="Modify trigger price" type="number" min="0.05" step="0.05" value={triggerPrice} onChange={(event) => setTriggerPrice(Number(event.target.value))} /></label>}
        </div>
        <div className="order-validity">
          <label><span>Validity</span><select aria-label="Modify validity" value={validity} onChange={(event) => setValidity(event.target.value as 'DAY' | 'MINUTES')}><option>DAY</option><option>MINUTES</option></select></label>
          {validity === 'MINUTES' && <label><span>Minutes from now</span><input aria-label="Modify validity minutes" type="number" min="1" max="120" value={validityMinutes} onChange={(event) => setValidityMinutes(Number(event.target.value))} /></label>}
        </div>
        <div className="order-estimate"><span>Filled quantity</span><span className="num">{order.filled} / {order.qty}</span></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={submitting || qty <= order.filled}>{submitting ? 'Updating…' : 'Update order'}</button>
      </form>
    </section>
  </div>;
}

export default function Orders() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [query, setQuery] = useState('');
  const [placed, setPlaced] = useState<OrderRecord[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [executedOpen, setExecutedOpen] = useState(true);
  const [tradesOpen, setTradesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRange, setHistoryRange] = useState<HistoryRange>('all');
  const [editing, setEditing] = useState<OrderRecord | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => Promise.all([ordersApi.list(token), ordersApi.trades(token)]).then(([orderBook, tradeBook]) => {
      if (cancelled) return;
      setPlaced(orderBook.orders);
      setTrades(tradeBook.trades);
    }).catch(() => undefined);
    load();
    const interval = window.setInterval(load, 3000);
    window.addEventListener('ntd:portfolio-change', load);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('ntd:portfolio-change', load);
    };
  }, [token]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...placed, ...orders];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return all.filter((order) => {
      const createdAt = order.createdAt ? timestampDate(order.createdAt) : null;
      const inRange = historyRange === 'all'
        || !createdAt
        || (historyRange === 'today'
          ? istDateKey(createdAt) === istDateKey()
          : createdAt >= cutoff);
      const searchable = [order.instrument, order.exchange, order.side, order.product, order.variety, order.status, order.time]
        .join(' ')
        .toLowerCase();
      return inRange && (!q || searchable.includes(q));
    });
  }, [query, placed, historyRange]);

  const cancel = async (order: OrderRecord) => {
    if (!token) return;
    try {
      const { order: cancelled } = await ordersApi.cancel(token, order.id);
      setPlaced((current) => current.map((item) => item.id === cancelled.id ? cancelled : item));
    } catch {
      const { orders: current } = await ordersApi.list(token);
      setPlaced(current);
    }
  };

  const downloadCsv = () => {
    const body = rows.map((order) => [order.time, order.side, order.instrument, order.exchange, order.product, order.filled, order.qty, order.avgPrice, order.status]);
    const csv = [['Time (IST)', 'Type', 'Instrument', 'Exchange', 'Product', 'Filled', 'Quantity', 'Average price', 'Status'], ...body]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');
    downloadFile(csv, 'text/csv;charset=utf-8', `ntd-orders-${istDateKey()}.csv`);
  };

  const downloadContractNote = () => {
    const turnover = rows.reduce((total, order) => total + order.filled * order.avgPrice, 0);
    const tableRows = rows.map((order) => `<tr><td>${escapeHtml(order.time)}</td><td>${escapeHtml(order.side)}</td><td>${escapeHtml(order.instrument)}</td><td>${escapeHtml(order.exchange)}</td><td>${escapeHtml(order.product)}</td><td class="number">${order.filled}</td><td class="number">₹${num(order.avgPrice)}</td><td>${escapeHtml(order.status)}</td></tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>NTD Contract Note</title><style>body{font:13px Arial,sans-serif;color:#15191e;margin:40px}header{display:flex;justify-content:space-between;border-bottom:2px solid #15191e;padding-bottom:16px}h1{font-size:20px;margin:0}p{line-height:1.6}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{border-bottom:1px solid #d7dce1;padding:8px;text-align:left}th{font-size:11px;text-transform:uppercase}.number{text-align:right}footer{margin-top:24px;color:#59616b}</style></head><body><header><div><h1>NTD Contract Note</h1><p>Trade date: ${istDate()}</p></div><p>Client: ${escapeHtml(user?.name ?? '')}<br>Client ID: ${escapeHtml(user?.clientId ?? '')}</p></header><table><thead><tr><th>Time (IST)</th><th>Type</th><th>Instrument</th><th>Exchange</th><th>Product</th><th class="number">Qty</th><th class="number">Price</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table><footer>${rows.length} executed orders · Gross turnover ₹${num(turnover)}<br>This development contract note is generated from the orders currently shown in NTD.</footer></body></html>`;
    downloadFile(html, 'text/html;charset=utf-8', `ntd-contract-note-${istDateKey()}.html`);
  };

  return (
    <AppShell tabs={[...ORDER_TABS]} activeTab="Orders" onTabChange={(tab) => navigate(ORDER_PATHS[tab as OrderTab])}>
      <section className="panel order-book-panel">
        <div className="panel-head">
          <button
            style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-3)' }}
            onClick={() => setExecutedOpen((v) => !v)}
          >
            <Icon.Chevron dir={executedOpen ? 'up' : 'down'} />
            <span className="panel-title">Order book</span>
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
                <div className="trow" key={o.id ?? `${o.time}-${o.instrument}-${o.side}`}>
                  <span className="num" style={{ width: COLS.time, fontSize: 11, color: 'var(--text-3)' }}>
                    {o.time}
                  </span>
                  <div style={{ width: COLS.type }}>
                    <span className={o.side === 'BUY' ? 'badge buy' : 'badge sell'}>{o.side}</span>
                  </div>
                  <div className="tname">
                    <span>{o.instrument}</span>
                    <span className="wl-exch">
                      {o.exchange} · {o.orderType ?? 'MARKET'}
                      {o.limitPrice ? ` @ ₹${num(o.limitPrice)}` : ''}
                      {o.triggerPrice ? ` · trigger ₹${num(o.triggerPrice)}` : ''}
                      {o.isAmo ? ' · AMO' : ''}
                      {o.icebergLegs ? ` · ${o.icebergLegs} legs` : ''}
                    </span>
                  </div>
                  <span style={{ width: COLS.product, fontSize: 11, color: 'var(--text-3)' }} title={o.variety === 'CO' ? `Protective trigger ₹${num(o.triggerPrice ?? 0)}` : undefined}>
                    {o.variety === 'CO' ? 'CO / ' : ''}{o.product}
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
                    {o.filled ? num(o.avgPrice) : '—'}
                  </span>
                  <div style={{ width: COLS.status, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    {o.id && ['OPEN', 'TRIGGER PENDING', 'AMO PENDING'].includes(o.status) ? (
                      <><span className="badge status">{o.status}</span><button className="chip" onClick={() => setEditing(o as OrderRecord)}>Edit</button><button className="chip danger" onClick={() => cancel(o as OrderRecord)}>Cancel</button></>
                    ) : <span className="badge status">{o.status}</span>}
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
          <span className="panel-count num">({trades.length})</span>
        </button>
        {tradesOpen && (
          trades.length ? <div className="trade-book">
            <div className="trade-head"><span>TIME</span><span>INSTRUMENT</span><span>TYPE</span><span>QUANTITY</span><span>PRICE</span><span>VALUE</span><span>ORDER</span></div>
            {trades.map((trade) => <div className="trade-row" key={trade.id}>
              <span className="num">{trade.time}</span>
              <div><strong>{trade.instrument}</strong><span>{trade.exchange} · {trade.product}</span></div>
              <span className={trade.side === 'BUY' ? 'badge buy' : 'badge sell'}>{trade.side}</span>
              <span className="num">{trade.quantity}</span>
              <span className="num">₹{num(trade.price)}</span>
              <span className="num">₹{num(trade.value)}</span>
              <span className="num">#{trade.orderId}</span>
            </div>)}
          </div> : <div className="stub" style={{ padding: '32px 0' }}><span style={{ fontSize: 11 }}>No completed trades yet.</span></div>
        )}
      </section>
      {editing && <ModifyOrderDialog order={editing} onClose={() => setEditing(null)} onComplete={(updated) => { setPlaced((current) => current.map((order) => order.id === updated.id ? updated : order)); setEditing(null); }} />}
    </AppShell>
  );
}
