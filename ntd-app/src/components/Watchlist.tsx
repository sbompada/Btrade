import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { watchlist, watchlistCapacity } from '../data/market';
import { useMarket } from '../market/MarketDataContext';
import { num, signedPct, toneOf } from '../lib/format';
import * as Icon from './Icons';
import OrderTicket from './OrderTicket';
import MarketDepth from './MarketDepth';
import InstrumentDetailsDialog from './InstrumentDetailsDialog';

type WatchlistGroup = { id: string; name: string; symbols: string[]; custom?: boolean };
type WatchlistState = { groups: WatchlistGroup[]; active: string };

const defaultGroups = (): WatchlistGroup[] =>
  Array.from({ length: 7 }, (_, index) => ({
    id: String(index + 1),
    name: `Watchlist ${index + 1}`,
    symbols: watchlist.map((instrument) => instrument.symbol),
  }));

function initialWatchlistState(clientId?: string): WatchlistState {
  if (clientId) {
    try {
      const saved = localStorage.getItem(`ntd.watchlists.${clientId}`);
      const parsed = saved ? JSON.parse(saved) as Partial<WatchlistState> : null;
      if (parsed?.groups?.length) {
        const active = parsed.groups.some((item) => item.id === parsed.active) ? parsed.active! : parsed.groups[0].id;
        return { groups: parsed.groups, active };
      }
    } catch {
      localStorage.removeItem(`ntd.watchlists.${clientId}`);
    }
  }

  return { groups: defaultGroups(), active: '4' };
}

function NewGroupDialog({ existing, onCreate, onClose }: {
  existing: string[];
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const clean = name.trim();
  const duplicate = existing.some((value) => value.toLowerCase() === clean.toLowerCase());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!clean || duplicate) return;
    onCreate(clean);
  };

  return (
    <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="group-dialog" role="dialog" aria-modal="true" aria-labelledby="group-title" onSubmit={submit}>
        <div className="order-ticket-head">
          <div>
            <strong id="group-title">Create watchlist group</strong>
            <span>Use a short name you can scan quickly.</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close new group dialog">×</button>
        </div>
        <div className="group-dialog-body">
          <label>
            <span>Group name</span>
            <input value={name} onChange={(event) => setName(event.target.value.slice(0, 24))} placeholder="e.g. Swing trades" autoFocus />
          </label>
          {duplicate && <span className="form-error">A group with this name already exists.</span>}
          <div className="group-dialog-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!clean || duplicate}>Create group</button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function Watchlist({ onOpenChart }: { onOpenChart?: (instrument: { symbol: string; exchange: string }) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { quotes } = useMarket();
  const [initialState] = useState(() => initialWatchlistState(user?.clientId));
  const [groups, setGroups] = useState(initialState.groups);
  const [group, setGroup] = useState(initialState.active);
  const [selected, setSelected] = useState<string | null>('TCS');
  const [search, setSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [depthSymbol, setDepthSymbol] = useState<string | null>(null);
  const [moreSymbol, setMoreSymbol] = useState<string | null>(null);
  const [details, setDetails] = useState<{ mode: 'notes' | 'options' | 'fundamentals'; instrument: { symbol: string; exchange: string; ltp: number; changePct: number } } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [ticket, setTicket] = useState<{
    symbol: string;
    exchange: string;
    ltp: number;
    side: 'BUY' | 'SELL';
  } | null>(null);

  const storageKey = user ? `ntd.watchlists.${user.clientId}` : null;
  const active = groups.find((item) => item.id === group) ?? groups[0];
  const quoteRows = [...quotes.values()];
  const available = quoteRows.length
    ? quoteRows.map((quote) => ({ symbol: quote.symbol, exchange: quote.exchange, ltp: quote.ltp, changePct: quote.changePct }))
    : watchlist;
  const rows = active.symbols
    .map((symbol) => available.find((instrument) => instrument.symbol === symbol) ?? watchlist.find((instrument) => instrument.symbol === symbol))
    .filter((instrument) => instrument != null);
  const needle = search.trim().toLowerCase();
  const matches = needle
    ? available.filter((instrument) =>
        instrument.symbol.toLowerCase().includes(needle) && !active.symbols.includes(instrument.symbol),
      ).slice(0, 6)
    : [];

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ groups, active: group }));
  }, [storageKey, groups, group]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.metaKey || event.altKey || target.closest('input, select, textarea, [contenteditable="true"], [role="dialog"]')) return;
      const side = event.key.toLowerCase() === 'b' ? 'BUY' : event.key.toLowerCase() === 's' ? 'SELL' : null;
      const instrument = side && selected ? rows.find((row) => row.symbol === selected) : null;
      if (!side || !instrument) return;
      event.preventDefault();
      setTicket({ symbol: instrument.symbol, exchange: instrument.exchange, ltp: instrument.ltp, side });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rows, selected]);

  const updateActive = (symbols: string[]) =>
    setGroups((current) => current.map((item) => item.id === active.id ? { ...item, symbols } : item));

  const addInstrument = (symbol: string) => {
    if (active.symbols.length >= watchlistCapacity) return;
    updateActive([...active.symbols, symbol]);
    setSelected(symbol);
    setSearch('');
  };

  const removeInstrument = (symbol: string) => {
    updateActive(active.symbols.filter((value) => value !== symbol));
    if (selected === symbol) setSelected(null);
    if (depthSymbol === symbol) setDepthSymbol(null);
    if (moreSymbol === symbol) setMoreSymbol(null);
  };

  const createGroup = (name: string) => {
    const id = `custom-${Date.now()}`;
    setGroups((current) => [...current, { id, name, symbols: [], custom: true }]);
    setGroup(id);
    setSelected(null);
    setCreatingGroup(false);
    setSearch('');
  };

  const deleteGroup = () => {
    if (!active.custom) return;
    const remaining = groups.filter((item) => item.id !== active.id);
    setGroups(remaining);
    setGroup(remaining[0].id);
    setSelected(null);
  };

  const pinToGroup = (symbol: string, targetIndex: number) => {
    setGroups((current) => current.map((item, index) => index === targetIndex && !item.symbols.includes(symbol) && item.symbols.length < watchlistCapacity ? { ...item, symbols: [...item.symbols, symbol] } : item));
    setMoreSymbol(null);
  };

  return (
    <>
      <aside className="sidebar">
      <div className="search watchlist-search">
        <span style={{ color: 'var(--dimmer)', display: 'flex' }}>
          <Icon.Search />
        </span>
        <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Add instrument" aria-label="Add instrument" />
        <span className="kbd num">Ctrl K</span>
        {matches.length > 0 && (
          <div className="watchlist-results">
            {matches.map((instrument) => (
              <button key={instrument.symbol} onClick={() => addInstrument(instrument.symbol)}>
                <span>{instrument.symbol}</span>
                <span>{instrument.exchange} · Add</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="groups">
        {groups.map((item, index) => (
          <button
            key={item.id}
            className={item.id === group ? 'group-chip active num' : 'group-chip num'}
            onClick={() => {
              setGroup(item.id);
              setSelected(null);
              setSearch('');
            }}
            title={item.name}
            aria-label={item.name}
          >
            {index + 1}
          </button>
        ))}
        <button className="group-add" onClick={() => setCreatingGroup(true)} aria-label="Create watchlist group">+</button>
      </div>

      <div className="watchlist-group-title">
        <span>{active.name}</span>
        {active.custom && <button onClick={deleteGroup} aria-label={`Delete ${active.name}`} title="Delete group">×</button>}
      </div>

      <div className="wl-head">
        <span style={{ flex: 1 }}>INSTRUMENT</span>
        <span style={{ width: 74, textAlign: 'right' }}>LTP</span>
        <span style={{ width: 56, textAlign: 'right' }}>CHG%</span>
      </div>

      <div>
        {rows.map((w) => {
          // Live quote when the feed has one; the seeded value until it does.
          const q = quotes.get(w.symbol);
          const ltp = q?.ltp ?? w.ltp;
          const changePct = q?.changePct ?? w.changePct;
          const tone = toneOf(changePct);
          const isSelected = selected === w.symbol;
          return (
            <div key={w.symbol} className="wl-instrument">
            <div
              className={isSelected ? 'wl-row selected' : 'wl-row'}
              onClick={() => { setSelected(w.symbol); setMoreSymbol(null); }}
            >
              <div className="wl-name">
                <span className="wl-sym">{w.symbol}</span>
                <span className="wl-exch">{w.exchange}</span>
              </div>
              {isSelected ? (
                <div className="wl-actions">
                  <button
                    className="badge buy"
                    aria-label={`Buy ${w.symbol}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTicket({ symbol: w.symbol, exchange: w.exchange, ltp, side: 'BUY' });
                    }}
                  >
                    B
                  </button>
                  <button
                    className="badge sell"
                    aria-label={`Sell ${w.symbol}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTicket({ symbol: w.symbol, exchange: w.exchange, ltp, side: 'SELL' });
                    }}
                  >
                    S
                  </button>
                  <button
                    className={depthSymbol === w.symbol ? 'watchlist-action active' : 'watchlist-action'}
                    aria-label={`Market depth for ${w.symbol}`}
                    title="Market depth"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDepthSymbol((current) => current === w.symbol ? null : w.symbol);
                      setMoreSymbol(null);
                    }}
                  ><Icon.Depth /></button>
                  <button
                    className="watchlist-action"
                    aria-label={`Open chart for ${w.symbol}`}
                    title="Open chart"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenChart?.({ symbol: w.symbol, exchange: w.exchange });
                    }}
                  ><Icon.Trend /></button>
                  <button
                    className="watchlist-action danger"
                    aria-label={`Remove ${w.symbol} from ${active.name}`}
                    title="Remove from group"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeInstrument(w.symbol);
                    }}
                  ><Icon.Trash /></button>
                  <button className={moreSymbol === w.symbol ? 'watchlist-action active' : 'watchlist-action'} aria-label={`More actions for ${w.symbol}`} title="More actions" onClick={(event) => { event.stopPropagation(); setMoreSymbol((current) => current === w.symbol ? null : w.symbol); }}><Icon.Dots /></button>
                  {moreSymbol === w.symbol && <div className="watchlist-more" role="menu">
                    <div className="watchlist-more-row pin-row"><span><Icon.Paperclip /> Pin</span><span><button aria-label={`Pin ${w.symbol} to watchlist 1`} onClick={(event) => { event.stopPropagation(); pinToGroup(w.symbol, 0); }}>1</button><button aria-label={`Pin ${w.symbol} to watchlist 2`} onClick={(event) => { event.stopPropagation(); pinToGroup(w.symbol, 1); }}>2</button></span></div>
                    <button onClick={(event) => { event.stopPropagation(); setDetails({ mode: 'notes', instrument: { symbol: w.symbol, exchange: w.exchange, ltp, changePct } }); setMoreSymbol(null); }}><Icon.Doc /><span>Notes</span></button>
                    <button onClick={(event) => { event.stopPropagation(); onOpenChart?.({ symbol: w.symbol, exchange: w.exchange }); setMoreSymbol(null); }}><Icon.Trend /><span>Chart</span></button>
                    <button onClick={(event) => { event.stopPropagation(); setDetails({ mode: 'options', instrument: { symbol: w.symbol, exchange: w.exchange, ltp, changePct } }); setMoreSymbol(null); }}><Icon.Depth /><span>Option chain</span></button>
                    <button onClick={(event) => { event.stopPropagation(); navigate(`/orders/alerts?symbol=${encodeURIComponent(w.symbol)}&price=${ltp}`); setMoreSymbol(null); }}><Icon.Bell /><span>Create alert / GTT</span></button>
                    <button onClick={(event) => { event.stopPropagation(); setDepthSymbol(w.symbol); setMoreSymbol(null); }}><Icon.Bars /><span>Market depth</span></button>
                    <button className="featured" onClick={(event) => { event.stopPropagation(); setDetails({ mode: 'fundamentals', instrument: { symbol: w.symbol, exchange: w.exchange, ltp, changePct } }); setMoreSymbol(null); }}><Icon.Rupee /><span>Fundamentals</span><b>↗</b></button>
                    <button className="featured" onClick={(event) => { event.stopPropagation(); onOpenChart?.({ symbol: w.symbol, exchange: w.exchange }); setMoreSymbol(null); }}><Icon.Bolt /><span>Technicals</span></button>
                  </div>}
                </div>
              ) : (
                <>
                  <span className={`wl-ltp num ${tone}`}>{num(ltp)}</span>
                  <span className={`wl-chg num ${tone}`}>{signedPct(changePct)}</span>
                </>
              )}
            </div>
            {depthSymbol === w.symbol && <MarketDepth symbol={w.symbol} ltp={ltp} prevClose={q?.prevClose ?? ltp / (1 + changePct / 100)} />}
            </div>
          );
        })}
      </div>

      <div className="sidebar-foot">
        <span className="num">
          {active.symbols.length} / {watchlistCapacity}
        </span>
        <button onClick={() => setCreatingGroup(true)}>+ New group</button>
      </div>
      </aside>
      {ticket && <OrderTicket ticket={ticket} onClose={() => setTicket(null)} />}
      {details && <InstrumentDetailsDialog {...details} clientId={user?.clientId} onClose={() => setDetails(null)} />}
      {creatingGroup && (
        <NewGroupDialog
          existing={groups.map((item) => item.name)}
          onCreate={createGroup}
          onClose={() => setCreatingGroup(false)}
        />
      )}
    </>
  );
}
