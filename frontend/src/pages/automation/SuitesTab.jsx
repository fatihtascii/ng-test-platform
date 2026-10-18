import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, MoreHorizontal, Pencil, Trash2, GitBranch, ChevronRight, FolderGit2 } from 'lucide-react';
import { Button, StatusBadge, EmptyState, Ident } from '../../components/ui';
import { Menu, MenuItem, MenuSeparator, Modal } from '../../components/ui/overlay';
import { toast } from '../../components/ui/toast';
import { suitesApi } from '../../api';
import { relativeTime, formatDate } from '../test-runs/model';
import SuiteFormDrawer from './SuiteFormDrawer';
import { suiteStatus, shortSha } from './suiteModel';

const SyncLog = ({ text }) => {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [text]);
  return (
    <pre ref={ref} className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs leading-relaxed text-slate-300">
      {text || 'Günlük boş.'}
    </pre>
  );
};

const SuiteCard = ({ suite, canManage, onEdit, onDelete, onSynced }) => {
  const [state, setState] = useState(null);       // senkronizasyon durumu (günlük dahil)
  const [open, setOpen] = useState(suite.sync_status === 'error');
  const syncing = state ? state.syncing : suite.syncing;
  const st = suiteStatus({ ...suite, syncing, sync_status: state?.sync_status || suite.sync_status });
  const summary = state?.sync_summary || suite.sync_summary;
  const wasSyncing = useRef(suite.syncing);

  // Sürerken her 1,5 sn'de durumu ve günlüğü oku; bitince listeyi tazele
  useEffect(() => {
    if (!syncing && !open) return undefined;
    let alive = true;
    const tick = () => suitesApi.syncState(suite.id).then(({ data }) => {
      if (!alive) return;
      if (wasSyncing.current && !data.syncing) onSynced(suite.id, data);
      wasSyncing.current = data.syncing;
      setState(data);
    }).catch(() => {});
    tick();
    if (!syncing) return () => { alive = false; };
    const t = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [syncing, open, suite.id, onSynced]);

  const sync = async () => {
    try {
      const { data } = await suitesApi.sync(suite.id);
      wasSyncing.current = data.syncing;
      if (!data.syncing) onSynced(suite.id, data);    // hızlı biten senkronizasyon
      setState(data);
      setOpen(true);
    } catch (e) { toast.error(e.message || 'Senkronizasyon başlatılamadı.'); }
  };

  const markers = Object.entries(summary?.markers || {}).slice(0, 12);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label={suite.name}>
      <div className="flex flex-wrap items-start gap-3 px-4 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><FolderGit2 size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            {suite.name} <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate font-mono">{suite.repo_url.replace(/^https:\/\//, '')}</span>
            <span className="inline-flex items-center gap-0.5"><GitBranch size={11} />{suite.branch}</span>
            <span>· {suite.project_name}</span>
            {suite.environment_name && <span>· ortam: {suite.environment_name}</span>}
          </p>
          {(state?.commit_sha || suite.commit_sha) && (
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              <Ident>{shortSha(state?.commit_sha || suite.commit_sha)}</Ident> {suite.commit_message}
              {(state?.synced_at || suite.synced_at) && <> · <span title={formatDate(state?.synced_at || suite.synced_at, true)}>{relativeTime(state?.synced_at || suite.synced_at)} senkronize edildi</span></>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && <Button size="sm" icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />} onClick={sync} disabled={syncing}>{syncing ? 'Senkronize ediliyor' : 'Senkronize et'}</Button>}
          {canManage && (
            <Menu trigger={({ ref, toggle, open: o }) => (
              <button ref={ref} type="button" onClick={toggle} aria-label={`${suite.name} işlemleri`} aria-haspopup="menu" aria-expanded={o}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><MoreHorizontal size={16} /></button>
            )}>
              <MenuItem icon={Pencil} onSelect={() => onEdit(suite)} disabled={syncing}>Ayarlar</MenuItem>
              <MenuSeparator />
              <MenuItem icon={Trash2} tone="danger" onSelect={() => onDelete(suite)} disabled={syncing}>Bağlantıyı kaldır</MenuItem>
            </Menu>
          )}
        </div>
      </div>

      <div className="grid gap-3 border-t border-slate-100 px-4 py-3 text-sm sm:grid-cols-[auto_1fr] dark:border-slate-800">
        <dl className="flex gap-5">
          <div><dt className="text-xs text-slate-500 dark:text-slate-400">Case</dt><dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{suite.case_count}</dd></div>
          {summary && <div><dt className="text-xs text-slate-500 dark:text-slate-400">Test</dt><dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{summary.tests ?? '—'}</dd></div>}
          {summary?.missing > 0 && <div><dt className="text-xs text-slate-500 dark:text-slate-400">Depoda yok</dt><dd className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">{summary.missing}</dd></div>}
        </dl>
        {markers.length > 0 && (
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">İşaretler (etiket olarak aktarıldı)</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {markers.map(([m, n]) => (
                <Link key={m} to={`/test-cases?project=${suite.project_id}&tag=${encodeURIComponent(m)}`}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300">{m} <span className="text-slate-400">{n}</span></Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {suite.sync_status === 'never' && !syncing && !state && (
        <p className="border-t border-slate-100 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          Henüz senkronize edilmedi. "Senkronize et" depoyu çeker, bağımlılıkları kurar ve testleri case olarak içe aktarır (ilk seferde birkaç dakika sürebilir).
        </p>
      )}

      <div className="border-t border-slate-100 dark:border-slate-800">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
          <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} /> Senkronizasyon günlüğü
        </button>
        {open && <div className="px-4 pb-4"><SyncLog text={state?.sync_log} /></div>}
      </div>
    </section>
  );
};

/** Otomasyon depoları sekmesi */
const SuitesTab = ({ suites, projects, envs, project, canManage, onChange }) => {
  const [form, setForm] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const shown = suites.filter(s => !project || String(s.project_id) === project);

  const onSynced = useCallback((id, st) => {
    if (st.sync_status === 'ready') toast.success(`Depo senkronize edildi: ${st.sync_summary?.added ?? 0} yeni, ${st.sync_summary?.updated ?? 0} güncellenen case.`);
    else if (st.sync_status === 'error') toast.error('Senkronizasyon başarısız; günlüğe bakın.');
    onChange();
  }, [onChange]);

  const remove = async (deleteCases) => {
    setBusy(true);
    try {
      const { data } = await suitesApi.remove(removing.id, deleteCases);
      toast.success(deleteCases ? `Depo ve ${data.cases} case silindi.` : 'Depo bağlantısı kaldırıldı; case\'ler korundu.');
      setRemoving(null);
      onChange();
    } catch (e) { toast.error(e.message || 'Kaldırılamadı.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto max-w-2xl text-sm text-slate-600 dark:text-slate-300">
          Mevcut bir pytest/Playwright otomasyon projesini (GitHub deposu) bağlayın: testleri case olarak içe aktarılır, buradan ya da CI'dan koşturulur, sonuçları raporlara ve hata kayıtlarına yansır.
        </p>
        {canManage && <Button variant="primary" icon={<Plus size={15} />} onClick={() => setForm({})} disabled={!projects.length}>Depo bağla</Button>}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={<FolderGit2 size={24} />} title="Bağlı otomasyon deposu yok"
          description={canManage ? 'Bir GitHub deposu bağlayarak başlayın.' : 'Depo bağlamak için "otomasyon depolarını yönet" izni gerekir.'}
          action={canManage && <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({})}>Depo bağla</Button>} />
      ) : shown.map(s => (
        <SuiteCard key={s.id} suite={s} canManage={canManage} onEdit={x => setForm({ suite: x })} onDelete={setRemoving} onSynced={onSynced} />
      ))}
      {form && (
        <SuiteFormDrawer suite={form.suite} projects={projects} envs={envs} defaultProject={project}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); onChange(); }} />
      )}
      {removing && (
        <Modal open onClose={() => !busy && setRemoving(null)} dismissable={!busy} size="sm" title={`${removing.name} bağlantısı kaldırılsın mı?`}
          footer={<>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={busy}>Vazgeç</Button>
            <Button onClick={() => remove(false)} loading={busy}>Case'leri koru</Button>
            <Button variant="danger" onClick={() => remove(true)} loading={busy}>Case'lerle birlikte sil</Button>
          </>}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Depodan içe aktarılan <b className="font-semibold">{removing.case_count}</b> case var. Korursanız geçmiş sonuçlarıyla kalır ama artık koşturulamaz. Sunucudaki depo kopyası her iki durumda da silinir.
          </p>
        </Modal>
      )}
    </div>
  );
};

export default SuitesTab;
