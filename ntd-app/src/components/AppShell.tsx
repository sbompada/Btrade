import { useEffect, useState, type ReactNode } from 'react';
import { currentSession } from '../data/market';
import TopBar from './TopBar';
import Watchlist from './Watchlist';

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
  const [session, setSession] = useState(currentSession());

  useEffect(() => {
    const id = setInterval(() => setSession(currentSession()), 1000);
    return () => clearInterval(id);
  }, []);

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
        <div className="status">
          <div className="status-dot" style={{ background: session.marketOpen ? "var(--up)" : "var(--faint)" }} />
          <span className="status-label">
            {session.marketOpen ? 'NSE & BSE open' : 'Markets closed'}
          </span>
          <span className="status-clock num">{session.clock}</span>
        </div>
      </div>

      <div className="shell-body">
        {withWatchlist && <Watchlist />}
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
