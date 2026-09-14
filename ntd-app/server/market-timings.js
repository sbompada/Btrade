const TIME_ZONE = 'Asia/Kolkata';

const SEGMENTS = [
  { id: 'equity-preopen', exchange: 'NSE / BSE', segment: 'Equity pre-open', open: '09:00', close: '09:15', days: 'Mon–Fri' },
  { id: 'nse-equity', exchange: 'NSE', segment: 'Equity', open: '09:15', close: '15:30', days: 'Mon–Fri' },
  { id: 'bse-equity', exchange: 'BSE', segment: 'Equity', open: '09:15', close: '15:30', days: 'Mon–Fri' },
  { id: 'nse-fo', exchange: 'NSE', segment: 'Equity derivatives', open: '09:15', close: '15:30', days: 'Mon–Fri' },
  { id: 'equity-postmarket', exchange: 'NSE / BSE', segment: 'Equity post-market', open: '15:40', close: '16:00', days: 'Mon–Fri' },
  { id: 'currency', exchange: 'NSE / BSE', segment: 'Currency derivatives', open: '09:00', close: '17:00', days: 'Mon–Fri' },
  { id: 'mcx-reference', exchange: 'MCX', segment: 'International commodities', open: '09:00', close: '23:30', days: 'Mon–Fri' },
  { id: 'mcx-reference-agri', exchange: 'MCX', segment: 'Cotton, CPO and KAPAS', open: '09:00', close: '21:00', days: 'Mon–Fri' },
  { id: 'mcx-agri', exchange: 'MCX', segment: 'Other agriculture', open: '09:00', close: '17:00', days: 'Mon–Fri' },
  { id: 'ipo', exchange: 'IPO', segment: 'Retail applications', open: '10:00', close: '16:30', days: 'Issue days' },
];

const partsInIst = (date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
);

const toMinutes = (value) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const nextWeekday = (dateParts, includeToday) => {
  const date = new Date(`${dateParts.year}-${dateParts.month}-${dateParts.day}T00:00:00+05:30`);
  if (!includeToday) date.setUTCDate(date.getUTCDate() + 1);
  while ([0, 6].includes(new Date(date.getTime() + 330 * 60_000).getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return partsInIst(date);
};

const transitionLabel = (parts, time, action) => {
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+05:30`);
  const day = date.toLocaleDateString('en-GB', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });
  return `${action} ${day}, ${time} IST`;
};

export function ipoModificationOpen(at = new Date()) {
  const now = partsInIst(at);
  const minutes = Number(now.hour) * 60 + Number(now.minute);
  return !['Sat', 'Sun'].includes(now.weekday) && minutes >= toMinutes('10:00') && minutes < toMinutes('16:30');
}

export function marketTimings(at = new Date()) {
  const now = partsInIst(at);
  const minutes = Number(now.hour) * 60 + Number(now.minute);
  const tradingDay = !['Sat', 'Sun'].includes(now.weekday);

  const segments = SEGMENTS.map((configured) => {
    const segment = configured.id === 'mcx-reference' && [0, 1, 2, 11].includes(Number(now.month) - 1)
      ? { ...configured, close: '23:55' }
      : configured;
    const open = toMinutes(segment.open);
    const close = toMinutes(segment.close);
    const isOpen = tradingDay && minutes >= open && minutes < close;
    const next = isOpen
      ? transitionLabel(now, segment.close, 'Closes')
      : tradingDay && minutes < open
        ? transitionLabel(now, segment.open, 'Opens')
        : transitionLabel(nextWeekday(now, false), segment.open, 'Opens');
    return { ...segment, isOpen, next };
  });

  return {
    timeZone: TIME_ZONE,
    asOf: `${now.year}-${now.month}-${now.day}T${now.hour}:${now.minute}:${now.second}+05:30`,
    dateLabel: new Date(at).toLocaleDateString('en-GB', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }),
    clock: `${now.hour}:${now.minute}:${now.second} IST`,
    tradingDay,
    equityOpen: segments.some((segment) => ['nse-equity', 'bse-equity'].includes(segment.id) && segment.isOpen),
    segments,
    notes: [
      'New IPO listings use a 09:00–10:00 IST price-discovery session on listing day.',
      'Exchange holidays and special sessions can override the standard weekday schedule.',
      'International commodity sessions close at 23:30 from March to November and 23:55 from November to March.',
    ],
  };
}