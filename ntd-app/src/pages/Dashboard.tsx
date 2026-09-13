import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { usePortfolio } from '../market/usePortfolio';
import { useFunds } from '../market/useFunds';
import { useHoldings } from '../market/useHoldings';
import { useMarket } from '../market/MarketDataContext';
import CalendarPanel from '../components/CalendarPanel';
import MarketOverview from '../components/MarketOverview';
import { currentSession } from '../data/market';
import { num, signed, signedPct, signedRupees, toneOf, whole } from '../lib/format';
import { DASHBOARD_PATHS, DASHBOARD_TABS, type DashboardTab } from './dashboardNavigation';


function MoversPanel({
  title,
  rows,
  move,
  source,
}: {
  title: string;
  rows: { symbol: string; exchange: string; ltp: number; changePct: number }[];
  move: 'gainers' | 'losers';
  source: string | null;
}) {
  return (
    <section className="panel">
      <div className="panel-head compact">
        <span className="panel-title caps">{title}</span>
        <span className="tag">{source === 'replay' ? 'REPLAY UNIVERSE' : 'MARKET UNIVERSE'}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--faint)', display: 'flex' }}>
          <Icon.Dots />
        </span>
      </div>
      <div style={{ padding: '3px 0' }}>
        {rows.map((r) => (
          <div className="trow sm" key={r.symbol}>
            <div className="tname">
              <span>{r.symbol}</span>
              <span className="wl-exch">{r.exchange}</span>
            </div>
            <span className="num right" style={{ width: 76, fontSize: 11, color: 'var(--text-2)' }}>
              {num(r.ltp)}
            </span>
            <span className={`num right ${toneOf(r.changePct)}`} style={{ width: 58, fontSize: 11 }}>
              {signedPct(r.changePct)}
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="stub" style={{ padding: '32px 0' }}>
            <span style={{ fontSize: 10 }}>Waiting for market data…</span>
          </div>
        )}
      </div>
      <div className="panel-foot">
        <Link to={`/screener?move=${move}`}>View all →</Link>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.name.split(/\s+/)[0] ?? 'there';
  const { positions, unrealised, realised, dayPnl, maxAbsPnl } = usePortfolio();
  const { funds, loading: fundsLoading } = useFunds();
  const hold = useHoldings();
  const { quotes, source } = useMarket();
  const session = currentSession();
  const marketRows = [...quotes.values()];
  const topGainers = marketRows
    .filter((quote) => quote.changePct > 0)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, 8);
  const topLosers = marketRows
    .filter((quote) => quote.changePct < 0)
    .sort((a, b) => a.changePct - b.changePct)
    .slice(0, 8);
  // A plausible-but-wrong 0.00 is worse than an obvious placeholder while loading.
  const money = (v: number | undefined) => (fundsLoading ? "—" : num(v ?? 0));

  return (
    <AppShell
      tabs={[...DASHBOARD_TABS]}
      activeTab="Dashboard"
      onTabChange={(tab) => navigate(DASHBOARD_PATHS[tab as DashboardTab])}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
          Good afternoon, {firstName}
        </h1>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>
          {session.dateLabel} · {session.expiryNote}
        </span>
      </div>

      <div className="grid-4">
        <div className="tile">
          <span className="tile-label">EQUITY · AVAILABLE</span>
          <span className="tile-value num">{fundsLoading ? "—" : `₹${num(funds?.equity?.availableMargin ?? 0)}`}</span>
          <div className="tile-rows">
            <div className="tile-row">
              <span>Margin used</span>
              <span className="num">{money(funds?.equity?.usedMargin)}</span>
            </div>
            <div className="tile-row">
              <span>Opening balance</span>
              <span className="num">{money(funds?.equity?.openingBalance)}</span>
            </div>
          </div>
        </div>

        <div className="tile">
          <span className="tile-label">COMMODITY · AVAILABLE</span>
          <span className="tile-value num">{fundsLoading ? "—" : `₹${num(funds?.commodity?.availableMargin ?? 0)}`}</span>
          <div className="tile-rows">
            <div className="tile-row">
              <span>Margin used</span>
              <span className="num">{money(funds?.commodity?.usedMargin)}</span>
            </div>
            <div className="tile-row">
              <span>Opening balance</span>
              <span className="num">{money(funds?.commodity?.openingBalance)}</span>
            </div>
          </div>
        </div>

        <div className="tile">
          <span className="tile-label">DAY&rsquo;S P&amp;L</span>
          <span className={`tile-value num ${toneOf(dayPnl)}`}>{signedRupees(dayPnl)}</span>
          <div className="tile-rows">
            <div className="tile-row">
              <span>Realised</span>
              <span className="num">{signed(realised)}</span>
            </div>
            <div className="tile-row">
              <span>Unrealised</span>
              <span className="num">{signed(unrealised)}</span>
            </div>
          </div>
        </div>

        <div className="tile">
          <span className="tile-label">HOLDINGS · {hold.count} STOCKS</span>
          <span className="tile-value num">{hold.loading ? "—" : `₹${whole(hold.currentValue)}`}</span>
          <div className="tile-rows">
            <div className="tile-row">
              <span>Invested</span>
              <span className="num">{hold.loading ? "—" : whole(hold.invested)}</span>
            </div>
            <div className="tile-row">
              <span>Overall returns</span>
              <span className={`num ${toneOf(hold.pnl)}`}>
                {hold.loading ? "—" : `${signed(hold.pnl)} (${hold.pnlPct.toFixed(2)}%)`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-lists">
        <MoversPanel title="Top gainers" rows={topGainers} move="gainers" source={source} />
        <MoversPanel title="Top losers" rows={topLosers} move="losers" source={source} />

        <CalendarPanel />
      </div>

      <div className="grid-chart">
        <MarketOverview />

        <section className="panel">
          <div className="panel-head compact">
            <span className="panel-title caps">Positions ({positions.length})</span>
            <span style={{ marginLeft: 'auto' }}>
              <a href="#analyse" style={{ fontSize: 10 }}>
                Analyse →
              </a>
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 12px' }}>
            {positions.map((p, idx) => {
              const pnl = p.pnl;
              const tone = toneOf(pnl);
              return (
                <div
                  key={p.instrument}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    padding: '8px 0',
                    borderTop: idx === 0 ? 'none' : '1px solid var(--hairline-soft)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{p.instrument}</span>
                    <span className={`num ${tone}`} style={{ fontSize: 11 }}>
                      {signedRupees(pnl)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="num" style={{ fontSize: 9, color: 'var(--dimmer)' }}>
                      {p.product} · {p.qty} · avg {num(p.avg)}
                    </span>
                    <span className="num" style={{ fontSize: 9, color: 'var(--dimmer)' }}>
                      LTP {num(p.ltp)}
                    </span>
                  </div>
                  <div className="bar">
                    <div
                      style={{
                        width: `${(Math.abs(pnl) / maxAbsPnl) * 100}%`,
                        background: tone === 'up' ? 'var(--up)' : 'var(--down)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="tfoot" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--dim)' }}>Total</span>
            <span className={`num ${toneOf(unrealised)}`} style={{ fontSize: 13, fontWeight: 500 }}>
              {signedRupees(unrealised)}
            </span>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
