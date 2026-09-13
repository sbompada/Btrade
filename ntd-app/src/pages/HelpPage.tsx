import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';

const SUPPORT = [
  ['Account access', 'Password, TOTP and profile assistance'],
  ['Orders and positions', 'Order status, positions and contract notes'],
  ['Funds and statements', 'Transfers, balances and ledger questions'],
  ['Bids and investments', 'IPO bids, mutual funds and SIP help'],
];

export default function HelpPage({ manual = false }: { manual?: boolean }) {
  return <AppShell tabs={[manual ? 'User manual' : 'Support']}>
    <section className="panel help-page">
      <div className="panel-head"><span className="panel-title">{manual ? 'NTD user manual' : 'Support centre'}</span></div>
      {manual ? <div className="help-sections">
        <article><Icon.Search /><div><strong>Find instruments</strong><span>Use the watchlist search or Ctrl+K, then add an instrument to the active group.</span></div></article>
        <article><Icon.Doc /><div><strong>Place and track orders</strong><span>Use B/S from the watchlist, then review executions, GTTs, baskets, SIPs, and alerts under Orders.</span></div></article>
        <article><Icon.Bars /><div><strong>Monitor your account</strong><span>Holdings, Positions, Funds, and Reports combine account records with the replay market feed.</span></div></article>
        <article><Icon.Download /><div><strong>Export records</strong><span>Download CSV statements and reports using the Save As picker.</span></div></article>
      </div> : <div className="support-grid">
        {SUPPORT.map(([title, detail]) => <article key={title}><Icon.LifeBuoy /><div><strong>{title}</strong><span>{detail}</span></div><button className="chip" onClick={() => window.location.href = `mailto:support@ntd.local?subject=${encodeURIComponent(title)}`}>Email support</button></article>)}
      </div>}
    </section>
  </AppShell>;
}