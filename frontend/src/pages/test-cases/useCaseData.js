/**
 * Test case ekranının verisi: projeler + case'ler ve onları değiştiren işlemler.
 * Her işlem sunucu yanıtıyla yerel listeyi günceller; tüm listeyi yeniden çekmez.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { testCasesApi, projectsApi, fetchAllTestCases } from '../../api';
import { parseCase } from './model';

const load = () => Promise.all([projectsApi.getAll(), fetchAllTestCases()])
  .then(([p, cases]) => ({ projects: p.data, cases }));

export const useCaseData = () => {
  const [raw, setRaw] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const apply = useCallback(({ projects: p, cases }) => {
    setProjects(p); setRaw(cases); setError(null); setLoading(false);
  }, []);
  const fail = useCallback((err) => { setError(err.message || 'Sunucuya bağlanılamadı.'); setLoading(false); }, []);

  useEffect(() => {
    let alive = true;
    load().then(r => alive && apply(r)).catch(e => alive && fail(e));
    return () => { alive = false; };
  }, [apply, fail]);

  const reload = useCallback(() => {
    setLoading(true);
    return load().then(apply).catch(fail);
  }, [apply, fail]);

  const cases = useMemo(() => raw.map(parseCase), [raw]);
  const byId = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const projectName = useCallback((id) => projectMap.get(Number(id))?.name || '—', [projectMap]);

  const upsert = (saved) => setRaw(prev => {
    const i = prev.findIndex(c => c.id === saved.id);
    if (i === -1) return [saved, ...prev];
    const next = prev.slice(); next[i] = saved; return next;
  });

  const create = useCallback(async (payload) => {
    const { data } = await testCasesApi.create(payload);
    upsert(data);
    return parseCase(data);
  }, []);

  const update = useCallback(async (id, payload) => {
    const { data } = await testCasesApi.update(id, payload);
    upsert(data);
    return parseCase(data);
  }, []);

  const remove = useCallback(async (ids) => {
    const list = [...ids];
    if (list.length === 1) await testCasesApi.remove(list[0]);
    else await testCasesApi.bulkDelete({ ids: list });
    const gone = new Set(list);
    setRaw(prev => prev.filter(c => !gone.has(c.id)));
    return list.length;
  }, []);

  const setStatus = useCallback(async (ids, status) => {
    const list = [...ids];
    const { data } = await testCasesApi.bulkStatus({ ids: list, status });
    const hit = new Set(list);
    setRaw(prev => prev.map(c => hit.has(c.id) ? { ...c, status } : c));
    return data.updated;
  }, []);

  return { cases, byId, projects, projectName, loading, error, reload, create, update, remove, setStatus };
};
