import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCalendar, type CalendarEvent, type Ipo } from '../market/useCalendar';

type Tab = 'ipos' | 'economic' | 'earnings';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ipos', label: 'IPOs' },
  { key: 'economic', label: 'Economic' },
  { key: 'earnings', label: 'Earnings' },
];

function GroupLabel({ label, live }: { label: string; live?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '9px 12px 5px',
        borderTop: '1px solid var(--rule)',
      }}
    >
      <div
        className="status-dot"
        style={{ width: 5, height: 5, background: live ? 'var(--up)' : 'var(--faint)' }}
      />
      <span className="tile-label">{label}</span>
    </div>
  );
}

function IpoRow({ ipo }: { ipo: Ipo }) {
  return (
    <div className="trow sm" style={{ height: 34 }}>
      <div className="tname" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <span>
          {ipo.name} <span className="wl-exch">{ipo.code}</span>
        </span>
        <span className="num" style={{ fontSize: 9, color: 'var(--faint)' }}>
          {ipo.priceBand}
          {ipo.lotSize ? ` · ${ipo.lotSize} shares/lot` : ''}
        </span>
      </div>
      <span
        style={{
          fontSize: 10,
          color: ipo.status === 'announced' ? 'var(--dimmer)' : 'var(--text-3)',
          whiteSpace: 'nowrap',
        }}
      >
        {ipo.window}
      </span>
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  return (
    <div className="trow sm" style={{ height: 34 }}>
      <div className="tname" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        <span>{event.title}</span>
        {event.detail && (
          <span style={{ fontSize: 9, color: 'var(--faint)' }}>{event.detail}</span>
        )}
      </div>
      <span
        style={{
          fontSize: 10,
          color: event.isToday ? 'var(--amber)' : 'var(--text-3)',
          whiteSpace: 'nowrap',
        }}
      >
        {event.isToday ? 'Today' : event.dateLabel}
      </span>
    </div>
  );
}

export default function CalendarPanel() {
  const { calendar, loading } = useCalendar();
  const [tab, setTab] = useState<Tab>('ipos');

  const open = calendar?.ipos.filter((i) => i.status === 'open') ?? [];
  const upcoming = calendar?.ipos.filter((i) => i.status !== 'open') ?? [];
  const events = tab === 'economic' ? calendar?.economic : calendar?.earnings;

  return (
    <section className="panel">
      <div className="panel-head compact" style={{ gap: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={t.key === tab ? 'subnav-tab active' : 'subnav-tab'}
            style={{ height: 34 }}
            onClick={() => setTab(t.key)}
          >
            <span
              className="panel-title caps"
              style={{ color: t.key === tab ? 'var(--text)' : undefined }}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="stub" style={{ padding: '44px 0' }}>
          <span style={{ fontSize: 11 }}>Loading…</span>
        </div>
      ) : tab === 'ipos' ? (
        <div>
          {open.length > 0 && (
            <>
              <GroupLabel label="OPEN NOW" live />
              {open.map((i) => (
                <IpoRow key={i.code} ipo={i} />
              ))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <GroupLabel label="UPCOMING" />
              {upcoming.map((i) => (
                <IpoRow key={i.code} ipo={i} />
              ))}
            </>
          )}
          {open.length === 0 && upcoming.length === 0 && (
            <div className="stub" style={{ padding: '44px 0' }}>
              <span style={{ fontSize: 11 }}>No issues open or announced.</span>
            </div>
          )}
        </div>
      ) : (
        <div>
          {events && events.length > 0 ? (
            events.map((e) => <EventRow key={`${e.date}-${e.title}`} event={e} />)
          ) : (
            <div className="stub" style={{ padding: '44px 0' }}>
              <span style={{ fontSize: 11 }}>Nothing scheduled.</span>
            </div>
          )}
        </div>
      )}

      <div className="panel-foot">
        <Link to={`/calendar?tab=${tab}`}>Full calendar →</Link>
      </div>
    </section>
  );
}
