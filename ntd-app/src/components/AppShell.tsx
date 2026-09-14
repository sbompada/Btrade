import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMarketTimings } from '../market/useMarketTimings';
import TopBar from './TopBar';
import Watchlist from './Watchlist';
import InstrumentChart from './InstrumentChart';

type Props = {
  tabs: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  /** Admin screens have nothing to do with a watchlist. */
  withWatchlist?: boolean;
  children: ReactNode;
};

export default function AppShell({
  tabs,
  activeTab,
  onTabChange,
  withWatchlist = true,
  children,
}: Props) {
  const active = activeTab ?? tabs[0];
  const timings = useMarketTimings();
  const [chartInstrument, setChartInstrument] = useState<{ symbol: string; exchange: string } | null>(null);

  return (
    <div className="app">
      <TopBar />

      <div className="subnav">
        {tabs.map((t) => (
          <button
            key={t}
            className={t === active ? 'subnav-tab active' : 'subnav-tab'}
            onClick={() => onTabChange?.(t)}
          >
            {t}
          </button>
        ))}
        <Link className="status" to="/market-timings" aria-label="View market timings">
          <div className="status-dot" style={{ background: timings?.equityOpen ? "var(--up)" : "var(--faint)" }} />
          <span className="status-label">
            {timings ? timings.equityOpen ? 'NSE & BSE open' : 'Markets closed' : 'Market status'}
          </span>
          <span className="status-clock num">{timings?.clock ?? 'IST'}</span>
        </Link>
      </div>

      <div className="shell-body">
        {withWatchlist && <Watchlist onOpenChart={setChartInstrument} />}
        <main className="main">{chartInstrument ? <InstrumentChart instrument={chartInstrument} onClose={() => setChartInstrument(null)} /> : children}</main>
      </div>
    </div>
  );
}
