import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { holdingsApi, type HoldingRecord, type UnsettledHoldingRecord } from '../lib/api';
import { useMarket } from './MarketDataContext';

export type LiveHolding = HoldingRecord & {
  ltp: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  /** Today's move on this holding, in rupees — not the same as overall P&L. */
  dayPnl: number;
  dayChangePct: number;
  isLive: boolean;
};

/**
 * Holdings valued at live prices.
 *
 * Two different P&L figures matter here and are easy to conflate: overall
 * return is against average cost, while the day's change is against the
 * previous close. A long-held stock can be deeply profitable and still be down
 * today.
 */
export function useHoldings() {
  const { token } = useAuth();
  const { quotes, connected, version } = useMarket();
  const [records, setRecords] = useState<HoldingRecord[]>([]);
  const [unsettled, setUnsettled] = useState<UnsettledHoldingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setRecords([]);
      setUnsettled([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () => holdingsApi
      .get(token)
      .then(({ holdings, unsettled: nextUnsettled }) => {
        if (!cancelled) {
          setRecords(holdings);
          setUnsettled(nextUnsettled);
        }
      })
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
    const holdings: LiveHolding[] = records.map((h) => {
      const quote = quotes.get(h.symbol);
      // Without a quote, value at cost rather than showing a fabricated gain.
      const ltp = quote?.ltp ?? h.avgCost;
      const invested = h.qty * h.avgCost;
      const currentValue = h.qty * ltp;
      const pnl = currentValue - invested;
      return {
        ...h,
        ltp,
        invested,
        currentValue,
        pnl,
        pnlPct: invested === 0 ? 0 : (pnl / invested) * 100,
        dayPnl: quote ? h.qty * (quote.ltp - quote.prevClose) : 0,
        dayChangePct: quote?.changePct ?? 0,
        isLive: !!quote,
      };
    });

    const invested = holdings.reduce((s, h) => s + h.invested, 0);
    const currentValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const pnl = currentValue - invested;

    return {
      holdings,
      unsettled,
      loading,
      count: holdings.length,
      invested,
      currentValue,
      pnl,
      pnlPct: invested === 0 ? 0 : (pnl / invested) * 100,
      dayPnl: holdings.reduce((s, h) => s + h.dayPnl, 0),
      isLive: connected && holdings.some((h) => h.isLive),
    };
    // `version`, not `quotes` — the Map is mutated in place and never changes identity.
  }, [records, unsettled, loading, quotes, version, connected]);
}
