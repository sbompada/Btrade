import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useCalendar, type CalendarEvent, type Ipo } from '../market/useCalendar';

type Tab = 'ipos' | 'economic' | 'earnings';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ipos', label: 'IPOs' },
  { key: 'economic', label: 'Economic' },
  { key: 'earnings', label: 'Earnings' },
];

function IpoRow({ ipo }: { ipo: Ipo }) {
  return (
    <div className="calendar-row">
      <div className="calendar-primary">
        <span>{ipo.name}</span>
        <span className="wl-exch">{ipo.code} · {ipo.exchange}</span>
      </div>
      <span className={`tag calendar-status ${ipo.status}`}>{ipo.status}</span>
      <span>{ipo.priceBand}</span>
      <span className="num">{ipo.lotSize ? `${ipo.lotSize} shares` : '—'}</span>
      <span>{ipo.window}</span>
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <div className="calendar-event-row">
      <div className="calendar-date">
        <span className={event.isToday ? 'up' : ''}>{event.isToday ? 'Today' : event.dateLabel}</span>
        <span className="num">{event.date}</span>
      </div>
      <div className="calendar-primary">
        <span>{event.title}</span>
        <span>{event.detail || 'Details awaited'}</span>
      </div>
    </div>
  );
}

export default function Calendar() {
  const { calendar, loading } = useCalendar();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: Tab = requested === 'economic' || requested === 'earnings' ? requested : 'ipos';
  const open = calendar?.ipos.filter((ipo) => ipo.status === 'open').length ?? 0;
  const upcoming = (calendar?.ipos.length ?? 0) - open;

  return (
    <AppShell tabs={['Calendar']}>
      <div className="calendar-title">
        <div>
          <h1>Market calendar</h1>
          <span>Issues, economic releases and earnings scheduled from {calendar?.today ?? 'today'}.</span>
        </div>
        <div className="calendar-counts">
          <span><strong className="num">{open}</strong> open IPOs</span>
          <span><strong className="num">{upcoming}</strong> upcoming</span>
          <span><strong className="num">{(calendar?.economic.length ?? 0) + (calendar?.earnings.length ?? 0)}</strong> events</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head calendar-tabs">
          {TABS.map(({ key, label }) => (
            <button key={key} className={tab === key ? 'chip range active' : 'chip range'} onClick={() => setSearchParams({ tab: key })}>
              {label}
              <span className="num">
                {key === 'ipos' ? calendar?.ipos.length ?? 0 : calendar?.[key].length ?? 0}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="stub"><span>Loading calendar…</span></div>
        ) : tab === 'ipos' ? (
          calendar?.ipos.length ? (
            <div className="table-scroll">
              <div className="calendar-head">
                <span>ISSUE</span><span>STATUS</span><span>PRICE BAND</span><span>LOT SIZE</span><span>WINDOW</span>
              </div>
              {calendar.ipos.map((ipo) => <IpoRow key={ipo.code} ipo={ipo} />)}
            </div>
          ) : <div className="stub"><span>No IPOs open or announced.</span></div>
        ) : (
          calendar?.[tab].length ? (
            <div>{calendar[tab].map((event) => <EventRow key={`${event.date}-${event.title}`} event={event} />)}</div>
          ) : <div className="stub"><span>Nothing scheduled.</span></div>
        )}
      </section>
    </AppShell>
  );
}