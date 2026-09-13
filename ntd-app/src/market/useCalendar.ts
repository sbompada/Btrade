import { useEffect, useState } from 'react';

export type Ipo = {
  name: string;
  code: string;
  exchange: string;
  status: 'open' | 'upcoming' | 'announced';
  window: string;
  priceBand: string;
  lotSize: number | null;
};

export type CalendarEvent = {
  kind: 'economic' | 'earnings';
  date: string;
  dateLabel: string;
  isToday: boolean;
  title: string;
  detail: string | null;
};

export type Calendar = {
  today: string;
  ipos: Ipo[];
  economic: CalendarEvent[];
  earnings: CalendarEvent[];
};

/**
 * Public data — no account involved, so no token. Status arrives already
 * derived from the server's date rather than being computed here, so two
 * clients in different timezones can't disagree about what is open.
 */
export function useCalendar() {
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/calendar')
      .then((r) => r.json())
      .then((data: Calendar) => !cancelled && setCalendar(data))
      .catch(() => !cancelled && setCalendar(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { calendar, loading };
}
