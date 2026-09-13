import { useEffect, useMemo, useState } from 'react';
import { useQuote } from '../market/MarketDataContext';
import { num, signedPct, toneOf } from '../lib/format';

type Candle = { bucket: string; open: number; high: number; low: number; close: number };
type History = { symbol: string; range: string; interval: '1m' | '1d'; candles: Candle[]; sufficient: boolean };

const RANGES = ['1D', '1W', '1M', '1Y', '5Y'] as const;
type Range = (typeof RANGES)[number];

const VB_W = 669;
const VB_H = 190;
const PAD = 14;

/** Minute buckets are times; day buckets are dates. */
const labelFor = (bucket: string, interval: '1m' | '1d') =>
  interval === '1m'
    ? bucket.slice(11, 16)
    : new Date(`${bucket}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      });

export default function MarketOverview({ symbol = 'NIFTY 50' }: { symbol?: string }) {
  const [range, setRange] = useState<Range>('1D');
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const quote = useQuote(symbol);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${range}`)
        .then((r) => r.json())
        .then((d: History) => !cancelled && setData(d))
        .catch(() => !cancelled && setData(null))
        .finally(() => !cancelled && setLoading(false));

    setLoading(true);
    load();
    // Intraday keeps extending while the session runs; daily candles do not.
    const timer = range === '1D' ? setInterval(load, 15_000) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [symbol, range]);

  const chart = useMemo(() => {
    const candles = data?.candles ?? [];
    if (candles.length < 2) return null;

    const closes = candles.map((c) => c.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;

    const points = candles.map((c, i) => {
      const x = (i / (candles.length - 1)) * VB_W;
      const y = PAD + (1 - (c.close - min) / span) * (VB_H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const first = closes[0];
    const last = closes.at(-1)!;

    // Four labels spread across the series beats a hardcoded month list that
    // never matched the data.
    const ticks = [0, 0.33, 0.66, 1].map((f) => {
      const i = Math.round(f * (candles.length - 1));
      return labelFor(candles[i].bucket, data!.interval);
    });

    return {
      line: `M${points.join(' L')}`,
      area: `M${points.join(' L')} L${VB_W},${VB_H} L0,${VB_H} Z`,
      min,
      max,
      mid: (min + max) / 2,
      changePct: ((last - first) / first) * 100,
      ticks,
      count: candles.length,
    };
  }, [data]);

  const tone = chart ? toneOf(chart.changePct) : 'up';
  const stroke = tone === 'down' ? 'var(--down)' : 'var(--amber)';

  return (
    <section className="panel">
      <div className="panel-head compact">
        <span className="panel-title caps">Market overview</span>
        <span style={{ fontSize: 10, color: 'var(--dim)' }}>{symbol}</span>
        {quote && (
          <span className={`num ${toneOf(quote.changePct)}`} style={{ fontSize: 11 }}>
            {num(quote.ltp)} <span style={{ fontSize: 10 }}>{signedPct(quote.changePct)}</span>
          </span>
        )}
        {chart && (
          <span className={`num ${tone}`} style={{ fontSize: 10 }}>
            {signedPct(chart.changePct)} · {range}
          </span>
        )}
        <div className="panel-actions" style={{ gap: 3 }}>
          {RANGES.map((r) => (
            <button
              key={r}
              className={r === range ? 'chip range active num' : 'chip range num'}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 12px 10px' }}>
        {loading ? (
          <div className="stub" style={{ height: VB_H }}>
            <span style={{ fontSize: 11 }}>Loading…</span>
          </div>
        ) : !chart ? (
          <div className="stub" style={{ height: VB_H, gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Not enough history yet</span>
            <span style={{ fontSize: 11, textAlign: 'center', maxWidth: 380, textWrap: 'pretty' }}>
              {range === '1D'
                ? 'Intraday candles build as the feed runs — give it a few minutes.'
                : 'Daily candles come from bhavcopy imports. Import more trading days to fill this range.'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <svg
              viewBox={`0 0 ${VB_W} ${VB_H}`}
              preserveAspectRatio="none"
              style={{ display: 'block', width: '100%', height: VB_H }}
            >
              <defs>
                <linearGradient id="overview-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              {[PAD, VB_H / 2, VB_H - PAD].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2={VB_W}
                  y2={y}
                  stroke="#191c20"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path d={chart.area} fill="url(#overview-fill)" />
              <path
                d={chart.line}
                fill="none"
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* A chart without a price axis cannot be read off. */}
            <div
              style={{
                width: 58,
                height: VB_H,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                flex: 'none',
              }}
            >
              {[chart.max, chart.mid, chart.min].map((v, i) => (
                <span key={i} className="num" style={{ fontSize: 9, color: 'var(--dimmer)' }}>
                  {num(v)}
                </span>
              ))}
            </div>
          </div>
        )}

        {chart && (
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, paddingRight: 66 }}>
            {chart.ticks.map((t, i) => (
              <span key={`${t}-${i}`} className="num" style={{ fontSize: 9, color: 'var(--dimmer)' }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
