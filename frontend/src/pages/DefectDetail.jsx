/**
 * Tek hata kaydı: açıklama, başarısız testler, yorumlar ve değişiklik geçmişi.
 * Sağ panelde durum, önem ve atanan doğrudan değiştirilir; her değişiklik geçmişe yazılır.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Pencil, Trash2, MoreHorizontal, Bug, ArrowRight, RotateCcw, CheckCircle2, Search as SearchIcon, ExternalLink, Ticket, Cpu } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { Button, StatusBadge, Ident, Skeleton, EmptyState, Panel } from '../components/ui';
import { Menu, MenuItem, ConfirmDialog } from '../components/ui/overlay';
import { toast } from '../components/ui/toast';
import { defectsApi, projectsApi, testCasesApi, integrationsApi } from '../api';
import { formatDate, relativeTime } from './test-runs/model';
import DefectFormDrawer from './defects/DefectFormDrawer';
import FailedCaseList from './defects/FailedCaseList';
import { isAutomatable } from './test-cases/model';
import ActivityFeed from './defects/ActivityFeed';
import {
  STATUSES, STATUS_LABEL, STATUS_TONE, SEVERITIES, SEVERITY_TONE, SOURCE_LABEL,
  defectIdent, parseDefectParam, defectReport, currentUser, userName, ageDays,
} from './defects/model';

// Duruma göre önerilen sonraki adım (iş akışı: Açık → İnceleniyor → Tekrar test → Çözüldü)
const NEXT_STEP = {
  'Open':        { to: 'In Progress', label: 'İncelemeye al', icon: SearchIcon },
  'In Progress': { to: 'Re-test',     label: 'Tekrar teste gönder', icon: ArrowRight },
  'Re-test':     { to: 'Resolved',    label: 'Çözüldü olarak kapat', icon: CheckCircle2 },
  'Resolved':    { to: 'Open',        label: 'Yeniden aç', icon: RotateCcw },
};

const selectCls = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const Row = ({ label, children }) => (
  <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 py-1.5 text-sm">
    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="min-w-0 text-slate-800 dark:text-slate-100">{children}</dd>
  </div>
);

const DefectDetail = () => {
  const { id: param } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canManage = can('defects.manage');
  const me = useMemo(currentUser, []);
  const defectId = parseDefectParam(param);

  const [state, setState] = useState({ loading: true, defect: null, error: null, notFound: false });
  const [cases, setCases] = useState({});
  const [projects, setProjects] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [saving, setSaving] = useState(null);       // değişen alan adı
  const [activityKey, setActivityKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [jiraOn, setJiraOn] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!defectId) return undefined;
    defectsApi.getOne(defectId).then(async ({ data }) => {
      if (!alive) return;
      setState({ loading: false, defect: data, error: null, notFound: false });
      // Adımları göstermek için hatalı case'lerin ayrıntıları (en fazla 40)
      const ids = [...new Set((data.failed_details || []).map(f => f.case_id).filter(Boolean))].slice(0, 40);
      const res = await Promise.allSettled(ids.map(cid => testCasesApi.getOne(cid)));
      if (alive) setCases(Object.fromEntries(res.filter(r => r.status === 'fulfilled').map(r => [r.value.data.id, r.value.data])));
    }).catch(e => {
      if (alive) setState({ loading: false, defect: null, error: e.message || 'Kayıt yüklenemedi.', notFound: e.status === 404 || /bulunamadı/i.test(e.message || '') });
    });
    defectsApi.assignees().then(({ data }) => { if (alive) setAssignees(data); }).catch(() => {});
    projectsApi.getAll().then(({ data }) => { if (alive) setProjects(data); }).catch(() => {});
    integrationsApi.status().then(({ data }) => { if (alive) setJiraOn(Boolean(data.jira)); }).catch(() => {});
    return () => { alive = false; };
  }, [defectId]);

  const d = state.defect;

  const update = useCallback(async (field, body, message) => {
    setSaving(field);
    try {
      const { data } = await defectsApi.update(d.id, body);
      setState(s => ({ ...s, defect: data }));
      setActivityKey(k => k + 1);
      if (message) toast.success(message);
    } catch (e) { toast.error(e.message || 'Güncellenemedi.'); }
    finally { setSaving(null); }
  }, [d]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(defectReport(d)); toast.success('Rapor panoya kopyalandı.'); }
    catch { toast.error('Panoya kopyalanamadı.'); }
  };

  const exportJira = async () => {
    setSaving('jira');
    try {
      const { data } = await defectsApi.exportJira(d.id);
      setState(s => ({ ...s, defect: data }));
      setActivityKey(k => k + 1);
      toast.success(`Jira'da ${data.external_key} açıldı.`);
    } catch (e) { toast.error(e.message || 'Jira\'ya aktarılamadı.'); }
    finally { setSaving(null); }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await defectsApi.remove(d.id);
      toast.success(`${defectIdent(d.id)} silindi.`);
      navigate('/defects');
    } catch (e) { toast.error(e.message || 'Silinemedi.'); setDeleting(false); }
  };

  if (!defectId || state.notFound || (state.error && !d)) {
    return (
      <EmptyState icon={<Bug size={24} />} className="py-20"
        title={!defectId || state.notFound ? 'Hata kaydı bulunamadı' : 'Kayıt yüklenemedi'}
        description={!defectId ? `"${param}" geçerli bir hata kimliği değil.` : state.notFound ? 'Kayıt silinmiş olabilir.' : state.error}
        action={<Button onClick={() => navigate('/defects')} icon={<ArrowLeft size={14} />}>Hatalara dön</Button>} />
    );
  }

  if (state.loading || !d) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-2/3" />
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    );
  }

  // Kayıttaki otomasyon case'leri: tek kaynaktan (en kalabalık) otomasyon sayfasında yeniden koşulur
  const retest = (() => {
    const auto = Object.values(cases).filter(isAutomatable);
    if (!auto.length || !can('automation.execute')) return null;
    const groups = new Map();
    auto.forEach(c => groups.set(c.suite_id || 0, [...(groups.get(c.suite_id || 0) || []), c.id]));
    const [suiteId, ids] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    return { ids, to: `/automation?project=${d.project_id}&cases=${ids.join(',')}${suiteId ? `&suite=${suiteId}` : ''}` };
  })();
  const next = NEXT_STEP[d.status];
  const age = ageDays(d);
  const NextIcon = next?.icon;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/defects" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft size={14} /> Hatalar
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Ident>{defectIdent(d.id)}</Ident>
              <StatusBadge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status] || d.status}</StatusBadge>
              <StatusBadge tone={SEVERITY_TONE[d.severity]}>{d.severity}</StatusBadge>
              <span className="text-xs text-slate-500 dark:text-slate-400">{SOURCE_LABEL[d.source] || d.source}</span>
            </div>
            <h1 className="mt-1 break-words text-xl font-semibold text-slate-900 dark:text-white">{d.title}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {d.project_name || '—'} · {d.created_by_name ? `${d.created_by_name} açtı` : 'Koşum açtı'} · <span title={formatDate(d.created_at, true)}>{relativeTime(d.created_at)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canManage && next && (
              <Button variant={d.status === 'Resolved' ? 'secondary' : 'primary'} icon={<NextIcon size={14} />} loading={saving === 'status'}
                onClick={() => update('status', { status: next.to }, `${defectIdent(d.id)} → ${STATUS_LABEL[next.to]}`)}>{next.label}</Button>
            )}
            {d.external_key ? (
              <a href={d.external_url} target="_blank" rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 dark:text-indigo-300 dark:ring-indigo-500/30 dark:hover:bg-indigo-500/10">
                <Ticket size={14} /> {d.external_key} <ExternalLink size={12} />
              </a>
            ) : jiraOn && canManage && (
              <Button icon={<Ticket size={14} />} onClick={exportJira} loading={saving === 'jira'}>Jira'ya aktar</Button>
            )}
            {retest && (
              <Button variant={d.status === 'Re-test' ? 'run' : 'runSoft'} icon={<Cpu size={14} />} onClick={() => navigate(retest.to)}
                title="Kayıttaki otomasyon case'lerini otomasyonda yeniden koş; otomatik açılmış kayıt, case geçince kendiliğinden çözülür">
                Yeniden test et{retest.ids.length > 1 ? ` (${retest.ids.length})` : ''}
              </Button>
            )}
            <Button icon={<Copy size={14} />} onClick={copy}>Kopyala</Button>
            {canManage && (
              <Menu trigger={({ ref, toggle, open }) => (
                <Button ref={ref} size="icon" onClick={toggle} aria-label="Diğer işlemler" aria-haspopup="menu" aria-expanded={open}><MoreHorizontal size={16} /></Button>
              )}>
                <MenuItem icon={Pencil} onSelect={() => setEditing(true)}>Düzenle</MenuItem>
                <MenuItem icon={Trash2} tone="danger" onSelect={() => setConfirm(true)}>Sil</MenuItem>
              </Menu>
            )}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Panel title="Açıklama" bodyClassName="px-4 py-3" actions={canManage && <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Düzenle</Button>}>
            {d.description
              ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 dark:text-slate-200">{d.description}</p>
              : <p className="text-sm text-slate-500 dark:text-slate-400">Açıklama yok. Tekrar etme adımlarını ve beklenen sonucu eklemek, düzeltecek kişinin işini hızlandırır.</p>}
          </Panel>

          {d.failed_details?.length > 0 && (
            <Panel title={d.source === 'auto' ? `Başarısız testler (${d.failed_count})` : `İlgili testler (${d.failed_count})`} bodyClassName="p-0"
              actions={d.test_run_id && <Link to={`/test-runs/${d.test_run_id}`} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">KS-{d.test_run_id} koşumunu aç</Link>}>
              <FailedCaseList details={d.failed_details} cases={cases} runId={d.test_run_id} manual={d.source === 'manual'} />
            </Panel>
          )}

          <ActivityFeed defectId={d.id} refreshKey={activityKey} canComment={canManage} me={me} />
        </div>

        <aside className="space-y-5 lg:sticky lg:top-4">
          <Panel title="Ayrıntılar" bodyClassName="px-4 py-1.5">
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row label="Durum">
                {canManage ? (
                  <select aria-label="Durum" value={d.status} disabled={saving === 'status'} className={selectCls}
                    onChange={e => update('status', { status: e.target.value })}>
                    {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                ) : <StatusBadge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</StatusBadge>}
              </Row>
              <Row label="Önem">
                {canManage ? (
                  <select aria-label="Önem" value={d.severity} disabled={saving === 'severity'} className={selectCls}
                    onChange={e => update('severity', { severity: e.target.value })}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : <StatusBadge tone={SEVERITY_TONE[d.severity]}>{d.severity}</StatusBadge>}
              </Row>
              <Row label="Atanan">
                {canManage ? (
                  <div>
                    <select aria-label="Atanan" value={d.assignee_id ?? ''} disabled={saving === 'assignee'} className={selectCls}
                      onChange={e => update('assignee', { assignee_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Atanmamış</option>
                      {assignees.map(u => <option key={u.id} value={u.id}>{userName(u)}</option>)}
                      {d.assignee_id && !assignees.some(u => u.id === d.assignee_id) && <option value={d.assignee_id}>{d.assignee_name} (devre dışı)</option>}
                    </select>
                    {me && d.assignee_id !== me.id && (
                      <button type="button" className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                        onClick={() => update('assignee', { assignee_id: me.id }, 'Kayıt size atandı.')}>Bana ata</button>
                    )}
                  </div>
                ) : (d.assignee_name || <span className="text-slate-400">Atanmamış</span>)}
              </Row>
              <Row label="Proje">{d.project_name || '—'}</Row>
              <Row label="Koşum">
                {d.test_run_id
                  ? <Link to={`/test-runs/${d.test_run_id}`} className="block truncate text-indigo-600 hover:underline dark:text-indigo-400">KS-{d.test_run_id} {d.test_run_name}</Link>
                  : <span className="text-slate-400">{d.source === 'auto' ? 'Koşum silinmiş' : 'Yok'}</span>}
              </Row>
              <Row label="Açan">{d.created_by_name || <span className="text-slate-500">Sistem (koşum)</span>}</Row>
              <Row label="Açıldı"><span title={formatDate(d.created_at, true)}>{formatDate(d.created_at, true)}</span></Row>
              {d.resolved_at && <Row label="Çözüldü">{formatDate(d.resolved_at, true)}</Row>}
              {age != null && <Row label={d.status === 'Resolved' ? 'Çözüm süresi' : 'Açık süre'}>{age === 0 ? '1 günden az' : `${age} gün`}</Row>}
              <Row label="Güncellendi"><span title={formatDate(d.updated_at, true)}>{relativeTime(d.updated_at || d.created_at)}</span></Row>
            </dl>
          </Panel>
        </aside>
      </div>

      {editing && (
        <DefectFormDrawer defect={d} projects={projects.length ? projects : [{ id: d.project_id, name: d.project_name }]} assignees={assignees}
          onClose={() => setEditing(false)}
          onSaved={(saved) => { setEditing(false); setState(s => ({ ...s, defect: saved })); setActivityKey(k => k + 1); }} />
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} loading={deleting} confirmLabel="Sil"
        title={`${defectIdent(d.id)} silinsin mi?`} description="Kayıt, yorumları ve geçmişiyle silinir. Bu işlem geri alınamaz." />
    </div>
  );
};

export default DefectDetail;
