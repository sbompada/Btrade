import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError, holdingsApi } from '../lib/api';
import { useHoldings, type LiveHolding } from '../market/useHoldings';
import { istDateKey, istDateTime, num, signed, signedPct, signedRupees, toneOf, whole } from '../lib/format';

const COLS = {
  qty: 70,
  avg: 90,
  ltp: 90,
  value: 110,
  pnl: 120,
  net: 80,
  day: 80,
};

type SortKey = 'symbol' | 'value' | 'pnl' | 'day';

function Summary({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value num ${tone ?? ''}`}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--dim)' }}>{sub}</span>}
    </div>
  );
}

export default function Holdings() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { holdings, unsettled, loading, count, invested, currentValue, pnl, pnlPct, dayPnl } = useHoldings();
  const [sort, setSort] = useState<SortKey>('value');
  const [view, setView] = useState<'settled' | 'unsettled'>('settled');
  const [detail, setDetail] = useState<LiveHolding | null>(null);
  const [exit, setExit] = useState<LiveHolding | null>(null);
  const [exitQty, setExitQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const copy = [...holdings];
    const by: Record<SortKey, (a: LiveHolding, b: LiveHolding) => number> = {
      symbol: (a, b) => a.symbol.localeCompare(b.symbol),
      value: (a, b) => b.currentValue - a.currentValue,
      pnl: (a, b) => b.pnl - a.pnl,
      day: (a, b) => b.dayChangePct - a.dayChangePct,
    };
    return copy.sort(by[sort]);
  }, [holdings, sort]);

  const download = () => {
    const source = view === 'settled'
      ? rows.map((holding) => [holding.symbol, holding.exchange, holding.qty, holding.avgCost, holding.ltp, holding.currentValue, holding.pnl, holding.pledgedQty])
      : unsettled.map((holding) => [holding.symbol, holding.exchange, holding.qty, holding.avgCost, '', '', '', holding.settlementStatus]);
    const header = view === 'settled'
      ? ['Instrument', 'Exchange', 'Quantity', 'Average cost', 'LTP', 'Current value', 'P&L', 'Pledged quantity']
      : ['Instrument', 'Exchange', 'Quantity', 'Average cost', 'LTP', 'Current value', 'P&L', 'Settlement status'];
    const csv = [header, ...source].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ntd-${view}-holdings-${istDateKey()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const submitExit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !exit) return;
    setSubmitting(true);
    setError(null);
    try {
      await holdingsApi.exit(token, exit.symbol, exitQty);
      setExit(null);
      setDetail(null);
      window.dispatchEvent(new Event('ntd:portfolio-change'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not exit this holding.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell tabs={['Holdings', 'Mutual funds']} activeTab="Holdings" onTabChange={(tab) => navigate(tab === 'Mutual funds' ? '/mutual-funds' : '/holdings')}>
      <div className="grid-4">
        <Summary label="CURRENT VALUE" value={`₹${whole(currentValue)}`} sub={`${count} stocks`} />
        <Summary label="INVESTED" value={`₹${whole(invested)}`} />
        <Summary
          label="OVERALL P&L"
          value={signedRupees(pnl)}
          sub={`${signedPct(pnlPct)} on cost`}
          tone={toneOf(pnl)}
        />
        <Summary
          label="DAY&rsquo;S CHANGE"
          value={signedRupees(dayPnl)}
          sub="against previous close"
          tone={toneOf(dayPnl)}
        />
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Holdings</span>
          <span className="panel-count num">({view === 'settled' ? count : unsettled.length})</span>
          <div className="panel-actions">
            <button className={view === 'settled' ? 'chip range active' : 'chip range'} onClick={() => { setView('settled'); setDetail(null); }}>Settled</button>
            <button className={view === 'unsettled' ? 'chip range active' : 'chip range'} onClick={() => { setView('unsettled'); setDetail(null); }}>T1 &amp; unsettled</button>
            {view === 'settled' && <>
            {(
              [
                ['value', 'Value'],
                ['pnl', 'P&L'],
                ['day', "Day's change"],
                ['symbol', 'Name'],
              ] as [SortKey, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                className={sort === key ? 'chip range active' : 'chip range'}
                onClick={() => setSort(key)}
              >
                {label}
              </button>
            ))}
            </>}
            <button className="chip" onClick={download} disabled={view === 'settled' ? !rows.length : !unsettled.length}>
              <Icon.Download /> Download
            </button>
          </div>
        </div>

        {view === 'settled' ? <><div className="thead">
          <span style={{ flex: 1, minWidth: 0 }}>INSTRUMENT</span>
          <span style={{ width: COLS.qty, textAlign: 'right' }}>QTY</span>
          <span style={{ width: COLS.avg, textAlign: 'right' }}>AVG. COST</span>
          <span style={{ width: COLS.ltp, textAlign: 'right' }}>LTP</span>
          <span style={{ width: COLS.value, textAlign: 'right' }}>CUR. VALUE</span>
          <span style={{ width: COLS.pnl, textAlign: 'right' }}>P&amp;L</span>
          <span style={{ width: COLS.net, textAlign: 'right' }}>NET CHG.</span>
          <span style={{ width: COLS.day, textAlign: 'right' }}>DAY CHG.</span>
          <span style={{ width: 104, textAlign: 'right' }}>ACTION</span>
        </div>

        {loading ? (
          <div className="stub" style={{ padding: '56px 0' }}>
            <span style={{ fontSize: 11 }}>Loading your holdings…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="stub" style={{ padding: '56px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No holdings yet</span>
            <span style={{ fontSize: 11 }}>
              Stock you buy for delivery appears here once it settles.
            </span>
          </div>
        ) : (
          <>
            {rows.map((h) => (
              <div className="trow" key={h.symbol}>
                <div className="tname">
                  <span>{h.symbol}</span>
                  <span className="wl-exch">{h.exchange}</span>
                  {h.pledgedQty > 0 && (
                    <span className="tag" style={{ fontSize: 8 }}>
                      {h.pledgedQty} PLEDGED
                    </span>
                  )}
                </div>
                <span className="num" style={{ width: COLS.qty, textAlign: 'right', fontSize: 11, color: 'var(--text-2)' }}>
                  {h.qty}
                </span>
                <span className="num" style={{ width: COLS.avg, textAlign: 'right', fontSize: 11, color: 'var(--text-3)' }}>
                  {num(h.avgCost)}
                </span>
                <span className="num" style={{ width: COLS.ltp, textAlign: 'right', fontSize: 11, color: 'var(--text-2)' }}>
                  {num(h.ltp)}
                </span>
                <span className="num" style={{ width: COLS.value, textAlign: 'right', fontSize: 11, color: 'var(--text-2)' }}>
                  {whole(h.currentValue)}
                </span>
                <span className={`num ${toneOf(h.pnl)}`} style={{ width: COLS.pnl, textAlign: 'right', fontSize: 11 }}>
                  {signed(h.pnl)}
                </span>
                <span className={`num ${toneOf(h.pnl)}`} style={{ width: COLS.net, textAlign: 'right', fontSize: 11 }}>
                  {signedPct(h.pnlPct)}
                </span>
                <span
                  className={`num ${toneOf(h.dayChangePct)}`}
                  style={{ width: COLS.day, textAlign: 'right', fontSize: 11 }}
                >
                  {signedPct(h.dayChangePct)}
                </span>
                <span style={{ width: 104, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                  <button className="chip range" onClick={() => setDetail(detail?.symbol === h.symbol ? null : h)}>Details</button>
                  <button className="chip danger" disabled={h.qty - h.pledgedQty <= 0} title={h.qty - h.pledgedQty <= 0 ? 'All shares are pledged' : 'Exit unpledged shares'} onClick={() => { setExit(h); setExitQty(Math.max(1, h.qty - h.pledgedQty)); setError(null); }}>Exit</button>
                </span>
              </div>
            ))}

            <div className="tfoot">
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Total</span>
              <span className="num" style={{ width: COLS.value, textAlign: 'right', fontSize: 12, color: 'var(--text)' }}>
                {whole(currentValue)}
              </span>
              <span
                className={`num ${toneOf(pnl)}`}
                style={{ width: COLS.pnl, textAlign: 'right', fontSize: 14, fontWeight: 500 }}
              >
                {signedRupees(pnl)}
              </span>
              <span className={`num ${toneOf(pnl)}`} style={{ width: COLS.net, textAlign: 'right', fontSize: 11 }}>
                {signedPct(pnlPct)}
              </span>
              <span style={{ width: COLS.day }} />
            </div>
          </>
        )}</> : <>
          <div className="thead"><span style={{ flex: 1 }}>INSTRUMENT</span><span style={{ width: 100 }}>STATUS</span><span style={{ width: 90, textAlign: 'right' }}>QTY</span><span style={{ width: 110, textAlign: 'right' }}>AVG. COST</span><span style={{ width: 180 }}>PURCHASED</span></div>
          {unsettled.map((holding) => <div className="trow" key={`${holding.symbol}-${holding.openedAt}`}><div className="tname"><span>{holding.symbol}</span><span className="wl-exch">{holding.exchange}</span></div><span style={{ width: 100 }}><span className="tag">{holding.settlementStatus}</span></span><span className="num" style={{ width: 90, textAlign: 'right' }}>{holding.qty}</span><span className="num" style={{ width: 110, textAlign: 'right' }}>{num(holding.avgCost)}</span><span className="num" style={{ width: 210 }}>{istDateTime(holding.openedAt)}</span></div>)}
          {!unsettled.length && <div className="stub" style={{ padding: '56px 0' }}><span>No unsettled delivery purchases.</span></div>}
        </>}
      </section>

      {detail && <section className="panel"><div className="panel-head"><span className="panel-title">{detail.symbol} breakdown</span><button className="chip" style={{ marginLeft: 'auto' }} onClick={() => setDetail(null)}>Close</button></div><div className="position-analytics"><div><span>AVAILABLE</span><strong className="num">{detail.qty - detail.pledgedQty}</strong></div><div><span>PLEDGED</span><strong className="num">{detail.pledgedQty}</strong></div><div><span>INVESTED</span><strong className="num">₹{num(detail.invested)}</strong></div><div><span>CURRENT VALUE</span><strong className="num">₹{num(detail.currentValue)}</strong></div></div></section>}

      {exit && <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setExit(null)}><section className="order-ticket" role="dialog" aria-modal="true" aria-labelledby="holding-exit-title"><div className="order-ticket-head"><div><strong id="holding-exit-title">Exit {exit.symbol}</strong><span>{exit.qty - exit.pledgedQty} unpledged shares available</span></div><button onClick={() => setExit(null)} aria-label="Close exit dialog">×</button></div><form onSubmit={submitExit}><div className="order-fields"><label><span>Quantity</span><input type="number" min="1" max={exit.qty - exit.pledgedQty} step="1" value={exitQty} onChange={(event) => setExitQty(Number(event.target.value))} autoFocus /></label><label><span>Order</span><input value="Market · CNC sell" disabled /></label></div>{error && <div className="form-error" role="alert">{error}</div>}<button className="btn primary block" disabled={submitting || exitQty < 1 || exitQty > exit.qty - exit.pledgedQty}>{submitting ? 'Placing exit…' : `Exit ${exitQty} share${exitQty === 1 ? '' : 's'}`}</button></form></section></div>}
    </AppShell>
  );
}
