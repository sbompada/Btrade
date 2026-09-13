import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, fundsApi, type Funds, type FundsSegment } from '../lib/api';
import { num } from '../lib/format';

type Direction = 'add' | 'withdraw';

export default function FundTransferDialog({
  direction,
  funds,
  onClose,
}: {
  direction: Direction;
  funds: Funds;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const segments = (['equity', 'commodity'] as const).filter((value) => funds[value]);
  const [segment, setSegment] = useState<FundsSegment['segment']>(segments[0] ?? 'equity');
  const [amount, setAmount] = useState(1000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const account = funds[segment];
  const title = direction === 'add' ? 'Add funds' : 'Withdraw funds';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !Number.isFinite(amount) || amount <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await fundsApi.transfer(token, { direction, segment, amount });
      setComplete(true);
      window.dispatchEvent(new Event('ntd:funds-change'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not complete the transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="order-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="order-ticket" role="dialog" aria-modal="true" aria-labelledby="fund-transfer-title">
        <div className="order-ticket-head">
          <div>
            <strong id="fund-transfer-title">{title}</strong>
            <span>{direction === 'add' ? 'Instant account credit' : 'Transfer to your registered bank'}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close funds dialog">×</button>
        </div>

        {complete ? (
          <div className="order-confirmation">
            <strong>₹{num(amount)} {direction === 'add' ? 'added' : 'withdrawn'}</strong>
            <span>{segment === 'equity' ? 'Equity' : 'Commodity'} balance updated successfully.</span>
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="order-fields">
              <label>
                <span>Amount</span>
                <input type="number" min="0.01" max="10000000" step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} autoFocus />
              </label>
              <label>
                <span>Segment</span>
                <select value={segment} onChange={(event) => setSegment(event.target.value as FundsSegment['segment'])}>
                  {segments.map((value) => <option key={value} value={value}>{value === 'equity' ? 'Equity' : 'Commodity'}</option>)}
                </select>
              </label>
            </div>
            <div className="order-estimate">
              <span>{direction === 'add' ? 'Available after transfer' : 'Available cash'}</span>
              <span className="num">₹{num(direction === 'add' ? (account?.availableCash ?? 0) + Math.max(amount || 0, 0) : account?.availableCash ?? 0)}</span>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="btn primary block" disabled={submitting || amount <= 0 || !Number.isFinite(amount)}>
              {submitting ? 'Processing…' : title}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}