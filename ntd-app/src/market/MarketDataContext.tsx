import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type Quote = {
  symbol: string;
  exchange: string;
  ltp: number;
  prevClose: number;
  change: number;
  changePct: number;
  ts: number;
};

type MarketState = {
  quotes: Map<string, Quote>;
  connected: boolean;
  source: string | null;
  /**
   * Increments on every flush. The quotes Map is mutated in place, so its
   * reference is stable — anything memoising over quotes must depend on this
   * instead, or it will compute once and then never update.
   */
  version: number;
};

const MarketCtx = createContext<MarketState>({ quotes: new Map(), connected: false, source: null, version: 0 });

/**
 * Holds one EventSource for the whole app and re-renders on a fixed cadence
 * rather than on every tick — nineteen instruments at 2s is fine, a real feed
 * pushing hundreds per second would thrash React if each tick set state.
 */
export function MarketDataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const quotesRef = useRef<Map<string, Quote>>(new Map());
  const dirty = useRef(false);

  useEffect(() => {
    const source = new EventSource('/api/market/stream');

    const apply = (quote: Quote) => {
      quotesRef.current.set(quote.symbol, quote);
      dirty.current = true;
    };

    fetch('/api/market/snapshot')
      .then((response) => response.json())
      .then((snapshot: { source?: string; quotes?: Quote[] }) => {
        setSource(snapshot.source ?? null);
        for (const quote of snapshot.quotes ?? []) apply(quote);
      })
      .catch(() => setSource(null));

    source.addEventListener('snapshot', (e) => {
      for (const quote of JSON.parse((e as MessageEvent).data) as Quote[]) apply(quote);
      setConnected(true);
      setVersion((v) => v + 1);
    });

    source.addEventListener('tick', (e) => apply(JSON.parse((e as MessageEvent).data) as Quote));

    source.onopen = () => setConnected(true);
    // EventSource reconnects by itself; this only reflects the gap in the UI.
    source.onerror = () => setConnected(false);

    const flush = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setVersion((v) => v + 1);
    }, 500);

    return () => {
      clearInterval(flush);
      source.close();
    };
  }, []);

  const value = useMemo(
    () => ({ quotes: quotesRef.current, connected, source, version }),
    [version, connected, source],
  );

  return <MarketCtx.Provider value={value}>{children}</MarketCtx.Provider>;
}

export const useMarket = () => useContext(MarketCtx);

/** One instrument. Returns undefined until the first tick for it arrives. */
export const useQuote = (symbol: string) => useMarket().quotes.get(symbol);
