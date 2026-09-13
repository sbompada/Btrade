import { db } from './db.js';

/**
 * IPO and event calendar.
 *
 * The status of an issue is DERIVED from today against its window — never
 * stored. A stored status is wrong the moment the date rolls over, which is
 * exactly how the panel ended up showing "OPEN NOW" for a window that had
 * closed weeks earlier.
 *
 * Seed dates are relative to the day the database is first created, so a fresh
 * checkout has a plausible calendar. Real issues replace this from an exchange
 * feed or a data vendor; the names here are invented, not real companies.
 */

const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (days) => iso(new Date(Date.now() + days * DAY));

/** Offsets in days from seeding, so the calendar spans past, present and future. */
const IPO_SEED = [
  { name: 'Suryodaya Infra', code: 'SURYIN', open: -1, close: 1, low: 142, high: 150, lot: 100 },
  { name: 'Halcyon Labs', code: 'HLCYN', open: 0, close: 2, low: 88, high: 94, lot: 150 },
  { name: 'Nexgen Ceramics', code: 'NXGCER', open: 0, close: 3, low: 310, high: 326, lot: 45 },
  { name: 'Vaidya Healthcare', code: 'VAIDYA', open: 1, close: 4, low: 205, high: 216, lot: 65 },
  { name: 'Meghna Textiles', code: 'MEGTEX', open: 2, close: 5, low: 74, high: 79, lot: 190 },
  { name: 'Lumino Industries', code: 'LUMINO', open: 4, close: 8, low: null, high: null, lot: null },
  { name: 'Aarav Data Centres', code: 'AARAVD', open: 6, close: 10, low: null, high: null, lot: null },
  { name: 'Kaveri Logistics', code: 'KAVLOG', open: null, close: null, low: null, high: null, lot: null },
  { name: 'Pralay Speciality', code: 'PRLSPC', open: -8, close: -5, low: 118, high: 124, lot: 120 },
];

const EVENT_SEED = [
  { kind: 'economic', day: 0, title: 'CPI inflation', detail: 'August · MoSPI · 17:30' },
  { kind: 'economic', day: 1, title: 'WPI inflation', detail: 'August · 12:00' },
  { kind: 'economic', day: 3, title: 'RBI monetary policy', detail: 'MPC decision · 10:00' },
  { kind: 'economic', day: 5, title: 'Trade balance', detail: 'August · Commerce Ministry' },
  { kind: 'economic', day: 8, title: 'GDP estimate', detail: 'Q1 FY27 · 17:30' },
  { kind: 'earnings', day: 0, title: 'ICICIBANK', detail: 'Q1 results · board meeting' },
  { kind: 'earnings', day: 1, title: 'INFY', detail: 'Q1 results · 15:00' },
  { kind: 'earnings', day: 2, title: 'HDFCBANK', detail: 'Q1 results' },
  { kind: 'earnings', day: 4, title: 'RELIANCE', detail: 'Q1 results · 18:00' },
  { kind: 'earnings', day: 6, title: 'TCS', detail: 'Q1 results · 16:30' },
  { kind: 'earnings', day: 7, title: 'LT', detail: 'Q1 results' },
];

export function seedCalendar() {
  let created = 0;

  const ipoExists = db.prepare('SELECT 1 FROM ipos LIMIT 1');
  if (!ipoExists.get()) {
    const insert = db.prepare(`
      INSERT INTO ipos (name, code, open_date, close_date, price_low, price_high, lot_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const i of IPO_SEED) {
      insert.run(
        i.name,
        i.code,
        i.open === null ? null : shift(i.open),
        i.close === null ? null : shift(i.close),
        i.low,
        i.high,
        i.lot,
      );
      created += 1;
    }
  }

  const eventExists = db.prepare('SELECT 1 FROM calendar_events LIMIT 1');
  if (!eventExists.get()) {
    const insert = db.prepare(
      'INSERT INTO calendar_events (kind, event_date, title, detail) VALUES (?, ?, ?, ?)',
    );
    for (const e of EVENT_SEED) {
      insert.run(e.kind, shift(e.day), e.title, e.detail);
      created += 1;
    }
  }

  return created;
}

/** open | upcoming | closed | announced — computed, never read from a column. */
function statusOf(row, today) {
  if (!row.open_date || !row.close_date) return 'announced';
  if (today < row.open_date) return 'upcoming';
  if (today > row.close_date) return 'closed';
  return 'open';
}

const fmt = (isoDate) => {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};

export function calendarFor(today = iso(new Date())) {
  const ipos = db
    .prepare('SELECT * FROM ipos ORDER BY open_date IS NULL, open_date, name')
    .all()
    .map((row) => ({
      name: row.name,
      code: row.code,
      exchange: row.exchange,
      status: statusOf(row, today),
      openDate: row.open_date,
      closeDate: row.close_date,
      window:
        row.open_date && row.close_date
          ? `${fmt(row.open_date)} – ${fmt(row.close_date)}`
          : 'To be announced',
      priceBand:
        row.price_low && row.price_high ? `₹${row.price_low}–${row.price_high}` : 'Price band awaited',
      lotSize: row.lot_size,
    }))
    // Closed issues are history; the panel is about what can still be applied to.
    .filter((i) => i.status !== 'closed');

  const events = db
    .prepare('SELECT * FROM calendar_events WHERE event_date >= ? ORDER BY event_date, id')
    .all(today)
    .map((row) => ({
      kind: row.kind,
      date: row.event_date,
      dateLabel: fmt(row.event_date),
      isToday: row.event_date === today,
      title: row.title,
      detail: row.detail,
    }));

  return {
    today,
    ipos,
    economic: events.filter((e) => e.kind === 'economic'),
    earnings: events.filter((e) => e.kind === 'earnings'),
  };
}
