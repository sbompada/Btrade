import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

export default function MultipleAccountsHelp() {
  return (
    <main className="policy-page help-article-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/support" className="btn ghost">Back to support</Link>
      </header>

      <article className="help-article">
        <div className="help-article-heading">
          <span className="eyebrow">Account access</span>
          <h1>How to use multiple uni-share accounts in the same browser</h1>
          <p>Updated 13 September 2026</p>
        </div>

        <div className="notice info" role="note">
          A regular browser profile shares one uni-share session across its tabs. Signing in to a
          second account there replaces the first account&rsquo;s active browser session.
        </div>

        <section>
          <h2>Use separate browser profiles</h2>
          <p>
            Create one Chrome or Microsoft Edge profile for each family member. Each profile keeps
            its own cookies, local storage, history, and uni-share session.
          </p>
          <ol>
            <li>Open the profile menu in the browser toolbar.</li>
            <li>Select the option to add or create a profile.</li>
            <li>Give the profile a clear name, such as the account holder&rsquo;s first name.</li>
            <li>Open uni-share in that profile and let the account holder complete sign-in and TOTP verification.</li>
            <li>Repeat with a separate profile for each additional account.</li>
          </ol>
        </section>

        <section>
          <h2>Use Firefox Multi-Account Containers</h2>
          <p>
            Firefox users can install the Multi-Account Containers extension from Mozilla Add-ons.
            A container isolates site data while allowing multiple accounts in different tabs of the
            same Firefox window.
          </p>
          <ol>
            <li>Install Firefox Multi-Account Containers from the official Mozilla Add-ons website.</li>
            <li>Create a separate container for each account holder.</li>
            <li>Open a new tab in the required container.</li>
            <li>Visit uni-share and sign in to that account inside the container.</li>
          </ol>
          <p>Always reopen the account in its assigned container to keep sessions separate.</p>
        </section>

        <section>
          <h2>Use a private window for temporary access</h2>
          <p>
            A private or incognito window has storage separate from the normal browser window and can
            be used for a second account temporarily. Closing every private window usually ends that
            private browsing session, so a dedicated browser profile is better for regular use.
          </p>
        </section>

        <section>
          <h2>Account security</h2>
          <ul>
            <li>Each account holder should enter their own password and TOTP code.</li>
            <li>Check the client ID or initials in the top bar before placing an order.</li>
            <li>Do not save passwords on a shared or public computer.</li>
            <li>Sign out of every profile or container when access is no longer required.</li>
          </ul>
        </section>

        <div className="help-article-actions">
          <Link to="/login" className="btn primary">Go to sign in</Link>
          <Link to="/support" className="btn ghost">Support centre</Link>
        </div>
      </article>
    </main>
  );
}