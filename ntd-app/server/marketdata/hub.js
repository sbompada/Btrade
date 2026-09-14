import { ReplayProvider } from './replay.js';
import { recordTick, writeMinuteCandle } from './candles.js';

/**
 * One process-wide subscription to the provider, fanned out to every connected
 * client. Browsers never poll the feed — that would multiply feed cost and rate
 * limits by the number of open tabs.
 */
class MarketDataHub {
  constructor() {
    this.provider = null;
    this.latest = new Map();
    this.clients = new Set();
    this.tickListeners = new Set();
  }

  /**
   * Chooses the implementation. Today only `replay` exists; a licensed feed
   * becomes another case here and nothing downstream changes.
   */
  async start({ source = process.env.NTD_MARKET_SOURCE ?? 'replay', intervalMs } = {}) {
    if (this.provider) return this.provider;

    switch (source) {
      case 'replay':
        this.provider = new ReplayProvider({
          intervalMs: Number(intervalMs ?? process.env.NTD_MARKET_INTERVAL_MS ?? 2000),
        });
        break;
      default:
        throw new Error(
          `Unknown market data source "${source}". Only "replay" is implemented — ` +
            'a licensed feed adapter goes here.',
        );
    }

    this.provider.onTick((tick) => {
      this.latest.set(tick.symbol, tick);
      recordTick(tick);
      for (const listener of this.tickListeners) {
        try {
          listener(tick);
        } catch (error) {
          console.error('[marketdata] tick listener failed:', error.message);
        }
      }
      this.broadcast(tick);
    });

    if (typeof this.provider.backfill === 'function') {
      const n = this.provider.backfill(writeMinuteCandle);
      if (n) console.log(`[marketdata] backfilled ${n} minute candles for today`);
    }

    await this.provider.start();
    return this.provider;
  }

  async stop() {
    await this.provider?.stop();
    this.provider = null;
    for (const res of this.clients) res.end();
    this.clients.clear();
  }

  snapshot() {
    return [...this.latest.values()];
  }

  addClient(res) {
    this.clients.add(res);
    return () => this.clients.delete(res);
  }

  onTick(listener) {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  broadcast(tick) {
    if (this.clients.size === 0) return;
    const frame = `event: tick\ndata: ${JSON.stringify(tick)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(frame);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  get status() {
    return {
      source: this.provider?.name ?? null,
      running: !!this.provider,
      instruments: this.latest.size,
      clients: this.clients.size,
    };
  }
}

export const hub = new MarketDataHub();
