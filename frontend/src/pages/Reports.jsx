/**
 * Raporlar: seçili dönem ve proje için geçme oranı, trend, kapsam, en çok kalan testler ve hatalar.
 * Hesaplar ./reports/metrics.js içinde (saf fonksiyonlar); filtreler adres çubuğunda tutulur.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, Printer, FileSpreadsheet, BarChart3 } from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import { useUrlFilters } from '../hooks/useUrlFilters';
import { PageHeader, Button, Panel, ResultBar, ResultLegend, Skeleton, EmptyState, StatusBadge } from '../components/ui';
import { FilterSelect } from '../components/ui/data';
import { Menu, MenuItem } from '../components/ui/overlay';
import { toast } from '../components/ui/toast';
import { projectsApi, testPlansApi, defectsApi, fetchAllTestRuns, fetchAllTestCases } from '../api';
import { planStats, planSegments, planIdent } from './test-plans/model';
import { RANGES, DEFAULT_RANGE, rangeOf, prepareRuns, buildReport, fmtPct } from './reports/metrics';
import { exportReportXlsx } from './reports/exportExcel';
import { KpiTile, Meter } from './reports/parts';
import TrendPanel from './reports/TrendPanel';
import FailingCases from './reports/FailingCases';
import ProjectTable from './reports/ProjectTable';
import DefectSummary from './reports/DefectSummary';

const CASE_STATUS_TONE = { 'Başarılı': 'pass', 'Başarısız': 'fail', 'Test Edilmedi': 'pending', 'Taslak': 'draft' };

const load = (withDefects) => Promise.all([
  fetchAllTestRuns(), fetchAllTestCases(), projectsApi.getAll(), testPlansApi.getAll(),
  withDefects ? defectsApi.getAll().then(r => r.data) : Promise.resolve([]),
]).then(([runs, cases, p, pl, defects]) => ({ runs: prepareRuns(runs), cases, projects: p.data, plans: pl.data, defects }));

const Reports = () => {
  const { can } = usePermission();
  const canDefects = can('defects.view');
  const canExport = can('reports.export');
  const filters = useUrlFilters(['project', 'range']);
  const project = filters.values.project;
  const range = rangeOf(filters.values.range || DEFAULT_RANGE).value;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    load(canDefects).then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message || 'Rapor verisi yüklenemedi.'); setLoading(false); } });
    return () => { alive = false; };
  }, [canDefects]);

  const reload = useCallback(() => {
    setLoading(true);
    load(canDefects).then(d => { setData(d); setError(null); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [canDefects]);

  const report = useMemo(() => (data ? buildReport(data, { project, range }) : null), [data, project, range]);
  const projectObj = data?.projects.find(p => String(p.id) === project);
  const rangeLabel = rangeOf(range).label;

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const pid = project ? Number(project) : null;
      await exportReportXlsx(report, {
        projectName: projectObj?.name, rangeLabel,
        cases: data.cases.filter(c => pid == null || c.project_id === pid),
        defects: data.defects.filter(d => pid == null || d.project_id === pid),
      });
      toast.success('Excel raporu indirildi.');
    } catch (e) { toast.error(e.message || 'Excel oluşturulamadı.'); }
    finally { setExporting(false); }
  };

  if (error && !data) {
    return (
      <div className="space-y-5">
        <PageHeader title="Raporlar" />
        <EmptyState icon={<BarChart3 size={24} />} title="Rapor yüklenemedi" description={error} action={<Button onClick={reload}>Tekrar dene</Button>} />
      </div>
    );
  }

  const r = report;
  const weekly = r && (!r.period.days || r.period.days > 31);
  const caseSegs = r ? r.caseStatus.map(s => ({ label: s.status, value: s.count, tone: CASE_STATUS_TONE[s.status] })) : [];

  return (
    <div className="space-y-5">
      <PageHeader title="Raporlar"
        description="Seçili dönemde koşumların sonucu, test kapsamı, en çok kalan testler ve hata durumu."
        actions={<div className="flex items-center gap-2 print:hidden">
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Yenile" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </Button>
          {canExport && (
            <Menu trigger={({ ref, toggle, open }) => (
              <Button ref={ref} icon={<Download size={15} />} onClick={toggle} aria-haspopup="menu" aria-expanded={open} loading={exporting} disabled={!r}>Dışa aktar</Button>
            )}>
              <MenuItem icon={FileSpreadsheet} onSelect={exportXlsx} hint="7 sayfa">Excel (.xlsx)</MenuItem>
              <MenuItem icon={Printer} onSelect={() => window.print()} hint="Yazdır → PDF">PDF / yazdır</MenuItem>
            </Menu>
          )}
        </div>} />

      {/* Yazdırırken sayfanın başında hangi kapsamın raporu olduğu görünsün */}
      <p className="hidden text-sm text-slate-600 print:block">
        {projectObj?.name || 'Tüm projeler'} · {rangeLabel} · {new Date().toLocaleString('tr-TR')}
      </p>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div role="radiogroup" aria-label="Dönem" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
          {RANGES.map(x => (
            <button key={x.value} type="button" role="radio" aria-checked={range === x.value}
              onClick={() => filters.set('range', x.value === DEFAULT_RANGE ? '' : x.value)}
              className={`h-7 rounded-md px-2.5 text-sm ${range === x.value ? 'bg-slate-900 font-medium text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}>
              {x.label}
            </button>
          ))}
        </div>
        {data?.projects.length > 1 && (
          <FilterSelect label="Proje" value={project} onChange={v => filters.set('project', v)} options={data.projects.map(p => [p.id, p.name])} />
        )}
        {project && <Button variant="ghost" size="sm" onClick={() => filters.set('project', '')}>Tüm projeler</Button>}
      </div>

      {!r ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          <section aria-label="Özet göstergeler" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Geçme oranı" value={fmtPct(r.rate, 1)} delta={r.rate != null && r.prevRate != null ? r.rate - r.prevRate : null} deltaUnit="pp"
              sub={`${r.counts.Passed} geçti · ${r.counts.Failed} kaldı`} hint="Geçen / (geçen + kalan). Atlanan ve bekleyen sayılmaz." />
            <KpiTile label="Koşum" value={r.runs} delta={r.period.days ? r.runs - r.prevRuns : null}
              sub={`${r.executedResults} sonuç girildi`} />
            <KpiTile label="Test kapsamı" value={fmtPct(r.coverage)} sub={`${r.coveredCount} / ${r.totalCases} case koşuldu`}
              hint="Dönemde en az bir kez sonuç alan case oranı" />
            {canDefects ? (
              <KpiTile label="Açık hata" value={r.defects.open} goodWhen="down"
                sub={r.defects.critical ? `${r.defects.critical} kritik` : 'kritik yok'} />
            ) : (
              <KpiTile label="Atlanan / bekleyen" value={`${r.counts.Skipped} / ${r.counts.Pending}`} />
            )}
          </section>

          {r.runs === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              {rangeLabel} içinde {projectObj ? `${projectObj.name} için ` : ''}koşum yok.
              {range !== 'all' && <> <button type="button" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => filters.set('range', 'all')}>Tüm zamanları göster</button></>}
            </div>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <TrendPanel trend={r.trend} weekly={weekly} />
            {canDefects ? <DefectSummary m={r.defects} periodLabel={rangeLabel} /> : (
              <Panel title="Sonuç dağılımı" bodyClassName="p-4">
                <ResultBar height="h-3" segments={[
                  { label: 'Geçti', value: r.counts.Passed, tone: 'pass' }, { label: 'Kaldı', value: r.counts.Failed, tone: 'fail' },
                  { label: 'Atlandı', value: r.counts.Skipped, tone: 'blocked' }, { label: 'Bekliyor', value: r.counts.Pending, tone: 'pending' },
                ]} />
              </Panel>
            )}
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <FailingCases items={r.failing} />
            <Panel title="Case envanteri" bodyClassName="space-y-4 p-4" className="print:break-inside-avoid"
              actions={<Link to={project ? `/test-cases?project=${project}` : '/test-cases'} className="text-xs font-medium text-indigo-600 hover:underline print:hidden dark:text-indigo-400">Case'ler</Link>}>
              <div>
                <p className="mb-2 text-sm text-slate-600 dark:text-slate-300"><b className="font-semibold tabular-nums text-slate-900 dark:text-white">{r.totalCases}</b> case · son sonuçlarına göre</p>
                <ResultBar height="h-2.5" segments={caseSegs} />
                <ResultLegend segments={caseSegs} className="mt-2 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Otomasyon payı</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{r.totalCases ? fmtPct((r.automated / r.totalCases) * 100) : '—'}</p>
                  <Meter value={r.totalCases ? (r.automated / r.totalCases) * 100 : 0} className="mt-1" />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.automated} otomasyon · {r.totalCases - r.automated} manuel</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Dönemde koşulan</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{fmtPct(r.coverage)}</p>
                  <Meter value={r.coverage || 0} tone="bg-emerald-500" className="mt-1" />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.totalCases - r.coveredCount} case hiç koşulmadı</p>
                </div>
              </div>
            </Panel>
          </div>

          {r.activePlans.length > 0 && (
            <Panel title="Süren planlar" bodyClassName="p-0" className="print:break-inside-avoid">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {r.activePlans.slice(0, 6).map(p => {
                  const s = planStats(p);
                  return (
                    <li key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_14rem_6rem]">
                      <Link to={`/test-plans/${p.id}`} className="min-w-0 truncate text-sm font-medium text-slate-900 hover:underline dark:text-white">
                        <span className="mr-2 font-mono text-xs font-normal text-slate-500">{planIdent(p.id)}</span>{p.title}
                      </Link>
                      <ResultBar height="h-1.5" segments={planSegments(s)} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
                      <span className="col-start-2 row-start-1 text-right text-xs tabular-nums text-slate-500 sm:col-start-auto sm:row-start-auto dark:text-slate-400">
                        %{s.progress} · {s.done}/{s.total}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {!project && r.projectRows.length > 1 && <ProjectTable rows={r.projectRows} onSelect={id => filters.set('project', String(id))} />}

          {r.recentRuns.length > 0 && (
            <Panel title="Dönemin koşumları" bodyClassName="p-0" className="print:break-inside-avoid"
              actions={<span className="text-xs text-slate-500 dark:text-slate-400">{r.recentRuns.length} koşum</span>}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {r.recentRuns.slice(0, 8).map(run => {
                  const s = { Passed: 0, Failed: 0, Skipped: 0, Pending: 0 };
                  run.results.forEach(x => { s[x.status] += 1; });
                  return (
                    <li key={run.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_12rem_4rem]">
                      <Link to={`/test-runs/${run.id}`} className="min-w-0 truncate text-sm text-slate-800 hover:underline dark:text-slate-100">
                        <span className="mr-2 font-mono text-xs text-slate-500">KS-{run.id}</span>{run.name}
                      </Link>
                      <ResultBar height="h-1.5" className="hidden sm:flex" segments={[
                        { label: 'Geçti', value: s.Passed, tone: 'pass' }, { label: 'Kaldı', value: s.Failed, tone: 'fail' },
                        { label: 'Atlandı', value: s.Skipped, tone: 'blocked' }, { label: 'Bekliyor', value: s.Pending, tone: 'pending' },
                      ]} />
                      {s.Failed ? <StatusBadge tone="fail" className="justify-self-end">{s.Failed} kaldı</StatusBadge>
                        : <span className="justify-self-end text-xs tabular-nums text-slate-500 dark:text-slate-400">{s.Passed + s.Failed ? `%${Math.round((s.Passed / (s.Passed + s.Failed)) * 100)}` : '—'}</span>}
                    </li>
                  );
                })}
              </ul>
              {r.recentRuns.length > 8 && (
                <Link to={project ? `/test-runs?project=${project}` : '/test-runs'} className="block border-t border-slate-100 px-4 py-2 text-xs font-medium text-indigo-600 hover:underline print:hidden dark:border-slate-800 dark:text-indigo-400">
                  Tüm koşumlar
                </Link>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
};

export default Reports;
