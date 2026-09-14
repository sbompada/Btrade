import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { istDateKey, istDateTime, istTime, num, signed, signedPct, signedRupees, toneOf, whole } from '../lib/format';
import { useFunds } from '../market/useFunds';
import { useHoldings } from '../market/useHoldings';
import { useMarket } from '../market/MarketDataContext';
import { usePortfolio } from '../market/usePortfolio';
import { DASHBOARD_PATHS, DASHBOARD_TABS, type DashboardTab } from './dashboardNavigation';

type ToolTab = Exclude<DashboardTab, 'Dashboard'>;
type ScreenerSort = 'change' | 'price' | 'symbol';
type MoveFilter = 'all' | 'gainers' | 'losers';
type ReportType = 'positions' | 'holdings' | 'funds';

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'up' | 'down' }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value num ${tone ?? ''}`}>{value}</span>
      <span className="tool-detail">{detail}</span>
    </div>
  );
}

function Screener() {
  const { quotes, connected, source } = useMarket();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState('ALL');
  const [sort, setSort] = useState<ScreenerSort>('change');
  const moveParam = searchParams.get('move');
  const move: MoveFilter = moveParam === 'gainers' || moveParam === 'losers' ? moveParam : 'all';

  const setMove = (value: MoveFilter) => {
    setSearchParams(value === 'all' ? {} : { move: value });
  };

  const exchanges = ['ALL', ...new Set([...quotes.values()].map((quote) => quote.exchange))];
  const needle = query.trim().toLowerCase();
  const rows = [...quotes.values()]
    .filter((quote) => !needle || quote.symbol.toLowerCase().includes(needle))
    .filter((quote) => exchange === 'ALL' || quote.exchange === exchange)
    .filter((quote) => move === 'all' || (move === 'gainers' ? quote.changePct > 0 : quote.changePct < 0))
    .sort((a, b) => {
      if (sort === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (sort === 'price') return b.ltp - a.ltp;
      return Math.abs(b.changePct) - Math.abs(a.changePct);
    });

  return (
    <>
      <section className="panel">
        <div className="panel-head tool-head">
          <div>
            <span className="panel-title">Market screener</span>
            <span className="panel-count num"> ({rows.length})</span>
          </div>
          <div className="tool-controls">
            <label className="tool-input">
              <Icon.Search />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search instrument" />
            </label>
            <select className="tool-select" value={exchange} onChange={(event) => setExchange(event.target.value)}>
              {exchanges.map((value) => <option key={value}>{value}</option>)}
            </select>
            {(['all', 'gainers', 'losers'] as MoveFilter[]).map((value) => (
              <button key={value} className={move === value ? 'chip range active' : 'chip range'} onClick={() => setMove(value)}>
                {value === 'all' ? 'All' : value === 'gainers' ? 'Gainers' : 'Losers'}
              </button>
            ))}
          </div>
        </div>
        <div className="tool-sort">
          <span>Sort by</span>
          {([['change', 'Move'], ['price', 'Price'], ['symbol', 'Name']] as [ScreenerSort, string][]).map(([key, label]) => (
            <button key={key} className={sort === key ? 'chip range active' : 'chip range'} onClick={() => setSort(key)}>{label}</button>
          ))}
          <span className={connected ? 'up' : ''} style={{ marginLeft: 'auto' }}>
            {connected ? (source === 'replay' ? 'Replay feed' : 'Live feed') : 'Feed reconnecting'}
          </span>
        </div>
        <div className="table-scroll">
          <div className="thead tool-table-row">
            <span>INSTRUMENT</span><span>EXCHANGE</span><span>LTP</span><span>CHANGE</span><span>CHANGE %</span><span>UPDATED</span>
          </div>
          {rows.map((quote) => (
            <div className="trow tool-table-row" key={quote.symbol}>
              <span className="tool-symbol">{quote.symbol}</span>
              <span><span className="tag">{quote.exchange}</span></span>
              <span className="num">{num(quote.ltp)}</span>
              <span className={`num ${toneOf(quote.change)}`}>{signed(quote.change)}</span>
              <span className={`num ${toneOf(quote.changePct)}`}>{signedPct(quote.changePct)}</span>
              <span className="num tool-muted">{istTime(quote.ts)}</span>
            </div>
          ))}
        </div>
        {rows.length === 0 && <div className="stub"><span>No instruments match these filters.</span></div>}
      </section>
    </>
  );
}

function ContributionRow({ label, value, scale }: { label: string; value: number; scale: number }) {
  const tone = toneOf(value);
  return (
    <div className="tool-contribution">
      <div><span>{label}</span><span className={`num ${tone}`}>{signedRupees(value)}</span></div>
      <div className="bar lg"><div style={{ width: `${Math.abs(value) / scale * 100}%`, background: tone === 'up' ? 'var(--up)' : 'var(--down)' }} /></div>
    </div>
  );
}

function Analytics() {
  const portfolio = usePortfolio();
  const holdings = useHoldings();
  const { funds } = useFunds();
  const grossExposure = portfolio.positions.reduce((sum, position) => sum + Math.abs(position.ltp * position.qty), 0);
  const maxPosition = Math.max(...portfolio.positions.map((position) => Math.abs(position.pnl)), 1);
  const maxHolding = Math.max(...holdings.holdings.map((holding) => holding.currentValue), 1);
  const available = funds?.equity?.availableMargin ?? 0;

  return (
    <>
      <div className="grid-4">
        <Metric label="DAY P&L" value={signedRupees(portfolio.dayPnl)} detail={`${portfolio.positions.length} open positions`} tone={toneOf(portfolio.dayPnl)} />
        <Metric label="PORTFOLIO VALUE" value={`₹${whole(holdings.currentValue)}`} detail={`${holdings.count} holdings`} />
        <Metric label="GROSS EXPOSURE" value={`₹${whole(grossExposure)}`} detail="absolute open notional" />
        <Metric label="AVAILABLE MARGIN" value={`₹${whole(available)}`} detail="equity segment" />
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><span className="panel-title">Position P&amp;L contribution</span></div>
          <div className="tool-list">
            {portfolio.positions.length ? portfolio.positions.map((position) => (
              <ContributionRow key={position.instrument} label={position.instrument} value={position.pnl} scale={maxPosition} />
            )) : <div className="stub"><span>No open positions</span></div>}
          </div>
          <div className="tfoot"><span>Total unrealised</span><span className={`num ${toneOf(portfolio.unrealised)}`}>{signedRupees(portfolio.unrealised)}</span></div>
        </section>
        <section className="panel">
          <div className="panel-head"><span className="panel-title">Holding allocation</span></div>
          <div className="tool-list">
            {[...holdings.holdings].sort((a, b) => b.currentValue - a.currentValue).slice(0, 8).map((holding) => (
              <div className="tool-contribution" key={holding.symbol}>
                <div><span>{holding.symbol}</span><span className="num">{holdings.currentValue ? `${(holding.currentValue / holdings.currentValue * 100).toFixed(1)}%` : '0.0%'}</span></div>
                <div className="bar lg"><div style={{ width: `${holding.currentValue / maxHolding * 100}%`, background: 'var(--blue)' }} /></div>
              </div>
            ))}
            {!holdings.holdings.length && <div className="stub"><span>No holdings</span></div>}
          </div>
          <div className="tfoot"><span>Overall return</span><span className={`num ${toneOf(holdings.pnl)}`}>{signedRupees(holdings.pnl)} · {signedPct(holdings.pnlPct)}</span></div>
        </section>
      </div>
    </>
  );
}

type Report = { headers: string[]; rows: (string | number)[][] };

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function Reports() {
  const portfolio = usePortfolio();
  const holdings = useHoldings();
  const { funds } = useFunds();
  const [type, setType] = useState<ReportType>('positions');

  const reports: Record<ReportType, Report> = {
    positions: {
      headers: ['Instrument', 'Exchange', 'Product', 'Quantity', 'Average', 'LTP', 'Unrealised P&L'],
      rows: portfolio.positions.map((position) => [position.instrument, position.exchange, position.product, position.qty, position.avg, position.ltp, position.pnl.toFixed(2)]),
    },
    holdings: {
      headers: ['Symbol', 'Exchange', 'Quantity', 'Average cost', 'LTP', 'Current value', 'Overall P&L'],
      rows: holdings.holdings.map((holding) => [holding.symbol, holding.exchange, holding.qty, holding.avgCost, holding.ltp, holding.currentValue.toFixed(2), holding.pnl.toFixed(2)]),
    },
    funds: {
      headers: ['Segment', 'Opening balance', 'Used margin', 'Available margin', 'Available cash', 'Collateral'],
      rows: [funds?.equity, funds?.commodity].filter((segment) => segment != null).map((segment) => [segment.segment, segment.openingBalance, segment.usedMargin, segment.availableMargin, segment.availableCash, segment.totalCollateral]),
    },
  };
  const report = reports[type];

  const download = () => {
    const csv = [report.headers, ...report.rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ntd-${type}-${istDateKey()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="panel-head tool-head">
        <div><span className="panel-title">Account reports</span><span className="panel-count num"> ({report.rows.length})</span></div>
        <div className="tool-controls">
          {(['positions', 'holdings', 'funds'] as ReportType[]).map((value) => (
            <button key={value} className={type === value ? 'chip range active' : 'chip range'} onClick={() => setType(value)}>{value[0].toUpperCase() + value.slice(1)}</button>
          ))}
          <button className="chip" onClick={download} disabled={!report.rows.length}><Icon.Download /> Download CSV</button>
        </div>
      </div>
      <div className="tool-report-meta"><span>Current account snapshot</span><span className="num">As of {istDateTime(new Date())}</span></div>
      <div className="table-scroll">
        <table className="report-table">
          <thead><tr>{report.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{report.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, cellIndex) => <td key={cellIndex} className={cellIndex > 2 ? 'num' : ''}>{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {!report.rows.length && <div className="stub"><span>No {type} data for this account.</span></div>}
    </section>
  );
}

export default function DashboardTool({ title }: { title: ToolTab }) {
  const navigate = useNavigate();

  return (
    <AppShell
      tabs={[...DASHBOARD_TABS]}
      activeTab={title}
      onTabChange={(tab) => navigate(DASHBOARD_PATHS[tab as DashboardTab])}
    >
      {title === 'Screener' && <Screener />}
      {title === 'Analytics' && <Analytics />}
      {title === 'Reports' && <Reports />}
    </AppShell>
  );
}