import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, fundsApi, type Funds, type FundsSegment, type FundTransferMethod } from '../lib/api';
import { num } from '../lib/format';

type Direction = 'add' | 'withdraw';
const ADD_METHODS: Array<{ value: FundTransferMethod; label: string; detail: string }> = [
  { value: 'UPI', label: 'UPI', detail: 'Instant · Free' },
  { value: 'NETBANKING', label: 'Net banking', detail: 'Instant · ₹10.62 fee' },
  { value: 'IMPS', label: 'IMPS', detail: 'Usually within 30 minutes' },
  { value: 'NEFT', label: 'NEFT', detail: 'May take up to 10 hours' },
  { value: 'RTGS', label: 'RTGS', detail: 'May take up to 10 hours' },
];

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
  const [method, setMethod] = useState<FundTransferMethod>(direction === 'add' ? 'UPI' : 'BANK');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const account = funds[segment];
  const title = direction === 'add' ? 'Add funds' : 'Withdraw funds';
  const instant = method === 'UPI' || method === 'NETBANKING';
  const maxAmount = direction === 'withdraw' ? account?.withdrawableBalance ?? 0 : 10_000_000;

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
      await fundsApi.transfer(token, { direction, segment, amount, method });
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
            <span>{direction === 'add' ? (instant ? 'Instant account credit' : 'Credit after bank confirmation') : 'Transfer to your registered bank'}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close funds dialog">×</button>
        </div>

        {complete ? (
          <div className="order-confirmation">
            <strong>₹{num(amount)} {direction === 'add' ? (instant ? 'added' : 'transfer submitted') : 'withdrawal requested'}</strong>
            <span>{direction === 'withdraw'
              ? 'Withdrawal requested. Bank credit is expected after the next processing cut-off.'
              : instant
                ? `${segment === 'equity' ? 'Equity' : 'Commodity'} balance updated successfully.`
                : `${method} transfer recorded and will be credited when received.`}</span>
            <button className="btn primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="order-fields">
              <label>
                <span>Amount</span>
                <input type="number" min="0.01" max={maxAmount} step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} autoFocus />
              </label>
              <label>
                <span>Segment</span>
                <select value={segment} onChange={(event) => setSegment(event.target.value as FundsSegment['segment'])}>
                  {segments.map((value) => <option key={value} value={value}>{value === 'equity' ? 'Equity' : 'Commodity'}</option>)}
                </select>
              </label>
              {direction === 'add' && <label>
                <span>Transfer method</span>
                <select value={method} onChange={(event) => setMethod(event.target.value as FundTransferMethod)}>
                  {ADD_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.detail}</option>)}
                </select>
              </label>}
            </div>
            <div className="order-estimate">
              <span>{direction === 'add' ? (instant ? 'Available after transfer' : 'Available after bank confirmation') : 'Withdrawable balance'}</span>
              <span className="num">₹{num(direction === 'add' && instant ? (account?.availableCash ?? 0) + Math.max(amount || 0, 0) : direction === 'withdraw' ? account?.withdrawableBalance ?? 0 : account?.availableCash ?? 0)}</span>
            </div>
            {direction === 'add' && <div className="order-estimate"><span>Method</span><span>{ADD_METHODS.find((option) => option.value === method)?.detail}</span></div>}
            {direction === 'withdraw' && <div className="order-estimate"><span>Processing</span><span>Up to 24–48 business hours</span></div>}
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="btn primary block" disabled={submitting || amount <= 0 || amount > maxAmount || !Number.isFinite(amount)}>
              {submitting ? 'Processing…' : direction === 'withdraw' ? 'Request withdrawal' : title}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}