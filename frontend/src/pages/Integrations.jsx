import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import {
  Blocks, MessageSquare, GitBranch, KanbanSquare,
  Save, CheckCircle2, AlertCircle, RefreshCw,
  Link as LinkIcon, Loader2, Check, Eye, EyeOff,
  X, Zap, Info, ShieldAlert
} from 'lucide-react';

// ── Toggle ─────────────────────────────────────────────────────
const Toggle = ({ enabled, onChange, disabled = false }) => (
  <button onClick={onChange} disabled={disabled}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-40 disabled:cursor-not-allowed ${
      enabled ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-700'
    }`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
      enabled ? 'translate-x-6' : 'translate-x-1'
    }`}/>
  </button>
);

// ── SecretInput: değer dolu → maskeleme + göster butonu ─────────
const SecretInput = ({ label, name, placeholder, value, onChange, disabled }) => {
  const [revealed, setRevealed] = useState(false);
  const isFilled = value && value.length > 0;
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</label>
      <div className="relative">
        <input
          type={revealed ? 'text' : 'password'}
          name={name}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`w-full px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-950 border rounded-xl text-sm outline-none transition-all font-mono ${
            disabled
              ? 'opacity-50 cursor-not-allowed text-slate-400 border-slate-200 dark:border-slate-800'
              : isFilled
                ? 'border-sky-300 dark:border-sky-700 focus:ring-2 focus:ring-sky-500/20 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 text-slate-900 dark:text-white'
          }`}
        />
        {!disabled && isFilled && (
          <button type="button" onClick={() => setRevealed(r => !r)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            {revealed ? <EyeOff size={15}/> : <Eye size={15}/>}
          </button>
        )}
      </div>
    </div>
  );
};

// ── NormalInput ────────────────────────────────────────────────
const InputField = ({ label, name, type = 'text', placeholder, value, onChange, disabled, hint }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</label>
    <input type={type} name={name} placeholder={placeholder} value={value} onChange={onChange} disabled={disabled}
      className={`w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none transition-all ${
        disabled ? 'opacity-50 cursor-not-allowed text-slate-400' : 'focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 text-slate-900 dark:text-white'
      }`}
    />
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

// ── Test Butonu ────────────────────────────────────────────────
const TestButton = ({ status, onClick, disabled }) => {
  const stateMap = {
    null:    { cls: 'bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/20', icon: <LinkIcon size={13}/>, label: 'Bağlantıyı Test Et' },
    loading: { cls: 'bg-slate-50 text-slate-500 dark:bg-slate-800 cursor-not-allowed',                     icon: <Loader2 size={13} className="animate-spin"/>, label: 'Test ediliyor...' },
    success: { cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',          icon: <Check size={13}/>,   label: 'Bağlantı Başarılı!' },
    error:   { cls: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',                     icon: <X size={13}/>,       label: 'Bağlanamadı' },
  };
  const s = stateMap[status] || stateMap[null];
  return (
    <button onClick={onClick} disabled={status === 'loading' || disabled}
      className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${s.cls}`}>
      {s.icon} {s.label}
    </button>
  );
};

// ── Platform Kartı Wrapper ──────────────────────────────────────
const IntegrationCard = ({ active, children, className = '' }) => (
  <div className={`bg-white dark:bg-slate-900 border rounded-2xl transition-all duration-300 flex flex-col ${
    active ? 'border-sky-300 dark:border-sky-700 shadow-md shadow-sky-500/5' : 'border-slate-200 dark:border-slate-800'
  } ${className}`}>
    {children}
  </div>
);

// ── Ana Bileşen ────────────────────────────────────────────────
const Integrations = () => {
  // HOOK BURAYA TAŞINDI!
  const { can } = usePermission();
  const canEdit = can('integrations.edit'); // Yetki kontrolü için sabit
  
  const [loading, setLoading]     = useState(false);
  const [toast, setToast]         = useState(null);    // { type, message }
  const [testStatus, setTestStatus] = useState({ slack: null, jira: null, github: null });
  const [active, setActive]       = useState({ slack: false, jira: false, github: false });
  const [isDirty, setIsDirty]     = useState(false);   // kayıt edilmemiş değişiklik var mı

  const [formData, setFormData] = useState({
    slackWebhook:    '',
    slackChannel:    '',      
    jiraUrl:         '',
    jiraEmail:       '',
    jiraToken:       '',
    jiraProjectKey:  '',
    githubToken:     '',
    githubRepo:      '',
    githubBranch:    'main',  
    githubSecret:    '',
  });

  const savedDataRef = useRef(formData);

  // ── localStorage'dan yükle ───────────────────────────────────
  useEffect(() => {
    try {
      const sA = JSON.parse(localStorage.getItem('ng-integrations-active') || '{}');
      const sD = JSON.parse(localStorage.getItem('ng-integrations-data')   || '{}');
      const merged = { ...formData, ...sD };
      setActive(prev => ({ ...prev, ...sA }));
      setFormData(merged);
      savedDataRef.current = merged;
    } catch { /* ignore */ }
  }, []);

  // ── Sayfa kapatma uyarısı ────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const handleToggle = (key) => {
    setActive(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('ng-integrations-active', JSON.stringify(next));
      return next;
    });
    setIsDirty(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      setIsDirty(JSON.stringify(next) !== JSON.stringify(savedDataRef.current));
      return next;
    });
  };

  // ── Kaydet ──────────────────────────────────────────────────
  const handleSave = async () => {
    setLoading(true);
    try {
      await new Promise(r => setTimeout(r, 600)); // simülasyon — backend hazır değil
      localStorage.setItem('ng-integrations-data', JSON.stringify(formData));
      savedDataRef.current = formData;
      setIsDirty(false);
      showToast('success', 'Entegrasyon ayarları kaydedildi.');
    } catch {
      showToast('error', 'Kaydedilemedi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  // ── Bağlantı Testi ──────────────────────────────────────────
  const handleTestConnection = async (key) => {
    const validationMap = {
      slack:  !!formData.slackWebhook,
      jira:   !!(formData.jiraUrl && formData.jiraToken),
      github: !!(formData.githubRepo && formData.githubToken),
    };
    setTestStatus(prev => ({ ...prev, [key]: 'loading' }));
    await new Promise(r => setTimeout(r, 1200));
    const result = validationMap[key] ? 'success' : 'error';
    setTestStatus(prev => ({ ...prev, [key]: result }));
    showToast(result, result === 'success' ? `${key} bağlantısı başarılı.` : `${key} için zorunlu alanlar eksik.`);
    setTimeout(() => setTestStatus(prev => ({ ...prev, [key]: null })), 4000);
  };

  // Aktif entegrasyon sayısı
  const activeCount = Object.values(active).filter(Boolean).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-5xl mx-auto relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400'
            : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Blocks size={24} className="text-sky-500"/> Entegrasyonlar
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
            Platformu diğer araçlara bağlayın ve iş akışlarını otomatikleştirin.
            {activeCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 text-xs font-bold rounded-full border border-sky-200 dark:border-sky-800">
                <Zap size={11}/> {activeCount} aktif
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
              <Info size={13}/> Kaydedilmemiş değişiklik var
            </span>
          )}
          {/* YETKİ KONTROLÜ: Sadece yetkisi olanlar kaydedebilir */}
          <button onClick={handleSave} disabled={loading || !isDirty || !canEdit}
            title={!canEdit ? "Düzenleme yetkiniz yok" : ""}
            className="px-5 py-2.5 bg-sky-500 text-white rounded-xl font-bold hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <><RefreshCw size={16} className="animate-spin"/> Kaydediliyor...</> : <><Save size={16}/> Değişiklikleri Kaydet</>}
          </button>
        </div>
      </div>

      {/* YETKİ UYARI BANNERI */}
      {!canEdit && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-900/10 dark:border-amber-800/50 dark:text-amber-400 px-5 py-3.5 rounded-xl text-sm font-medium">
          <ShieldAlert size={18} className="shrink-0" />
          Entegrasyon ayarlarını düzenleme yetkiniz bulunmamaktadır. Aşağıdaki verileri sadece görüntüleyebilirsiniz.
        </div>
      )}

      {/* KARTLAR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── SLACK ── */}
        <IntegrationCard active={active.slack}>
          <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#E01E5A]/10 text-[#E01E5A] rounded-xl flex items-center justify-center shrink-0">
                <MessageSquare size={22}/>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Slack</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Koşum sonuçlarını kanallara bildir.</p>
              </div>
            </div>
            <Toggle enabled={active.slack} onChange={() => handleToggle('slack')} disabled={!canEdit}/>
          </div>

          <div className={`p-6 space-y-4 flex-1 transition-opacity ${!active.slack ? 'opacity-50 pointer-events-none' : ''}`}>
            <SecretInput label="Webhook URL" name="slackWebhook"
              placeholder="https://hooks.slack.com/services/T0000/..." value={formData.slackWebhook}
              onChange={handleChange} disabled={!active.slack || !canEdit}
            />
            <InputField label="Bildirim Kanalı" name="slackChannel"
              placeholder="#test-sonuclari" value={formData.slackChannel}
              onChange={handleChange} disabled={!active.slack || !canEdit}
              hint="Boş bırakılırsa webhook'un varsayılan kanalı kullanılır."
            />
          </div>

          <div className="px-6 pb-5 flex items-center justify-between">
            {active.slack
              ? <TestButton status={testStatus.slack} onClick={() => handleTestConnection('slack')} disabled={!canEdit}/>
              : <span className="text-xs text-slate-400 italic">Etkinleştirmek için toggle'ı açın</span>
            }
            {active.slack && formData.slackWebhook && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"/> Yapılandırıldı
              </span>
            )}
          </div>
        </IntegrationCard>

        {/* ── JIRA ── */}
        <IntegrationCard active={active.jira}>
          <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-[#0052CC]/10 text-[#0052CC] rounded-xl flex items-center justify-center shrink-0">
                <KanbanSquare size={22}/>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Jira Software</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Başarısız testleri otomatik bug'a dönüştür.</p>
              </div>
            </div>
            <Toggle enabled={active.jira} onChange={() => handleToggle('jira')} disabled={!canEdit}/>
          </div>

          <div className={`p-6 space-y-4 flex-1 transition-opacity ${!active.jira ? 'opacity-50 pointer-events-none' : ''}`}>
            <InputField label="Jira Workspace URL" name="jiraUrl"
              placeholder="https://sirketiniz.atlassian.net" value={formData.jiraUrl}
              onChange={handleChange} disabled={!active.jira || !canEdit}
            />
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Hesap E-postası" name="jiraEmail"
                placeholder="dev@sirket.com" value={formData.jiraEmail}
                onChange={handleChange} disabled={!active.jira || !canEdit}
              />
              <InputField label="Proje Anahtarı" name="jiraProjectKey"
                placeholder="QA veya FRONT" value={formData.jiraProjectKey}
                onChange={handleChange} disabled={!active.jira || !canEdit}
                hint="Jira board URL'indeki kısa kod."
              />
            </div>
            <SecretInput label="API Token" name="jiraToken"
              placeholder="••••••••••••••••" value={formData.jiraToken}
              onChange={handleChange} disabled={!active.jira || !canEdit}
            />
          </div>

          <div className="px-6 pb-5 flex items-center justify-between">
            {active.jira
              ? <TestButton status={testStatus.jira} onClick={() => handleTestConnection('jira')} disabled={!canEdit}/>
              : <span className="text-xs text-slate-400 italic">Etkinleştirmek için toggle'ı açın</span>
            }
            {active.jira && formData.jiraUrl && formData.jiraToken && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"/> Yapılandırıldı
              </span>
            )}
          </div>
        </IntegrationCard>

        {/* ── GITHUB ── */}
        <IntegrationCard active={active.github} className="md:col-span-2">
          <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-800 text-white rounded-xl flex items-center justify-center shrink-0">
                <GitBranch size={22}/>
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">GitHub Actions</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">CI/CD pipeline üzerinden otomasyon koşumlarını tetikle.</p>
              </div>
            </div>
            <Toggle enabled={active.github} onChange={() => handleToggle('github')} disabled={!canEdit}/>
          </div>

          <div className={`p-6 transition-opacity ${!active.github ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <InputField label="Repository (owner/repo)" name="githubRepo"
                placeholder="sirketadi/frontend" value={formData.githubRepo}
                onChange={handleChange} disabled={!active.github || !canEdit}
              />
              <InputField label="Tetiklenecek Branch" name="githubBranch"
                placeholder="main" value={formData.githubBranch}
                onChange={handleChange} disabled={!active.github || !canEdit}
                hint="Varsayılan: main"
              />
              <SecretInput label="Personal Access Token (PAT)" name="githubToken"
                placeholder="ghp_XXXXXXXXXXXXXXX" value={formData.githubToken}
                onChange={handleChange} disabled={!active.github || !canEdit}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SecretInput label="Webhook Secret (Opsiyonel)" name="githubSecret"
                placeholder="Gelen istekleri doğrulamak için şifre" value={formData.githubSecret}
                onChange={handleChange} disabled={!active.github || !canEdit}
              />

              {active.github && (
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex gap-3 items-start">
                  <Info size={16} className="text-sky-500 shrink-0 mt-0.5"/>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <p className="font-bold text-slate-900 dark:text-white mb-1.5">GitHub Webhook Kurulumu</p>
                    <p>Deponuzun <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded text-xs">Settings → Webhooks</code> alanına şunu ekleyin:</p>
                    <code className="block mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg font-mono text-xs text-sky-600 dark:text-sky-400 select-all cursor-copy break-all">
                      https://api.ngtest.com/v1/webhooks/github/receive
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 mt-2 pt-4">
            {active.github
              ? <TestButton status={testStatus.github} onClick={() => handleTestConnection('github')} disabled={!canEdit}/>
              : <span className="text-xs text-slate-400 italic">Etkinleştirmek için toggle'ı açın</span>
            }
            {active.github && formData.githubRepo && formData.githubToken && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"/> Yapılandırıldı
              </span>
            )}
          </div>
        </IntegrationCard>

      </div>

      {/* Bilgi Notu */}
      <div className="bg-sky-50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800 rounded-2xl p-5 flex gap-4 items-start">
        <Info size={18} className="text-sky-500 shrink-0 mt-0.5"/>
        <div className="text-sm text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-900 dark:text-white mb-1">Entegrasyon verileriniz güvende</p>
          <p>API token ve webhook URL'leri şu an tarayıcı depolama alanında tutulmaktadır. Backend entegrasyon endpoint'i hazır olduğunda bu veriler sunucuya şifreli olarak aktarılacaktır. Production ortamı için backend yapılandırması gereklidir.</p>
        </div>
      </div>
    </div>
  );
};

export default Integrations;