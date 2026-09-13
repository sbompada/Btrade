import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarketDataProvider, makeTick } from './provider.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Development source. Starts from previous-day closes and walks each instrument
 * within a plausible intraday range.
 *
 * This is NOT market simulation — it exists so the UI has something changing
 * every couple of seconds, and so the seam gets exercised before a licensed feed
 * exists. Do not read anything analytical into these prices.
 *
 * The walk is driven by a seeded PRNG, so a given seed replays identically —
 * which a live feed can never do, and which makes UI bugs reproducible.
 */
export class ReplayProvider extends MarketDataProvider {
  constructor({ seedFile, intervalMs = 2000, randomSeed = 20260913 } = {}) {
    super('replay');
    this.intervalMs = intervalMs;
    this.timer = null;
    this.rngState = randomSeed >>> 0;

    const file = seedFile ?? resolve(here, 'seed.json');
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    this.tradingDay = parsed.tradingDay;

    this.instruments = new Map();
    for (const row of parsed.instruments) {
      this.instruments.set(row.symbol, {
        ...row,
        // Opens at the previous close; the walk moves it from there.
        ltp: row.prevClose,
        // Each instrument gets a session range it stays inside.
        floor: row.prevClose * (1 - (row.volatility ?? 0.002) * 12),
        ceiling: row.prevClose * (1 + (row.volatility ?? 0.002) * 12),
      });
    }

    this.subscribed = new Set(this.instruments.keys());
  }

  /** mulberry32 — small, fast, and deterministic for a given seed. */
  random() {
    this.rngState = (this.rngState + 0x6d2b79f5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Walk today's session up to now and write it as minute candles, so a 1D
   * chart has shape the moment the server starts rather than after five
   * minutes of waiting. Only the replay source does this — it is synthetic by
   * definition, and a licensed feed would backfill from real history instead.
   */
  backfill(writeCandle) {
    const now = new Date();
    const open = new Date(now);
    open.setHours(9, 15, 0, 0);
    const minutes = Math.floor((now.getTime() - open.getTime()) / 60_000);
    if (minutes < 2) return 0;

    let written = 0;
    for (const inst of this.instruments.values()) {
      let price = inst.prevClose;
      for (let m = 0; m < Math.min(minutes, 375); m += 1) {
        const barOpen = price;
        let high = price;
        let low = price;
        // 30 two-second steps make one minute.
        for (let s = 0; s < 30; s += 1) {
          const shock = (this.random() - 0.5) * 2 * (inst.volatility ?? 0.002);
          const pull = ((inst.prevClose - price) / inst.prevClose) * 0.05;
          price = Math.min(Math.max(price * (1 + shock + pull), inst.floor), inst.ceiling);
          high = Math.max(high, price);
          low = Math.min(low, price);
        }
        const bucket = new Date(open.getTime() + m * 60_000).toISOString().slice(0, 16);
        writeCandle(inst.symbol, bucket, { open: barOpen, high, low, close: price });
        written += 1;
      }
      // Carry the walk's end into the live feed so the chart joins up.
      inst.ltp = Math.round(price / (inst.tickSize ?? 0.05)) * (inst.tickSize ?? 0.05);
    }
    return written;
  }

  async start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.step(), this.intervalMs);
    // Emit once immediately so a client never waits for the first interval.
    this.step();
    console.log(
      `[marketdata] replay provider live — ${this.instruments.size} instruments, ` +
        `${this.intervalMs}ms interval, trading day ${this.tradingDay}`,
    );
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(symbols) {
    for (const s of symbols) if (this.instruments.has(s)) this.subscribed.add(s);
  }

  unsubscribe(symbols) {
    for (const s of symbols) this.subscribed.delete(s);
  }

  snapshot() {
    return [...this.subscribed]
      .map((symbol) => this.instruments.get(symbol))
      .filter(Boolean)
      .map((inst) => makeTick(inst, inst.ltp));
  }

  step() {
    const ts = Date.now();
    for (const symbol of this.subscribed) {
      const inst = this.instruments.get(symbol);
      if (!inst) continue;

      // Mean-reverting random walk: pulled gently back toward the previous close
      // so prices wander without drifting off to nonsense over a long session.
      const shock = (this.random() - 0.5) * 2 * (inst.volatility ?? 0.002);
      const pull = ((inst.prevClose - inst.ltp) / inst.prevClose) * 0.05;
      let next = inst.ltp * (1 + shock + pull);

      next = Math.min(Math.max(next, inst.floor), inst.ceiling);

      // Real venues quote on a tick grid; rounding here keeps the UI honest.
      const tick = inst.tickSize ?? 0.05;
      inst.ltp = Math.round(next / tick) * tick;

      this.emit(makeTick(inst, inst.ltp, ts));
    }
  }
}
