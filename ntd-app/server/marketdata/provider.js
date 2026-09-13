/**
 * The market-data seam.
 *
 * Everything downstream — the hub, the SSE stream, every screen — talks to this
 * interface and nothing else. Swapping the development replay source for a
 * licensed broker/vendor feed means adding one more implementation and changing
 * which one is constructed; no screen, route or store changes.
 *
 * A tick is always this shape, whatever produced it:
 *
 *   { symbol, exchange, ltp, prevClose, change, changePct, ts }
 *
 * `ts` is epoch milliseconds at the source, not at ingestion.
 */
export class MarketDataProvider {
  constructor(name) {
    this.name = name;
    this.handlers = new Set();
  }

  /** Begin producing ticks. Resolves once the source is live. */
  async start() {
    throw new Error(`${this.name}: start() not implemented`);
  }

  /** Stop producing ticks and release the connection. */
  async stop() {
    throw new Error(`${this.name}: stop() not implemented`);
  }

  /** Add instruments to the subscription. */
  subscribe(_symbols) {
    throw new Error(`${this.name}: subscribe() not implemented`);
  }

  /** Remove instruments from the subscription. */
  unsubscribe(_symbols) {
    throw new Error(`${this.name}: unsubscribe() not implemented`);
  }

  /** Last known value for every subscribed instrument. */
  snapshot() {
    throw new Error(`${this.name}: snapshot() not implemented`);
  }

  onTick(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Implementations call this; they never touch `handlers` directly. */
  emit(tick) {
    for (const handler of this.handlers) {
      try {
        handler(tick);
      } catch (err) {
        // One bad subscriber must not stall the feed for the others.
        console.error(`[marketdata] subscriber threw: ${err.message}`);
      }
    }
  }
}

export const makeTick = (instrument, ltp, ts = Date.now()) => {
  const change = ltp - instrument.prevClose;
  return {
    symbol: instrument.symbol,
    exchange: instrument.exchange,
    ltp: Number(ltp.toFixed(2)),
    prevClose: instrument.prevClose,
    change: Number(change.toFixed(2)),
    changePct: Number(((change / instrument.prevClose) * 100).toFixed(2)),
    ts,
  };
};
