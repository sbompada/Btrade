const inr = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 253410.75 -> "2,53,410.75" */
export const num = (value: number) => inr.format(value);

/** 1248900 -> "12,48,900" */
export const whole = (value: number) => inrWhole.format(value);

/** 3912.75 -> "+₹3,912.75"; -2115 -> "−₹2,115.00" */
export const signedRupees = (value: number) =>
  `${value < 0 ? '−' : '+'}₹${inr.format(Math.abs(value))}`;

/** 1653.75 -> "+1,653.75"; -2115 -> "−2,115.00" */
export const signed = (value: number) =>
  `${value < 0 ? '−' : '+'}${inr.format(Math.abs(value))}`;

/** -0.49 -> "−0.49%"; 4.18 -> "+4.18%" */
export const signedPct = (value: number) =>
  `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}%`;

export const toneOf = (value: number) => (value < 0 ? 'down' : 'up');
