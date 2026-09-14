import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useMutualFunds, type MutualFundHolding } from '../market/useMutualFunds';
import { istDateKey, num, signedPct, signedRupees, toneOf, whole } from '../lib/format';

type SortKey = 'value' | 'pnl' | 'name';

const escapeCsv = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export default function MutualFunds() {
  const navigate = useNavigate();
  const portfolio = useMutualFunds();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('value');
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = portfolio.mutualFunds.filter((fund) => !needle || `${fund.name} ${fund.category} ${fund.folio}`.toLowerCase().includes(needle));
    const by: Record<SortKey, (left: MutualFundHolding, right: MutualFundHolding) => number> = {
      value: (left, right) => right.currentValue - left.currentValue,
      pnl: (left, right) => right.pnl - left.pnl,
      name: (left, right) => left.name.localeCompare(right.name),
    };
    return filtered.sort(by[sort]);
  }, [portfolio.mutualFunds, query, sort]);

  const download = () => {
    const csv = [['Scheme', 'Category', 'Folio', 'Units', 'Average NAV', 'Current NAV', 'Current value', 'P&L'], ...rows.map((fund) => [fund.name, fund.category, fund.folio, fund.units, fund.avgNav, fund.currentNav, fund.currentValue.toFixed(2), fund.pnl.toFixed(2)])]
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ntd-mutual-funds-${istDateKey()}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <AppShell tabs={['Holdings', 'Mutual funds']} activeTab="Mutual funds" onTabChange={(tab) => navigate(tab === 'Holdings' ? '/holdings' : '/mutual-funds')}>
      <div className="grid-4">
        <div className="tile"><span className="tile-label">CURRENT VALUE</span><span className="tile-value num">₹{whole(portfolio.currentValue)}</span><span>{portfolio.mutualFunds.length} schemes</span></div>
        <div className="tile"><span className="tile-label">INVESTED</span><span className="tile-value num">₹{whole(portfolio.invested)}</span></div>
        <div className="tile"><span className="tile-label">OVERALL P&amp;L</span><span className={`tile-value num ${toneOf(portfolio.pnl)}`}>{signedRupees(portfolio.pnl)}</span><span>{signedPct(portfolio.pnlPct)} on cost</span></div>
        <div className="tile"><span className="tile-label">DAY&rsquo;S CHANGE</span><span className={`tile-value num ${toneOf(portfolio.dayPnl)}`}>{signedRupees(portfolio.dayPnl)}</span><span>Latest declared NAV</span></div>
      </div>

      {portfolio.error && <div className="notice error" role="alert">{portfolio.error}</div>}
      <section className="panel">
        <div className="panel-head">
          <div><span className="panel-title">Mutual funds</span><span className="panel-count num"> ({rows.length})</span></div>
          <div className="panel-actions">
            <div className="chip input"><Icon.Search /><input aria-label="Search mutual funds" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search schemes" /></div>
            {([['value', 'Value'], ['pnl', 'P&L'], ['name', 'Name']] as [SortKey, string][]).map(([value, label]) => <button key={value} className={sort === value ? 'chip range active' : 'chip range'} onClick={() => setSort(value)}>{label}</button>)}
            <button className="chip" onClick={download} disabled={!rows.length}><Icon.Download /> Download</button>
          </div>
        </div>
        <div className="mutual-fund-head"><span>SCHEME</span><span>UNITS</span><span>AVG. NAV</span><span>NAV</span><span>CUR. VALUE</span><span>P&amp;L</span></div>
        {portfolio.loading ? <div className="stub"><span>Loading mutual funds…</span></div> : rows.length ? rows.map((fund) => (
          <div className="mutual-fund-row" key={`${fund.schemeCode}-${fund.folio}`}>
            <div><strong>{fund.name}</strong><span>{fund.category} · Folio {fund.folio} · NAV {new Date(`${fund.navAsOf}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
            <span className="num">{num(fund.units)}</span><span className="num">{num(fund.avgNav)}</span><span className="num">{num(fund.currentNav)}</span><span className="num">₹{whole(fund.currentValue)}</span>
            <div><span className={`num ${toneOf(fund.pnl)}`}>{signedRupees(fund.pnl)}</span><span className={`num ${toneOf(fund.pnl)}`}>{signedPct(fund.pnlPct)}</span></div>
          </div>
        )) : <div className="stub"><strong>No mutual fund holdings</strong><span>Your purchased funds will appear here.</span></div>}
      </section>
    </AppShell>
  );
}