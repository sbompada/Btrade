import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ordersApi, type OrderRecord } from '../lib/api';
import { usePortfolio } from '../market/usePortfolio';
import { num, signed, signedPct, signedRupees, toneOf } from '../lib/format';

const COLS = {
  check: 28,
  product: 76,
  qty: 70,
  avg: 90,
  ltp: 90,
  pnl: 120,
  chg: 90,
};

type View = 'positions' | 'history';
type PositionSettings = { showDayChange: boolean; lossesFirst: boolean };

const defaultSettings: PositionSettings = { showDayChange: true, lossesFirst: false };

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }> }>;

async function downloadCsv(rows: (string | number)[][], filename: string): Promise<'saved' | 'cancelled' | 'downloaded'> {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const saveFilePicker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (saveFilePicker) {
    try {
      const handle = await saveFilePicker.call(window, {
        suggestedName: filename,
        types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(csv);
      await writable.close();
      return 'saved';
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return 'cancelled';
    }
  }

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1000);
  return 'downloaded';
}

export default function Positions() {
  const { token, user } = useAuth();
  const { positions, unrealised, maxAbsPnl } = usePortfolio();
  const [view, setView] = useState<View>('positions');
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [settings, setSettings] = useState<PositionSettings>(() => {
    try {
      return JSON.parse(localStorage.getItem(`ntd.position-settings.${user?.clientId}`) ?? '') as PositionSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => ordersApi.list(token).then(({ orders: next }) => !cancelled && setOrders(next)).catch(() => undefined);
    load();
    window.addEventListener('ntd:portfolio-change', load);
    return () => {
      cancelled = true;
      window.removeEventListener('ntd:portfolio-change', load);
    };
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem(`ntd.position-settings.${user.clientId}`, JSON.stringify(settings));
  }, [settings, user]);

  const filteredPositions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = positions.filter((position) => !needle || `${position.instrument} ${position.exchange} ${position.product} ${position.qty}`.toLowerCase().includes(needle));
    return settings.lossesFirst ? filtered.sort((left, right) => left.pnl - right.pnl) : filtered;
  }, [positions, query, settings.lossesFirst]);

  const dayOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    return orders.filter((order) => {
      const isToday = !order.createdAt || order.createdAt.slice(0, 10) === today;
      return isToday && (!needle || `${order.instrument} ${order.exchange} ${order.product} ${order.side} ${order.status}`.toLowerCase().includes(needle));
    });
  }, [orders, query]);

  const ranked = [...filteredPositions].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));
  const grossExposure = positions.reduce((sum, position) => sum + Math.abs(position.qty * position.ltp), 0);
  const longExposure = positions.filter((position) => position.qty > 0).reduce((sum, position) => sum + position.qty * position.ltp, 0);
  const shortExposure = positions.filter((position) => position.qty < 0).reduce((sum, position) => sum + Math.abs(position.qty * position.ltp), 0);

  const download = async () => {
    const date = new Date().toISOString().slice(0, 10);
    if (view === 'history') {
      const result = await downloadCsv([
        ['Time', 'Side', 'Instrument', 'Exchange', 'Product', 'Quantity', 'Average price', 'Status'],
        ...dayOrders.map((order) => [order.time, order.side, order.instrument, order.exchange, order.product, order.qty, order.avgPrice, order.status]),
      ], `ntd-day-history-${date}.csv`);
      setDownloadStatus(result === 'cancelled' ? 'Download cancelled.' : 'Day history saved.');
      return;
    }
    const result = await downloadCsv([
      ['Product', 'Instrument', 'Exchange', 'Quantity', 'Average', 'LTP', 'P&L', 'Day change %'],
      ...filteredPositions.map((position) => [position.product, position.instrument, position.exchange, position.qty, position.avg, position.ltp, position.pnl.toFixed(2), position.dayChangePct.toFixed(2)]),
    ], `ntd-positions-${date}.csv`);
    setDownloadStatus(result === 'cancelled' ? 'Download cancelled.' : 'Positions saved.');
  };

  return (
    <AppShell
      tabs={['Positions', "Day's history"]}
      activeTab={view === 'positions' ? 'Positions' : "Day's history"}
      onTabChange={(tab) => { setView(tab === 'Positions' ? 'positions' : 'history'); setQuery(''); }}
    >
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">{view === 'positions' ? 'Positions' : "Day's history"}</span>
          <span className="panel-count num">({view === 'positions' ? filteredPositions.length : dayOrders.length})</span>
          <div className="panel-actions">
            <div className="chip input">
              <Icon.Search size={12} />
              <input aria-label="Search positions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === 'positions' ? 'Search positions' : 'Search history'} />
            </div>
            <button className={analyticsOpen ? 'chip range active' : 'chip'} onClick={() => setAnalyticsOpen((open) => !open)} aria-expanded={analyticsOpen}>
              <Icon.Bars /> Analytics
            </button>
            <button className={settingsOpen ? 'chip range active' : 'chip'} onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
              <Icon.Gear /> Settings
            </button>
            <button className="chip" onClick={download} disabled={view === 'positions' ? !filteredPositions.length : !dayOrders.length}>
              <Icon.Download /> Download
            </button>
          </div>
        </div>

        {settingsOpen && (
          <div className="position-settings">
            <label><input type="checkbox" checked={settings.showDayChange} onChange={(event) => setSettings((current) => ({ ...current, showDayChange: event.target.checked }))} /> Show day change</label>
            <label><input type="checkbox" checked={settings.lossesFirst} onChange={(event) => setSettings((current) => ({ ...current, lossesFirst: event.target.checked }))} /> Show losses first</label>
            <button className="chip" onClick={() => setSettings(defaultSettings)}>Reset</button>
          </div>
        )}

        {downloadStatus && <div className="download-status" role="status">{downloadStatus}<button onClick={() => setDownloadStatus(null)} aria-label="Dismiss download status">×</button></div>}

        {analyticsOpen && (
          <div className="position-analytics">
            <div><span>GROSS EXPOSURE</span><strong className="num">₹{num(grossExposure)}</strong></div>
            <div><span>LONG</span><strong className="num up">₹{num(longExposure)}</strong></div>
            <div><span>SHORT</span><strong className="num down">₹{num(shortExposure)}</strong></div>
            <div><span>UNREALISED P&amp;L</span><strong className={`num ${toneOf(unrealised)}`}>{signedRupees(unrealised)}</strong></div>
          </div>
        )}

        {view === 'positions' ? <><div className="thead">
          <span style={{ width: COLS.check }} />
          <span style={{ width: COLS.product }}>PRODUCT</span>
          <span style={{ flex: 1, minWidth: 0 }}>INSTRUMENT</span>
          <span style={{ width: COLS.qty, textAlign: 'right' }}>QTY</span>
          <span style={{ width: COLS.avg, textAlign: 'right' }}>AVG.</span>
          <span style={{ width: COLS.ltp, textAlign: 'right' }}>LTP</span>
          <span style={{ width: COLS.pnl, textAlign: 'right' }}>P&amp;L</span>
          {settings.showDayChange && <span style={{ width: COLS.chg, textAlign: 'right' }}>CHG.</span>}
        </div>

        <div>
          {filteredPositions.map((p) => {
            const pnl = p.pnl;
            return (
              <div className="trow" key={p.instrument}>
                <div style={{ width: COLS.check }}>
                  <div className="checkbox" />
                </div>
                <div style={{ width: COLS.product }}>
                  <span className="badge product">{p.product}</span>
                </div>
                <div className="tname">
                  <span>{p.instrument}</span>
                  <span className="wl-exch">{p.exchange}</span>
                </div>
                <span
                  className="num"
                  style={{ width: COLS.qty, textAlign: 'right', fontSize: 11, color: 'var(--text-2)' }}
                >
                  {p.qty}
                </span>
                <span
                  className="num"
                  style={{ width: COLS.avg, textAlign: 'right', fontSize: 11, color: 'var(--text-3)' }}
                >
                  {num(p.avg)}
                </span>
                <span
                  className="num"
                  style={{ width: COLS.ltp, textAlign: 'right', fontSize: 11, color: 'var(--text-2)' }}
                >
                  {num(p.ltp)}
                </span>
                <span
                  className={`num ${toneOf(pnl)}`}
                  style={{ width: COLS.pnl, textAlign: 'right', fontSize: 11 }}
                >
                  {signed(pnl)}
                </span>
                {settings.showDayChange && <span
                  className={`num ${toneOf(p.dayChangePct)}`}
                  style={{ width: COLS.chg, textAlign: 'right', fontSize: 11 }}
                >
                  {signedPct(p.dayChangePct)}
                </span>}
              </div>
            );
          })}
          {!filteredPositions.length && <div className="stub"><span>{query ? `No positions match “${query}”.` : 'No open positions.'}</span></div>}
        </div>

        <div className="tfoot">
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Total P&amp;L</span>
          <span
            className={`num ${toneOf(unrealised)}`}
            style={{ width: COLS.pnl, textAlign: 'right', fontSize: 14, fontWeight: 500 }}
          >
            {signedRupees(unrealised)}
          </span>
          {settings.showDayChange && <span style={{ width: COLS.chg }} />}
        </div>
        </> : <>
          <div className="thead">
            <span style={{ width: 90 }}>TIME</span><span style={{ width: 64 }}>TYPE</span><span style={{ flex: 1 }}>INSTRUMENT</span><span style={{ width: 84 }}>PRODUCT</span><span style={{ width: 90, textAlign: 'right' }}>QTY</span><span style={{ width: 110, textAlign: 'right' }}>AVG. PRICE</span><span style={{ width: 100, textAlign: 'right' }}>STATUS</span>
          </div>
          {dayOrders.map((order) => <div className="trow" key={order.id}>
            <span className="num" style={{ width: 90 }}>{order.time}</span><span style={{ width: 64 }}><span className={order.side === 'BUY' ? 'badge buy' : 'badge sell'}>{order.side}</span></span><div className="tname"><span>{order.instrument}</span><span className="wl-exch">{order.exchange}</span></div><span style={{ width: 84 }}>{order.product}</span><span className="num" style={{ width: 90, textAlign: 'right' }}>{order.qty}</span><span className="num" style={{ width: 110, textAlign: 'right' }}>{num(order.avgPrice)}</span><span style={{ width: 100, textAlign: 'right' }}><span className="badge status">{order.status}</span></span>
          </div>)}
          {!dayOrders.length && <div className="stub"><span>{query ? `No trades match “${query}”.` : 'No trades executed today.'}</span></div>}
        </>}
      </section>

      {view === 'positions' && <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Breakdown</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--dim)' }}>
            P&amp;L contribution by position
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 12px 14px' }}>
          {ranked.map((p) => {
            const pnl = p.pnl;
            const tone = toneOf(pnl);
            return (
              <div
                key={p.instrument}
                style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                    {p.instrument} <span style={{ fontSize: 9, color: 'var(--faint)' }}>{p.product}</span>
                  </span>
                  <span className={`num ${tone}`} style={{ fontSize: 11 }}>
                    {signedRupees(pnl)}
                  </span>
                </div>
                <div className="bar lg">
                  <div
                    style={{
                      width: `${(Math.abs(pnl) / maxAbsPnl) * 100}%`,
                      background: tone === 'up' ? 'var(--up)' : 'var(--down)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>}
    </AppShell>
  );
}
