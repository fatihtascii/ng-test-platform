/**
 * Yürütme ekranının durumu: koşum, kapsamdaki case'ler, sonuçlar ve otomatik kayıt.
 *
 * Sonuçlar her değişiklikten kısa süre sonra sunucuya yazılır; aynı anda tek kayıt isteği
 * gider, arada gelen değişiklikler bir sonraki istekte toplanır. Böylece "ara kayıt"
 * düğmesine ve kaydedilmemiş değişiklik uyarısına gerek kalmaz.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { testRunsApi, projectsApi, testPlansApi, defectsApi, fetchAllTestCases } from '../../api';
import { parseCase } from '../test-cases/model';
import { parseResults, serializeResults, summarize, toPayload, FINISHED } from './model';

const SAVE_DELAY = 700;

const loadSession = async (id, canSeeDefects) => {
  const { data: run } = await testRunsApi.getOne(id);
  const [cases, projects, plan, defects] = await Promise.all([
    fetchAllTestCases({ project_id: run.project_id }),
    projectsApi.getAll().then(r => r.data).catch(() => []),
    run.test_plan_id ? testPlansApi.getOne(run.test_plan_id).then(r => r.data).catch(() => null) : null,
    canSeeDefects ? defectsApi.getAll({ test_run_id: run.id }).then(r => r.data).catch(() => []) : [],
  ]);
  let results = parseResults(run.results);
  // Kapsamı sabitlenmemiş eski koşumlar: plan ya da proje case'lerinden doldurulur
  let seeded = false;
  if (!results.length && !FINISHED.has(run.status)) {
    const ids = plan ? plan.items.map(i => i.test_case_id) : cases.map(c => c.id).sort((a, b) => a - b);
    results = ids.map(caseId => ({ caseId, status: 'Pending', note: '', raw: {} }));
    seeded = results.length > 0;
  }
  return {
    run, results, seeded, plan, defects,
    project: projects.find(p => p.id === run.project_id) || null,
    cases: new Map(cases.map(c => [c.id, parseCase(c)])),
  };
};

export const useRunSession = (id, { canSeeDefects, canExecute }) => {
  const [state, setState] = useState({ loading: true });
  const [results, setResults] = useState([]);
  const [save, setSave] = useState({ status: 'idle', at: null });   // idle | pending | saving | saved | error
  const runRef = useRef(null);
  const resultsRef = useRef([]);
  const timer = useRef(null);
  const inFlight = useRef(false);
  const queued = useRef(false);

  useEffect(() => {
    let alive = true;
    loadSession(id, canSeeDefects).then(s => {
      if (!alive) return;
      runRef.current = s.run;
      resultsRef.current = s.results;
      setResults(s.results);
      setState({ loading: false, ...s });
    }).catch(err => alive && setState({ loading: false, error: err.message || 'Koşum yüklenemedi.' }));
    return () => { alive = false; };
  }, [id, canSeeDefects]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) { queued.current = true; return; }
    inFlight.current = true;
    setSave(s => ({ ...s, status: 'saving' }));
    try {
      const { data } = await testRunsApi.update(runRef.current.id,
        toPayload(runRef.current, { results: serializeResults(resultsRef.current) }));
      runRef.current = data;
      setState(s => ({ ...s, run: data }));
      setSave({ status: queued.current ? 'pending' : 'saved', at: new Date().toISOString() });
    } catch (err) {
      setSave({ status: 'error', at: null, error: err.message });
    } finally {
      inFlight.current = false;
      if (queued.current) { queued.current = false; flush(); }
    }
  }, []);

  const schedule = useCallback(() => {
    setSave(s => ({ ...s, status: 'pending' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [flush]);

  // Sayfadan çıkarken bekleyen kayıt gönderilir; kapanırken tarayıcı uyarır
  useEffect(() => {
    const warn = (e) => { if (timer.current && save.status === 'pending') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [save.status]);
  useEffect(() => () => { if (timer.current && runRef.current) { clearTimeout(timer.current); flush(); } }, [flush]);

  const update = useCallback((caseId, patch) => {
    const next = resultsRef.current.map(r => r.caseId === caseId ? { ...r, ...patch } : r);
    resultsRef.current = next;
    setResults(next);
    schedule();
  }, [schedule]);

  const updateMany = useCallback((predicate, patch) => {
    let n = 0;
    const next = resultsRef.current.map(r => { if (predicate(r)) { n += 1; return { ...r, ...patch }; } return r; });
    if (!n) return 0;
    resultsRef.current = next;
    setResults(next);
    schedule();
    return n;
  }, [schedule]);

  /** Durum değiştirir (Tamamlandı → sonuçlar case'lere, plana ve hata kaydına yansır) */
  const setRunStatus = useCallback(async (status) => {
    clearTimeout(timer.current);
    timer.current = null;
    const { data } = await testRunsApi.update(runRef.current.id,
      toPayload(runRef.current, { status, results: serializeResults(resultsRef.current) }));
    runRef.current = data;
    setSave({ status: 'saved', at: new Date().toISOString() });
    const defects = canSeeDefects ? await defectsApi.getAll({ test_run_id: data.id }).then(r => r.data).catch(() => []) : [];
    setState(s => ({ ...s, run: data, defects }));
    return { run: data, defects };
  }, [canSeeDefects]);

  const replaceRun = useCallback((run) => { runRef.current = run; setState(s => ({ ...s, run })); }, []);

  const summary = useMemo(() => summarize(results), [results]);

  // Kapsamı yeni doldurulan eski koşum ilk açılışta kaydedilir
  const seededRef = useRef(false);
  useEffect(() => {
    if (state.seeded && canExecute && !seededRef.current) { seededRef.current = true; schedule(); }
  }, [state.seeded, canExecute, schedule]);

  return { ...state, results, summary, save, update, updateMany, setRunStatus, replaceRun, retrySave: flush };
};
