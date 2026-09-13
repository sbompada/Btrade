import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { positionsApi, type PositionRecord } from '../lib/api';
import { realisedPnl } from '../data/market';
import { useMarket } from './MarketDataContext';

export type LivePosition = PositionRecord & {
  ltp: number;
  pnl: number;
  dayChangePct: number;
  isLive: boolean;
};

/**
 * The single place position P&L is derived. Records come from the server (the
 * client cannot be trusted to define its own book); prices come from the local
 * tick stream, so P&L updates between fetches rather than only on refresh.
 */
export function usePortfolio() {
  const { token } = useAuth();
  const { quotes, connected, version } = useMarket();
  const [records, setRecords] = useState<PositionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setRecords([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () =>
      positionsApi
        .get(token)
        .then(({ positions }) => !cancelled && setRecords(positions))
        .catch(() => !cancelled && setRecords([]))
        .finally(() => !cancelled && setLoading(false));
    load();
    window.addEventListener('ntd:portfolio-change', load);
    return () => {
      cancelled = true;
      window.removeEventListener('ntd:portfolio-change', load);
    };
  }, [token]);

  return useMemo(() => {
    const live: LivePosition[] = records.map((p) => {
      const quote = quotes.get(p.instrument);
      const ltp = quote?.ltp ?? p.avg;
      return {
        ...p,
        ltp,
        // Works for shorts too: a negative qty profits as the price falls.
        pnl: (ltp - p.avg) * p.qty,
        dayChangePct: quote?.changePct ?? 0,
        isLive: !!quote,
      };
    });

    const unrealised = live.reduce((sum, p) => sum + p.pnl, 0);

    return {
      positions: live,
      loading,
      unrealised,
      realised: realisedPnl,
      dayPnl: realisedPnl + unrealised,
      /** Largest absolute P&L — the scale every contribution bar is drawn against. */
      maxAbsPnl: Math.max(...live.map((p) => Math.abs(p.pnl)), 1),
      isLive: connected && live.some((p) => p.isLive),
    };
    // `version`, not `quotes` — the Map is mutated in place and never changes identity.
  }, [records, loading, quotes, version, connected]);
}
