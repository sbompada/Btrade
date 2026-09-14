import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

const TOOLS = [
  {
    title: 'Market orders',
    path: '/dashboard',
    link: 'Open dashboard',
    description: 'Place an immediate buy or sell order from an instrument in your watchlist.',
    steps: [
      'Select B or S beside an instrument in the watchlist.',
      'Choose the product: CNC or MIS for NSE instruments, and NRML or MIS for derivatives and commodities.',
      'Enter a whole-number quantity and review the estimated value.',
      'Submit the order and confirm the filled quantity, average price, product, and order number.',
    ],
  },
  {
    title: 'Good till triggered orders',
    path: '/orders/gtt',
    link: 'Open GTT',
    description: 'Keep a single buy or sell trigger active, or pair a sell stop and target as OCO.',
    steps: [
      'Choose Single trigger for a buy or sell condition, or OCO for paired sell exits.',
      'Enter trigger and limit prices, then set the quantity.',
      'The replay feed monitors active GTTs and places the applicable limit order when triggered.',
      'An OCO pauses after one leg triggers, preventing the other leg from being placed.',
    ],
  },
  {
    title: 'Order baskets',
    path: '/orders/baskets',
    link: 'Open baskets',
    description: 'Build and execute a named group containing up to 20 orders.',
    steps: [
      'Enter a basket name between 2 and 40 characters.',
      'Add each instrument, side, product, and quantity as a separate order.',
      'Preview the development margin estimate before execution.',
      'Execute, clone, minimise, or retry only rejected orders from the basket list.',
    ],
  },
  {
    title: 'Basket SIPs',
    path: '/orders/sip',
    link: 'Open SIPs',
    description: 'Schedule a saved basket to execute weekly or monthly against the replay feed.',
    steps: [
      'Create the basket of orders you want to repeat.',
      'Name the SIP and select that basket.',
      'Choose a weekly or monthly frequency, next date, and preferred time.',
      'The schedule advances after each replay execution attempt and retains recent run history.',
    ],
  },
  {
    title: 'Price alerts',
    path: '/orders/alerts',
    link: 'Open alerts',
    description: 'Monitor replay price or percentage change against a named condition.',
    steps: [
      'Name the alert and select an instrument.',
      'Choose last traded price or change percentage, ABOVE or BELOW, and a value.',
      'When the replay value matches, the alert records its trigger and pauses automatically.',
    ],
  },
];

export default function AdvancedOrdersGuide() {
  return (
    <main className="policy-page help-article-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/support" className="btn ghost">Back to support</Link>
      </header>

      <article className="help-article advanced-orders-guide">
        <div className="help-article-heading">
          <span className="eyebrow">Orders and positions</span>
          <h1>Advanced order tools on uni-share</h1>
          <p>Updated 13 September 2026</p>
        </div>

        <p className="help-article-lead">
          uni-share groups regular market orders and reusable order tools under the Orders workspace.
          This guide explains what the current application supports and how to configure each tool.
        </p>

        <div className="notice warning" role="note">
          This development version uses replay prices rather than executable market quotes. Active GTTs,
          SIPs, and alerts are evaluated only while the API and replay feed are running. Basket margins are
          estimates and triggered tools place simulated orders in the development order book.
        </div>

        {TOOLS.map((tool) => (
          <section key={tool.title}>
            <div className="help-section-title">
              <h2>{tool.title}</h2>
              <Link className="chip" to={tool.path}>{tool.link}</Link>
            </div>
            <p>{tool.description}</p>
            <ol>
              {tool.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </section>
        ))}

        <section>
          <h2>Reviewing orders</h2>
          <p>
            Open Orders to search executed orders and filter them by today, the last seven days, or
            all available records. You can also download the visible rows as CSV or generate the
            development contract note for the current result set.
          </p>
        </section>

        <section>
          <h2>Before placing an order</h2>
          <ul>
            <li>Confirm the instrument, side, product, quantity, and estimated value.</li>
            <li>Check available funds and current positions rather than relying on a saved tool.</li>
            <li>Remember that replay prices are demonstration data and are not executable market quotes.</li>
            <li>Review every confirmation and report an unexpected record through the Support Centre.</li>
          </ul>
        </section>

        <div className="help-article-actions">
          <Link to="/orders" className="btn primary">Open orders</Link>
          <Link to="/support" className="btn ghost">Support centre</Link>
        </div>
      </article>
    </main>
  );
}