import { useEffect, useMemo, useState } from 'react';
import { useQuote } from '../market/MarketDataContext';
import { num, signedPct, toneOf } from '../lib/format';

type Instrument = { symbol: string; exchange: string };
type Candle = { bucket: string; open: number; high: number; low: number; close: number };
type History = { candles: Candle[] };
const RANGES = ['1D', '1W', '1M', '1Y'] as const;
type Range = (typeof RANGES)[number];

const ema = (values: number[], period: number) => {
  const weight = 2 / (period + 1);
  return values.reduce<number[]>((result, value, index) => {
    result.push(index ? value * weight + result[index - 1] * (1 - weight) : value);
    return result;
  }, []);
};

const linePath = (values: number[], width: number, height: number, min: number, max: number) => {
  const span = max - min || 1;
  return values.map((value, index) => `${index ? 'L' : 'M'}${(index / Math.max(1, values.length - 1) * width).toFixed(1)},${(height - ((value - min) / span) * height).toFixed(1)}`).join(' ');
};

export default function InstrumentChart({ instrument, onClose }: { instrument: Instrument; onClose: () => void }) {
  const [range, setRange] = useState<Range>('1D');
  const [result, setResult] = useState<{ key: string; history: History | null } | null>(null);
  const quote = useQuote(instrument.symbol);
  const requestKey = `${instrument.symbol}:${range}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market/history?symbol=${encodeURIComponent(instrument.symbol)}&range=${range}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((history: History) => !cancelled && setResult({ key: requestKey, history }))
      .catch(() => !cancelled && setResult({ key: requestKey, history: null }));
    return () => { cancelled = true; };
  }, [instrument.symbol, range, requestKey]);

  const chart = useMemo(() => {
    const candles = result?.key === requestKey ? result.history?.candles ?? [] : [];
    if (candles.length < 2) return null;
    const visible = candles.slice(-90);
    const closes = visible.map((item) => item.close);
    const fast = ema(closes, 12);
    const slow = ema(closes, 26);
    const macd = fast.map((value, index) => value - slow[index]);
    const signal = ema(macd, 9);
    const rsi = closes.map((_, index) => {
      const start = Math.max(1, index - 13);
      let gains = 0; let losses = 0;
      for (let cursor = start; cursor <= index; cursor += 1) {
        const delta = closes[cursor] - closes[cursor - 1];
        if (delta >= 0) gains += delta; else losses -= delta;
      }
      return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    });
    return { visible, closes, macd, signal, rsi, min: Math.min(...visible.map((item) => item.low)), max: Math.max(...visible.map((item) => item.high)) };
  }, [requestKey, result]);

  const width = 1000; const priceHeight = 330; const indicatorHeight = 90;
  const tone = quote ? toneOf(quote.changePct) : 'up';
  const loading = result?.key !== requestKey;

  return <section className="instrument-chart panel">
    <header className="chart-toolbar">
      <div><strong>{instrument.symbol}</strong><span>{instrument.exchange}</span>{quote && <><b className={`num ${tone}`}>{num(quote.ltp)}</b><b className={`num ${tone}`}>{signedPct(quote.changePct)}</b></>}</div>
      <div className="chart-ranges">{RANGES.map((item) => <button key={item} className={range === item ? 'active' : ''} onClick={() => setRange(item)}>{item}</button>)}<button onClick={onClose} aria-label="Close chart">×</button></div>
    </header>
    {loading ? <div className="chart-empty">Loading chart…</div> : !chart ? <div className="chart-empty">Not enough candle history for {range}</div> : <div className="chart-canvas">
      <svg viewBox={`0 0 ${width} ${priceHeight}`} preserveAspectRatio="none" aria-label={`${instrument.symbol} candlestick chart`}>
        {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="0" x2={width} y1={line * priceHeight / 4} y2={line * priceHeight / 4} className="chart-grid-line" />)}
        {chart.visible.map((candle, index) => {
          const x = (index + 0.5) / chart.visible.length * width;
          const scale = (value: number) => priceHeight - ((value - chart.min) / (chart.max - chart.min || 1)) * (priceHeight - 12) - 6;
          const rising = candle.close >= candle.open;
          return <g key={`${candle.bucket}-${index}`} className={rising ? 'candle up-candle' : 'candle down-candle'}><line x1={x} x2={x} y1={scale(candle.high)} y2={scale(candle.low)} /><rect x={x - Math.max(1.5, width / chart.visible.length * 0.28)} width={Math.max(3, width / chart.visible.length * 0.56)} y={Math.min(scale(candle.open), scale(candle.close))} height={Math.max(2, Math.abs(scale(candle.open) - scale(candle.close)))} /></g>;
        })}
      </svg>
      <div className="indicator-label">MACD (12, 26, 9)</div>
      <svg viewBox={`0 0 ${width} ${indicatorHeight}`} preserveAspectRatio="none">
        <line x1="0" x2={width} y1={indicatorHeight / 2} y2={indicatorHeight / 2} className="chart-grid-line" />
        {chart.macd.map((value, index) => { const span = Math.max(...chart.macd.map(Math.abs), 0.001); const barHeight = Math.abs(value) / span * 38; const y = value >= 0 ? indicatorHeight / 2 - barHeight : indicatorHeight / 2; return <rect key={index} x={index / chart.macd.length * width} y={y} width={Math.max(2, width / chart.macd.length - 2)} height={barHeight} className={value >= 0 ? 'macd-up' : 'macd-down'} />; })}
        <path d={linePath(chart.macd, width, indicatorHeight - 12, Math.min(...chart.macd), Math.max(...chart.macd))} className="macd-line" /><path d={linePath(chart.signal, width, indicatorHeight - 12, Math.min(...chart.macd), Math.max(...chart.macd))} className="signal-line" />
      </svg>
      <div className="indicator-label">RSI (14)</div>
      <svg viewBox={`0 0 ${width} ${indicatorHeight}`} preserveAspectRatio="none">
        {[30, 70].map((level) => <line key={level} x1="0" x2={width} y1={indicatorHeight - level / 100 * indicatorHeight} y2={indicatorHeight - level / 100 * indicatorHeight} className="chart-grid-line" />)}
        <path d={linePath(chart.rsi, width, indicatorHeight, 0, 100)} className="rsi-line" />
      </svg>
    </div>}
  </section>;
}