import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

export default function MarketwatchGuide() {
  return (
    <main className="policy-page help-article-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/support" className="btn ghost">Back to support</Link>
      </header>

      <article className="help-article marketwatch-guide">
        <div className="help-article-heading">
          <span className="eyebrow">Markets and instruments</span>
          <h1>Marketwatch</h1>
          <p>Updated 13 September 2026</p>
        </div>

        <p className="help-article-lead">
          Use Marketwatch to organise instruments, follow replay prices, inspect market depth, and
          open trading and analysis tools from one compact workspace.
        </p>

        <div className="notice warning" role="note">
          Marketwatch prices and depth use uni-share&rsquo;s demonstration replay feed. They are not
          exchange-authorised live data and must not be used as the sole basis for a trading decision.
        </div>

        <section>
          <h2>Open and switch watchlists</h2>
          <p>
            Marketwatch appears in the left sidebar of supported workspaces. Select a numbered tab
            to move between the seven default watchlists. The selected list shows its name and its
            current instrument count out of a maximum of 250.
          </p>
          <p>
            Watchlists are saved in this browser for the signed-in client ID. They do not sync to
            another browser or device.
          </p>
          <Link className="chip" to="/dashboard">Open dashboard</Link>
        </section>

        <section>
          <h2>Search and add an instrument</h2>
          <ol>
            <li>Select the Add instrument field or press Ctrl+K to focus it.</li>
            <li>Enter part of an available symbol.</li>
            <li>Select a result marked Add to include it in the active watchlist.</li>
          </ol>
          <p>
            An instrument already present in the active list is excluded from the results. Search is
            limited to instruments supplied by the current replay feed and the bundled market list.
          </p>
        </section>

        <section>
          <h2>Create and manage groups</h2>
          <p>
            Select the plus button beside the numbered watchlists, or New group below the instrument
            list, to create a named custom group. Names can contain up to 24 characters and must be
            unique. Custom groups can be deleted from their heading; the seven default groups cannot.
          </p>
          <p>
            Open an instrument&rsquo;s More actions menu to pin it to watchlist 1 or 2. Pinning adds the
            symbol to that list without removing it from the current one, provided the destination
            has space and does not already contain the symbol.
          </p>
        </section>

        <section>
          <h2>Read the instrument row</h2>
          <p>
            Each unselected row shows the symbol, exchange, last traded price (LTP), and percentage
            change. Colour indicates whether the current change is positive or negative. Values
            update when a new replay quote is received.
          </p>
          <p>
            Select a row to replace those quote columns with actions for buying, selling, market
            depth, charting, removal, and the extended instrument menu.
          </p>
        </section>

        <section>
          <h2>Buy, sell, and analyse</h2>
          <ul>
            <li>Select B or S to open an order ticket for the instrument.</li>
            <li>Select the chart icon to open its candlestick, MACD, and RSI view.</li>
            <li>Select the trash icon to remove it from only the active watchlist.</li>
            <li>Use More actions for notes, option chain, alerts and GTTs, fundamentals, and technicals.</li>
          </ul>
          <p>Some extended views use demonstration data and may not include every exchange field.</p>
        </section>

        <section>
          <h2>Market depth</h2>
          <p>
            Select the depth icon or Market depth in More actions to expand five bid and five offer
            levels below the instrument. Each side shows price, simulated order count, and quantity,
            followed by total quantities and replay open, previous close, low, and high values.
          </p>
          <p>
            Depth levels are generated for demonstration and are labelled Replay depth. They are not
            an exchange order book, and selecting a level does not populate an order ticket.
          </p>
        </section>

        <section>
          <h2>Current Marketwatch limitations</h2>
          <p>
            Instruments cannot currently be manually reordered or sorted by symbol, LTP, change, or
            exchange. uni-share also does not provide previous-close versus open-price settings,
            absolute-change display, global pinned instruments, keyboard row navigation, or watchlist
            switching shortcuts.
          </p>
        </section>

        <div className="help-article-actions">
          <Link to="/dashboard" className="btn primary">Open Marketwatch</Link>
          <Link to="/support/trade-charting" className="btn ghost">Trade charting guide</Link>
        </div>
      </article>
    </main>
  );
}