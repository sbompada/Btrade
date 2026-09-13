import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fundsApi, type Funds } from '../lib/api';

/**
 * Account funds for the signed-in user. Fetched rather than imported, because
 * these are per-account balances — a shared constant showed every user the
 * same money.
 *
 * Only margin moves intraday, and that changes when positions or prices do, so
 * there is nothing to stream here yet; a refetch after any order or funds
 * movement is enough until margin is computed from positions.
 */
export function useFunds() {
  const { token } = useAuth();
  const [funds, setFunds] = useState<Funds | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setFunds(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = () =>
      fundsApi
        .get(token)
        .then(({ funds: f }) => !cancelled && setFunds(f))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load funds.'))
        .finally(() => !cancelled && setLoading(false));

    setLoading(true);
    load();
    window.addEventListener('ntd:funds-change', load);

    // Margin on a written option or future tracks spot, so this needs refreshing —
    // but it moves far too slowly to justify a stream of its own.
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('ntd:funds-change', load);
    };
  }, [token]);

  return { funds, loading, error };
}
