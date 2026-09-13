import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';
import { useMarket } from '../market/MarketDataContext';
import { watchlist } from '../data/market';
import { ApiError, orderToolsApi, type OrderTool, type OrderToolKind } from '../lib/api';
import { num } from '../lib/format';
import { ORDER_PATHS, ORDER_TABS, type OrderTab } from './orderNavigation';

const META: Record<OrderToolKind, { tab: OrderTab; title: string; action: string; empty: string }> = {
  gtt: { tab: 'GTT', title: 'Good till triggered orders', action: 'Create GTT', empty: 'No GTT orders yet.' },
  basket: { tab: 'Baskets', title: 'Order baskets', action: 'Create basket', empty: 'No baskets yet.' },
  sip: { tab: 'SIP', title: 'Stock SIPs', action: 'Create SIP', empty: 'No stock SIPs yet.' },
  alert: { tab: 'Alerts', title: 'Price alerts', action: 'Create alert', empty: 'No price alerts yet.' },
};

const nextMonth = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

export default function OrderTools({ kind }: { kind: OrderToolKind }) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { quotes } = useMarket();
  const meta = META[kind];
  const symbols = quotes.size ? [...quotes.keys()].sort() : watchlist.map((item) => item.symbol);
  const [tools, setTools] = useState<OrderTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState(symbols[0] ?? 'RELIANCE');
  const [side, setSide] = useState('BUY');
  const [condition, setCondition] = useState('ABOVE');
  const [price, setPrice] = useState(1000);
  const [qty, setQty] = useState(1);
  const [name, setName] = useState('Core holdings');
  const [basketSymbols, setBasketSymbols] = useState('RELIANCE, TCS');
  const [amount, setAmount] = useState(5000);
  const [frequency, setFrequency] = useState('MONTHLY');
  const [nextDate, setNextDate] = useState(nextMonth);

  const load = async () => {
    if (!token) return;
    try {
      const result = await orderToolsApi.list(token, kind);
      setTools(result.tools);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this tool.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    orderToolsApi.list(token, kind)
      .then(({ tools: next }) => !cancelled && setTools(next))
      .catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : 'Could not load this tool.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [token, kind]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const payload: Record<OrderToolKind, Record<string, unknown>> = {
      gtt: { symbol, side, condition, triggerPrice: price, qty },
      basket: { name, symbols: basketSymbols },
      sip: { symbol, amount, frequency, nextDate },
      alert: { symbol, condition, price },
    };
    setSubmitting(true);
    setError(null);
    try {
      await orderToolsApi.create(token, kind, payload[kind]);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create the item.');
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (tool: OrderTool) => {
    if (!token) return;
    await orderToolsApi.setStatus(token, tool.id, tool.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE');
    await load();
  };
  const remove = async (tool: OrderTool) => {
    if (!token) return;
    await orderToolsApi.remove(token, tool.id);
    await load();
  };

  const describe = (tool: OrderTool) => {
    const config = tool.config;
    if (tool.kind === 'basket') return `${(config.symbols as string[]).join(', ')}`;
    if (tool.kind === 'sip') return `₹${num(config.amount as number)} · ${config.frequency} · next ${config.nextDate}`;
    if (tool.kind === 'gtt') return `${config.side} ${config.qty} · ${config.condition} ₹${num(config.triggerPrice as number)}`;
    return `${config.condition} ₹${num(config.price as number)}`;
  };

  return <AppShell tabs={[...ORDER_TABS]} activeTab={meta.tab} onTabChange={(tab) => navigate(ORDER_PATHS[tab as OrderTab])}>
    <div className="order-tool-layout">
      <section className="panel order-tool-form">
        <div className="panel-head"><span className="panel-title">{meta.action}</span></div>
        <form onSubmit={submit}>
          {kind === 'basket' ? <>
            <label><span>Basket name</span><input aria-label="Basket name" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label><span>Instruments</span><input aria-label="Basket instruments" value={basketSymbols} onChange={(event) => setBasketSymbols(event.target.value)} placeholder="RELIANCE, TCS" /></label>
          </> : <label><span>Instrument</span><select aria-label="Instrument" value={symbol} onChange={(event) => setSymbol(event.target.value)}>{symbols.map((value) => <option key={value}>{value}</option>)}</select></label>}
          {kind === 'gtt' && <div className="order-tool-fields"><label><span>Side</span><select aria-label="Side" value={side} onChange={(event) => setSide(event.target.value)}><option>BUY</option><option>SELL</option></select></label><label><span>Trigger</span><select aria-label="Trigger condition" value={condition} onChange={(event) => setCondition(event.target.value)}><option>ABOVE</option><option>BELOW</option></select></label><label><span>Price</span><input aria-label="Trigger price" type="number" min="0.05" step="0.05" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label><label><span>Quantity</span><input aria-label="Quantity" type="number" min="1" value={qty} onChange={(event) => setQty(Number(event.target.value))} /></label></div>}
          {kind === 'sip' && <div className="order-tool-fields"><label><span>Amount</span><input aria-label="SIP amount" type="number" min="100" step="100" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><label><span>Frequency</span><select aria-label="SIP frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}><option>WEEKLY</option><option>MONTHLY</option></select></label><label><span>Next execution</span><input aria-label="Next execution date" type="date" min={new Date().toISOString().slice(0, 10)} value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label></div>}
          {kind === 'alert' && <div className="order-tool-fields"><label><span>Condition</span><select aria-label="Alert condition" value={condition} onChange={(event) => setCondition(event.target.value)}><option>ABOVE</option><option>BELOW</option></select></label><label><span>Target price</span><input aria-label="Target price" type="number" min="0.05" step="0.05" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label></div>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn primary" disabled={submitting}>{submitting ? 'Saving…' : meta.action}</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="panel-title">{meta.title}</span><span className="panel-count num"> ({tools.length})</span></div></div>
        {loading ? <div className="stub"><span>Loading…</span></div> : tools.length ? <div className="order-tool-list">{tools.map((tool) => <div className="order-tool-row" key={tool.id}><div><strong>{tool.name}</strong><span>{describe(tool)}</span></div><span className={`tag bid-status ${tool.status.toLowerCase()}`}>{tool.status}</span><button className="chip" onClick={() => void setStatus(tool)}>{tool.status === 'ACTIVE' ? 'Pause' : 'Resume'}</button><button className="chip" onClick={() => void remove(tool)}>Delete</button></div>)}</div> : <div className="stub"><strong>{meta.empty}</strong><span>Create one using the form.</span></div>}
      </section>
    </div>
  </AppShell>;
}