import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, ordersApi, type OrderRecord } from '../lib/api';
import { num } from '../lib/format';

type Ticket = {
  symbol: string;
  exchange: string;
  ltp: number;
  side: 'BUY' | 'SELL';
};

export default function OrderTicket({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const { token, user } = useAuth();
  const ticketRef = useRef<HTMLElement>(null);
  const products: OrderRecord['product'][] = ['NSE', 'BSE'].includes(ticket.exchange) ? ['CNC', 'MIS'] : ['NRML', 'MIS'];
  const [side, setSide] = useState(ticket.side);
  const [product, setProduct] = useState<OrderRecord['product']>(products[0]);
  const [variety, setVariety] = useState<OrderRecord['variety']>('REGULAR');
  const [orderType, setOrderType] = useState<OrderRecord['orderType']>('MARKET');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [qty, setQty] = useState(1);
  const [isAmo, setIsAmo] = useState(false);
  const [iceberg, setIceberg] = useState(false);
  const [icebergLegs, setIcebergLegs] = useState(2);
  const [validity, setValidity] = useState<OrderRecord['validity']>('DAY');
  const [validityMinutes, setValidityMinutes] = useState(5);
  const [sticky, setSticky] = useState(() => localStorage.getItem(`ntd.sticky-order.${user?.clientId}`) === 'true');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<OrderRecord | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (user) localStorage.setItem(`ntd.sticky-order.${user.clientId}`, String(sticky));
  }, [sticky, user]);

  useEffect(() => {
    const keepInViewport = () => {
      const element = ticketRef.current;
      if (!element) return;
      setPosition((current) => {
        if (!current) return current;
        const x = Math.min(Math.max(8, current.x), Math.max(8, window.innerWidth - element.offsetWidth - 8));
        const y = Math.min(Math.max(8, current.y), Math.max(8, window.innerHeight - element.offsetHeight - 8));
        return x === current.x && y === current.y ? current : { x, y };
      });
    };
    keepInViewport();
    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [minimized]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const element = ticketRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    event.currentTarget.setPointerCapture(event.pointerId);

    const move = (pointerEvent: PointerEvent) => {
      const nextX = Math.min(Math.max(8, pointerEvent.clientX - offsetX), window.innerWidth - element.offsetWidth - 8);
      const nextY = Math.min(Math.max(8, pointerEvent.clientY - offsetY), window.innerHeight - element.offsetHeight - 8);
      setPosition({ x: nextX, y: nextY });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !Number.isInteger(qty) || qty < 1) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await ordersApi.place(token, {
        instrument: ticket.symbol,
        side,
        product,
        qty,
        variety,
        orderType,
        triggerPrice: variety === 'CO' || orderType === 'SL' || orderType === 'SL-M' ? Number(triggerPrice) : undefined,
        limitPrice: orderType === 'LIMIT' || orderType === 'SL' ? Number(limitPrice) : undefined,
        isAmo,
        icebergLegs: iceberg ? icebergLegs : undefined,
        validity,
        validityMinutes: validity === 'MINUTES' ? validityMinutes : undefined,
      });
      if (sticky) setNotice(`Order #${result.order.id} · ${result.order.status}`);
      else setFilled(result.order);
      window.dispatchEvent(new Event('ntd:portfolio-change'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not place the order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={ticketRef}
        className={minimized ? 'order-ticket minimized' : 'order-ticket'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-title"
        style={position ? { position: 'fixed', left: position.x, top: position.y, transform: 'none' } : undefined}
      >
        <div className="order-ticket-head" onPointerDown={startDrag}>
          <div>
            <strong id="order-title">{ticket.symbol}</strong>
            <span>{ticket.exchange} · Replay ₹{num(ticket.ltp)}</span>
          </div>
          <div className="order-ticket-controls">
            <button onClick={() => setMinimized((value) => !value)} aria-label={minimized ? 'Restore order ticket' : 'Minimize order ticket'}>{minimized ? '□' : '−'}</button>
            <button onClick={onClose} aria-label="Close order ticket">×</button>
          </div>
        </div>

        {!minimized && (filled ? (
          <div className="order-confirmation">
            <span className={`badge ${filled.side === 'BUY' ? 'buy' : 'sell'}`}>{filled.side}</span>
            <strong>{filled.status === 'COMPLETE' ? `${filled.qty} filled at ₹${num(filled.avgPrice)}` : `${filled.qty} submitted · ${filled.status}`}</strong>
            <span>Order #{filled.id} · {filled.variety === 'CO' ? 'CO / ' : ''}{filled.product} · {filled.status}</span>
            {filled.variety === 'CO' && <span>Protective stop recorded at ₹{num(filled.triggerPrice ?? 0)}</span>}
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="order-side">
              <button type="button" className={side === 'BUY' ? 'buy active' : 'buy'} onClick={() => setSide('BUY')}>Buy</button>
              <button type="button" className={side === 'SELL' ? 'sell active' : 'sell'} onClick={() => setSide('SELL')}>Sell</button>
            </div>
            {ticket.exchange === 'NSE' && (
              <div className="order-variety" aria-label="Order variety">
                <button type="button" className={variety === 'REGULAR' ? 'active' : ''} onClick={() => setVariety('REGULAR')}>Regular</button>
                <button type="button" className={variety === 'CO' ? 'active' : ''} onClick={() => { setVariety('CO'); setProduct('MIS'); setIsAmo(false); setIceberg(false); if (!['MARKET', 'LIMIT'].includes(orderType)) setOrderType('MARKET'); }}>Cover (CO)</button>
              </div>
            )}
            <div className="order-type" aria-label="Order type">
              {(variety === 'CO' ? ['MARKET', 'LIMIT'] : ['MARKET', 'LIMIT', 'SL', 'SL-M']).map((value) => (
                <button type="button" key={value} className={orderType === value ? 'active' : ''} onClick={() => setOrderType(value as OrderRecord['orderType'])}>{value}</button>
              ))}
            </div>
            <div className="order-fields">
              <label>
                <span>Quantity</span>
                <input type="number" min="1" max="100000" step="1" value={qty} onChange={(event) => setQty(Number(event.target.value))} autoFocus />
              </label>
              <label>
                <span>Product</span>
                <select value={product} disabled={variety === 'CO'} onChange={(event) => setProduct(event.target.value as OrderRecord['product'])}>
                  {products.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              {(orderType === 'LIMIT' || orderType === 'SL') && (
                <label>
                  <span>Limit price</span>
                  <input type="number" min="0.05" step="0.05" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} placeholder={num(ticket.ltp)} />
                </label>
              )}
              {(variety === 'CO' || orderType === 'SL' || orderType === 'SL-M') && (
                <label>
                  <span>Stop-loss trigger</span>
                  <input type="number" min="0.05" step="0.05" value={triggerPrice} onChange={(event) => setTriggerPrice(event.target.value)} placeholder={variety === 'CO' ? (side === 'BUY' ? `Below ${num(ticket.ltp)}` : `Above ${num(ticket.ltp)}`) : (side === 'BUY' ? `Above ${num(ticket.ltp)}` : `Below ${num(ticket.ltp)}`)} />
                </label>
              )}
            </div>
            <div className="order-product-help">
              {product === 'CNC' && <span><strong>CNC</strong> Cash n Carry · delivery equity with full funding.</span>}
              {product === 'MIS' && <span><strong>MIS</strong> Margin Intraday Squareoff · intraday position.</span>}
              {product === 'NRML' && <span><strong>NRML</strong> Normal · carry-forward F&amp;O or commodity position.</span>}
              {variety === 'CO' && <span><strong>CO</strong> MIS entry with a mandatory protective stop recorded by uni-share.</span>}
            </div>
            <div className="order-options">
              {variety === 'REGULAR' && <label><input type="checkbox" checked={isAmo} onChange={(event) => setIsAmo(event.target.checked)} /> After market order</label>}
              {variety === 'REGULAR' && <label><input type="checkbox" checked={iceberg} onChange={(event) => setIceberg(event.target.checked)} /> Iceberg</label>}
              <label><input type="checkbox" checked={sticky} onChange={(event) => setSticky(event.target.checked)} /> Sticky window</label>
            </div>
            {variety === 'REGULAR' && iceberg && <label className="order-legs"><span>Iceberg legs</span><input type="number" min="2" max="10" value={icebergLegs} onChange={(event) => setIcebergLegs(Number(event.target.value))} /></label>}
            <div className="order-validity">
              <label><span>Validity</span><select value={validity} onChange={(event) => setValidity(event.target.value as OrderRecord['validity'])}><option>DAY</option><option>IOC</option><option>MINUTES</option></select></label>
              {validity === 'MINUTES' && <label><span>Minutes</span><input type="number" min="1" max="120" value={validityMinutes} onChange={(event) => setValidityMinutes(Number(event.target.value))} /></label>}
            </div>
            <div className="order-estimate"><span>Estimated value</span><span className="num">₹{num(ticket.ltp * Math.max(qty || 0, 0))}</span></div>
            {notice && <div className="notice info" role="status">{notice}</div>}
            {error && <div className="form-error">{error}</div>}
            <button className={`btn block ${side === 'BUY' ? 'order-buy' : 'order-sell'}`} disabled={submitting || qty < 1 || ((variety === 'CO' || orderType === 'SL' || orderType === 'SL-M') && !triggerPrice) || ((orderType === 'LIMIT' || orderType === 'SL') && !limitPrice)}>
              {submitting ? 'Placing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${ticket.symbol}`}
            </button>
          </form>
        ))}
      </section>
    </div>
  );
}