import { useEffect, useState } from 'react';

export type MarketSegment = {
  id: string;
  exchange: string;
  segment: string;
  open: string;
  close: string;
  days: string;
  isOpen: boolean;
  next: string;
};

export type MarketTimings = {
  timeZone: 'Asia/Kolkata';
  asOf: string;
  dateLabel: string;
  clock: string;
  tradingDay: boolean;
  equityOpen: boolean;
  segments: MarketSegment[];
  notes: string[];
};

export function useMarketTimings() {
  const [timings, setTimings] = useState<MarketTimings | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetch('/api/market-timings')
      .then((response) => response.ok ? response.json() as Promise<MarketTimings> : Promise.reject(new Error('Could not load market timings.')))
      .then((next) => !cancelled && setTimings(next))
      .catch(() => !cancelled && setTimings(null));
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return timings;
}