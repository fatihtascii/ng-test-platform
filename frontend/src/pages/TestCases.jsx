/**
 * Test case'ler: liste, filtreler, toplu işlemler, detay ve düzenleme paneli.
 *
 * Parçalar ./test-cases altında:
 *   model.js         veri dönüşümleri, doğrulama, CSV (bileşen yok)
 *   useCaseData.js   sunucudan okuma ve değişiklikler
 *   useCaseQuery.js  arama/filtre/sıralama/sayfa ve açık case → adres çubuğu
 *   CaseTable, CaseFilters, BulkBar, CaseDetail, CaseForm, StepEditor, diyaloglar
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Download, RefreshCw, Pencil, Copy, Trash2, Play, Smartphone, ClipboardList, FlaskConical, Eye } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { PageHeader, Button, ResultBar, EmptyState } from '../components/ui';
import { Drawer, ConfirmDialog } from '../components/ui/overlay';
import { TONES } from '../components/ui/tokens';
import { toast } from '../components/ui/toast';

import { useCaseData } from './test-cases/useCaseData';
import { useCaseQuery } from './test-cases/useCaseQuery';
import CaseTable from './test-cases/CaseTable';
import CaseFilters from './test-cases/CaseFilters';
import BulkBar from './test-cases/BulkBar';
import CaseDetail, { CaseDetailActions } from './test-cases/CaseDetail';
import CaseForm from './test-cases/CaseForm';
import AiDialog from './test-cases/AiDialog';
import MobileRunDialog from './test-cases/MobileRunDialog';
import AddToPlanDialog from './test-cases/AddToPlanDialog';
import {
  STATUSES, compareCases, matchesQuery, isAutomatable, caseIdent, casesToCsv, downloadText,
  emptyForm, formFromCase, formFromAi, formSignature, validateForm, buildPayload, duplicatePayload, trLower,
} from './test-cases/model';

const STATUS_SEGMENT = { 'Başarılı': 'pass', 'Başarısız': 'fail', 'Test Edilmedi': 'pending', 'Taslak': 'draft' };

const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

const TestCases = () => {
  const { can } = usePermission();
  const navigate = useNavigate();
  const location = useLocation();
  const data = useCaseData();
  const query = useCaseQuery();
  const { cases, byId, projects, projectName, loading, error } = data;
  const { filters, sort } = query;

  const [selected, setSelected] = useState(() => new Set());
  const [editor, setEditor] = useState(null);         // { mode, form, baseline, errors }
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);         // { type: 'delete'|'discard'|'ai'|'mobile'|'plan', ... }
  const [busy, setBusy] = useState(null);
  const searchRef = useRef(null);

  // ── Filtreleme / sıralama ───────────────────────────────────
  const allTags = useMemo(() => {
    const set = new Set(); cases.forEach(c => c.tagList.forEach(t => set.add(t)));
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [cases]);

  // Statü dışındaki tüm filtreler: özet şeridi bunun üzerinden sayar, statü filtresi şeritten seçilir
  const baseFiltered = useMemo(() => cases.filter(c =>
    (!filters.project || String(c.project_id) === filters.project) &&
    (!filters.priority || c.priority === filters.priority) &&
    (!filters.exec || c.execution_type === filters.exec) &&
    (!filters.type || c.type === filters.type) &&
    (!filters.tag || c.tagList.some(t => trLower(t) === trLower(filters.tag))) &&
    matchesQuery(c, query.q, projectName)
  ), [cases, filters.project, filters.priority, filters.exec, filters.type, filters.tag, query.q, projectName]);

  const filtered = useMemo(() => {
    const list = filters.status ? baseFiltered.filter(c => c.status === filters.status) : baseFiltered.slice();
    const cmp = compareCases(sort.key, projectName);
    const dir = sort.direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => (cmp(a, b) || a.id - b.id) * dir);
  }, [baseFiltered, filters.status, sort, projectName]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const rows = filtered.slice((page - 1) * query.pageSize, page * query.pageSize);

  const segments = STATUSES.map(s => ({ label: s, value: baseFiltered.filter(c => c.status === s).length, tone: STATUS_SEGMENT[s], status: s }));
  const passed = segments[2].value, failed = segments[3].value;
  const automatedCount = baseFiltered.filter(c => c.execution_type === 'Automated').length;

  // ── Seçim ───────────────────────────────────────────────────
  const selectedCases = useMemo(() => [...selected].map(id => byId.get(id)).filter(Boolean), [selected, byId]);
  const visibleIds = useMemo(() => new Set(filtered.map(c => c.id)), [filtered]);
  const toggle = (id) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = (ids, on) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n; });
  const dropFromSelection = (ids) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
  const selectable = can('test_cases.edit') || can('test_cases.delete') || can('test_plans.edit') || can('automation.execute');

  // ── Açık case / panel ───────────────────────────────────────
  const openCase = query.openCase;
  const current = query.caseId ? byId.get(query.caseId) : null;
  const position = current ? filtered.findIndex(c => c.id === current.id) : -1;

  const closeDetail = useCallback(() => {
    if (location.state?.caseDrawer) navigate(-1);
    else openCase(null);
  }, [location.state, navigate, openCase]);

  const goRelative = useCallback((d) => {
    const next = filtered[position + d];
    if (next) openCase(next.id, { replace: true });
  }, [filtered, position, openCase]);

  const startCreate = (form) => {
    const f = form || emptyForm(filters.project || (projects.length === 1 ? projects[0].id : ''));
    setEditor({ mode: 'create', form: f, baseline: formSignature(emptyForm(f.project_id)), errors: {} });
  };
  const startEdit = (c) => {
    if (query.caseId !== c.id) openCase(c.id);
    const f = formFromCase(c);
    setEditor({ mode: 'edit', id: c.id, form: f, baseline: formSignature(f), errors: {} });
  };
  const setForm = (updater) => setEditor(e => ({ ...e, form: typeof updater === 'function' ? updater(e.form) : updater }));
  const dirty = editor ? formSignature(editor.form) !== editor.baseline : false;
  const closeEditor = (force = false) => {
    if (!force && dirty) { setDialog({ type: 'discard' }); return; }
    setEditor(null);
  };

  const save = async () => {
    if (!editor || saving) return;
    const errors = validateForm(editor.form);
    if (Object.keys(errors).length) { setEditor(e => ({ ...e, errors })); return; }
    setSaving(true);
    try {
      const payload = buildPayload(editor.form);
      if (editor.mode === 'create') {
        const created = await data.create(payload);
        setEditor(null);
        openCase(created.id);
        toast.success(`${caseIdent(created.id)} oluşturuldu.`);
      } else {
        await data.update(editor.id, payload);
        setEditor(null);
        toast.success('Değişiklikler kaydedildi.');
      }
    } catch (err) {
      toast.error(err.message || 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  // ── İşlemler ────────────────────────────────────────────────
  const duplicate = async (c) => {
    try {
      const copy = await data.create(duplicatePayload(c));
      openCase(copy.id, { replace: Boolean(query.caseId) });
      toast.success(`${caseIdent(c.id)} kopyalandı: ${caseIdent(copy.id)}.`);
    } catch (err) { toast.error(err.message || 'Kopyalanamadı.'); }
  };

  const confirmDelete = async () => {
    const ids = dialog.ids;
    setBusy('delete');
    try {
      const n = await data.remove(ids);
      dropFromSelection(ids);
      if (ids.includes(query.caseId)) { setEditor(null); openCase(null); }
      toast.success(n === 1 ? `${caseIdent(ids[0])} silindi.` : `${n} case silindi.`);
      setDialog(null);
    } catch (err) { toast.error(err.message || 'Silinemedi.'); }
    finally { setBusy(null); }
  };

  const bulkStatus = async (status) => {
    setBusy('status');
    try {
      const n = await data.setStatus(selected, status);
      toast.success(`${n} case "${status}" olarak işaretlendi.`);
      setSelected(new Set());
      return true;
    } catch (err) { toast.error(err.message || 'Güncellenemedi.'); return false; }
    finally { setBusy(null); }
  };

  const sendToAutomation = (list) => {
    const auto = list.filter(isAutomatable);
    if (!auto.length) { toast.error('Seçimde script\'i olan otomasyon case\'i yok.'); return; }
    const projectsInSel = new Set(auto.map(c => c.project_id));
    if (projectsInSel.size > 1) { toast.error('Otomasyon tek seferde tek projenin case\'lerini koşar; seçimi bir projeyle sınırlayın.'); return; }
    navigate(`/automation?cases=${auto.map(c => c.id).join(',')}&project=${auto[0].project_id}`);
  };

  const exportCsv = (list, label) => {
    const day = new Date().toISOString().slice(0, 10);
    downloadText(casesToCsv(list, projectName), `test-caseler-${day}.csv`);
    toast.success(`${list.length} case ${label} CSV olarak indirildi.`);
  };

  const rowActions = (c) => {
    const a = [{ icon: Eye, label: 'Aç', onSelect: () => openCase(c.id) }];
    if (can('test_cases.edit')) a.push({ icon: Pencil, label: 'Düzenle', onSelect: () => startEdit(c) });
    if (can('test_cases.create')) a.push({ icon: Copy, label: 'Kopyasını oluştur', onSelect: () => duplicate(c) });
    const run = [];
    if (can('test_plans.edit')) run.push({ icon: ClipboardList, label: 'Plana ekle', onSelect: () => setDialog({ type: 'plan', cases: [c] }) });
    if (can('automation.execute') && isAutomatable(c)) run.push({ icon: Play, label: 'Otomasyonda koş', onSelect: () => sendToAutomation([c]) });
    if (can('automation.execute')) run.push({ icon: Smartphone, label: 'Mobil cihazda koş', onSelect: () => setDialog({ type: 'mobile', testCase: c }) });
    if (run.length) a.push('sep', ...run);
    if (can('test_cases.delete')) a.push('sep', { icon: Trash2, label: 'Sil', tone: 'danger', onSelect: () => setDialog({ type: 'delete', ids: [c.id] }) });
    return a;
  };

  // ── Klavye kısayolları ──────────────────────────────────────
  const keys = useRef({});
  keys.current = { editor, dialog, current, goRelative, startEdit, startCreate, can };
  useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      if (k.editor && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); document.getElementById('tc-save')?.click(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement) || k.dialog || k.editor) return;
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'n' && !k.current && k.can('test_cases.create')) { e.preventDefault(); k.startCreate(); }
      else if (k.current && e.key === 'j') k.goRelative(1);
      else if (k.current && e.key === 'k') k.goRelative(-1);
      else if (k.current && e.key === 'e' && k.can('test_cases.edit')) { e.preventDefault(); k.startEdit(k.current); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Görünüm ─────────────────────────────────────────────────
  const empty = cases.length === 0 ? (
    <EmptyState icon={<FlaskConical size={24} />} title="Henüz test case yok"
      description={projects.length ? 'İlk case\'i elle yazın ya da AI ile bir taslak üretin.' : 'Case eklemek için önce bir proje oluşturun.'}
      action={projects.length ? (can('test_cases.create') && (
        <div className="flex gap-2">
          <Button icon={<Sparkles size={14} />} onClick={() => setDialog({ type: 'ai' })}>AI ile taslak</Button>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => startCreate()}>Test case ekle</Button>
        </div>
      )) : can('projects.create') && <Button variant="primary" onClick={() => navigate('/projects')}>Projelere git</Button>} />
  ) : (
    <EmptyState title="Filtrelere uyan case yok" description="Aramayı veya filtreleri gevşetin."
      action={<Button onClick={query.clearFilters}>Filtreleri temizle</Button>} />
  );

  const drawerOpen = Boolean(editor) || Boolean(current);

  return (
    <div className="space-y-5">
      <PageHeader title="Test case'ler"
        description="Adımları, beklenen sonuçları, BDD senaryoları ve otomasyon script'leriyle tüm case'ler."
        actions={<>
          <Button variant="ghost" size="icon" onClick={data.reload} aria-label="Yenile" title="Yenile"
            disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></Button>
          <Button icon={<Download size={14} />} onClick={() => exportCsv(filtered, 'listesi')} disabled={!filtered.length}>CSV</Button>
          {can('test_cases.create') && <>
            <Button icon={<Sparkles size={14} />} onClick={() => setDialog({ type: 'ai' })} disabled={!projects.length}>AI ile taslak</Button>
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => startCreate()} disabled={!projects.length}
              title="Yeni test case (n)">Yeni test case</Button>
          </>}
        </>} />

      {error && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
          <Button size="sm" className="ml-auto" onClick={data.reload}>Tekrar dene</Button>
        </div>
      )}

      {/* Özet: son sonuç dağılımı. Gösterge düğmeleri statü filtresi olarak çalışır. */}
      {cases.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 dark:border-slate-800 dark:bg-slate-900" aria-label="Son sonuç özeti">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 tabular-nums dark:text-white">{baseFiltered.length}</span> case
              {passed + failed > 0 && <> · geçme oranı <span className="font-semibold text-slate-900 tabular-nums dark:text-white">%{Math.round((passed / (passed + failed)) * 100)}</span></>}
              {' '}· {automatedCount} otomasyon, {baseFiltered.length - automatedCount} manuel
            </p>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Son sonuca göre filtrele">
              {segments.map(s => {
                const active = filters.status === s.status;
                return (
                  <button key={s.status} type="button" aria-pressed={active}
                    onClick={() => query.setFilter('status', active ? '' : s.status)}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                    <span className={`h-2 w-2 rounded-full ${TONES[s.tone].dot}`} aria-hidden />
                    {s.label}<span className="tabular-nums opacity-70">{s.value}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <ResultBar segments={segments} height="h-2" />
        </section>
      )}

      <CaseFilters query={query} projects={projects} tags={allTags} searchRef={searchRef} />

      {selected.size > 0 && (
        <BulkBar count={selected.size} hiddenCount={[...selected].filter(id => !visibleIds.has(id)).length} busy={busy}
          onClear={() => setSelected(new Set())}
          onStatus={can('test_cases.edit') ? bulkStatus : null}
          onAddToPlan={can('test_plans.edit') ? () => setDialog({ type: 'plan', cases: selectedCases }) : null}
          onAutomation={can('automation.execute') ? () => sendToAutomation(selectedCases) : null}
          automatableCount={selectedCases.filter(isAutomatable).length}
          onExport={() => exportCsv(selectedCases, 'seçimi')}
          onDelete={can('test_cases.delete') ? () => setDialog({ type: 'delete', ids: [...selected] }) : null} />
      )}

      <CaseTable rows={rows} total={filtered.length} loading={loading && !cases.length}
        selectable={selectable} selected={selected} onToggle={toggle} onTogglePage={togglePage}
        sort={sort} onSort={query.toggleSort} projectName={projectName}
        onOpen={(id) => openCase(id, { replace: Boolean(query.caseId) })} activeId={current?.id} rowActions={rowActions}
        page={page} pageSize={query.pageSize} onPage={query.setPage} onPageSize={query.setPageSize} empty={empty} />

      <p className="hidden text-xs text-slate-400 lg:block">
        Kısayollar: <kbd className="font-mono">/</kbd> ara · <kbd className="font-mono">n</kbd> yeni case · panelde <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> sonraki/önceki, <kbd className="font-mono">e</kbd> düzenle · formda <kbd className="font-mono">Ctrl+S</kbd> kaydet
      </p>

      {/* Detay / form paneli */}
      <Drawer open={drawerOpen} size="xl"
        onClose={editor ? () => closeEditor() : closeDetail}
        eyebrow={editor ? (editor.mode === 'create' ? 'Yeni test case' : `${caseIdent(editor.id)} düzenleniyor`) : current && `${projectName(current.project_id)}${position >= 0 ? ` · ${position + 1} / ${filtered.length}` : ''}`}
        title={editor ? (editor.form.title.trim() || 'Başlıksız case') : current && caseIdent(current.id)}
        actions={!editor && current && (
          <CaseDetailActions c={current} can={can}
            onEdit={() => startEdit(current)} onDuplicate={() => duplicate(current)}
            onDelete={() => setDialog({ type: 'delete', ids: [current.id] })}
            onMobile={() => setDialog({ type: 'mobile', testCase: current })}
            onAddToPlan={() => setDialog({ type: 'plan', cases: [current] })}
            onAutomation={() => sendToAutomation([current])}
            onPrev={position > 0 ? () => goRelative(-1) : null}
            onNext={position >= 0 && position < filtered.length - 1 ? () => goRelative(1) : null} />
        )}
        footer={editor && (
          <>
            <span className="mr-auto hidden text-xs text-slate-400 sm:inline">{dirty ? 'Kaydedilmemiş değişiklikler var' : 'Değişiklik yok'} · Ctrl+S</span>
            <Button variant="ghost" onClick={() => closeEditor()} disabled={saving}>Vazgeç</Button>
            <Button id="tc-save" variant="primary" onClick={save} loading={saving}
              disabled={editor.mode === 'edit' && !dirty}>{editor.mode === 'create' ? 'Oluştur' : 'Kaydet'}</Button>
          </>
        )}>
        {editor ? (
          <CaseForm key={editor.mode + (editor.id || '')} form={editor.form} setForm={setForm} errors={editor.errors}
            mode={editor.mode} projects={projects} tagSuggestions={allTags} />
        ) : current ? (
          <CaseDetail c={current} projectName={projectName} can={can} />
        ) : null}
      </Drawer>

      {/* Diyaloglar */}
      <ConfirmDialog open={dialog?.type === 'delete'} onClose={() => setDialog(null)} onConfirm={confirmDelete}
        loading={busy === 'delete'} confirmLabel="Sil"
        title={dialog?.ids?.length > 1 ? `${dialog.ids.length} case silinsin mi?` : `${dialog?.ids ? caseIdent(dialog.ids[0]) : ''} silinsin mi?`}
        description="Case'ler test planlarından da çıkarılır. Geçmiş koşum sonuçları korunur. Bu işlem geri alınamaz." />

      <ConfirmDialog open={dialog?.type === 'discard'} onClose={() => setDialog(null)} confirmLabel="Değişiklikleri at"
        onConfirm={() => { setDialog(null); closeEditor(true); }}
        title="Kaydedilmemiş değişiklikler var" description="Paneli kapatırsanız yaptığınız değişiklikler kaybolur." />

      {dialog?.type === 'ai' && (
        <AiDialog open onClose={() => setDialog(null)}
          onImport={(result) => {
            setDialog(null);
            startCreate(formFromAi(result, filters.project || projects[0]?.id || ''));
            toast.info('Taslak forma aktarıldı; gözden geçirip kaydedin.');
          }} />
      )}
      {dialog?.type === 'mobile' && <MobileRunDialog testCase={dialog.testCase} onClose={() => setDialog(null)} />}
      {dialog?.type === 'plan' && <AddToPlanDialog cases={dialog.cases} projectName={projectName} onClose={() => setDialog(null)} />}
    </div>
  );
};

export default TestCases;
