import { Link } from 'react-router-dom';
import * as Icon from '../components/Icons';

const SECTIONS = [
  {
    id: 'orders',
    title: '1. Orders and instructions',
    body: [
      'uni-share accepts orders and account instructions through the channels made available to each client. An instruction is treated as received only after it is accepted by our systems and an acknowledgement is generated.',
      'We may reject, pause, or require confirmation of an instruction where information is incomplete, limits are unavailable, a security concern exists, or execution could conflict with law, exchange rules, or our risk controls.',
    ],
  },
  {
    id: 'limits',
    title: '2. Trading limits and exposure',
    body: [
      'Trading limits depend on available funds, eligible collateral, market conditions, instrument liquidity, settlement obligations, and applicable risk parameters. Displayed limits may change during the trading day.',
      'uni-share may reduce exposure, restrict an instrument, or require additional funds without prior notice when reasonably necessary to manage market, settlement, concentration, or operational risk.',
    ],
  },
  {
    id: 'charges',
    title: '3. Brokerage, taxes, and charges',
    body: [
      'Brokerage and service charges are applied according to the tariff accepted by the client. Statutory levies, exchange charges, taxes, duties, and depository charges are applied at the rates in force on the transaction date.',
      'The applicable tariff and transaction records should be reviewed before placing an order. Any discrepancy should be reported through the support channel promptly.',
    ],
  },
  {
    id: 'payments',
    title: '4. Funds, securities, and delayed payments',
    body: [
      'Clients must maintain sufficient cleared funds and eligible securities to meet margin and settlement obligations. Credits that are pending, reversed, disputed, or subject to a banking hold may not be treated as available.',
      'Delayed payment charges may apply to overdue debit balances according to the agreed tariff and applicable regulation. uni-share may withhold payouts to the extent reasonably required to meet outstanding obligations.',
    ],
  },
  {
    id: 'risk',
    title: '5. Risk management and position closure',
    body: [
      'uni-share monitors positions against available margin and internal risk thresholds. If a shortfall or material risk arises, we may cancel pending orders, reduce positions, or close positions in accordance with applicable rules.',
      'Automated alerts are informational and may be delayed or unavailable. Clients remain responsible for monitoring positions and maintaining sufficient margin; an alert is not a guarantee that time will be available to add funds.',
    ],
  },
  {
    id: 'settlement',
    title: '6. Settlement and delivery obligations',
    body: [
      'Transactions are settled according to the relevant exchange, clearing corporation, and depository timelines. Clients must provide funds, securities, and instructions early enough for uni-share to complete those obligations.',
      'Short delivery, auction, close-out, penalties, and other settlement consequences will be handled under the rules applicable to the transaction and may be passed to the responsible client where permitted.',
    ],
  },
  {
    id: 'inactive',
    title: '7. Inactive and dormant accounts',
    body: [
      'An account may be marked inactive after the period prescribed by our approved internal policy or applicable regulation. Reactivation may require fresh identity, contact, financial, or consent verification.',
      'uni-share may also restrict an account while investigating suspected misuse, conflicting instructions, returned communications, or incomplete regulatory information.',
    ],
  },
  {
    id: 'communications',
    title: '8. Statements and communications',
    body: [
      'Contract notes, statements, margin information, notices, and service communications may be delivered electronically to the registered contact details. Clients should keep those details current and review communications promptly.',
      'Records displayed in the application are provided for convenience. Exchange records, depository records, contract notes, and the maintained books of account govern where a display is delayed or incomplete.',
    ],
  },
  {
    id: 'closure',
    title: '9. Suspension and account closure',
    body: [
      'A client may request account closure after open positions, balances, securities, disputes, and settlement obligations are resolved. uni-share may request documents or instructions needed to transfer remaining assets.',
      'We may suspend or close an account where required by law or where continued service creates material legal, security, credit, or operational risk. Required records may be retained after closure.',
    ],
  },
  {
    id: 'grievances',
    title: '10. Complaints and policy changes',
    body: [
      'Questions or complaints should first be submitted through the uni-share support channel with the relevant client ID, date, transaction reference, and supporting records. Escalation contacts and regulatory resolution channels will be published after compliance approval.',
      'This policy may be updated to reflect changes in services, regulation, exchange rules, or risk controls. Material changes will be communicated through an appropriate registered channel or application notice.',
    ],
  },
];

export default function PoliciesAndProcedures() {
  return (
    <main className="policy-page">
      <header className="policy-header">
        <Link to="/login" className="policy-brand" aria-label="uni-share sign in">
          <Icon.Logo size={22} />
          <span className="brand-word">uni-share</span>
        </Link>
        <Link to="/login" className="btn ghost">Back to sign in</Link>
      </header>

      <div className="policy-layout">
        <aside className="policy-nav" aria-label="On this page">
          <span>On this page</span>
          {SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
        </aside>

        <article className="policy-document">
          <div className="policy-title">
            <span className="eyebrow">Legal and compliance</span>
            <h1>Policies and Procedures</h1>
            <p>uni-share Broking Private Limited</p>
            <div className="notice warning" role="note">
              Draft pending legal and compliance approval. Broker registration details, charges,
              escalation contacts, and effective date must be approved before publication.
            </div>
            <dl className="policy-meta">
              <div><dt>Version</dt><dd>Draft 1.0</dd></div>
              <div><dt>Effective date</dt><dd>Pending approval</dd></div>
              <div><dt>Last reviewed</dt><dd>13 September 2026</dd></div>
            </dl>
          </div>

          <p className="policy-intro">
            This document describes the general operating policies applied to uni-share trading
            accounts. It should be read with the client agreement, tariff sheet, risk disclosure
            documents, exchange rules, and applicable law. If those documents conflict, the legally
            controlling document or rule prevails.
          </p>

          {SECTIONS.map((section) => (
            <section id={section.id} key={section.id} className="policy-section">
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}

          <footer className="policy-document-footer">
            <Icon.Logo size={18} />
            <span>uni-share · Policies and Procedures · Draft for review</span>
          </footer>
        </article>
      </div>
    </main>
  );
}