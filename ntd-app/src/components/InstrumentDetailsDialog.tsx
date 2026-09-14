import { useEffect, useState, type FormEvent } from 'react';
import { num, signedPct, toneOf } from '../lib/format';

type Instrument = { symbol: string; exchange: string; ltp: number; changePct: number };
type Mode = 'notes' | 'options' | 'fundamentals';

export default function InstrumentDetailsDialog({ instrument, mode, clientId, onClose }: {
  instrument: Instrument;
  mode: Mode;
  clientId?: string;
  onClose: () => void;
}) {
  const storageKey = `ntd.notes.${clientId ?? 'guest'}.${instrument.symbol}`;
  const [notes, setNotes] = useState(() => localStorage.getItem(storageKey) ?? '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const saveNotes = (event: FormEvent) => {
    event.preventDefault();
    localStorage.setItem(storageKey, notes.trim());
    setSaved(true);
  };

  const step = instrument.ltp >= 1000 ? 100 : instrument.ltp >= 100 ? 10 : 5;
  const atTheMoney = Math.round(instrument.ltp / step) * step;
  const strikes = Array.from({ length: 7 }, (_, index) => atTheMoney + (index - 3) * step);
  const tone = toneOf(instrument.changePct);

  return <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="order-ticket instrument-dialog" role="dialog" aria-modal="true" aria-labelledby="instrument-dialog-title">
      <div className="order-ticket-head"><div><strong id="instrument-dialog-title">{mode === 'notes' ? 'Notes' : mode === 'options' ? 'Option chain' : 'Fundamentals'}</strong><span>{instrument.symbol} · {instrument.exchange}</span></div><button onClick={onClose} aria-label="Close instrument dialog">×</button></div>
      {mode === 'notes' && <form className="instrument-notes" onSubmit={saveNotes}><textarea aria-label={`Notes for ${instrument.symbol}`} value={notes} onChange={(event) => { setNotes(event.target.value.slice(0, 1000)); setSaved(false); }} placeholder="Add a trade plan, level, or reminder…" autoFocus /><div><span>{notes.length} / 1000</span><button className="btn primary">{saved ? 'Saved' : 'Save note'}</button></div></form>}
      {mode === 'options' && <div className="option-chain"><div className="option-chain-head"><span>CALL LTP</span><span>STRIKE</span><span>PUT LTP</span></div>{strikes.map((strike) => { const distance = Math.abs(strike - instrument.ltp); const premium = Math.max(step * .08, instrument.ltp * .018 - distance * .32); return <div className={strike === atTheMoney ? 'option-row atm' : 'option-row'} key={strike}><span className="num up">{num(premium + Math.max(0, instrument.ltp - strike))}</span><strong className="num">{num(strike)}</strong><span className="num down">{num(premium + Math.max(0, strike - instrument.ltp))}</span></div>; })}<span className="instrument-disclaimer">Illustrative replay chain · not exchange depth</span></div>}
      {mode === 'fundamentals' && <div className="fundamental-grid"><div><span>Last price</span><strong className="num">₹{num(instrument.ltp)}</strong></div><div><span>Day change</span><strong className={`num ${tone}`}>{signedPct(instrument.changePct)}</strong></div><div><span>Market</span><strong>{instrument.exchange}</strong></div><div><span>Data source</span><strong>Replay feed</strong></div><p>Company financial statements are not available from the configured market-data provider. Connect a fundamentals provider to add P/E, EPS, market cap, and financial ratios.</p></div>}
    </section>
  </div>;
}