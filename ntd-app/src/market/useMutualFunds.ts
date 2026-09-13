import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { mutualFundsApi, type MutualFundRecord } from '../lib/api';

export type MutualFundHolding = MutualFundRecord & {
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  dayPnl: number;
};

export function useMutualFunds() {
  const { token } = useAuth();
  const [records, setRecords] = useState<MutualFundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    mutualFundsApi.get(token)
      .then(({ mutualFunds }) => !cancelled && setRecords(mutualFunds))
      .catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : 'Could not load mutual funds.'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [token]);

  return useMemo(() => {
    const mutualFunds: MutualFundHolding[] = records.map((fund) => {
      const invested = fund.units * fund.avgNav;
      const currentValue = fund.units * fund.currentNav;
      const pnl = currentValue - invested;
      return { ...fund, invested, currentValue, pnl, pnlPct: invested ? pnl / invested * 100 : 0, dayPnl: currentValue * fund.dayChangePct / 100 };
    });
    const invested = mutualFunds.reduce((sum, fund) => sum + fund.invested, 0);
    const currentValue = mutualFunds.reduce((sum, fund) => sum + fund.currentValue, 0);
    const pnl = currentValue - invested;
    return { mutualFunds, loading, error, invested, currentValue, pnl, pnlPct: invested ? pnl / invested * 100 : 0, dayPnl: mutualFunds.reduce((sum, fund) => sum + fund.dayPnl, 0) };
  }, [records, loading, error]);
}