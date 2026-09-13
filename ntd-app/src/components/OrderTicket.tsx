import { useEffect, useState, type FormEvent } from 'react';
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
  const { token } = useAuth();
  const products: OrderRecord['product'][] = ticket.exchange === 'NSE' ? ['CNC', 'MIS'] : ['NRML', 'MIS'];
  const [side, setSide] = useState(ticket.side);
  const [product, setProduct] = useState<OrderRecord['product']>(products[0]);
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState<OrderRecord | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !Number.isInteger(qty) || qty < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await ordersApi.place(token, { instrument: ticket.symbol, side, product, qty });
      setFilled(result.order);
      window.dispatchEvent(new Event('ntd:portfolio-change'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not place the order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="order-ticket" role="dialog" aria-modal="true" aria-labelledby="order-title">
        <div className="order-ticket-head">
          <div>
            <strong id="order-title">{ticket.symbol}</strong>
            <span>{ticket.exchange} · Replay ₹{num(ticket.ltp)}</span>
          </div>
          <button onClick={onClose} aria-label="Close order ticket">×</button>
        </div>

        {filled ? (
          <div className="order-confirmation">
            <span className={`badge ${filled.side === 'BUY' ? 'buy' : 'sell'}`}>{filled.side}</span>
            <strong>{filled.qty} filled at ₹{num(filled.avgPrice)}</strong>
            <span>Order #{filled.id} · {filled.product} · {filled.status}</span>
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="order-side">
              <button type="button" className={side === 'BUY' ? 'buy active' : 'buy'} onClick={() => setSide('BUY')}>Buy</button>
              <button type="button" className={side === 'SELL' ? 'sell active' : 'sell'} onClick={() => setSide('SELL')}>Sell</button>
            </div>
            <div className="order-fields">
              <label>
                <span>Quantity</span>
                <input type="number" min="1" max="100000" step="1" value={qty} onChange={(event) => setQty(Number(event.target.value))} autoFocus />
              </label>
              <label>
                <span>Product</span>
                <select value={product} onChange={(event) => setProduct(event.target.value as OrderRecord['product'])}>
                  {products.map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="order-estimate"><span>Estimated value</span><span className="num">₹{num(ticket.ltp * Math.max(qty || 0, 0))}</span></div>
            {error && <div className="form-error">{error}</div>}
            <button className={`btn block ${side === 'BUY' ? 'order-buy' : 'order-sell'}`} disabled={submitting || qty < 1}>
              {submitting ? 'Placing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${ticket.symbol}`}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}