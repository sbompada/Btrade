import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import FundTransferDialog from '../components/FundTransferDialog';
import * as Icon from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { useFunds } from '../market/useFunds';
import { fundsApi, type FundStatement, type FundsSegment } from '../lib/api';
import { istDateKey, istDateTime, num } from '../lib/format';

type SegmentFilter = 'all' | FundsSegment['segment'];
type KindFilter = 'all' | FundStatement['kind'];
type StatusFilter = 'all' | FundStatement['status'];

const escapeCsv = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

async function saveStatements(rows: FundStatement[]) {
  const csv = [
    ['Date', 'Segment', 'Type', 'Method', 'Status', 'Description', 'Reference', 'Fee', 'Expected', 'Debit', 'Credit'],
    ...rows.map((row) => [istDateTime(row.date), row.segment, row.kind, row.method, row.status, row.description, row.reference, row.fee.toFixed(2), row.expectedAt ? istDateTime(row.expectedAt) : '', row.debit.toFixed(2), row.credit.toFixed(2)]),
  ].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const filename = `ntd-fund-statement-${istDateKey()}.csv`;
  const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<{ createWritable: () => Promise<{ write: (content: string) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, { suggestedName: filename, types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }] });
      const writable = await handle.createWritable();
      await writable.write(csv);
      await writable.close();
      return 'Statement saved.';
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return 'Download cancelled.';
    }
  }
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 1000);
  return 'Statement downloaded.';
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 30 }}>
      <span style={{ fontSize: 11, color: strong ? 'var(--text-3)' : 'var(--muted)' }}>{label}</span>
      <span className="num" style={{ fontSize: 11, color: strong ? 'var(--text)' : 'var(--text-2)' }}>
        {num(value)}
      </span>
    </div>
  );
}

function Headline({
  label,
  value,
  accent,
  divider,
}: {
  label: string;
  value: number;
  accent?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 48,
        borderTop: divider ? '1px solid var(--hairline-soft)' : 'none',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span
        className="num"
        style={{ fontSize: 20, fontWeight: 500, color: accent ? 'var(--amber)' : 'var(--text)' }}
      >
        {num(value)}
      </span>
    </div>
  );
}

function Segment({
  title,
  icon,
  funds,
  onViewStatement,
}: {
  title: string;
  icon: ReactNode;
  funds: FundsSegment | null;
  onViewStatement: () => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head" style={{ padding: '0 14px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
          {icon}
          <span className="panel-title">{title}</span>
        </span>
        <div className="panel-actions" style={{ gap: 14 }}>
          <button onClick={onViewStatement} style={{ fontSize: 11, color: 'var(--blue)' }}>
            View statement
          </button>
          <a href="#help" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Help
          </a>
        </div>
      </div>

      {!funds ? (
        <div className="stub" style={{ padding: '48px 0' }}>
          <span style={{ fontSize: 11 }}>No {title.toLowerCase()} account.</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 14px 0' }}>
            <Headline label="Available margin" value={funds.availableMargin} accent />
            <Headline label="Used margin" value={funds.usedMargin} divider />
            <Headline label="Available cash" value={funds.availableCash} divider />
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 14px 12px',
              marginTop: 6,
              borderTop: '1px solid var(--border)',
            }}
          >
            <Row label="Opening balance" value={funds.openingBalance} />
            <Row label="Payin" value={funds.payin} />
            <Row label="Payout" value={funds.payout} />
            <Row label="Withdrawable balance" value={funds.withdrawableBalance} strong />
            <Row label="SPAN" value={funds.span} />
            <Row label="Delivery margin" value={funds.deliveryMargin} />
            <Row label="Exposure" value={funds.exposure} />
            <Row label="Options premium" value={funds.optionsPremium} />
            <Row label="Collateral (liquid funds)" value={funds.collateralLiquid} />
            <Row label="Collateral (equity)" value={funds.collateralEquity} />
            <div style={{ borderTop: '1px solid var(--hairline-soft)', marginTop: 4 }}>
              <Row label="Total collateral" value={funds.totalCollateral} strong />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function Funds() {
  const { token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { funds, loading, error } = useFunds();
  const [transfer, setTransfer] = useState<'add' | 'withdraw' | null>(null);
  const [statements, setStatements] = useState<FundStatement[]>([]);
  const [statementsLoading, setStatementsLoading] = useState(true);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const showingStatements = location.pathname.endsWith('/statements');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => fundsApi.statements(token)
      .then(({ statements: next }) => {
        if (cancelled) return;
        setStatements(next);
        setStatementError(null);
      })
      .catch((cause) => !cancelled && setStatementError(cause instanceof Error ? cause.message : 'Could not load statements.'))
      .finally(() => !cancelled && setStatementsLoading(false));
    void load();
    window.addEventListener('ntd:funds-change', load);
    return () => { cancelled = true; window.removeEventListener('ntd:funds-change', load); };
  }, [token]);

  const filteredStatements = useMemo(() => statements.filter((row) => {
    const date = istDateKey(row.date);
    return (segment === 'all' || row.segment === segment)
      && (kind === 'all' || row.kind === kind)
      && (status === 'all' || row.status === status)
      && (!from || date >= from)
      && (!to || date <= to);
  }), [statements, segment, kind, status, from, to]);

  const showStatement = (nextSegment: SegmentFilter = 'all') => {
    setSegment(nextSegment);
    navigate('/funds/statements');
  };

  const credit = filteredStatements.reduce((sum, row) => sum + row.credit, 0);
  const debit = filteredStatements.reduce((sum, row) => sum + row.debit, 0);
  const pending = filteredStatements.filter((row) => row.status === 'PENDING').length;

  return (
    <AppShell tabs={['Funds', 'Statements']} activeTab={showingStatements ? 'Statements' : 'Funds'} onTabChange={(tab) => navigate(tab === 'Statements' ? '/funds/statements' : '/funds')}>
      {showingStatements ? <>
        <div className="grid-4">
          <div className="tile"><span className="tile-label">ENTRIES</span><span className="tile-value num">{filteredStatements.length}</span><span>{pending} pending</span></div>
          <div className="tile"><span className="tile-label">TOTAL CREDIT</span><span className="tile-value num up">₹{num(credit)}</span><span>Opening balance and pay-ins</span></div>
          <div className="tile"><span className="tile-label">TOTAL DEBIT</span><span className="tile-value num down">₹{num(debit)}</span><span>Withdrawals</span></div>
          <div className="tile"><span className="tile-label">NET MOVEMENT</span><span className="tile-value num">₹{num(credit - debit)}</span><span>For selected period</span></div>
        </div>
        {statementError && <div className="notice error" role="alert">{statementError}</div>}
        <section className="panel">
          <div className="panel-head tool-head"><div><span className="panel-title">Fund statement</span><span className="panel-count num"> ({filteredStatements.length})</span></div><div className="statement-filters">
            <select aria-label="Statement segment" value={segment} onChange={(event) => setSegment(event.target.value as SegmentFilter)}><option value="all">All segments</option><option value="equity">Equity</option><option value="commodity">Commodity</option></select>
            <select aria-label="Statement type" value={kind} onChange={(event) => setKind(event.target.value as KindFilter)}><option value="all">All entries</option><option value="OPENING">Opening balance</option><option value="PAYIN">Pay-ins</option><option value="PAYOUT">Payouts</option></select>
            <select aria-label="Statement status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="COMPLETED">Completed</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option></select>
            <label><span>From</span><input aria-label="Statement from date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label><span>To</span><input aria-label="Statement to date" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <button className="chip" onClick={async () => setDownloadStatus(await saveStatements(filteredStatements))} disabled={!filteredStatements.length}><Icon.Download /> Download CSV</button>
          </div></div>
          {downloadStatus && <div className="download-status" role="status">{downloadStatus}<button onClick={() => setDownloadStatus(null)} aria-label="Dismiss download status">×</button></div>}
          <div className="statement-head"><span>DATE</span><span>SEGMENT</span><span>DESCRIPTION</span><span>REFERENCE</span><span>STATUS</span><span>DEBIT</span><span>CREDIT</span></div>
          {statementsLoading ? <div className="stub"><span>Loading fund statement…</span></div> : filteredStatements.length ? filteredStatements.map((row) => <div className="statement-row" key={row.id}><span className="num">{istDateTime(row.date)}</span><span className="tag">{row.segment.toUpperCase()}</span><div><strong>{row.description}</strong><span>{row.kind} · {row.method}{row.fee ? ` · ₹${num(row.fee)} fee` : ''}</span></div><span className="num statement-reference">{row.reference}</span><div><span className={`tag fund-status ${row.status.toLowerCase()}`}>{row.status}</span>{row.status === 'PENDING' && row.expectedAt && <span>Expected {istDateTime(row.expectedAt)}</span>}</div><span className="num down">{row.debit ? `₹${num(row.debit)}` : '—'}</span><span className="num up">{row.credit ? `₹${num(row.credit)}` : '—'}</span></div>) : <div className="stub"><strong>No statement entries</strong><span>Adjust the filters or add funds to create an entry.</span></div>}
        </section>
      </> : <>
      <div className="panel funds-transfer-banner">
        <Icon.Shield />
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          UPI is instant and free. Net banking is instant with a ₹10.62 fee; bank transfers are credited after confirmation.
        </span>
        <div className="funds-transfer-actions">
          <button className="btn ghost" onClick={() => setTransfer('withdraw')}>Withdraw</button>
          <button className="btn primary" onClick={() => setTransfer('add')}>Add funds</button>
        </div>
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="stub" style={{ padding: '64px 0' }}>
          <span style={{ fontSize: 11 }}>Loading your funds…</span>
        </div>
      ) : (
        <div className="grid-2">
          <Segment title="Equity" icon={<Icon.Equity />} funds={funds?.equity ?? null} onViewStatement={() => showStatement('equity')} />
          <Segment title="Commodity" icon={<Icon.Commodity />} funds={funds?.commodity ?? null} onViewStatement={() => showStatement('commodity')} />
        </div>
      )}

      {transfer && funds && (
        <FundTransferDialog direction={transfer} funds={funds} onClose={() => setTransfer(null)} />
      )}
      </>}
    </AppShell>
  );
}
