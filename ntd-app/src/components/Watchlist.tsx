import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { watchlist, watchlistCapacity } from '../data/market';
import { useMarket } from '../market/MarketDataContext';
import { num, signedPct, toneOf } from '../lib/format';
import * as Icon from './Icons';
import OrderTicket from './OrderTicket';

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

export default function Watchlist() {
  const { user } = useAuth();
  const { quotes } = useMarket();
  const [initialState] = useState(() => initialWatchlistState(user?.clientId));
  const [groups, setGroups] = useState(initialState.groups);
  const [group, setGroup] = useState(initialState.active);
  const [selected, setSelected] = useState<string | null>('TCS');
  const [search, setSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
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
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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
            <div
              key={w.symbol}
              className={isSelected ? 'wl-row selected' : 'wl-row'}
              onClick={() => setSelected(w.symbol)}
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
                    className="watchlist-remove"
                    aria-label={`Remove ${w.symbol} from ${active.name}`}
                    title="Remove from group"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeInstrument(w.symbol);
                    }}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <span className={`wl-ltp num ${tone}`}>{num(ltp)}</span>
                  <span className={`wl-chg num ${tone}`}>{signedPct(changePct)}</span>
                </>
              )}
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
