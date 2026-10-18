/**
 * Açık (çözülmemiş) ve bir case'e bağlı hata kayıtları: Map(caseId → [{ id, status, severity }]).
 * Listelerde "BUG-N" rozeti ve "açık bug'ı olan" filtresi için; defects.view izni yoksa boş kalır.
 */
import { useCallback, useEffect, useState } from 'react';
import { defectsApi } from '../../api';

export const useOpenBugs = (enabled, projectId = null) => {
  const [map, setMap] = useState(() => new Map());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let off = false;
    defectsApi.activeByCase(projectId ? { project_id: projectId } : undefined)
      .then(({ data }) => {
        if (off) return;
        const m = new Map();
        data.forEach(d => m.set(d.case_id, [...(m.get(d.case_id) || []), d]));
        setMap(m);
      })
      .catch(() => {});
    return () => { off = true; };
  }, [enabled, projectId, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { map, reload };
};
