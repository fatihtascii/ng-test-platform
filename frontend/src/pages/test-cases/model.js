/**
 * Test case veri modeli: sabitler, ayrıştırma, form ↔ API dönüşümü, dışa aktarma.
 * Bileşen içermez; saf fonksiyonlar test edilmesi ve yeniden kullanılması kolay olsun diye burada.
 */

// ── Sabitler ──────────────────────────────────────────────────
export const TEST_TYPES = [
  'Functional', 'Smoke', 'Sanity', 'Regression', 'Integration',
  'End-to-End (E2E)', 'API', 'UI/Design', 'Usability', 'Performance',
  'Security', 'Acceptance (UAT)', 'Accessibility', 'Compatibility', 'Exploratory',
];

export const PRIORITIES = ['Kritik', 'Yüksek', 'Orta', 'Düşük'];
export const PRIORITY_RANK = { 'Kritik': 4, 'Yüksek': 3, 'Orta': 2, 'Düşük': 1 };

// Backend'deki CHECK kısıtıyla aynı değerler
export const STATUSES = ['Taslak', 'Test Edilmedi', 'Başarılı', 'Başarısız'];

export const EXECUTION_LABEL = { Manual: 'Manuel', Automated: 'Otomasyon' };

export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export const GHERKIN_SUGGESTIONS = [
  { label: 'Giriş', text: 'Feature: Kullanıcı girişi\n\n  Scenario: Başarılı giriş\n    Given Kullanıcı giriş sayfasındadır\n    When Geçerli e-posta ve şifre girer\n    And Giriş butonuna tıklar\n    Then Genel durum sayfasına yönlendirilir' },
  { label: 'Sepet', text: 'Feature: Sepet yönetimi\n\n  Scenario: Ürünü sepete ekleme\n    Given Kullanıcı ürün detay sayfasındadır\n    When "Sepete ekle" butonuna tıklar\n    Then Sepet sayacı 1 artar\n    And Başarı bildirimi gösterilir' },
  { label: 'Arama', text: 'Feature: Ürün arama\n\n  Scenario: Geçerli sorgu ile arama\n    Given Kullanıcı ana sayfadadır\n    When Arama kutusuna "laptop" yazar\n    And Ara butonuna basar\n    Then En az 1 sonuç listelenir' },
];

export const PROMPT_SUGGESTIONS = [
  { label: 'Kullanıcı girişi', text: 'Kullanıcının e-posta ve şifre ile sisteme giriş yapması senaryosunu test et.' },
  { label: 'Kayıt formu',      text: 'Yeni kullanıcı kayıt formunun doğrulama kurallarını ve başarılı kayıt akışını test et.' },
  { label: 'Sepete ekleme',    text: 'E-ticaret sitesinde ürünü sepete ekleme ve adet güncelleme işlemini test et.' },
  { label: 'Arama',            text: 'Arama kutusuna sorgu girildiğinde filtrelenmiş sonuçların gelmesini test et.' },
];

export const PLAYWRIGHT_TEMPLATE = `import pytest
from playwright.sync_api import Page, expect


def test_ornek(page: Page):
    page.goto("https://www.example.com")
    expect(page).to_have_title("Example Domain")
`;

// ── Yardımcılar ───────────────────────────────────────────────
export const trLower = (s = '') => String(s).toLocaleLowerCase('tr-TR');

let stepSeq = 0;
// Date.now() aynı milisaniyede çağrılınca çakışıyordu (AI aktarımı + hızlı "adım ekle")
export const newStepId = () => `s${Date.now().toString(36)}${(++stepSeq).toString(36)}`;
export const emptyStep = () => ({ id: newStepId(), action: '', expectedResult: '', image: null });

export const parseTags = (raw) => {
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.filter(t => typeof t === 'string') : [];
  } catch { return []; }
};

const parseDescription = (desc) => {
  const fallback = { steps: [], type: 'Functional', execution_type: null };
  if (!desc) return fallback;
  const text = String(desc);
  if (text.trim().startsWith('{')) {
    try {
      const p = JSON.parse(text);
      return {
        steps: Array.isArray(p.steps) ? p.steps.map(s => ({ expectedResult: '', image: null, ...s, id: s.id ?? newStepId() })) : [],
        type: p.type || 'Functional',
        execution_type: p.execution_type || null,
      };
    } catch { /* bozuk JSON → düz metin gibi davran */ }
  }
  return { ...fallback, steps: [{ id: newStepId(), action: text, expectedResult: '', image: null }] };
};

/**
 * API kaydını arayüzün kullandığı biçime çevirir.
 * Yürütme tipinde asıl kaynak veritabanı kolonu; açıklama JSON'undaki alan eski kayıtlar için.
 */
export const parseCase = (tc) => {
  const d = parseDescription(tc.description);
  return {
    ...tc,
    steps: d.steps,
    type: d.type,
    execution_type: tc.execution_type || d.execution_type || 'Manual',
    tagList: parseTags(tc.tags),
  };
};

export const isAutomatable = (c) => c.execution_type === 'Automated' && Boolean(c.automation_script?.trim());

export const caseIdent = (id) => `TC-${id}`;

// ── Form ──────────────────────────────────────────────────────
export const emptyForm = (projectId = '') => ({
  id: null,
  title: '',
  status: 'Taslak',
  priority: 'Orta',
  project_id: projectId ? String(projectId) : '',
  type: 'Functional',
  execution_type: 'Manual',
  tags: [],
  steps: [emptyStep()],
  gherkin_scenario: '',
  automation_script: '',
});

export const formFromCase = (c) => ({
  id: c.id,
  title: c.title || '',
  status: c.status || 'Taslak',
  priority: c.priority || 'Orta',
  project_id: String(c.project_id ?? ''),
  type: c.type || 'Functional',
  execution_type: c.execution_type || 'Manual',
  tags: [...(c.tagList || [])],
  steps: c.steps?.length ? c.steps.map(s => ({ ...s })) : [emptyStep()],
  gherkin_scenario: c.gherkin_scenario || '',
  automation_script: c.automation_script || '',
});

/** Kaydedilmemiş değişiklik kontrolü için karşılaştırılabilir özet */
export const formSignature = (f) => JSON.stringify({
  ...f,
  steps: f.steps.filter(s => s.action?.trim() || s.expectedResult?.trim() || s.image)
    .map(({ action, expectedResult, image }) => ({ action: action?.trim() || '', expectedResult: expectedResult?.trim() || '', image: image || null })),
  title: f.title.trim(),
});

export const validateForm = (f) => {
  const errors = {};
  if (!f.title.trim()) errors.title = 'Başlık zorunlu.';
  else if (f.title.trim().length > 500) errors.title = 'Başlık en fazla 500 karakter olabilir.';
  if (!f.project_id) errors.project_id = 'Bir proje seçin.';
  if (f.execution_type === 'Automated' && !f.automation_script.trim()) {
    errors.automation_script = 'Otomasyon case\'i için script gerekli; şablonla başlayabilirsiniz.';
  }
  return errors;
};

export const buildPayload = (f) => {
  // Tamamen boş adımlar kaydedilmez
  const steps = f.steps
    .filter(s => s.action?.trim() || s.expectedResult?.trim() || s.image)
    .map(s => ({ id: s.id, action: s.action?.trim() || '', expectedResult: s.expectedResult?.trim() || '', image: s.image || null }));
  return {
    title: f.title.trim(),
    description: JSON.stringify({ steps, type: f.type, execution_type: f.execution_type }),
    status: f.status,
    priority: f.priority,
    project_id: Number(f.project_id),
    execution_type: f.execution_type,
    gherkin_scenario: f.gherkin_scenario.trim() || null,
    automation_script: f.automation_script.trim() ? f.automation_script : null,
    tags: JSON.stringify(f.tags),
  };
};

/** Kopya: tüm içerik korunur, statü Taslak'a döner */
export const duplicatePayload = (c) => ({
  ...buildPayload(formFromCase(c)),
  title: `${c.title} (kopya)`.slice(0, 500),
  status: 'Taslak',
});

/** AI yanıtını forma güvenle aktarır (geçersiz değerler varsayılana düşer) */
export const formFromAi = (ai, projectId) => {
  const base = emptyForm(projectId);
  const steps = (Array.isArray(ai?.steps) ? ai.steps : [])
    .map(s => ({ id: newStepId(), action: String(s?.action || '').trim(), expectedResult: String(s?.expectedResult || s?.expected || '').trim(), image: null }))
    .filter(s => s.action);
  return {
    ...base,
    title: String(ai?.title || '').slice(0, 500),
    priority: PRIORITIES.includes(ai?.priority) ? ai.priority : base.priority,
    type: TEST_TYPES.includes(ai?.type) ? ai.type : base.type,
    steps: steps.length ? steps : base.steps,
  };
};

// ── Sıralama / filtreleme ─────────────────────────────────────
const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });

export const compareCases = (key, projectName) => (a, b) => {
  switch (key) {
    case 'title':      return collator.compare(a.title || '', b.title || '');
    case 'project':    return collator.compare(projectName(a.project_id), projectName(b.project_id));
    case 'priority':   return (PRIORITY_RANK[a.priority] || 0) - (PRIORITY_RANK[b.priority] || 0);
    case 'status':     return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
    case 'updated':    return new Date(a.updated_at || a.created_at || 0) - new Date(b.updated_at || b.created_at || 0);
    default:           return a.id - b.id;
  }
};

export const matchesQuery = (c, q, projectName) => {
  if (!q) return true;
  // "TC-12" ya da "#12" yazıldıysa yalnızca kimliğe bakılır
  const idOnly = /^\s*(tc-|#)(\d+)\s*$/i.exec(q);
  if (idOnly) return String(c.id) === idOnly[2];
  const needle = trLower(q.trim());
  if (!needle) return true;
  return String(c.id) === needle
    || trLower(c.title).includes(needle)
    || c.tagList.some(t => trLower(t).includes(needle))
    || trLower(projectName(c.project_id)).includes(needle)
    || c.steps.some(s => trLower(s.action).includes(needle));
};

// ── CSV ───────────────────────────────────────────────────────
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const casesToCsv = (cases, projectName) => {
  const head = ['ID', 'Başlık', 'Proje', 'Durum', 'Öncelik', 'Tür', 'Yürütme', 'Etiketler', 'Adım sayısı', 'BDD', 'Script', 'Güncellendi'];
  const rows = cases.map(c => [
    caseIdent(c.id), c.title, projectName(c.project_id), c.status, c.priority, c.type,
    EXECUTION_LABEL[c.execution_type] || c.execution_type, c.tagList.join(' '),
    c.steps.length, c.gherkin_scenario ? 'Evet' : 'Hayır', c.automation_script ? 'Evet' : 'Hayır',
    c.updated_at || c.created_at || '',
  ]);
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
};

export const downloadText = (text, filename, type = 'text/csv;charset=utf-8') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const formatDate = (iso, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
};
