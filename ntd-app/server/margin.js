/**
 * Margin from open positions.
 *
 * A deliberate approximation. Real SPAN comes from exchange-published parameter
 * files and is portfolio-netted across a whole book; this applies flat rates per
 * position and nets nothing. It behaves plausibly and moves with the market,
 * which is what development needs — swap it for the real calculator behind this
 * same function signature when there is one.
 *
 * The treatments that actually matter, and are correct here:
 *   long option   — premium is paid in full at entry. No SPAN, no exposure, and
 *                   it does NOT move with price.
 *   short option  — SPAN + exposure on notional, recomputed against spot.
 *   futures       — SPAN + exposure on contract value, recomputed against price.
 */

const RATES = {
  index: { span: 0.1, exposure: 0.02 },
  stock: { span: 0.16, exposure: 0.035 },
};

/** Underlying spot symbols as the feed publishes them. */
const UNDERLYING = {
  NIFTY: 'NIFTY 50',
  BANKNIFTY: 'BANK NIFTY',
  FINNIFTY: 'FIN NIFTY',
};

const INDEX_UNDERLYINGS = new Set(Object.keys(UNDERLYING));

/** "NIFTY AUG 24250 CE" -> {underlying, strike, right}; futures have no right. */
export function parseInstrument(name) {
  const parts = String(name).trim().toUpperCase().split(/\s+/);
  const right = parts.at(-1);

  if (right === 'CE' || right === 'PE') {
    return {
      kind: 'option',
      underlying: parts[0],
      strike: Number(parts.at(-2)),
      right,
    };
  }
  if (right === 'FUT') return { kind: 'future', underlying: parts[0] };
  return { kind: 'equity', underlying: parts[0] };
}

const rateFor = (underlying) => (INDEX_UNDERLYINGS.has(underlying) ? RATES.index : RATES.stock);

/**
 * @param positions rows from open_positions
 * @param quoteFor  (symbol) => quote | undefined, from the live feed
 */
export function computeMargin(positions, quoteFor) {
  let span = 0;
  let exposure = 0;
  let optionsPremium = 0;
  let deliveryMargin = 0;

  for (const p of positions) {
    const spec = parseInstrument(p.instrument);
    const rates = rateFor(spec.underlying);
    const isLong = p.qty > 0;
    const lots = Math.abs(p.qty);

    if (spec.kind === 'option') {
      if (isLong) {
        // Premium paid at entry — fixed, and never revalued for margin.
        optionsPremium += lots * p.avg_price;
        continue;
      }
      // Short: margin is on the underlying's notional, so it tracks spot.
      const spot = quoteFor(UNDERLYING[spec.underlying])?.ltp ?? spec.strike;
      const notional = lots * spot;
      span += notional * rates.span;
      exposure += notional * rates.exposure;
      continue;
    }

    if (spec.kind === 'future') {
      const price = quoteFor(p.instrument)?.ltp ?? p.avg_price;
      const notional = lots * price;
      span += notional * rates.span;
      exposure += notional * rates.exposure;
      continue;
    }

    // Delivery (CNC) equity is funded, not margined; intraday would be levered.
    if (p.product === 'CNC' && isLong) {
      const price = quoteFor(p.instrument)?.ltp ?? p.avg_price;
      deliveryMargin += lots * price;
    }
  }

  const round = (n) => Number(n.toFixed(2));
  return {
    span: round(span),
    exposure: round(exposure),
    optionsPremium: round(optionsPremium),
    deliveryMargin: round(deliveryMargin),
  };
}
