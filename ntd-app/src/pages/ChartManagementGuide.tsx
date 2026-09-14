import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

export default function ChartManagementGuide() {
  return (
    <main className="policy-page help-article-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/support" className="btn ghost">Back to support</Link>
      </header>

      <article className="help-article chart-management-guide">
        <div className="help-article-heading">
          <span className="eyebrow">Markets and analysis</span>
          <h1>Trade Charting</h1>
          <p>Updated 13 September 2026</p>
        </div>

        <p className="help-article-lead">
          Use uni-share charts to study replay market history with candlesticks, MACD, and RSI before
          opening an order ticket from the watchlist.
        </p>

        <div className="notice warning" role="note">
          Charts use demonstration candles and replay quotes. They are not exchange-authorised market
          data and must not be used as the sole basis for a trading decision.
        </div>

        <section>
          <h2>Open an instrument chart</h2>
          <ol>
            <li>Open a workspace that includes the watchlist.</li>
            <li>Find the required instrument.</li>
            <li>Select the chart icon, or open the instrument menu and select Chart.</li>
            <li>Use the close button in the chart toolbar to return to the previous workspace.</li>
          </ol>
          <p>
            The chart header shows the instrument, exchange, latest replay price, and current
            percentage change while a quote is available.
          </p>
          <Link className="chip" to="/dashboard">Open dashboard</Link>
        </section>

        <section>
          <h2>Choose a date range</h2>
          <p>The detailed instrument chart supports four ranges:</p>
          <dl className="chart-range-list">
            <div><dt>1D</dt><dd>Minute candles for the current replay trading day.</dd></div>
            <div><dt>1W</dt><dd>Daily candles for the recent weekly period.</dd></div>
            <div><dt>1M</dt><dd>Daily candles for the recent monthly period.</dd></div>
            <div><dt>1Y</dt><dd>Daily candles for the recent yearly period.</dd></div>
          </dl>
          <p>
            The chart displays up to the latest 90 candles returned for the selected range. Changing
            the range requests a new history set from the server.
          </p>
        </section>

        <section>
          <h2>Read the candlestick chart</h2>
          <p>
            Each candle represents open, high, low, and close values for one time bucket. A rising
            candle closes at or above its open; a falling candle closes below its open. The vertical
            wick covers the recorded high-to-low range.
          </p>
          <p>
            The chart rescales to the lowest and highest values currently visible. Because the axes
            are fitted to the selected data, compare absolute prices rather than judging movement
            only by the visual height of a candle.
          </p>
        </section>

        <section>
          <h2>MACD panel</h2>
          <p>
            The fixed MACD panel compares 12-period and 26-period exponential averages and displays
            a 9-period signal line. Histogram bars show the direction and relative size of the
            difference. uni-share does not currently allow these periods to be changed.
          </p>
        </section>

        <section>
          <h2>RSI panel</h2>
          <p>
            The fixed 14-period RSI panel maps recent gains and losses to a scale from 0 to 100. Guide
            lines are shown at 30 and 70. RSI is contextual information, not an instruction to buy or
            sell, and its period cannot currently be edited.
          </p>
        </section>

        <section>
          <h2>Market overview chart</h2>
          <p>
            The dashboard overview presents closing-price movement for the selected market index. It
            supports 1D, 1W, 1M, 1Y, and 5Y ranges, displays a price scale and time or date
            labels, and colours the series according to the selected period&rsquo;s direction.
          </p>
          <p>
            Intraday overview history refreshes periodically while the dashboard is open. Longer
            ranges use imported daily candles and may show an insufficient-history message until more
            trading days are available.
          </p>
        </section>

        <section>
          <h2>History and refresh behavior</h2>
          <ul>
            <li>The live quote in an instrument chart header continues to follow the replay feed.</li>
            <li>Instrument candles are fetched when the chart opens or its range changes.</li>
            <li>The 1D market overview refreshes its candle history periodically.</li>
            <li>Daily ranges depend on the market-history records imported into the development database.</li>
          </ul>
        </section>

        <section>
          <h2>Trade from a chart</h2>
          <p>
            Direct chart trading is not available in the current version of uni-share. Orders and
            positions are not plotted on the chart, and price markers cannot be dragged to place,
            modify, or cancel an order.
          </p>
          <p>
            To act on chart analysis, return to the watchlist, open the instrument&rsquo;s buy or sell
            ticket, review the order details, and submit it. Track the resulting order in Orders.
          </p>
          <Link className="chip" to="/support/order-management">Read the Order management guide</Link>
        </section>

        <section>
          <h2>Current chart limitations</h2>
          <p>
            This version provides a focused read-only chart. It does not currently support changing
            chart types, custom indicators, drawing tools, zoom or pan, instrument comparison,
            multi-chart layouts, or saved chart views.
          </p>
        </section>

        <div className="help-article-actions">
          <Link to="/dashboard" className="btn primary">Open charts</Link>
          <Link to="/support" className="btn ghost">Support centre</Link>
        </div>
      </article>
    </main>
  );
}