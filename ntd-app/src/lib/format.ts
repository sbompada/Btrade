const inr = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const INDIA_TIME_ZONE = 'Asia/Kolkata';

export const timestampDate = (value: string | number | Date) => {
  if (value instanceof Date || typeof value === 'number') return new Date(value);
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
};

export const istDateTime = (value: string | number | Date) => `${timestampDate(value).toLocaleString('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'medium',
})} IST`;

export const istTime = (value: string | number | Date) => `${timestampDate(value).toLocaleTimeString('en-GB', {
  timeZone: INDIA_TIME_ZONE,
  hour12: false,
})} IST`;

export const istDate = (value: string | number | Date = new Date()) => timestampDate(value).toLocaleDateString('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const istDateKey = (value: string | number | Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(timestampDate(value));
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
};

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
