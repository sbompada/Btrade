import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useHoldings, type LiveHolding } from '../market/useHoldings';
import { num, signed, signedPct, signedRupees, toneOf, whole } from '../lib/format';

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
  const { holdings, loading, count, invested, currentValue, pnl, pnlPct, dayPnl } = useHoldings();
  const [sort, setSort] = useState<SortKey>('value');

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
          <span className="panel-count num">({count})</span>
          <div className="panel-actions">
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
            <button className="chip">
              <Icon.Download /> Download
            </button>
          </div>
        </div>

        <div className="thead">
          <span style={{ flex: 1, minWidth: 0 }}>INSTRUMENT</span>
          <span style={{ width: COLS.qty, textAlign: 'right' }}>QTY</span>
          <span style={{ width: COLS.avg, textAlign: 'right' }}>AVG. COST</span>
          <span style={{ width: COLS.ltp, textAlign: 'right' }}>LTP</span>
          <span style={{ width: COLS.value, textAlign: 'right' }}>CUR. VALUE</span>
          <span style={{ width: COLS.pnl, textAlign: 'right' }}>P&amp;L</span>
          <span style={{ width: COLS.net, textAlign: 'right' }}>NET CHG.</span>
          <span style={{ width: COLS.day, textAlign: 'right' }}>DAY CHG.</span>
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
        )}
      </section>
    </AppShell>
  );
}
