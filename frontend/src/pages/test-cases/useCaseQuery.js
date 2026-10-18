/**
 * Liste görünümünün durumu (arama, filtreler, sıralama, sayfa, açık case) adres çubuğunda
 * tutulur: sayfa yenilense de korunur, bağlantı paylaşılabilir, geri tuşu çalışır.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

// run: koşum (KS-N) · runres: o koşumdaki sonuç (Failed | Passed | Skipped)
export const FILTER_KEYS = ['project', 'status', 'priority', 'exec', 'type', 'tag', 'run', 'runres'];
const DEFAULT_SORT = '-id';
const PAGE_SIZES = [10, 25, 50, 100];

export const useCaseQuery = () => {
  const [params, setParams] = useSearchParams();

  const state = useMemo(() => {
    const sortRaw = params.get('sort') || DEFAULT_SORT;
    const size = Number(params.get('size'));
    return {
      q: params.get('q') || '',
      filters: Object.fromEntries(FILTER_KEYS.map(k => [k, params.get(k) || ''])),
      sort: { key: sortRaw.replace(/^-/, ''), direction: sortRaw.startsWith('-') ? 'desc' : 'asc' },
      page: Math.max(1, Number(params.get('page')) || 1),
      pageSize: PAGE_SIZES.includes(size) ? size : 25,
      caseId: Number(params.get('case')) || null,
    };
  }, [params]);

  const update = useCallback((patch, { resetPage = true, push = false, state } = {}) => {
    setParams(() => {
      // Router'ın verdiği "prev" aynı tick içindeki art arda güncellemelerde eski kalabiliyor;
      // en güncel adres her zaman window.location'da.
      const next = new URLSearchParams(window.location.search);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === '' || v == null || v === false) next.delete(k); else next.set(k, String(v));
      });
      if (resetPage && !('page' in patch)) next.delete('page');
      return next;
    }, { replace: !push, state });
  }, [setParams]);

  const setQ = useCallback((q) => update({ q }), [update]);
  const setFilter = useCallback((key, value) => update(key === 'run' && !value ? { run: '', runres: '' } : { [key]: value }), [update]);
  // Koşumdaki kalanları listede göstermek için: diğer filtreler temizlenir, panel kapanır
  const showRun = useCallback((run, runres = '') => update(
    { ...Object.fromEntries([...FILTER_KEYS, 'q'].map(k => [k, ''])), run, runres, case: '' },
  ), [update]);
  const clearFilters = useCallback(() => update(Object.fromEntries([...FILTER_KEYS, 'q'].map(k => [k, '']))), [update]);
  const setPage = useCallback((page) => update({ page: page > 1 ? page : '' }, { resetPage: false }), [update]);
  const setPageSize = useCallback((size) => update({ size: size === 25 ? '' : size }), [update]);
  const toggleSort = useCallback((key) => {
    const cur = state.sort;
    const next = cur.key === key ? (cur.direction === 'asc' ? `-${key}` : key) : key;
    update({ sort: next === DEFAULT_SORT ? '' : next });
  }, [state.sort, update]);
  // Case paneli geçmişe eklenir: geri tuşu paneli kapatır
  // (state.caseDrawer: kapatırken geri gidilebileceğini bilmek için)
  const openCase = useCallback((id, { replace = false } = {}) => update(
    { case: id || '' },
    { resetPage: false, push: Boolean(id) && !replace, state: id ? { caseDrawer: true } : undefined },
  ), [update]);

  const hasFilter = Boolean(state.q) || FILTER_KEYS.some(k => state.filters[k]);

  return { ...state, hasFilter, setQ, setFilter, showRun, clearFilters, setPage, setPageSize, toggleSort, openCase };
};
