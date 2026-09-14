import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

const BALANCES = [
  ['Available margin', 'Opening balance plus pay-ins and collateral, less payouts and used margin.'],
  ['Used margin', 'The total of SPAN, delivery margin, exposure, and options premium in this model.'],
  ['Available cash', 'Opening balance plus completed pay-ins, less requested payouts; collateral and used margin are shown separately.'],
  ['Withdrawable balance', 'Cash available after reserving current margin obligations. Collateral is excluded.'],
  ['Opening balance', 'Cash carried into the current account period.'],
  ['Pay-in', 'Funds added to the selected segment.'],
  ['Payout', 'Funds withdrawn from the selected segment.'],
  ['SPAN', 'A simulated risk-margin component derived from applicable open positions.'],
  ['Delivery margin', 'A simulated margin component associated with delivery obligations.'],
  ['Exposure', 'An additional simulated risk-margin component.'],
  ['Options premium', 'The premium component calculated from applicable option positions.'],
  ['Total collateral', 'The sum of liquid-fund and equity collateral values.'],
];

export default function FundsManagementGuide() {
  return (
    <main className="policy-page help-article-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/support" className="btn ghost">Back to support</Link>
      </header>

      <article className="help-article funds-management-guide">
        <div className="help-article-heading">
          <span className="eyebrow">Funds and statements</span>
          <h1>Funds Management</h1>
          <p>Updated 14 September 2026</p>
        </div>

        <p className="help-article-lead">
          The Funds workspace shows cash, collateral, and margin information separately for the
          equity and commodity segments. It also provides simulated transfers and an account-level
          fund statement.
        </p>

        <div className="notice warning" role="note">
          This development environment does not connect to UPI, a payment gateway, or a bank.
          Transfers simulate payment methods, fees, confirmation delays, and withdrawal cut-offs,
          but do not move real money or perform bank authentication.
        </div>

        <section>
          <h2>View your funds</h2>
          <ol>
            <li>Open Funds from the account menu.</li>
            <li>Review the Equity and Commodity panels independently.</li>
            <li>Check available margin before placing a new trade.</li>
            <li>Review used margin and its components when exposure changes.</li>
          </ol>
          <p>
            Margin values are recalculated from open positions and replay prices. The page refreshes
            those values periodically and after an order or fund movement.
          </p>
          <Link className="chip" to="/funds">Open funds</Link>
        </section>

        <section>
          <h2>Add funds</h2>
          <ol>
            <li>Select Add funds from the Funds page.</li>
            <li>Enter an amount greater than zero, up to ₹1,00,00,000.</li>
            <li>Select the Equity or Commodity segment.</li>
            <li>Choose UPI, net banking, IMPS, NEFT, or RTGS.</li>
            <li>Review the projected available cash and confirm.</li>
          </ol>
          <p>
            UPI is free and net banking carries a simulated ₹10.62 gateway fee; both credit the demo
            account immediately. IMPS, NEFT, and RTGS remain pending until their expected confirmation
            time, then credit the account exactly once. No UPI approval or bank authentication occurs.
          </p>
        </section>

        <section>
          <h2>Withdraw funds</h2>
          <ol>
            <li>Select Withdraw from the Funds page.</li>
            <li>Enter the amount and choose the source segment.</li>
            <li>Compare the request with the displayed withdrawable balance.</li>
            <li>Confirm to create a PAYOUT statement entry.</li>
          </ol>
          <p>
            The request immediately reserves the amount and remains pending for the simulated bank
            processing period. Requests before the modelled cut-off are expected in one business day;
            later requests use two business days. Real settlement balances are not available.
          </p>
        </section>

        <section>
          <h2>Understand the balance values</h2>
          <dl className="fund-value-list">
            {BALANCES.map(([term, description]) => (
              <div key={term}><dt>{term}</dt><dd>{description}</dd></div>
            ))}
          </dl>
        </section>

        <section>
          <h2>Review fund statements</h2>
          <p>
            Open Statements to review opening balances, pay-ins, and payouts. Each entry includes its
            date, segment, method, status, expected processing time, fee, reference, debit, and credit value.
          </p>
          <ol>
            <li>Filter by Equity, Commodity, or all segments.</li>
            <li>Filter by opening balance, pay-in, payout, or all entry types.</li>
            <li>Filter pending and completed entries.</li>
            <li>Optionally set From and To dates.</li>
            <li>Review total credits, total debits, and net movement for the filtered rows.</li>
          </ol>
          <Link className="chip" to="/funds/statements">Open statements</Link>
        </section>

        <section>
          <h2>Download a statement</h2>
          <p>
            Apply the required statement filters and select Download CSV. The exported file contains
            only the rows currently included by those filters. Review the file before using it for
            reconciliation; development exports are not bank or exchange statements.
          </p>
        </section>

        <section>
          <h2>Safety checks</h2>
          <ul>
            <li>Confirm the selected segment before every transfer.</li>
            <li>Do not treat collateral as withdrawable cash.</li>
            <li>Review statement entries after each simulated transfer.</li>
            <li>Report an unexpected balance or reference through the Support Centre.</li>
          </ul>
        </section>

        <div className="help-article-actions">
          <Link to="/funds" className="btn primary">Open funds</Link>
          <Link to="/support" className="btn ghost">Support centre</Link>
        </div>
      </article>
    </main>
  );
}