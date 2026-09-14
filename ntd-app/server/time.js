export const INDIA_TIME_ZONE = 'Asia/Kolkata';

const asUtcDate = (value) => {
  const text = String(value ?? '');
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
};

export const istTime = (value) => `${asUtcDate(value).toLocaleTimeString('en-GB', {
  timeZone: INDIA_TIME_ZONE,
  hour12: false,
})} IST`;

export const istDateKey = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: INDIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(value);