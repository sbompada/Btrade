import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useAuth } from '../auth/AuthContext';
import { useMarket } from '../market/MarketDataContext';
import { watchlist } from '../data/market';
import { ApiError, orderToolsApi, type BasketMargin, type OrderTool, type OrderToolKind } from '../lib/api';
import { istDate, istDateKey, istDateTime, num } from '../lib/format';
import { ORDER_PATHS, ORDER_TABS, type OrderTab } from './orderNavigation';

const META: Record<OrderToolKind, { tab: OrderTab; title: string; action: string; empty: string }> = {
  gtt: { tab: 'GTT', title: 'Good till triggered orders', action: 'Create GTT', empty: 'No GTT orders yet.' },
  basket: { tab: 'Baskets', title: 'Order baskets', action: 'Create basket', empty: 'No baskets yet.' },
  sip: { tab: 'SIP', title: 'Stock SIPs', action: 'Create SIP', empty: 'No stock SIPs yet.' },
  alert: { tab: 'Alerts', title: 'Price alerts', action: 'Create alert', empty: 'No price alerts yet.' },
};

const nextMonth = () => {
  return istDateKey(Date.now() + 86_400_000);
};

export default function OrderTools({ kind }: { kind: OrderToolKind }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const { quotes } = useMarket();
  const meta = META[kind];
  const requestedSymbol = searchParams.get('symbol');
  const symbols = [...new Set([...(requestedSymbol ? [requestedSymbol] : []), ...(quotes.size ? [...quotes.keys()].sort() : watchlist.map((item) => item.symbol))])];
  const [tools, setTools] = useState<OrderTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState(() => requestedSymbol ?? symbols[0] ?? 'RELIANCE');
  const [side, setSide] = useState('BUY');
  const [triggerType, setTriggerType] = useState('SINGLE');
  const [condition, setCondition] = useState('ABOVE');
  const [price, setPrice] = useState(() => Number(searchParams.get('price')) || 1000);
  const [limitPrice, setLimitPrice] = useState(() => Number(searchParams.get('price')) || 1000);
  const [stopTrigger, setStopTrigger] = useState(900);
  const [stopLimit, setStopLimit] = useState(895);
  const [targetTrigger, setTargetTrigger] = useState(1100);
  const [targetLimit, setTargetLimit] = useState(1095);
  const [qty, setQty] = useState(1);
  const [name, setName] = useState('Core holdings');
  const [basketLegs, setBasketLegs] = useState([{ symbol: 'RELIANCE', side: 'BUY', product: 'CNC', qty: 1 }]);
  const [baskets, setBaskets] = useState<OrderTool[]>([]);
  const [basketId, setBasketId] = useState(0);
  const [frequency, setFrequency] = useState('MONTHLY');
  const [nextDate, setNextDate] = useState(nextMonth);
  const [preferredTime, setPreferredTime] = useState('09:30');
  const [alertProperty, setAlertProperty] = useState('LTP');
  const [margins, setMargins] = useState<Record<number, BasketMargin>>({});
  const [minimized, setMinimized] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    if (!token || kind !== 'sip') return;
    orderToolsApi.list(token, 'basket').then(({ tools: next }) => {
      setBaskets(next);
      setBasketId((current) => current || next[0]?.id || 0);
    }).catch(() => setBaskets([]));
  }, [token, kind]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const payload: Record<OrderToolKind, Record<string, unknown>> = {
      gtt: triggerType === 'OCO'
        ? { symbol, triggerType, side: 'SELL', qty, stopTrigger, stopLimit, targetTrigger, targetLimit }
        : { symbol, triggerType, side, condition, triggerPrice: price, limitPrice, qty },
      basket: { name, legs: basketLegs },
      sip: { name, basketId, frequency, nextDate, preferredTime },
      alert: { name, symbol, property: alertProperty, condition, price },
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

  const basketAction = async (tool: OrderTool, action: 'margin' | 'execute' | 'retry' | 'clone') => {
    if (!token) return;
    setError(null);
    try {
      if (action === 'margin') {
        const { margin } = await orderToolsApi.margin(token, tool.id);
        setMargins((current) => ({ ...current, [tool.id]: margin }));
      } else if (action === 'clone') await orderToolsApi.clone(token, tool.id);
      else await orderToolsApi.execute(token, tool.id, action === 'retry');
      await load();
      window.dispatchEvent(new Event('ntd:portfolio-change'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Basket action failed.');
    }
  };

  const describe = (tool: OrderTool) => {
    const config = tool.config;
    if (tool.kind === 'basket') return `${((config.legs as Array<{ symbol: string }>) ?? []).map((leg) => leg.symbol).join(', ')}`;
    if (tool.kind === 'sip') return `${config.basketName} · ${config.frequency} · ${config.nextDate} ${config.preferredTime}`;
    if (tool.kind === 'gtt') {
      const instruction = config.triggerType === 'OCO' ? `SELL ${config.qty} · stop ₹${num(config.stopTrigger as number)} / target ₹${num(config.targetTrigger as number)}` : `${config.side} ${config.qty} · ${config.condition} ₹${num(config.triggerPrice as number)}`;
      return `${instruction}${config.expiresAt ? ` · valid to ${istDate(String(config.expiresAt))}` : ''}`;
    }
    return `${config.property} ${config.condition} ${num(config.price as number)}`;
  };

  return <AppShell tabs={[...ORDER_TABS]} activeTab={meta.tab} onTabChange={(tab) => navigate(ORDER_PATHS[tab as OrderTab])}>
    <div className="order-tool-layout">
      <section className="panel order-tool-form">
        <div className="panel-head"><span className="panel-title">{meta.action}</span></div>
        <form onSubmit={submit}>
          {kind === 'basket' ? <>
            <label><span>Basket name</span><input aria-label="Basket name" value={name} onChange={(event) => setName(event.target.value)} /></label>
            <div className="basket-leg-editor">
              {basketLegs.map((leg, index) => <div className="basket-leg" key={index}>
                <select aria-label={`Basket instrument ${index + 1}`} value={leg.symbol} onChange={(event) => setBasketLegs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, symbol: event.target.value } : item))}>{symbols.map((value) => <option key={value}>{value}</option>)}</select>
                <select aria-label={`Basket side ${index + 1}`} value={leg.side} onChange={(event) => setBasketLegs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, side: event.target.value } : item))}><option>BUY</option><option>SELL</option></select>
                <select aria-label={`Basket product ${index + 1}`} value={leg.product} onChange={(event) => setBasketLegs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, product: event.target.value } : item))}><option>CNC</option><option>MIS</option><option>NRML</option></select>
                <input aria-label={`Basket quantity ${index + 1}`} type="number" min="1" value={leg.qty} onChange={(event) => setBasketLegs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, qty: Number(event.target.value) } : item))} />
                <button type="button" className="iconbtn" aria-label={`Remove basket order ${index + 1}`} disabled={basketLegs.length === 1} onClick={() => setBasketLegs((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
              </div>)}
              <button type="button" className="chip" disabled={basketLegs.length >= 20} onClick={() => setBasketLegs((current) => [...current, { symbol: symbols[0], side: 'BUY', product: 'CNC', qty: 1 }])}>+ Add order</button>
            </div>
          </> : kind !== 'sip' && <label><span>Instrument</span><select aria-label="Instrument" value={symbol} onChange={(event) => setSymbol(event.target.value)}>{symbols.map((value) => <option key={value}>{value}</option>)}</select></label>}
          {kind === 'gtt' && <>
            <div className="order-variety"><button type="button" className={triggerType === 'SINGLE' ? 'active' : ''} onClick={() => setTriggerType('SINGLE')}>Single trigger</button><button type="button" className={triggerType === 'OCO' ? 'active' : ''} onClick={() => { setTriggerType('OCO'); setSide('SELL'); }}>OCO</button></div>
            {triggerType === 'SINGLE' ? <div className="order-tool-fields"><label><span>Side</span><select aria-label="Side" value={side} onChange={(event) => setSide(event.target.value)}><option>BUY</option><option>SELL</option></select></label><label><span>Trigger</span><select aria-label="Trigger condition" value={condition} onChange={(event) => setCondition(event.target.value)}><option>ABOVE</option><option>BELOW</option></select></label><label><span>Trigger price</span><input aria-label="Trigger price" type="number" min="0.05" step="0.05" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label><label><span>Limit price</span><input aria-label="GTT limit price" type="number" min="0.05" step="0.05" value={limitPrice} onChange={(event) => setLimitPrice(Number(event.target.value))} /></label></div> : <div className="order-tool-fields"><label><span>Stop trigger</span><input aria-label="OCO stop trigger" type="number" min="0.05" step="0.05" value={stopTrigger} onChange={(event) => setStopTrigger(Number(event.target.value))} /></label><label><span>Stop limit</span><input aria-label="OCO stop limit" type="number" min="0.05" step="0.05" value={stopLimit} onChange={(event) => setStopLimit(Number(event.target.value))} /></label><label><span>Target trigger</span><input aria-label="OCO target trigger" type="number" min="0.05" step="0.05" value={targetTrigger} onChange={(event) => setTargetTrigger(Number(event.target.value))} /></label><label><span>Target limit</span><input aria-label="OCO target limit" type="number" min="0.05" step="0.05" value={targetLimit} onChange={(event) => setTargetLimit(Number(event.target.value))} /></label></div>}
            <label><span>Quantity</span><input aria-label="Quantity" type="number" min="1" value={qty} onChange={(event) => setQty(Number(event.target.value))} /></label>
          </>}
          {kind === 'sip' && <><label><span>SIP name</span><input aria-label="SIP name" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Basket</span><select aria-label="SIP basket" value={basketId} onChange={(event) => setBasketId(Number(event.target.value))}>{baskets.map((basket) => <option key={basket.id} value={basket.id}>{basket.name}</option>)}</select></label><div className="order-tool-fields"><label><span>Frequency</span><select aria-label="Frequency" value={frequency} onChange={(event) => setFrequency(event.target.value)}><option>WEEKLY</option><option>MONTHLY</option></select></label><label><span>Next execution</span><input aria-label="Next execution date" type="date" min={istDateKey()} value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label><label><span>Preferred time</span><input aria-label="Preferred time" type="time" value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} /></label></div>{!baskets.length && <div className="notice warning">Create a basket before scheduling a SIP.</div>}</>}
          {kind === 'alert' && <><label><span>Alert name</span><input aria-label="Alert name" value={name} onChange={(event) => setName(event.target.value)} /></label><div className="order-tool-fields"><label><span>Property</span><select aria-label="Alert property" value={alertProperty} onChange={(event) => setAlertProperty(event.target.value)}><option value="LTP">Last traded price</option><option value="CHANGE_PCT">Change %</option></select></label><label><span>Condition</span><select aria-label="Alert condition" value={condition} onChange={(event) => setCondition(event.target.value)}><option>ABOVE</option><option>BELOW</option></select></label><label><span>Value</span><input aria-label="Alert value" type="number" step="0.05" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label></div></>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn primary" disabled={submitting || (kind === 'sip' && !basketId)}>{submitting ? 'Saving…' : meta.action}</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="panel-title">{meta.title}</span><span className="panel-count num"> ({tools.length})</span></div></div>
        {loading ? <div className="stub"><span>Loading…</span></div> : tools.length ? <div className="order-tool-list">{tools.map((tool) => {
          const isMinimized = minimized.has(tool.id);
          const results = (tool.config.results as Array<{ symbol: string; status: string; message?: string }> | undefined) ?? [];
          const hasRejected = results.some((result) => result.status === 'REJECTED');
          return <div className={isMinimized ? 'order-tool-row minimized' : 'order-tool-row'} key={tool.id}>
            <div><strong>{tool.name}</strong><span>{describe(tool)}</span>{!isMinimized && Boolean(tool.config.triggeredAt) && <span>Triggered {istDateTime(String(tool.config.triggeredAt))}{tool.config.triggeredLeg ? ` · ${String(tool.config.triggeredLeg)}` : ''}</span>}</div>
            <span className={`tag bid-status ${tool.status.toLowerCase()}`}>{tool.status}</span>
            {tool.kind === 'basket' && <button className="chip" onClick={() => setMinimized((current) => { const next = new Set(current); if (next.has(tool.id)) next.delete(tool.id); else next.add(tool.id); return next; })}>{isMinimized ? 'Restore' : 'Minimise'}</button>}
            {!isMinimized && tool.kind === 'basket' && <><button className="chip" onClick={() => void basketAction(tool, 'margin')}>Margins</button><button className="chip" onClick={() => void basketAction(tool, 'execute')}>Execute</button><button className="chip" onClick={() => void basketAction(tool, 'clone')}>Clone</button>{hasRejected && <button className="chip danger" onClick={() => void basketAction(tool, 'retry')}>Retry rejected</button>}</>}
            {!isMinimized && <button className="chip" onClick={() => void setStatus(tool)}>{tool.status === 'ACTIVE' ? 'Pause' : 'Resume'}</button>}
            {!isMinimized && <button className="chip" onClick={() => void remove(tool)}>Delete</button>}
            {!isMinimized && margins[tool.id] && <div className="basket-margin"><strong>Required margin ₹{num(margins[tool.id].required)}</strong><span>Development estimate · {margins[tool.id].legs.length} orders</span></div>}
            {!isMinimized && results.length > 0 && <div className="basket-results">{results.map((result, index) => <span key={`${result.symbol}-${index}`} className={result.status === 'REJECTED' ? 'down' : 'up'}>{result.symbol}: {result.status}{result.message ? ` · ${result.message}` : ''}</span>)}</div>}
          </div>;
        })}</div> : <div className="stub"><strong>{meta.empty}</strong><span>Create one using the form.</span></div>}
      </section>
    </div>
  </AppShell>;
}