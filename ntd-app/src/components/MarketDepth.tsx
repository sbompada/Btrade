import { num } from '../lib/format';

type Props = {
  symbol: string;
  ltp: number;
  prevClose: number;
};

const hashOf = (value: string) => [...value].reduce((total, char) => total + char.charCodeAt(0), 0);

export default function MarketDepth({ symbol, ltp, prevClose }: Props) {
  const seed = hashOf(symbol);
  const tick = ltp >= 1000 ? 0.5 : 0.05;
  const bids = Array.from({ length: 5 }, (_, index) => ({
    price: ltp - tick * (index + 1),
    orders: (seed * (index + 3)) % 19 + 1,
    quantity: ((seed + index * 37) % 18 + 1) * 25,
  }));
  const offers = Array.from({ length: 5 }, (_, index) => ({
    price: ltp + tick * (index + 1),
    orders: (seed * (index + 5)) % 17 + 1,
    quantity: ((seed + index * 53) % 16 + 1) * 25,
  }));
  const low = Math.min(ltp, prevClose) * 0.985;
  const high = Math.max(ltp, prevClose) * 1.015;
  const open = prevClose + (ltp - prevClose) * 0.32;

  return (
    <div className="market-depth" aria-label={`${symbol} market depth`}>
      <div className="depth-head"><span>Bid</span><span>Orders</span><span>Qty.</span><span>Offer</span><span>Orders</span><span>Qty.</span></div>
      {bids.map((bid, index) => <div className="depth-row" key={bid.price}>
        <span className="num up">{num(bid.price)}</span><span className="num up">{bid.orders}</span><span className="num up">{bid.quantity}</span>
        <span className="num down">{num(offers[index].price)}</span><span className="num down">{offers[index].orders}</span><span className="num down">{offers[index].quantity}</span>
      </div>)}
      <div className="depth-total"><strong>Total</strong><span className="num">{bids.reduce((sum, level) => sum + level.quantity, 0)}</span><strong>Total</strong><span className="num">{offers.reduce((sum, level) => sum + level.quantity, 0)}</span></div>
      <div className="depth-stats">
        <span>Open <strong className="num">{num(open)}</strong></span><span>Prev. Close <strong className="num">{num(prevClose)}</strong></span>
        <span>Low <strong className="num">{num(low)}</strong></span><span>High <strong className="num">{num(high)}</strong></span>
      </div>
      <div className="depth-range"><i style={{ left: `${Math.max(4, Math.min(96, ((ltp - low) / (high - low)) * 100))}%` }} /></div>
      <span className="depth-source">REPLAY DEPTH</span>
    </div>
  );
}