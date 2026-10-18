import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Copy, Trash2, Play, Smartphone, ClipboardList, ChevronUp, ChevronDown, MoreHorizontal, ListChecks, MonitorPlay } from 'lucide-react';
import { StatusBadge, Ident, Button, EmptyState, Skeleton } from '../../components/ui';
import { Tabs } from '../../components/ui/data';
import { Menu, MenuItem, MenuSeparator } from '../../components/ui/overlay';
import { testCasesApi } from '../../api';
import CodeBlock from './CodeBlock';
import CaseLinks from './CaseLinks';
import { PriorityMark, TagList } from './parts';
import { caseIdent, formatDate, EXECUTION_LABEL, isAutomatable } from './model';

const RESULT_LABEL = { Passed: 'Geçti', Failed: 'Kaldı', Blocked: 'Bloklandı', Skipped: 'Atlandı', Untested: 'Koşulmadı' };
const DEFECT_LABEL = { Open: 'Açık', 'In Progress': 'İnceleniyor', 'Re-test': 'Tekrar test', Resolved: 'Çözüldü' };

const Meta = ({ label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2 text-sm">
    <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="min-w-0 text-right text-slate-900 dark:text-slate-100">{children}</dd>
  </div>
);

const Steps = ({ steps }) => {
  if (!steps.length) return <EmptyState icon={<ListChecks size={22} />} title="Adım girilmemiş" description="Düzenle ile adım ve beklenen sonuç ekleyebilirsiniz." />;
  return (
    <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      {steps.map((s, i) => (
        <li key={s.id || i} className="grid grid-cols-[2rem_1fr] gap-x-3 px-3 py-3 sm:grid-cols-[2rem_1fr_1fr]">
          <span className="pt-0.5 font-mono text-xs tabular-nums text-slate-400">{String(i + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            <p className="whitespace-pre-wrap text-sm text-slate-900 [overflow-wrap:anywhere] dark:text-slate-100">{s.action || <span className="italic text-slate-400">Aksiyon yok</span>}</p>
            {s.image && (
              <a href={s.image} target="_blank" rel="noreferrer" className="mt-2 inline-block">
                <img src={s.image} alt={`Adım ${i + 1} görseli`} className="max-h-40 rounded border border-slate-200 bg-slate-50 object-contain dark:border-slate-700 dark:bg-slate-800" />
              </a>
            )}
          </div>
          <div className="col-start-2 mt-2 min-w-0 border-l-2 border-slate-200 pl-3 sm:col-start-3 sm:mt-0 dark:border-slate-700">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Beklenen</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{s.expectedResult || '—'}</p>
          </div>
        </li>
      ))}
    </ol>
  );
};

const History = ({ caseId }) => {
  const [state, setState] = useState({ id: null });
  useEffect(() => {
    let alive = true;
    testCasesApi.history(caseId)
      .then(({ data }) => alive && setState({ id: caseId, data }))
      .catch(err => alive && setState({ id: caseId, error: err.message }));
    return () => { alive = false; };
  }, [caseId]);

  if (state.id !== caseId) return <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-10" />)}</div>;
  if (state.error) return <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>;
  const { runs, defects } = state.data;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">Son koşumlar</h3>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Bu case henüz bir koşumda yer almadı.</p>
        ) : (
          <>
            {/* Son 20 sonucun şeridi: soldan sağa eskiden yeniye */}
            <div className="mb-3 flex h-5 gap-px" role="img" aria-label="Sonuç geçmişi">
              {[...runs].reverse().map(r => (
                <span key={r.run_id} title={`${r.run_name}: ${RESULT_LABEL[r.result]}`}
                  className={`w-2.5 rounded-[1px] ${r.result === 'Passed' ? 'bg-emerald-500' : r.result === 'Failed' ? 'bg-rose-500' : r.result === 'Blocked' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
              ))}
            </div>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {runs.map(r => (
                <li key={r.run_id} className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Link to={`/test-runs/${r.run_id}`} className="min-w-0 flex-1 truncate text-sm text-slate-900 hover:underline dark:text-slate-100">{r.run_name}</Link>
                    <span className="hidden text-xs tabular-nums text-slate-500 sm:inline dark:text-slate-400">{formatDate(r.created_at, true)}</span>
                    <StatusBadge status={r.result}>{RESULT_LABEL[r.result]}</StatusBadge>
                  </div>
                  {r.note && <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{r.note}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-900 dark:text-slate-100">Bağlı hata kayıtları</h3>
        {defects.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Bağlı hata kaydı yok.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {defects.map(d => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                <Ident>BUG-{d.id}</Ident>
                <Link to={`/defects/BUG-${d.id}`} className="min-w-0 flex-1 truncate text-sm text-slate-900 hover:underline dark:text-slate-100">{d.title}</Link>
                <StatusBadge status={d.status}>{DEFECT_LABEL[d.status] || d.status}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

/** Drawer gövdesi ve başlık aksiyonları; Drawer'ın kendisi sayfada. */
export const CaseDetailActions = ({ c, can, onEdit, onDuplicate, onDelete, onMobile, onAddToPlan, onAutomation, onBrowserRun, browserBusy, onPrev, onNext }) => {
  const run = [
    can('automation.execute') && isAutomatable(c) && { icon: Play, label: 'Otomasyonda koş', onSelect: onAutomation },
    can('automation.execute') && { icon: Smartphone, label: 'Mobil cihazda koş', onSelect: onMobile },
    can('test_plans.edit') && { icon: ClipboardList, label: 'Plana ekle', onSelect: onAddToPlan },
    can('test_cases.create') && { icon: Copy, label: 'Kopyasını oluştur', onSelect: onDuplicate },
  ].filter(Boolean);
  const canDelete = can('test_cases.delete');
  const canBrowser = onBrowserRun && can('automation.execute') && isAutomatable(c);
  return (
    <div className="flex items-center gap-1">
      <div className="mr-1 hidden items-center sm:flex">
        <Button variant="ghost" size="icon" onClick={onPrev} disabled={!onPrev} aria-label="Önceki case (k)" title="Önceki (k)"><ChevronUp size={16} /></Button>
        <Button variant="ghost" size="icon" onClick={onNext} disabled={!onNext} aria-label="Sonraki case (j)" title="Sonraki (j)"><ChevronDown size={16} /></Button>
      </div>
      {canBrowser && (
        <Button size="sm" icon={<MonitorPlay size={13} />} onClick={onBrowserRun} disabled={browserBusy}
          title={browserBusy ? 'Bir tarayıcı koşumu sürüyor' : 'Bu case\'i tarayıcı görünür koş'}>
          <span className="hidden sm:inline">Tarayıcıda çalıştır</span><span className="sm:hidden">Çalıştır</span>
        </Button>
      )}
      {can('test_cases.edit') && <Button size="sm" icon={<Pencil size={13} />} onClick={onEdit}>Düzenle</Button>}
      {(run.length > 0 || canDelete) && (
        <Menu trigger={({ ref, toggle, open }) => (
          <Button ref={ref} variant="ghost" size="icon" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label="Diğer işlemler">
            <MoreHorizontal size={16} />
          </Button>
        )}>
          {run.map(a => <MenuItem key={a.label} icon={a.icon} onSelect={a.onSelect}>{a.label}</MenuItem>)}
          {canDelete && <>{run.length > 0 && <MenuSeparator />}<MenuItem icon={Trash2} tone="danger" onSelect={onDelete}>Sil</MenuItem></>}
        </Menu>
      )}
    </div>
  );
};

const CaseDetail = ({ c, projectName, can }) => {
  const tabs = [
    { id: 'steps', label: 'Adımlar', count: c.steps.length },
    c.gherkin_scenario && { id: 'bdd', label: 'BDD' },
    c.automation_script && { id: 'script', label: 'Script' },
    can('test_runs.view') && { id: 'history', label: 'Geçmiş' },
  ].filter(Boolean);
  const [tabState, setTab] = useState({ id: c.id, tab: 'steps' });
  // Başka case'e geçince ilk sekmeye dön; sekme bu case'de yoksa da
  const tab = tabState.id === c.id && tabs.some(t => t.id === tabState.tab) ? tabState.tab : 'steps';

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_260px]">
      <div className="min-w-0 space-y-4 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Ident>{caseIdent(c.id)}</Ident>
            <StatusBadge status={c.status} />
          </div>
          <h1 className="mt-1.5 text-lg font-semibold leading-snug text-slate-900 dark:text-white">{c.title}</h1>
          {c.tagList.length > 0 && <TagList tags={c.tagList} max={12} className="mt-2" />}
        </div>
        {c.summary && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{c.summary}</p>}
        <Tabs tabs={tabs} value={tab} onChange={t => setTab({ id: c.id, tab: t })} />
        {tab === 'steps' && <Steps steps={c.steps} />}
        {tab === 'steps' && c.automation_ref && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {c.fromRepo ? 'Başlık ve adımlar testin docstring\'inden gelir; depo yenilendiğinde güncellenir.' : 'Bu case burada düzenlendi; depo yenilendiğinde başlık ve adımlar korunur.'}
          </p>
        )}
        {tab === 'bdd' && <CodeBlock code={c.gherkin_scenario} language="gherkin" filename="senaryo.feature" maxHeight="max-h-[60vh]" />}
        {tab === 'script' && <CodeBlock code={c.automation_script} language="python" filename={`test_tc_${c.id}.py`} maxHeight="max-h-[60vh]" />}
        {tab === 'history' && <History caseId={c.id} />}
      </div>
      <aside className="border-t border-slate-200 bg-slate-50/60 p-5 lg:border-l lg:border-t-0 dark:border-slate-800 dark:bg-slate-950/30">
        <dl className="divide-y divide-slate-200/70 dark:divide-slate-800">
          <Meta label="Proje"><Link to={`/projects/${c.project_id}`} className="hover:underline">{projectName(c.project_id)}</Link></Meta>
          <Meta label="Öncelik"><PriorityMark priority={c.priority} /></Meta>
          <Meta label="Tür">{c.type}</Meta>
          <Meta label="Yürütme">{EXECUTION_LABEL[c.execution_type] || c.execution_type}</Meta>
          <Meta label="Oluşturuldu"><span className="tabular-nums">{formatDate(c.created_at, true)}</span></Meta>
          <Meta label="Güncellendi"><span className="tabular-nums">{formatDate(c.updated_at || c.created_at, true)}</span></Meta>
        </dl>
        {c.automation_ref && (
          <div className="mt-4 rounded-md bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-200">
            <p className="font-medium">Otomasyon deposundaki test</p>
            <p className="mt-0.5 break-all font-mono">{c.automation_ref}</p>
            <Link to={`/automation?project=${c.project_id}&suite=${c.suite_id || ''}&cases=${c.id}`} className="mt-1 inline-block font-medium text-indigo-700 hover:underline dark:text-indigo-300">Otomasyonda koş</Link>
          </div>
        )}
        <CaseLinks c={c} can={can} refreshKey={`${c.status}:${c.updated_at || ''}`} />
        {c.execution_type === 'Automated' && !c.automation_script && !c.automation_ref && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Otomasyon case'i ama script'i yok; otomasyonda koşulamaz.
          </p>
        )}
      </aside>
    </div>
  );
};

export default CaseDetail;
