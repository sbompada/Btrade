import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';

const SUPPORT = [
  ['Account access', 'Password, TOTP and profile assistance'],
  ['Orders and positions', 'Order status, positions and contract notes'],
  ['Funds and statements', 'Transfers, balances and ledger questions'],
  ['IPO and investments', 'IPO applications, mutual funds and SIP help'],
];

export default function HelpPage({ manual = false }: { manual?: boolean }) {
  return <AppShell tabs={[manual ? 'User manual' : 'Support']}>
    <section className="panel help-page">
      <div className="panel-head"><span className="panel-title">{manual ? 'uni-share user manual' : 'Support centre'}</span></div>
      {manual ? <div className="help-sections">
        <article><Icon.Search /><div><strong>Find instruments</strong><span>Use the watchlist search or Ctrl+K, then add an instrument to the active group.</span></div></article>
        <article><Icon.Doc /><div><strong>Place and track orders</strong><span>Use B/S from the watchlist, then review executions, GTTs, baskets, SIPs, and alerts under Orders.</span></div></article>
        <article><Icon.Bars /><div><strong>Monitor your account</strong><span>Holdings, Positions, Funds, and Reports combine account records with the replay market feed.</span></div></article>
        <article><Icon.Download /><div><strong>Export records</strong><span>Download CSV statements and reports using the Save As picker.</span></div></article>
      </div> : <div className="support-grid">
        <article><Icon.UserPlus /><div><strong>Multiple family accounts</strong><span>Keep simultaneous sessions separate in the same browser.</span></div><Link className="chip" to="/support/multiple-accounts">Read guide</Link></article>
        <article><Icon.Bars /><div><strong>Advanced order tools</strong><span>Market orders, GTTs, baskets, SIPs, alerts, and order history.</span></div><Link className="chip" to="/support/advanced-order-tools">Read guide</Link></article>
        <article><Icon.Doc /><div><strong>Order management</strong><span>Place orders, understand statuses, review fills, and manage exposure.</span></div><Link className="chip" to="/support/order-management">Read guide</Link></article>
        <article><Icon.Rupee /><div><strong>Funds management</strong><span>Balances, simulated transfers, margin values, and statements.</span></div><Link className="chip" to="/support/funds-management">Read guide</Link></article>
        <article><Icon.Equity /><div><strong>Portfolio management</strong><span>Holdings, positions, live P&amp;L, exposure, and day history.</span></div><Link className="chip" to="/support/portfolio-management">Read guide</Link></article>
        <article><Icon.Trend /><div><strong>Trade charting</strong><span>Analyse candlesticks, ranges, MACD, and RSI before placing an order.</span></div><Link className="chip" to="/support/trade-charting">Read guide</Link></article>
        <article><Icon.Search /><div><strong>Marketwatch</strong><span>Organise instruments, follow replay quotes, and open trading tools.</span></div><Link className="chip" to="/support/marketwatch">Read guide</Link></article>
        {SUPPORT.map(([title, detail]) => <article key={title}><Icon.LifeBuoy /><div><strong>{title}</strong><span>{detail}</span></div><button className="chip" onClick={() => window.location.href = `mailto:support@ntd.local?subject=${encodeURIComponent(title)}`}>Email support</button></article>)}
      </div>}
    </section>
  </AppShell>;
}