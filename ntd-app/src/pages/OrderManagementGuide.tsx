import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

export default function OrderManagementGuide() {
  return (
    <main className="policy-page help-article-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/support" className="btn ghost">Back to support</Link>
      </header>

      <article className="help-article order-management-guide">
        <div className="help-article-heading">
          <span className="eyebrow">Orders and positions</span>
          <h1>Order management</h1>
          <p>Updated 14 September 2026</p>
        </div>

        <p className="help-article-lead">
          Use the uni-share order ticket to place market orders, then review fills and their effect
          on positions from the Orders workspace.
        </p>

        <div className="notice warning" role="note">
          uni-share is currently a development trading environment. Orders fill immediately against
          replay prices or wait for replay trigger conditions and are not transmitted to an exchange.
          Cover Order protective legs are recorded but are not automatically executed as exchange
          stop orders.
        </div>

        <section>
          <h2>Place an order</h2>
          <ol>
            <li>Open Dashboard and find the instrument in a watchlist.</li>
            <li>Select B to buy or S to sell.</li>
            <li>Review the instrument, exchange, replay price, and order side.</li>
            <li>Drag the ticket header to reposition it, or minimise it while reviewing the workspace.</li>
            <li>Select the product, order type, and a whole-number quantity from 1 to 100,000.</li>
            <li>For Limit, SL, or SL-M, enter the required price and trigger fields.</li>
            <li>Check the estimated value, then submit the order.</li>
            <li>Confirm whether the order completed or entered the order book as pending.</li>
          </ol>
          <Link className="chip" to="/dashboard">Open dashboard</Link>
        </section>

        <section>
          <h2>Order types</h2>
          <dl className="order-product-list">
            <div><dt>MARKET</dt><dd>Executes immediately at the current replay price.</dd></div>
            <div><dt>LIMIT</dt><dd>Waits until replay price reaches or improves on the entered limit.</dd></div>
            <div><dt>SL</dt><dd>Requires a trigger and limit; executes only when both conditions are marketable.</dd></div>
            <div><dt>SL-M</dt><dd>Becomes a replay market order when its trigger is reached.</dd></div>
          </dl>
          <p>
            Buy stop triggers must be above the current price and sell stop triggers below it.
            Pending orders can be modified or cancelled from the order book before execution. Market
            orders for stock options and SL-M orders for index options are blocked in line with the
            documented impact-risk controls.
          </p>
        </section>

        <section>
          <h2>Product labels</h2>
          <p>
            The order ticket records one of the following product labels. In this development build,
            they classify the position but do not apply real broker margin or square-off rules.
          </p>
          <dl className="order-product-list">
            <div><dt>CNC</dt><dd>Delivery-intent label available for NSE and BSE cash equities.</dd></div>
            <div><dt>MIS</dt><dd>Intraday-intent label available across supported exchanges.</dd></div>
            <div><dt>NRML</dt><dd>Carry-forward-intent label for supported derivatives and commodities.</dd></div>
          </dl>
        </section>

        <section>
          <h2>Cover Orders</h2>
          <p>
            Cover Order (CO) is available for NSE equity instruments. Selecting CO fixes the product
            to MIS and requires a protective stop-loss trigger: below the replay entry for a buy, or
            above it for a sell.
          </p>
          <p>
            A Market CO entry fills immediately. A Limit CO entry waits for its limit condition.
            The protective trigger is stored with the completed entry, but this development feed
            does not automatically execute that second leg, so it is not live exchange protection.
          </p>
        </section>

        <section>
          <h2>AMO, Iceberg, and sticky window</h2>
          <ul>
            <li>After Market Orders remain AMO PENDING until the first replay tick on a later calendar day, then enter the normal Market, Limit, SL, or SL-M lifecycle.</li>
            <li>Iceberg orders split quantity into 2 to 10 legs. Equity Icebergs require at least ₹1,00,000 in order value, and one slice fills on each matching replay tick until complete.</li>
            <li>Sticky window is saved per client in this browser. It retains the ticket and its attributes after submission so another order can be placed quickly.</li>
          </ul>
          <p>AMO and Iceberg are available for regular orders, not Cover Orders.</p>
        </section>

        <section>
          <h2>Order lifecycle</h2>
          <ol>
            <li>The server verifies the session, instrument, side, product, variety, quantity, and any CO trigger.</li>
            <li>The latest replay quote becomes the fill price.</li>
            <li>The order is recorded with a COMPLETE status.</li>
            <li>A marketable quantity updates the matching position; pending quantities wait for replay ticks.</li>
            <li>The record appears in Orders with COMPLETE, OPEN, TRIGGER PENDING, AMO PENDING, or CANCELLED status.</li>
          </ol>
        </section>

        <section>
          <h2>Review and find orders</h2>
          <p>
            Open Orders to view completed and pending records. Search by instrument, exchange, side,
            product, variety, status, or time. Pending orders show Edit and Cancel. Edit can change
            quantity, limit or trigger values, and DAY or minute validity. Use the period control to
            show today, the last seven days, or all loaded records.
          </p>
          <p>
            Each row shows the execution time, side, instrument, product, filled quantity, average
            price, and final status. Expand Trades to inspect each persisted fill, including individual
            Iceberg slices and their order numbers.
          </p>
          <Link className="chip" to="/orders">Open orders</Link>
        </section>

        <section>
          <h2>Exports and contract notes</h2>
          <p>
            Download exports the currently filtered rows as CSV. Contract note generates a local
            development HTML document from the same result set. These files are demonstration records
            and are not exchange-issued or legally valid contract notes.
          </p>
        </section>

        <section>
          <h2>Managing open exposure</h2>
          <p>
            Orders update Positions immediately. Review the current quantity, average price, last
            traded price, and unrealised profit or loss there. Select one or more rows and choose
            Exit selected to close them together at current server-owned replay prices. The exits
            are applied atomically: if any selected position is stale or invalid, none are changed.
          </p>
          <Link className="chip" to="/positions">Open positions</Link>
        </section>

        <section>
          <h2>Validation and rejected requests</h2>
          <p>An order request is rejected when:</p>
          <ul>
            <li>The selected instrument has no current replay quote.</li>
            <li>The side or product is not supported.</li>
            <li>A Cover Order is not NSE equity with MIS, or its trigger is on the wrong side of the entry.</li>
            <li>A stock-option market order or index-option SL-M order uses a blocked order type.</li>
            <li>An equity Iceberg is below ₹1,00,000 or uses fewer than 2 or more than 10 legs.</li>
            <li>The quantity is not a whole number between 1 and 100,000.</li>
            <li>The session has expired or too many requests are submitted in a short period.</li>
          </ul>
          <p>
            Review the message in the order ticket, correct the input, and submit again. Do not repeat
            a request if its earlier confirmation is uncertain; check Orders first.
          </p>
        </section>

        <section>
          <h2>Related tools</h2>
          <p>
            GTTs, baskets, SIPs, and alerts are managed separately from completed orders. In this
            development version active tools are evaluated by the replay engine. GTTs expire after
            one year, stock SIPs accept CNC cash-equity baskets, and configured platform limits apply.
          </p>
          <Link className="chip" to="/support/advanced-order-tools">Read the advanced order tools guide</Link>
        </section>

        <div className="help-article-actions">
          <Link to="/orders" className="btn primary">Open orders</Link>
          <Link to="/support" className="btn ghost">Support centre</Link>
        </div>
      </article>
    </main>
  );
}