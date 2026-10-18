/**
 * "Koşum" filtresi için veri: son koşumlar (seçenekler) ve seçili koşumun case sonuçları.
 * results: Map(caseId → { status: Passed|Failed|Skipped|Pending, note })
 */
import { useCallback, useEffect, useState } from 'react';
import { testRunsApi } from '../../api';
import { parseResults, runIdent } from '../test-runs/model';

const RECENT_LIMIT = 30;

const shortName = (name = '') => name.replace(/^Otomasyon koşumu\s*·\s*/, '').trim();

export const useRunFilter = (runId, enabled) => {
  const [recent, setRecent] = useState([]);
  const [run, setRun] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let off = false;
    testRunsApi.getAll({ is_defect: false, limit: RECENT_LIMIT })
      .then(({ data }) => { if (!off) setRecent(data.map(r => ({ id: r.id, name: r.name, project_id: r.project_id, source: r.source }))); })
      .catch(() => {});
    return () => { off = true; };
  }, [enabled, tick]);

  useEffect(() => {
    if (!enabled || !runId) return undefined;
    let off = false;
    const id = Number(runId);
    testRunsApi.getOne(id)
      .then(({ data }) => {
        if (off) return;
        setRun({ id, name: data.name, project_id: data.project_id,
          results: new Map(parseResults(data.results).map(r => [r.caseId, { status: r.status, note: r.note }])) });
      })
      .catch(() => { if (!off) setRun({ id, missing: true, results: new Map() }); });
    return () => { off = true; };
  }, [runId, enabled, tick]);

  // Yeni koşum bitince listeyi ve seçili koşumu tazele
  const reload = useCallback(() => setTick(t => t + 1), []);

  const active = runId && run?.id === Number(runId) ? run : null;
  return { recent, run: active, loading: Boolean(enabled && runId) && !active, reload };
};

/** FilterSelect seçenekleri: [id, "KS-8 · 19.10 00:37 · Staging", "KS-8"] */
export const runOptions = (recent, selectedId, projectFilter) => {
  const list = recent.filter(r => !projectFilter || String(r.project_id) === String(projectFilter));
  const opts = list.map(r => [r.id, `${runIdent(r.id)} · ${shortName(r.name) || r.name}`, runIdent(r.id)]);
  if (selectedId && !opts.some(([id]) => String(id) === String(selectedId))) {
    opts.unshift([Number(selectedId), runIdent(selectedId), runIdent(selectedId)]);
  }
  return opts;
};
