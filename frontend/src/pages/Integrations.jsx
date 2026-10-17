import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api'; // FIX: Orijinal haline (default export) geri alındı!
import { usePermission } from '../hooks/usePermission';
import {
  Blocks, MessageSquare, GitBranch, KanbanSquare,
  Save, CheckCircle2, AlertCircle, RefreshCw,
  Link as LinkIcon, Loader2, Check, Eye, EyeOff,
  X, Zap, Info, ShieldAlert
} from 'lucide-react';

// ── Sabitler ──────────────────────────────────────────────────────
const PROVIDERS = ['slack', 'jira', 'github'];

const PROVIDER_KEYS = {
  slack:  ['slackWebhook', 'slackChannel'],
  jira:   ['jiraUrl', 'jiraEmail', 'jiraToken', 'jiraProjectKey'],
  github: ['githubToken', 'githubRepo', 'githubBranch', 'githubSecret'],
};

const DEFAULT_FORM = {
  slackWebhook:   '',
  slackChannel:   '',
  jiraUrl:        '',
  jiraEmail:      '',
  jiraToken:      '',
  jiraProjectKey: '',
  githubToken:    '',
  githubRepo:     '',
  githubBranch:   'main',
  githubSecret:   '',
};

const DEFAULT_ACTIVE = { slack: false, jira: false, github: false };

const parseApiError = (err) => {
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || String(d)).join(', ');
  if (typeof detail === 'string') return detail;
  return err?.message || 'Bir hata oluştu.';
};

const getProviderConfig = (provider, formData) => {
  const config = {};
  PROVIDER_KEYS[provider].forEach(k => { config[k] = formData[k] || ''; });
  return config;
};

// ── Alt Bileşenler ────────────────────────────────────────────────
const Toggle = ({ enabled, onChange, disabled = false }) => (
  <button
    onClick={onChange}
    disabled={disabled}
    type="button"
    aria-checked={enabled}
    role="switch"
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 disabled:opacity-40 disabled:cursor-not-allowed ${ enabled ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-700' }`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${ enabled ? 'translate-x-6' : 'translate-x-1' }`}/>
  </button>
);

const SecretInput = ({ label, name, placeholder, value, onChange, disabled }) => {
  const [revealToggle, setRevealed] = useState(false);
  // Alan kilitliyken değer hiçbir zaman açık gösterilmez (effect içinde setState yerine türetilmiş değer)
  const revealed = revealToggle && !disabled;

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <div className="relative">
        <input
          type={revealed ? 'text' : 'password'}
          name={name}
          placeholder={placeholder}
          value={value || ''} 
          onChange={onChange}
          disabled={disabled}
          autoComplete="off"
          className={`w-full px-4 py-2.5 pr-10 bg-slate-50 dark:bg-slate-950 border rounded-xl text-sm outline-none transition-all font-mono ${ disabled ? 'opacity-50 cursor-not-allowed text-slate-400 border-slate-200 dark:border-slate-800' : value ? 'border-sky-300 dark:border-sky-700 focus:ring-2 focus:ring-sky-500/20 text-slate-900 dark:text-white' : 'border-slate-200 dark:border-slate-800 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 text-slate-900 dark:text-white' }`}
        />
        {!disabled && (
          <button
            type="button"
            onClick={() => setRevealed(r => !r)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title={revealed ? 'Gizle' : 'Göster'}
          >
            {revealed ? <EyeOff size={15}/> : <Eye size={15}/>}
          </button>
        )}
      </div>
    </div>
  );
};

const InputField = ({ label, name, placeholder, value, onChange, disabled, hint }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
      {label}
    </label>
    <input
      type="text"
      name={name}
      placeholder={placeholder}
      value={value || ''} 
      onChange={onChange}
      disabled={disabled}
      className={`w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm outline-none transition-all ${ disabled ? 'opacity-50 cursor-not-allowed text-slate-400' : 'focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 text-slate-900 dark:text-white' }`}
    />
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

const TestButton = ({ status, onClick, disabled }) => {
  const map = {
    null:    { cls: 'bg-sky-50 text-sky-600 hover:bg-sky-100 dark:bg-sky-500/10 dark:hover:bg-sky-500/20 border-sky-200 dark:border-sky-800',          icon: <LinkIcon size={13}/>,                       label: 'Bağlantıyı Test Et'  },
    loading: { cls: 'bg-slate-50 text-slate-400 dark:bg-slate-800 border-slate-200 cursor-not-allowed',                                                icon: <Loader2 size={13} className="animate-spin"/>, label: 'Test ediliyor...'    },
    success: { cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',          icon: <Check size={13}/>,                            label: 'Bağlantı Başarılı!'  },
    error:   { cls: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-800',                             icon: <X size={13}/>,                                label: 'Bağlanamadı'         },
  };
  
  const s = map[status ?? 'null'] || map['null'];
  
  return (
    <button
      onClick={onClick}
      disabled={status === 'loading' || disabled}
      type="button"
      className={`text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 border transition-colors disabled:cursor-not-allowed ${s.cls}`}
    >
      {s.icon} {s.label}
    </button>
  );
};

const IntegrationCard = ({ active, children, className = '' }) => (
  <div className={`bg-white dark:bg-slate-900 border rounded-2xl transition-all duration-300 flex flex-col ${ active ? 'border-sky-300 dark:border-sky-700 shadow-md shadow-sky-500/5' : 'border-slate-200 dark:border-slate-800' } ${className}`}>
    {children}
  </div>
);

// ── Ana Bileşen ────────────────────────────────────────────────────
const Integrations = () => {
  const { can } = usePermission();
  const canEdit = can('integrations.manage');

  const [pageLoading, setPageLoading] = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [active,      setActive]      = useState({ ...DEFAULT_ACTIVE });
  const [formData,    setFormData]    = useState({ ...DEFAULT_FORM });
  const [testStatus,  setTestStatus]  = useState({
    slack: null, jira: null, github: null,
  });

  const toastTimerRef = useRef(null);
  const [toast, setToast] = useState(null);
  
  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);
  
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const testTimerRefs = useRef({
    slack: null, jira: null, github: null,
  });
  
  useEffect(() => () => {
    Object.values(testTimerRefs.current).forEach(t => { if (t) clearTimeout(t); });
  }, []);

  const savedRef = useRef(
    JSON.stringify({ active: DEFAULT_ACTIVE, form: DEFAULT_FORM })
  );
  const isDirty = JSON.stringify({ active, form: formData }) !== savedRef.current;

  // ── Veri Çekme ──────────────────────────────────────────────────
  const fetchIntegrations = useCallback(async () => {
    setPageLoading(true);
    try {
      const res  = await api.get('/integrations/'); // FIX: api.get geri getirildi
      const rows = Array.isArray(res.data) ? res.data : (res.data?.data || []);

      const newActive = { ...DEFAULT_ACTIVE };
      const newForm   = { ...DEFAULT_FORM };

      rows.forEach((item) => {
        const provider = item.provider;
        if (PROVIDERS.includes(provider)) {
          newActive[provider] = Boolean(item.is_active);
          
          if (item.config) {
            PROVIDER_KEYS[provider].forEach(key => {
              if (item.config[key] !== undefined && item.config[key] !== null) {
                newForm[key] = item.config[key];
              }
            });
          }
        }
      });

      setActive(newActive);
      setFormData(newForm);
      savedRef.current = JSON.stringify({ active: newActive, form: newForm });
    } catch (err) {
      showToast('error', parseApiError(err));
    } finally {
      setPageLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  // Kaydedilmemiş değişiklik varsa sayfadan çıkışta uyar
  useEffect(() => {
    const handler = (e) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Handler'lar ─────────────────────────────────────────────────
  const handleToggle = useCallback((key) => {
    if (!canEdit) return;
    setActive(prev => ({ ...prev, [key]: !prev[key] }));
  }, [canEdit]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  // ── Kaydet ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!isDirty || !canEdit) return;
    setSaving(true);
    try {
      await Promise.all(
        PROVIDERS.map(provider =>
          api.put(`/integrations/${provider}`, { // FIX: api.put geri getirildi
            is_active: active[provider],
            config:    getProviderConfig(provider, formData),
          })
        )
      );
      savedRef.current = JSON.stringify({ active, form: formData });
      showToast('success', 'Entegrasyon ayarları kaydedildi.');
    } catch (err) {
      showToast('error', parseApiError(err));
    } finally {
      setSaving(false);
    }
  }, [active, formData, isDirty, canEdit, showToast]);

  // ── Bağlantı Testi ────────────────────────────────────────────────
  const handleTest = useCallback(async (provider) => {
    if (testTimerRefs.current[provider]) {
      clearTimeout(testTimerRefs.current[provider]);
    }
    setTestStatus(prev => ({ ...prev, [provider]: 'loading' }));
    
    try {
      const res = await api.post(`/integrations/${provider}/test`, { // FIX: api.post geri getirildi
        is_active: active[provider],
        config:    getProviderConfig(provider, formData),
      });
      setTestStatus(prev => ({ ...prev, [provider]: 'success' }));
      showToast('success', res.data?.message || `${provider.toUpperCase()} bağlantısı başarılı.`);
    } catch (err) {
      setTestStatus(prev => ({ ...prev, [provider]: 'error' }));
      showToast('error', parseApiError(err));
    } finally {
      testTimerRefs.current[provider] = setTimeout(
        () => setTestStatus(prev => ({ ...prev, [provider]: null })),
        4000
      );
    }
  }, [active, formData, showToast]);

  // ── Hesaplamalı Değerler ──────────────────────────────────────────
  const activeCount = Object.values(active).filter(Boolean).length;
  
  const rawWebhookBase = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
  const webhookBase = rawWebhookBase.replace(/\/$/, '');

  const isConfigured = {
    slack:  !!(active.slack  && formData.slackWebhook),
    jira:   !!(active.jira   && formData.jiraUrl && formData.jiraToken),
    github: !!(active.github && formData.githubRepo && formData.githubToken),
  };

  const isTestDisabled = {
    slack:  !canEdit || !formData.slackWebhook,
    jira:   !canEdit || !formData.jiraUrl || !formData.jiraToken,
    github: !canEdit || !formData.githubRepo || !formData.githubToken,
  };

  if (pageLoading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <Loader2 size={28} className="animate-spin text-sky-500"/>
        <p className="text-sm">Entegrasyon ayarları yükleniyor...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border animate-in fade-in slide-in-from-top-2 duration-300 ${ toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700 dark:text-emerald-400' : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-700 dark:text-rose-400' }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Entegrasyonlar
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
        <div className="flex items-center gap-2">
          <button
            onClick={fetchIntegrations}
            type="button"
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-sky-600 hover:border-sky-300 transition-colors"
            title="Yenile"
          >
            <RefreshCw size={16}/>
          </button>
          {isDirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium px-3 py-2 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-200 dark:border-amber-800">
              <Info size={13}/> Kaydedilmemiş değişiklik
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty || !canEdit}
            type="button"
            title={!canEdit ? 'Düzenleme yetkiniz yok' : !isDirty ? 'Değişiklik yok' : ''}
            className="px-5 py-2.5 bg-sky-500 text-white rounded-xl font-bold hover:bg-sky-600 transition-colors shadow-lg shadow-sky-500/20 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? <><RefreshCw size={15} className="animate-spin"/> Kaydediliyor...</>
              : <><Save size={15}/> Kaydet</>}
          </button>
        </div>
      </div>

      {/* Yetki uyarısı */}
      {!canEdit && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-900/10 dark:border-amber-800/50 dark:text-amber-400 px-5 py-3.5 rounded-xl text-sm font-medium">
          <ShieldAlert size={18} className="shrink-0"/>
          Entegrasyon ayarlarını düzenleme yetkiniz yok. Yalnızca görüntüleyebilirsiniz.
        </div>
      )}

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
          <div className={`p-6 space-y-4 flex-1 transition-opacity duration-200 ${!active.slack ? 'opacity-40 pointer-events-none' : ''}`}>
            <SecretInput
              label="Webhook URL" name="slackWebhook"
              placeholder="https://hooks.slack.com/services/T0000/..."
              value={formData.slackWebhook} onChange={handleChange}
              disabled={!canEdit}
            />
            <InputField
              label="Bildirim Kanalı" name="slackChannel"
              placeholder="#test-sonuclari" value={formData.slackChannel}
              onChange={handleChange} disabled={!canEdit}
              hint="Boş bırakılırsa webhook'un varsayılan kanalı kullanılır."
            />
          </div>
          <div className="px-6 pb-5 flex items-center justify-between">
            {active.slack
              ? <TestButton status={testStatus.slack} onClick={() => handleTest('slack')} disabled={isTestDisabled.slack}/>
              : <span className="text-xs text-slate-400 italic">Toggle'ı açın</span>
            }
            {isConfigured.slack && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"/> Yapılandırıldı
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
          <div className={`p-6 space-y-4 flex-1 transition-opacity duration-200 ${!active.jira ? 'opacity-40 pointer-events-none' : ''}`}>
            <InputField
              label="Jira Workspace URL" name="jiraUrl"
              placeholder="https://sirketiniz.atlassian.net"
              value={formData.jiraUrl} onChange={handleChange} disabled={!canEdit}
            />
            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Hesap E-postası" name="jiraEmail"
                placeholder="dev@sirket.com" value={formData.jiraEmail}
                onChange={handleChange} disabled={!canEdit}
              />
              <InputField
                label="Proje Anahtarı" name="jiraProjectKey"
                placeholder="QA" value={formData.jiraProjectKey}
                onChange={handleChange} disabled={!canEdit}
                hint="Jira board URL'indeki kısa kod"
              />
            </div>
            <SecretInput
              label="API Token" name="jiraToken"
              placeholder="••••••••••••••••" value={formData.jiraToken}
              onChange={handleChange} disabled={!canEdit}
            />
          </div>
          <div className="px-6 pb-5 flex items-center justify-between">
            {active.jira
              ? <TestButton status={testStatus.jira} onClick={() => handleTest('jira')} disabled={isTestDisabled.jira}/>
              : <span className="text-xs text-slate-400 italic">Toggle'ı açın</span>
            }
            {isConfigured.jira && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"/> Yapılandırıldı
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
          <div className={`p-6 transition-opacity duration-200 ${!active.github ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <InputField
                label="Repository (owner/repo)" name="githubRepo"
                placeholder="sirketadi/frontend" value={formData.githubRepo}
                onChange={handleChange} disabled={!canEdit}
              />
              <InputField
                label="Branch" name="githubBranch"
                placeholder="main" value={formData.githubBranch}
                onChange={handleChange} disabled={!canEdit}
                hint="Varsayılan: main"
              />
              <SecretInput
                label="Personal Access Token (PAT)" name="githubToken"
                placeholder="ghp_XXXXXXXXXXXXXXX" value={formData.githubToken}
                onChange={handleChange} disabled={!canEdit}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SecretInput
                label="Webhook Secret (Opsiyonel)" name="githubSecret"
                placeholder="Gelen istekleri doğrulamak için şifre"
                value={formData.githubSecret}
                onChange={handleChange} disabled={!canEdit}
              />
              {active.github && (
                <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex gap-3 items-start">
                  <Info size={15} className="text-sky-500 shrink-0 mt-0.5"/>
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <p className="font-bold text-slate-900 dark:text-white mb-1.5">GitHub Webhook Kurulumu</p>
                    <p>Deponuzun <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">Settings → Webhooks</code> alanına ekleyin:</p>
                    <code className="block mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-lg font-mono text-xs text-sky-600 dark:text-sky-400 select-all cursor-copy break-all">
                      {webhookBase}/webhooks/github/receive
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="px-6 pb-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 mt-2 pt-4">
            {active.github
              ? <TestButton status={testStatus.github} onClick={() => handleTest('github')} disabled={isTestDisabled.github}/>
              : <span className="text-xs text-slate-400 italic">Toggle'ı açın</span>
            }
            {isConfigured.github && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"/> Yapılandırıldı
              </span>
            )}
          </div>
        </IntegrationCard>

      </div>
    </div>
  );
};

export default Integrations;