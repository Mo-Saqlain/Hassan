import { useCallback, useEffect, useState } from 'react';
import { isConfigured } from './config';

// Small async loader with loading/error/refresh state.
// `loader` is an async function; `deps` re-runs it when they change.
export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (isRefresh) => {
    if (!isConfigured()) {
      setError(new Error('Supabase anon key is not set. Edit src/config.js.'));
      setLoading(false);
      return;
    }
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const result = await loader();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, refreshing, error, reload: () => run(false), refresh: () => run(true) };
}

export function errMessage(e) {
  if (!e) return '';
  return e.message || e.hint || String(e);
}
