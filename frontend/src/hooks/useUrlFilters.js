/**
 * Liste filtrelerini adres çubuğunda tutar: yenilemede korunur, bağlantı paylaşılabilir.
 *   const f = useUrlFilters(['q', 'project', 'status']);
 *   f.values.q; f.set('q', 'abc'); f.clear();
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const useUrlFilters = (keys) => {
  const [params, setParams] = useSearchParams();
  const keyStr = keys.join(',');

  const values = useMemo(
    () => Object.fromEntries(keyStr.split(',').map(k => [k, params.get(k) || ''])),
    [params, keyStr],
  );

  const patch = useCallback((obj) => {
    setParams(() => {
      // Router'ın "prev" değeri art arda güncellemelerde eski kalabiliyor; güncel adres window.location'da
      const next = new URLSearchParams(window.location.search);
      Object.entries(obj).forEach(([k, v]) => { if (v === '' || v == null) next.delete(k); else next.set(k, String(v)); });
      return next;
    }, { replace: true });
  }, [setParams]);

  const set = useCallback((k, v) => patch({ [k]: v }), [patch]);
  const clear = useCallback(() => patch(Object.fromEntries(keyStr.split(',').map(k => [k, '']))), [patch, keyStr]);
  const active = Object.values(values).some(Boolean);

  return { values, set, patch, clear, active };
};
