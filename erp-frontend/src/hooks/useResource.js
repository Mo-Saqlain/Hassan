import { useCallback, useEffect, useState } from 'react';
import { getCached } from '../api/client';

export function useResource(path) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(
    async (opts) => {
      setError(null);
      try {
        const res = await getCached(path, opts);
        setData(res.data);
        return res;
      } catch (e) {
        setError(e.uiMessage ?? 'Failed to load');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [path],
  );

  // `reload` is what call sites use after mutations — always bypass the
  // cache so the screen reflects the write that just happened.
  const reload = useCallback(() => fetch({ fresh: true }), [fetch]);

  useEffect(() => {
    setLoading(true);
    fetch();
  }, [fetch]);

  return { data, loading, error, reload, setData };
}
