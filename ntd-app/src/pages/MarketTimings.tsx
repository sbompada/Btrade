import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useMarketTimings } from '../market/useMarketTimings';

export default function MarketTimings() {
  const navigate = useNavigate();
  const timings = useMarketTimings();
  const openCount = timings?.segments.filter((segment) => segment.isOpen).length ?? 0;
  const equity = timings?.segments.find((segment) => segment.id === 'nse-equity');

  return <AppShell tabs={['Market timings', 'Calendar']} activeTab="Market timings" onTabChange={(tab) => tab === 'Calendar' && navigate('/calendar')} withWatchlist={false}>
    <div className="grid-3 market-timing-summary">
      <div className="tile"><span className="tile-label">TRADING DAY</span><span className="tile-value">{timings ? timings.tradingDay ? 'Yes' : 'No' : '—'}</span><span>{timings?.dateLabel ?? 'Loading schedule…'}</span></div>
      <div className="tile"><span className="tile-label">EQUITY MARKET</span><span className={`tile-value ${timings?.equityOpen ? 'up' : ''}`}>{timings ? timings.equityOpen ? 'Open' : 'Closed' : '—'}</span><span>{equity?.next ?? 'Checking next transition…'}</span></div>
      <div className="tile"><span className="tile-label">OPEN SEGMENTS</span><span className="tile-value num">{timings ? `${openCount}/${timings.segments.length}` : '—'}</span><span>{timings?.clock ?? 'India Standard Time'}</span></div>
    </div>

    <section className="panel">
      <div className="panel-head"><div><span className="panel-title">Standard trading sessions</span><span className="panel-count"> · IST</span></div></div>
      {timings ? <div className="market-timing-list">
        <div className="market-timing-head"><span>EXCHANGE</span><span>SEGMENT</span><span>SESSION</span><span>STATUS</span><span>NEXT</span></div>
        {timings.segments.map((segment) => <div className="market-timing-row" key={segment.id}>
          <strong>{segment.exchange}</strong>
          <div><strong>{segment.segment}</strong><span>{segment.days}</span></div>
          <span className="num">{segment.open}–{segment.close}</span>
          <span className={`tag bid-status ${segment.isOpen ? 'submitted' : 'cancelled'}`}>{segment.isOpen ? 'OPEN' : 'CLOSED'}</span>
          <span>{segment.next}</span>
        </div>)}
      </div> : <div className="stub"><span>Loading exchange sessions…</span></div>}
    </section>

    <section className="panel market-timing-notes">
      <div className="panel-head"><span className="panel-title">Session notes</span></div>
      <ul>{timings?.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </section>
  </AppShell>;
}