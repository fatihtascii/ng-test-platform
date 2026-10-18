/**
 * Koşum ekranı: sonuçları görüntüleme ve koşma tek yerde.
 * Sol bölmede kapsamdaki case'ler, sağda seçili case'in adımları ve sonuç girişi.
 * Sonuçlar otomatik kaydedilir; koşum tamamlanınca case'lere, plana ve hata kaydına yansır.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, RotateCcw, MoreHorizontal, Pencil, Trash2, CheckCheck, SkipForward, AlertTriangle, Bug } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { Button, ResultBar, StatusBadge, Ident, Skeleton, EmptyState } from '../components/ui';
import { Menu, MenuItem, MenuSeparator, ConfirmDialog } from '../components/ui/overlay';
import { toast } from '../components/ui/toast';
import { defectsApi, testRunsApi, projectsApi, testPlansApi } from '../api';
import { useRunSession } from './test-runs/useRunSession';
import RunCaseList from './test-runs/RunCaseList';
import RunCasePanel from './test-runs/RunCasePanel';
import RunFormDrawer from './test-runs/RunFormDrawer';
import { RUN_STATUS_TONE, RUN_STATUS_LABEL, FINISHED, segmentsOf, runIdent, relativeTime, formatDate, trLower } from './test-runs/model';
import { caseIdent } from './test-cases/model';

const SEVERITY_BY_PRIORITY = { 'Kritik': 'Kritik', 'Yüksek': 'Yüksek', 'Orta': 'Orta', 'Düşük': 'Düşük' };
const DEFECT_LABEL = { Open: 'Açık', 'In Progress': 'İnceleniyor', 'Re-test': 'Tekrar test', Resolved: 'Çözüldü' };
const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

const SaveState = ({ save, onRetry }) => {
  if (save.status === 'saving' || save.status === 'pending') return <span className="text-xs text-slate-500 dark:text-slate-400">Kaydediliyor…</span>;
  if (save.status === 'error') return (
    <span className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400" role="alert">
      <AlertTriangle size={13} /> Kaydedilemedi
      <button type="button" onClick={onRetry} className="font-medium underline">Tekrar dene</button>
    </span>
  );
  if (save.status === 'saved') return <span className="text-xs text-slate-500 dark:text-slate-400" title={formatDate(save.at, true)}>Kaydedildi</span>;
  return null;
};

const TestRunDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const session = useRunSession(id, { canSeeDefects: can('defects.view'), canExecute: can('test_runs.execute') });
  const { run, results, summary, cases, project, plan, defects, save } = session;

  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [dialog, setDialog] = useState(null);       // 'complete' | 'delete' | 'edit'
  const [busy, setBusy] = useState(null);
  const [editCtx, setEditCtx] = useState(null);
  const noteRef = useRef(null);

  const readOnly = !run || !can('test_runs.execute') || FINISHED.has(run.status);

  // Sıra ve görünür liste
  const ordered = useMemo(() => results.map((result, index) => ({ result, index, tc: cases?.get(result.caseId) })), [results, cases]);
  const visible = useMemo(() => ordered.filter(({ result, tc }) =>
    (filter === 'all' || result.status === filter) &&
    (!query || trLower(tc?.title || '').includes(trLower(query)) || caseIdent(result.caseId).toLowerCase() === query.trim().toLowerCase())
  ), [ordered, filter, query]);

  // Varsayılan seçim: ilk bekleyen (yoksa ilk case). Seçim filtre dışına düşerse görünür ilk case.
  const fallback = (ordered.find(o => o.result.status === 'Pending') || ordered[0])?.result.caseId ?? null;
  const selectedId = selected != null && ordered.some(o => o.result.caseId === selected) ? selected : fallback;
  const pos = visible.findIndex(o => o.result.caseId === selectedId);
  const current = ordered.find(o => o.result.caseId === selectedId);

  const go = useCallback((d) => {
    const next = visible[(pos === -1 ? -1 : pos) + d];
    if (next) setSelected(next.result.caseId);
  }, [visible, pos]);

  const nextPendingAfter = useCallback((caseId) => {
    const i = ordered.findIndex(o => o.result.caseId === caseId);
    return [...ordered.slice(i + 1), ...ordered.slice(0, i)].find(o => o.result.status === 'Pending' && o.result.caseId !== caseId);
  }, [ordered]);

  const mark = useCallback((status) => {
    if (readOnly || !current) return;
    session.update(current.result.caseId, { status });
    if (status === 'Failed') setTimeout(() => noteRef.current?.focus(), 0);
    else if (status !== 'Pending') {
      const nxt = nextPendingAfter(current.result.caseId);
      if (nxt) setSelected(nxt.result.caseId);
    }
  }, [readOnly, current, session, nextPendingAfter]);

  // Klavye: j/k gezin, p/f/s sonuç, n not
  const keys = useRef({});
  keys.current = { go, mark, dialog, readOnly };
  useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      if (e.key === 'Escape' && document.activeElement === noteRef.current) { noteRef.current.blur(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement) || k.dialog || document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); k.go(1); }
      else if (key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); k.go(-1); }
      else if (!k.readOnly && key === 'p') k.mark('Passed');
      else if (!k.readOnly && key === 'f') k.mark('Failed');
      else if (!k.readOnly && key === 's') k.mark('Skipped');
      else if (!k.readOnly && key === 'n') { e.preventDefault(); noteRef.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const complete = async () => {
    setBusy('complete');
    try {
      const { defects: ds } = await session.setRunStatus('Tamamlandı');
      setDialog(null);
      const bug = ds.find(d => d.source === 'auto');
      toast.success(`Koşum tamamlandı: ${summary.Passed} geçti, ${summary.Failed} kaldı.${bug ? ` Kaldı sonucu alan case'ler BUG-${bug.id} kaydında.` : ''}`);
    } catch (e) { toast.error(e.message || 'Tamamlanamadı.'); }
    finally { setBusy(null); }
  };

  const reopen = async () => {
    setBusy('reopen');
    try { await session.setRunStatus('Aktif'); toast.info('Koşum yeniden açıldı.'); }
    catch (e) { toast.error(e.message || 'Açılamadı.'); }
    finally { setBusy(null); }
  };

  const bulk = (status) => {
    const n = session.updateMany(r => r.status === 'Pending', { status });
    toast.success(n ? `${n} bekleyen case "${status === 'Passed' ? 'Geçti' : 'Atlandı'}" olarak işaretlendi.` : 'Bekleyen case yok.');
  };

  const createDefect = async () => {
    const tc = current?.tc;
    setBusy('defect');
    try {
      const { data } = await defectsApi.create({
        title: `${tc?.title || caseIdent(current.result.caseId)} — ${run.name}`.slice(0, 500),
        description: current.result.note,
        severity: SEVERITY_BY_PRIORITY[tc?.priority] || 'Orta',
        status: 'Open', project_id: run.project_id, test_run_id: run.id, test_case_id: current.result.caseId,
      });
      toast.success(`BUG-${data.id} açıldı.`);
    } catch (e) { toast.error(e.message || 'Hata kaydı açılamadı.'); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('delete');
    try { await testRunsApi.remove(run.id); toast.success(`${runIdent(run.id)} silindi.`); navigate('/test-runs'); }
    catch (e) { toast.error(e.message || 'Silinemedi.'); setBusy(null); }
  };

  const openEdit = async () => {
    // Düzenleme paneli proje/plan listesini ister; gerekince yüklenir
    const [p, pl] = await Promise.all([projectsApi.getAll(), testPlansApi.getAll()]).catch(() => [{ data: [] }, { data: [] }]);
    setEditCtx({ projects: p.data, plans: pl.data });
  };

  // ── Görünüm ─────────────────────────────────────────────────
  if (session.loading) return (
    <div className="space-y-4"><Skeleton className="h-8 w-80" /><Skeleton className="h-16" /><Skeleton className="h-[28rem]" /></div>
  );
  if (session.error || !run) return (
    <EmptyState title="Koşum açılamadı" description={session.error} action={<Button onClick={() => navigate('/test-runs')}>Koşumlara dön</Button>} />
  );

  const autoDefect = defects?.find(d => d.source === 'auto');
  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link to="/test-runs" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            <ArrowLeft size={12} /> Koşumlar
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Ident>{runIdent(run.id)}</Ident>
            <StatusBadge tone={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABEL[run.status] || run.status}</StatusBadge>
            {!readOnly && <SaveState save={save} onRetry={session.retrySave} />}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{run.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {project && <Link to={`/projects/${project.id}`} className="hover:underline">{project.name}</Link>}
            {plan && <> · Plan: <Link to={`/test-plans/${plan.id}`} className="hover:underline">{plan.title}</Link></>}
            {' '}· {relativeTime(run.updated_at || run.created_at)} güncellendi
            {run.description && <> · {run.description}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {can('test_runs.execute') && (FINISHED.has(run.status)
            ? <Button icon={<RotateCcw size={14} />} onClick={reopen} loading={busy === 'reopen'}>Yeniden aç</Button>
            : <Button variant="primary" icon={<CheckCircle2 size={15} />} onClick={() => setDialog('complete')}>Koşumu tamamla</Button>)}
          {(can('test_runs.execute') || can('test_runs.delete')) && (
            <Menu trigger={({ ref, toggle, open }) => (
              <Button ref={ref} variant="ghost" size="icon" onClick={toggle} aria-label="Diğer işlemler" aria-haspopup="menu" aria-expanded={open}><MoreHorizontal size={16} /></Button>
            )} width={260}>
              {!readOnly && <MenuItem icon={CheckCheck} onSelect={() => bulk('Passed')} disabled={!summary.Pending}>Bekleyenlerin hepsi geçti</MenuItem>}
              {!readOnly && <MenuItem icon={SkipForward} onSelect={() => bulk('Skipped')} disabled={!summary.Pending}>Bekleyenleri atla</MenuItem>}
              {can('test_runs.execute') && <>{!readOnly && <MenuSeparator />}<MenuItem icon={Pencil} onSelect={openEdit}>Ad ve açıklamayı düzenle</MenuItem></>}
              {can('test_runs.delete') && <><MenuSeparator /><MenuItem icon={Trash2} tone="danger" onSelect={() => setDialog('delete')}>Koşumu sil</MenuItem></>}
            </Menu>
          )}
        </div>
      </div>

      {/* Özet */}
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900" aria-label="Koşum özeti">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{summary.done}/{summary.total}</span> sonuç girildi (%{summary.progress})
            {summary.rate != null && <> · geçme oranı <span className="font-semibold tabular-nums text-slate-900 dark:text-white">%{summary.rate}</span></>}
          </p>
          <p className="flex flex-wrap gap-x-4 tabular-nums text-slate-600 dark:text-slate-300">
            <span><span className="font-semibold text-emerald-700 dark:text-emerald-400">{summary.Passed}</span> geçti</span>
            <span><span className="font-semibold text-rose-700 dark:text-rose-400">{summary.Failed}</span> kaldı</span>
            <span><span className="font-semibold text-amber-700 dark:text-amber-400">{summary.Skipped}</span> atlandı</span>
            <span><span className="font-semibold text-slate-900 dark:text-white">{summary.Pending}</span> bekliyor</span>
          </p>
        </div>
        <ResultBar segments={segmentsOf(summary)} />
        {autoDefect && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <Bug size={13} className="text-rose-500" />
            Kaldı sonucu alan case'ler <Link to={`/defects/BUG-${autoDefect.id}`} className="font-medium hover:underline">BUG-{autoDefect.id}</Link> kaydında
            ({DEFECT_LABEL[autoDefect.status] || autoDefect.status})
            {defects.length > 1 && <> · {defects.length - 1} ayrı hata kaydı</>}
          </p>
        )}
      </section>

      {readOnly && can('test_runs.execute') && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Bu koşum tamamlandı; sonuçları değiştirmek için <button type="button" onClick={reopen} className="font-medium underline">yeniden açın</button>.
        </p>
      )}

      {/* Yürütme alanı */}
      {results.length === 0 ? (
        <EmptyState title="Bu koşumda case yok" description="Koşumun kapsamı boş. Projeye ya da plana case ekleyip yeni bir koşum oluşturun." />
      ) : (
        <div className="grid min-h-[28rem] overflow-hidden rounded-2xl border border-slate-200 bg-white lg:h-[calc(100vh-20rem)] lg:grid-cols-[22rem_1fr] dark:border-slate-800 dark:bg-slate-900">
          <div className={`min-h-0 border-slate-200 lg:flex lg:flex-col lg:border-r dark:border-slate-800 ${mobileDetail ? 'hidden' : 'flex flex-col max-h-[70vh] lg:max-h-none'}`}>
            <RunCaseList items={visible} counts={summary} filter={filter} onFilter={setFilter} query={query} onQuery={setQuery}
              selectedId={selectedId} onSelect={(cid) => { setSelected(cid); setMobileDetail(true); }} />
          </div>
          <div className={`min-h-0 lg:flex lg:flex-col ${mobileDetail ? 'flex flex-col' : 'hidden'}`}>
            <RunCasePanel result={current?.result} tc={current?.tc} index={current?.index ?? 0} total={results.length}
              readOnly={readOnly} noteRef={noteRef}
              onResult={mark} onNote={(note) => session.update(current.result.caseId, { note })}
              onPrev={pos > 0 ? () => go(-1) : null} onNext={pos !== -1 && pos < visible.length - 1 ? () => go(1) : null}
              onBack={() => setMobileDetail(false)}
              canDefect={!readOnly && can('defects.manage')} onDefect={createDefect} defectBusy={busy === 'defect'} />
          </div>
        </div>
      )}

      {!readOnly && (
        <p className="hidden text-xs text-slate-400 lg:block">
          Kısayollar: <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> sonraki/önceki · <kbd className="font-mono">p</kbd> geçti · <kbd className="font-mono">f</kbd> kaldı · <kbd className="font-mono">s</kbd> atla · <kbd className="font-mono">n</kbd> not. Geçti ya da atla sonrası sıradaki bekleyen case açılır.
        </p>
      )}

      <ConfirmDialog open={dialog === 'complete'} onClose={() => setDialog(null)} onConfirm={complete} loading={busy === 'complete'}
        tone={summary.Pending ? 'danger' : 'primary'} confirmLabel="Tamamla"
        title="Koşum tamamlansın mı?"
        description={summary.Pending
          ? `${summary.Pending} case hâlâ bekliyor; bunlar sonuçsuz kalır. Girilen sonuçlar case'lerin son sonucuna${plan ? ', plana' : ''} ve hata kaydına yansıtılacak.`
          : `Tüm sonuçlar girildi. Sonuçlar case'lerin son sonucuna${plan ? ', plana' : ''} ve hata kaydına yansıtılacak.`} />
      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={remove} loading={busy === 'delete'} confirmLabel="Sil"
        title={`${runIdent(run.id)} silinsin mi?`} description="Koşumun tüm sonuçları silinir. Bu işlem geri alınamaz." />
      {editCtx && (
        <RunFormDrawer run={run} projects={editCtx.projects} plans={editCtx.plans} caseCounts={new Map()}
          onClose={() => setEditCtx(null)} onSaved={(saved) => { setEditCtx(null); session.replaceRun(saved); }} />
      )}
    </div>
  );
};

export default TestRunDetail;
