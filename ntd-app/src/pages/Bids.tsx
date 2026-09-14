import { useEffect, useMemo, useState, type FormEvent } from 'react';
import AppShell from '../components/AppShell';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { ApiError, bidsApi, type BidApplication, type BidIssue } from '../lib/api';
import { num } from '../lib/format';

type View = 'issues' | 'applications';

function BidTicket({ issue, application, onClose, onComplete }: { issue: BidIssue; application?: BidApplication; onClose: () => void; onComplete: () => void }) {
  const { token } = useAuth();
  const [lots, setLots] = useState(application?.lots ?? 1);
  const [price, setPrice] = useState(application?.price ?? issue.priceHigh ?? 0);
  const [isCutoff, setIsCutoff] = useState(application?.isCutoff ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quantity = lots * (issue.lotSize ?? 0);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await bidsApi.place(token, { issueId: issue.id, lots, price, isCutoff });
      onComplete();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not submit the bid.');
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="order-ticket" role="dialog" aria-modal="true" aria-labelledby="bid-title">
      <div className="order-ticket-head"><div><strong id="bid-title">{application ? 'Modify' : 'Apply for'} {issue.name}</strong><span>{issue.exchange} · {issue.code}</span></div><button onClick={onClose} aria-label="Close bid ticket">×</button></div>
      <form onSubmit={submit}>
        <div className="order-fields">
          <label><span>Lots</span><input aria-label="Lots" type="number" min="1" max="50" step="1" value={lots} onChange={(event) => setLots(Number(event.target.value))} autoFocus /></label>
          <label><span>Bid price</span><input aria-label="Bid price" type="number" min={issue.priceLow ?? 0} max={issue.priceHigh ?? 0} step="0.01" value={isCutoff ? issue.priceHigh ?? price : price} disabled={isCutoff} onChange={(event) => setPrice(Number(event.target.value))} /></label>
        </div>
        <label className="bid-cutoff"><input type="checkbox" checked={isCutoff} onChange={(event) => setIsCutoff(event.target.checked)} /><span>Apply at cutoff price</span></label>
        <div className="bid-ticket-summary"><span>{quantity} shares</span><span className="num">₹{num(quantity * (isCutoff ? issue.priceHigh ?? price : price))}</span></div>
        <span className="bid-note">Price band ₹{num(issue.priceLow ?? 0)}–₹{num(issue.priceHigh ?? 0)} · {issue.lotSize} shares per lot</span>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn primary block" disabled={submitting || lots < 1 || price <= 0}>{submitting ? 'Submitting…' : application ? 'Update application' : 'Submit application'}</button>
      </form>
    </section>
  </div>;
}

export default function Bids() {
  const { token } = useAuth();
  const [view, setView] = useState<View>('issues');
  const [issues, setIssues] = useState<BidIssue[]>([]);
  const [bids, setBids] = useState<BidApplication[]>([]);
  const [query, setQuery] = useState('');
  const [ticket, setTicket] = useState<BidIssue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    try {
      const book = await bidsApi.get(token);
      setIssues(book.issues);
      setBids(book.bids);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load bids.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    bidsApi.get(token)
      .then((book) => {
        if (cancelled) return;
        setIssues(book.issues);
        setBids(book.bids);
        setError(null);
      })
      .catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : 'Could not load bids.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [token]);

  const filteredIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return issues.filter((issue) => !needle || `${issue.name} ${issue.code} ${issue.exchange}`.toLowerCase().includes(needle));
  }, [issues, query]);
  const activeBids = bids.filter((bid) => bid.status === 'SUBMITTED');

  const cancel = async (bid: BidApplication) => {
    if (!token) return;
    setError(null);
    try {
      await bidsApi.cancel(token, bid.id);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not cancel the application.');
    }
  };

  return <AppShell tabs={['IPOs', 'My applications']} activeTab={view === 'issues' ? 'IPOs' : 'My applications'} onTabChange={(tab) => setView(tab === 'IPOs' ? 'issues' : 'applications')}>
    <div className="grid-4">
      <div className="tile"><span className="tile-label">OPEN ISSUES</span><span className="tile-value num">{issues.filter((issue) => issue.status === 'open').length}</span><span>Accepting applications</span></div>
      <div className="tile"><span className="tile-label">UPCOMING</span><span className="tile-value num">{issues.filter((issue) => issue.status !== 'open').length}</span><span>Upcoming and announced</span></div>
      <div className="tile"><span className="tile-label">ACTIVE BIDS</span><span className="tile-value num">{activeBids.length}</span><span>Your submitted applications</span></div>
      <div className="tile"><span className="tile-label">BLOCKED AMOUNT</span><span className="tile-value num">₹{num(activeBids.reduce((sum, bid) => sum + bid.amount, 0))}</span><span>Via UPI mandate</span></div>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    <section className="panel">
      <div className="panel-head"><div><span className="panel-title">{view === 'issues' ? 'IPO issues' : 'My applications'}</span><span className="panel-count num"> ({view === 'issues' ? filteredIssues.length : bids.length})</span></div>{view === 'issues' && <div className="panel-actions"><div className="chip input"><Icon.Search /><input aria-label="Search IPOs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search IPOs" /></div></div>}</div>
      {loading ? <div className="stub"><span>Loading IPO bids…</span></div> : view === 'issues' ? <div className="bid-grid">{filteredIssues.map((issue) => {
        const application = bids.find((bid) => bid.issueId === issue.id && bid.status === 'SUBMITTED');
        return <article className="bid-card" key={issue.id}><div className="bid-card-head"><div><strong>{issue.name}</strong><span>{issue.code} · {issue.exchange}</span></div><span className={`tag calendar-status ${issue.status}`}>{issue.status}</span></div><div className="bid-terms"><div><span>PRICE BAND</span><strong className="num">{issue.priceLow ? `₹${num(issue.priceLow)}–₹${num(issue.priceHigh ?? 0)}` : 'Awaited'}</strong></div><div><span>LOT SIZE</span><strong className="num">{issue.lotSize ? `${issue.lotSize} shares` : 'Awaited'}</strong></div><div><span>ISSUE WINDOW</span><strong>{issue.openDate && issue.closeDate ? `${issue.openDate} to ${issue.closeDate}` : 'TBA'}</strong></div></div><button className={application ? 'btn ghost block' : 'btn primary block'} disabled={issue.status !== 'open'} onClick={() => setTicket(issue)}>{application ? 'Modify application' : issue.status === 'open' ? 'Apply' : 'Not open yet'}</button></article>;
      })}{!filteredIssues.length && <div className="stub"><span>No IPOs match “{query}”.</span></div>}</div> : bids.length ? <div className="bid-applications"><div className="bid-application-head"><span>ISSUE</span><span>QTY</span><span>PRICE</span><span>AMOUNT</span><span>STATUS</span><span /></div>{bids.map((bid) => {
        const issue = issues.find((item) => item.id === bid.issueId);
        const canModify = bid.status === 'SUBMITTED' && issue?.status === 'open';
        return <div className="bid-application-row" key={bid.id}><div><strong>{bid.name}</strong><span>{bid.code} · {bid.lots} lot{bid.lots === 1 ? '' : 's'}</span></div><span className="num">{bid.quantity}</span><span className="num">{bid.isCutoff ? 'Cutoff' : `₹${num(bid.price)}`}</span><span className="num">₹{num(bid.amount)}</span><span className={`tag bid-status ${bid.status.toLowerCase()}`}>{bid.status}</span><div className="bid-row-actions"><button className="chip" disabled={!canModify} onClick={() => issue && setTicket(issue)}>Modify</button><button className="chip" disabled={!canModify} onClick={() => void cancel(bid)}>Cancel</button></div></div>;
      })}</div> : <div className="stub"><strong>No applications yet</strong><span>Apply to an open IPO to see it here.</span></div>}
    </section>
    {ticket && <BidTicket issue={ticket} application={bids.find((bid) => bid.issueId === ticket.id && bid.status === 'SUBMITTED')} onClose={() => setTicket(null)} onComplete={() => { setTicket(null); setView('applications'); void load(); }} />}
  </AppShell>;
}