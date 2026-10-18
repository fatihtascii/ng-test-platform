/** Otomasyon depoları: durum etiketleri ve profil önerileri */
export const SYNC_STATUS = {
  never:   { label: 'Senkronize edilmedi', tone: 'pending' },
  syncing: { label: 'Senkronize ediliyor', tone: 'info' },
  ready:   { label: 'Hazır', tone: 'pass' },
  error:   { label: 'Hata', tone: 'fail' },
};

export const suiteStatus = (s) => SYNC_STATUS[s.syncing ? 'syncing' : s.sync_status] || SYNC_STATUS.never;

/** Depodaki işaretlerden hazır profil önerileri (yalnız depoda olanlar) */
export const suggestProfiles = (markers = {}) => {
  const out = [];
  if (markers.smoke) out.push({ name: 'Smoke', marker: 'smoke' });
  if (markers.deploy) out.push({ name: 'Deploy sonrası', marker: 'deploy' });
  if (markers.regression) out.push({ name: 'Regresyon', marker: 'regression' });
  if (markers.data_producing) out.push({ name: 'Güvenli (kayıt bırakmaz)', marker: 'not data_producing' });
  out.push({ name: 'Tümü', marker: '' });
  return out;
};

export const shortSha = (sha) => (sha ? sha.slice(0, 7) : '');
