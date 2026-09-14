import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

const HOLDING_VALUES = [
  ['Quantity', 'The settled demo quantity held for the instrument.'],
  ['Average cost', 'The recorded average acquisition cost per unit.'],
  ['LTP', 'The latest available replay price, or average cost when no quote is available.'],
  ['Current value', 'Quantity multiplied by the latest displayed price.'],
  ['Overall P&L', 'Current value less the recorded invested amount.'],
  ['Net change', 'Overall profit or loss expressed as a percentage of cost.'],
  ["Day's change", 'Movement against the replay quote’s previous close.'],
];

export default function PortfolioManagementGuide() {
  return (
    <main className="policy-page help-article-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/support" className="btn ghost">Back to support</Link>
      </header>

      <article className="help-article portfolio-management-guide">
        <div className="help-article-heading">
          <span className="eyebrow">Holdings and positions</span>
          <h1>Portfolio Management</h1>
          <p>Updated 14 September 2026</p>
        </div>

        <p className="help-article-lead">
          uni-share separates settled holdings from open trading positions. Both views combine
          account records with replay quotes to show current values and profit or loss.
        </p>

        <div className="notice warning" role="note">
          This is a development portfolio using demonstration records and replay market prices. It
          is not connected to an exchange or depository. Settlement, CDSL authorization, corporate
          actions, and automatic square-off are not implemented.
        </div>

        <section>
          <h2>Holdings overview</h2>
          <p>
            Holdings contains settled demo stock records. The summary shows current value, invested
            amount, overall profit or loss, and the day&rsquo;s movement. Instruments with a pledged
            quantity are identified in the table.
          </p>
          <p>
            Sort holdings by value, profit or loss, day change, or instrument name. The current
            view can be downloaded as CSV. Select Details for available, pledged, invested, and
            current-value breakdowns. Exit places a market CNC sale and is limited to unpledged shares.
          </p>
          <p>T1 &amp; unsettled lists positive CNC positions separately from settled holdings.</p>
          <Link className="chip" to="/holdings">Open holdings</Link>
        </section>

        <section>
          <h2>Understand holding values</h2>
          <dl className="portfolio-value-list">
            {HOLDING_VALUES.map(([term, description]) => (
              <div key={term}><dt>{term}</dt><dd>{description}</dd></div>
            ))}
          </dl>
        </section>

        <section>
          <h2>Open positions</h2>
          <p>
            Positions are created and updated by completed market orders. Separate rows are
            maintained for each instrument and product. A positive quantity is long and a negative
            quantity is short.
          </p>
          <p>
            The table shows product, quantity, average entry price, latest replay price, unrealised
            profit or loss and return percentage, and optional day change. Use Convert to switch
            cash positions between MIS and CNC or derivative positions between MIS and NRML. Cover
            order positions cannot be converted.
          </p>
          <Link className="chip" to="/positions">Open positions</Link>
        </section>

        <section>
          <h2>Portfolio analytics</h2>
          <p>Select Analytics in Positions to review:</p>
          <ul>
            <li>Gross exposure across long and short positions.</li>
            <li>Total long exposure at current replay prices.</li>
            <li>Total absolute short exposure at current replay prices.</li>
            <li>Combined unrealised profit or loss.</li>
          </ul>
          <p>
            These values move with the replay feed. They are estimates for this development
            environment and should not be treated as broker ledger or tax values.
          </p>
        </section>

        <section>
          <h2>Position display settings</h2>
          <p>
            Open Settings in Positions to show or hide day change and optionally list losing
            positions first. These preferences are stored separately for the signed-in client on the
            current browser.
          </p>
        </section>

        <section>
          <h2>Reduce, close, or reverse a position</h2>
          <ol>
            <li>Note the instrument, product, direction, and open quantity in Positions.</li>
            <li>Open the same instrument from the watchlist.</li>
            <li>Place an opposite-side market order using the same product.</li>
            <li>Use a smaller quantity to reduce, the same quantity to close, or a larger quantity to reverse.</li>
            <li>Return to Positions and verify the updated quantity and average price.</li>
          </ol>
          <p>
            Using a different product creates or changes a separate position instead of closing the
            original product position.
          </p>
        </section>

        <section>
          <h2>Day history and downloads</h2>
          <p>
            Switch to Day&rsquo;s history in Positions to review today&rsquo;s completed order records.
            Both the current positions view and day history can be downloaded as CSV. Search filters
            are applied before the file is generated.
          </p>
        </section>

        <section>
          <h2>Holdings and positions are different</h2>
          <p>
            Holdings are independent settled demo records. Market orders update open positions but
            do not move CNC quantities into Holdings on a later settlement date. Likewise, selling a
            holding creates an immediate simulated market order and is not wired to a depository
            authorization flow.
          </p>
        </section>

        <section>
          <h2>Portfolio checks</h2>
          <ul>
            <li>Confirm that every position matches the expected instrument and product.</li>
            <li>Distinguish overall return from the current day&rsquo;s price movement.</li>
            <li>Review Funds after opening or closing exposure because margin values may change.</li>
            <li>Check Orders before repeating an action when confirmation is uncertain.</li>
          </ul>
        </section>

        <div className="help-article-actions">
          <Link to="/holdings" className="btn primary">Open holdings</Link>
          <Link to="/positions" className="btn ghost">Open positions</Link>
        </div>
      </article>
    </main>
  );
}