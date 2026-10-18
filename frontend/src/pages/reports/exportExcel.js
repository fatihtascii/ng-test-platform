/** Raporu çok sayfalı Excel dosyası olarak indirir (xlsx kütüphanesi gerektiğinde yüklenir). */
import { rate } from './metrics';

const pct = (v) => (v == null ? '' : Math.round(v * 10) / 10);
const day = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR') : '');

export const exportReportXlsx = async (report, { projectName, rangeLabel, cases, defects }) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const add = (name, rows, widths) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Bilgi: 'Veri yok' }]);
    if (widths) ws['!cols'] = widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const c = report.counts;

  add('Özet', [
    { Gösterge: 'Kapsam', Değer: projectName || 'Tüm projeler' },
    { Gösterge: 'Dönem', Değer: rangeLabel },
    { Gösterge: 'Oluşturulma', Değer: new Date().toLocaleString('tr-TR') },
    { Gösterge: 'Koşum sayısı', Değer: report.runs },
    { Gösterge: 'Geçti', Değer: c.Passed },
    { Gösterge: 'Kaldı', Değer: c.Failed },
    { Gösterge: 'Atlandı', Değer: c.Skipped },
    { Gösterge: 'Bekliyor', Değer: c.Pending },
    { Gösterge: 'Geçme oranı (%)', Değer: pct(report.rate) },
    { Gösterge: 'Önceki dönem geçme oranı (%)', Değer: pct(report.prevRate) },
    { Gösterge: 'Koşulan case', Değer: `${report.coveredCount} / ${report.totalCases}` },
    { Gösterge: 'Açık hata', Değer: report.defects.open },
    { Gösterge: 'Kritik açık hata', Değer: report.defects.critical },
    { Gösterge: 'Dönemde açılan hata', Değer: report.defects.opened },
    { Gösterge: 'Dönemde çözülen hata', Değer: report.defects.resolved },
    { Gösterge: 'Ortalama çözüm süresi (gün)', Değer: report.defects.avgResolveDays == null ? '' : Math.round(report.defects.avgResolveDays * 10) / 10 },
  ], [32, 28]);

  add('Trend', report.trend.map(b => ({
    Tarih: b.label, Koşum: b.runs, Geçti: b.Passed, Kaldı: b.Failed, Atlandı: b.Skipped, Bekliyor: b.Pending, 'Geçme oranı (%)': pct(b.rate),
  })), [18, 8, 8, 8, 8, 9, 14]);

  add('Projeler', report.projectRows.map(p => ({
    Proje: p.name, Koşum: p.runs, Geçti: p.counts.Passed, Kaldı: p.counts.Failed, Atlandı: p.counts.Skipped,
    'Geçme oranı (%)': pct(p.rate), Case: p.cases, 'Koşulan case': p.covered, 'Açık hata': p.openDefects,
    'Son koşum': p.lastRun ? day(p.lastRun.created_at) : '',
  })), [24, 8, 8, 8, 8, 14, 8, 12, 10, 18]);

  add('Koşumlar', report.recentRuns.map(r => {
    const s = { Passed: 0, Failed: 0, Skipped: 0, Pending: 0 };
    r.results.forEach(x => { s[x.status] += 1; });
    return {
      ID: `KS-${r.id}`, Koşum: r.name, Durum: r.status, Tarih: day(r.created_at),
      Geçti: s.Passed, Kaldı: s.Failed, Atlandı: s.Skipped, Bekliyor: s.Pending, 'Geçme oranı (%)': pct(rate(s.Passed, s.Failed)),
    };
  }), [8, 30, 12, 18, 8, 8, 8, 9, 14]);

  add('En çok kalan', report.failing.map(f => ({
    ID: `TC-${f.caseId}`, Test: f.title, Öncelik: f.priority || '', Kaldı: f.Failed, Geçti: f.Passed, Koşuldu: f.executions,
    Kararsız: f.flaky ? 'Evet' : '', 'Son kalış': f.lastFail ? `KS-${f.lastFail.runId} ${day(f.lastFail.at)}` : '', 'Son hata': f.lastFail?.note || '',
  })), [8, 34, 9, 7, 7, 8, 9, 24, 40]);

  add('Hatalar', defects.map(d => ({
    ID: `BUG-${d.id}`, Başlık: d.title, Durum: d.status, Önem: d.severity, Proje: d.project_name || '',
    Atanan: d.assignee_name || '', Açıldı: day(d.created_at), Çözüldü: day(d.resolved_at),
  })), [9, 40, 12, 9, 18, 16, 18, 18]);

  add('Case\'ler', cases.map(tc => ({
    ID: `TC-${tc.id}`, Başlık: tc.title, Durum: tc.status, Öncelik: tc.priority,
    Yürütme: tc.execution_type === 'Automated' ? 'Otomasyon' : 'Manuel',
  })), [8, 44, 14, 9, 11]);

  const slug = (projectName || 'tum-projeler').toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]+/g, '-');
  XLSX.writeFile(wb, `ng-test-rapor-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
};
