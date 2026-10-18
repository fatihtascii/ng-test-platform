/**
 * Eski sürüm defect verisini tarayıcıda (localStorage) tutuyordu. Bu modül o veriyi
 * bir kez sunucuya taşır; yeni kodda localStorage'a defect yazılmaz.
 */
import { defectsApi } from '../../api';
import { SEVERITIES, STATUSES } from './model';

const LS_KEY     = 'ng-defect-statuses';
const MANUAL_KEY = 'ng-manual-defects';
const HIDDEN_KEY = 'ng-hidden-auto-defects';

// Eski localStorage verisini (manuel defect'ler + statüler) bir kez sunucuya aktarır.
// StrictMode effect'i iki kez çalıştırdığında (veya iki sekme açıkken) aynı kaydın iki kez
// oluşmaması için: sayfa başına tek çalıştırma + veri okunur okunmaz tarayıcıdan "sahiplenilir".
let legacyMigration = null;
export const migrateLegacyLocalDefects = () => {
  if (!legacyMigration) legacyMigration = runLegacyMigration().finally(() => { legacyMigration = null; });
  return legacyMigration;
};

const runLegacyMigration = async () => {
  const LEGACY_KEYS = [LS_KEY, `${LS_KEY}-times`, MANUAL_KEY, HIDDEN_KEY];
  const snapshot = Object.fromEntries(LEGACY_KEYS.map(k => [k, localStorage.getItem(k)]));
  let manual = [], statuses = {};
  try { manual   = JSON.parse(snapshot[MANUAL_KEY] || '[]'); } catch { manual = []; }
  try { statuses = JSON.parse(snapshot[LS_KEY]     || '{}'); } catch { statuses = {}; }
  if (!manual.length && !Object.keys(statuses).length) return 0;
  LEGACY_KEYS.forEach(k => localStorage.removeItem(k));   // sahiplen

  let moved = 0;
  let processed = 0;   // sunucuya gönderilen veya geçersiz olduğu için atlanan manuel kayıt sayısı
  try {
    for (const m of manual) {
      if (m?.title && m?.projectId) {
        await defectsApi.create({
          title: m.title, description: m.description || null,
          severity: SEVERITIES.includes(m.severity) ? m.severity : 'Orta',
          status: statuses[m.id] || m.status || 'Open', project_id: Number(m.projectId),
        });
        moved++;
      }
      processed++;
    }
    // Otomatik defect statüleri eskiden "BUG-{koşumId}" anahtarıyla tutuluyordu
    const runStatuses = Object.entries(statuses)
      .map(([k, v]) => [k.match(/^BUG-(\d+)$/)?.[1], v]).filter(([runId]) => runId);
    if (runStatuses.length) {
      const { data } = await defectsApi.getAll();
      for (const [runId, status] of runStatuses) {
        const d = data.find(x => x.source === 'auto' && String(x.test_run_id) === runId);
        if (d && d.status !== status && STATUSES.some(o => o.value === status)) {
          await defectsApi.update(d.id, { status });
          moved++;
        }
      }
    }
  } catch (err) {
    // Yarıda kalırsa: sunucuya ulaşmamış manuel kayıtları ve statüleri geri yaz,
    // bir sonraki açılışta tekrar denensin (gönderilmiş olanlar tekrar oluşmaz).
    Object.entries(snapshot).forEach(([k, v]) => { if (v !== null) localStorage.setItem(k, v); });
    localStorage.setItem(MANUAL_KEY, JSON.stringify(manual.slice(processed)));
    throw err;
  }
  return moved;
};
