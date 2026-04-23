import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Beaker, MoreVertical, Activity, X, Pencil,
  Trash2, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight,
  Folder, Loader2, PlayCircle, Cpu, Zap, Hash, Sparkles,
  Wand2, Bot, RefreshCw, Clock, Terminal, Copy, Check, CheckSquare,
  Square, Download, FileText, ChevronsUpDown, ArrowUp, ArrowDown,
  Key, Code2, Play
} from 'lucide-react';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import { testCasesApi, projectsApi } from '../api';

// ── Sabitler ──────────────────────────────────────────────────
export const GLOBAL_TEST_TYPES = [
  'Functional','Smoke','Sanity','Regression','Integration',
  'End-to-End (E2E)','API','UI/Design','Usability','Performance',
  'Security','Acceptance (UAT)','Accessibility','Compatibility','Exploratory',
];

const GHERKIN_SUGGESTIONS = [
  { label: '🔐 Giriş', text: 'Feature: Kullanıcı Girişi\n\nScenario: Başarılı giriş\n  Given Kullanıcı login sayfasındadır\n  When Kullanıcı geçerli e-posta ve şifre girer\n  And Giriş butonuna tıklar\n  Then Dashboard sayfasına yönlendirilmelidir' },
  { label: '🛒 Sepet',  text: 'Feature: Sepet Yönetimi\n\nScenario: Ürünü sepete ekle\n  Given Kullanıcı ürün detay sayfasındadır\n  When Kullanıcı \'Sepete Ekle\' butonuna tıklar\n  Then Sepet sayacı 1 artmalıdır\n  And Başarı bildirimi gösterilmelidir' },
  { label: '🔍 Arama',  text: 'Feature: Ürün Arama\n\nScenario: Geçerli sorgu ile arama\n  Given Kullanıcı anasayfadadır\n  When Arama kutusuna \'laptop\' yazar\n  And Arama butonuna basar\n  Then En az 1 sonuç görünmelidir' },
];

const PROMPT_SUGGESTIONS = [
  { label: '🔐 Kullanıcı Girişi', text: 'Kullanıcının e-posta ve şifre ile sisteme giriş yapması senaryosunu test et.' },
  { label: '📝 Kayıt Formu',      text: 'Yeni kullanıcı kayıt formunun validasyon ve başarılı kayıt akışını test et.' },
  { label: '🛒 Sepete Ekle',      text: 'E-ticaret sitesinde ürünü sepete ekleme ve güncelleme işlemini test et.' },
  { label: '🔍 Arama',            text: 'Arama kutusuna sorgu girince filtrelenmiş sonuçların gelmesini test et.' },
];

const PLAYWRIGHT_TEMPLATE = `import pytest
from playwright.sync_api import Page, expect

def test_auto_generated(page: Page):
    print("\\n[LOG] Tarayıcı başlatılıyor...")
    page.goto("https://www.example.com")
    
    # Assert
    expect(page).to_have_title("Example Domain")
    print("[LOG] Başarılı!")
`;

// ── Türkçe güvenli lowercase ──────────────────────────────────
const trLower = (s = '') => s.toLocaleLowerCase('tr-TR');

// ── Yardımcılar ───────────────────────────────────────────────
const getPriorityConfig = (p) => ({
  'Kritik': { cls: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800',         dot: 'bg-rose-500',   val: 4 },
  'Yüksek': { cls: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', dot: 'bg-orange-500', val: 3 },
  'Orta':   { cls: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-500', val: 2 },
  'Düşük':  { cls: 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700',        dot: 'bg-slate-400',  val: 1 },
}[p] || { cls: 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700', dot: 'bg-slate-400', val: 0 });

const getStatusConfig = (s) => ({
  'Başarılı':      { cls: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  'Başarısız':     { cls: 'text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400 border-rose-200 dark:border-rose-800',                   dot: 'bg-rose-500' },
  'Test Edilmedi': { cls: 'text-violet-700 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-400 border-violet-200 dark:border-violet-800',        dot: 'bg-violet-500' },
  'Taslak':        { cls: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',                dot: 'bg-slate-400' },
}[s] || { cls: 'text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' });

const safeParseDesc = (desc) => {
  if (!desc) return { steps: [], type: 'Functional', execution_type: 'Manual' };
  try {
    if (desc.trim().startsWith('{')) {
      const p = JSON.parse(desc);
      return {
        steps: Array.isArray(p.steps) ? p.steps : [],
        type: p.type || 'Functional',
        execution_type: p.execution_type || 'Manual',
      };
    }
  } catch {}
  return { steps: desc ? [{ id: 0, action: desc, expectedResult: '' }] : [], type: 'Functional', execution_type: 'Manual' };
};

const formatDate = (iso) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded-xl ${className}`} />
);

// ── Alt Bileşenler ────────────────────────────────────────────
const MetaRow = ({ icon, label, children }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="flex items-center gap-2 text-xs text-slate-400 shrink-0">{icon}{label}</span>
    <div className="text-right">{children}</div>
  </div>
);

const StepCard = ({ step, index }) => (
  <div className="relative pl-10">
    <div className="absolute left-0 top-0 w-7 h-7 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-700 flex items-center justify-center">
      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{index + 1}</span>
    </div>
    <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Aksiyon</p>
        <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
          {step.action || <span className="italic text-slate-400">Belirtilmemiş</span>}
        </p>
      </div>
      {step.expectedResult && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-1">Beklenen Sonuç</p>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{step.expectedResult}</p>
        </div>
      )}
    </div>
  </div>
);

const CodeBlock = ({ code, language = 'python' }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500/60"/>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60"/>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60"/>
          </div>
          <span className="text-xs text-slate-500 font-mono">{language}</span>
        </div>
        <button onClick={handleCopy} className={`flex items-center gap-1.5 text-xs transition-colors ${copied ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>
          {copied ? <><Check size={12}/> Kopyalandı!</> : <><Copy size={12}/> Kopyala</>}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono overflow-x-auto max-h-64 leading-relaxed">
        {code.split('\n').map((line, i) => {
          const cls =
            line.trim().startsWith('#') ? 'text-slate-500' :
            line.trim().startsWith('Feature:') || line.trim().startsWith('Scenario:') ? 'text-amber-400 font-bold' :
            /^\s+(Given|When|Then|And|But)\s/.test(line) ? 'text-fuchsia-400' :
            line.trim().startsWith('@') ? 'text-blue-400' :
            line.trim().startsWith('def ') ? 'text-emerald-400' :
            line.trim().startsWith('import') || line.trim().startsWith('from ') ? 'text-indigo-400' :
            line.includes('pass') || line.includes('TODO') ? 'text-slate-500' : 'text-slate-300';
          return <div key={i} className={cls}>{line || ' '}</div>;
        })}
      </pre>
    </div>
  );
};

// ── AI Modal ──────────────────────────────────────────────────
const AI_SYSTEM_PROMPT = `Sen uzman bir QA mühendisisin. JSON formatında test senaryosu üret. YALNIZCA JSON döndür:
{"title":"...","type":"Functional","priority":"Yüksek","execution_type":"Manual","steps":[{"id":1,"action":"...","expectedResult":"..."}]}
Kurallar: 4-8 adım, Türkçe, negatif senaryolar dahil, sadece geçerli JSON.`;

const AIModal = ({ onClose, onImport }) => {
  const [prompt, setPrompt]     = useState('');
  const [apiKey, setApiKey]     = useState(localStorage.getItem('ng-gemini-key') || '');
  const [state, setState]       = useState('idle');
  const [result, setResult]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey.trim()) {
      setState('error');
      setErrorMsg(!apiKey.trim() ? 'API Key gerekli.' : 'Lütfen bir senaryo yazın.');
      return;
    }
    setState('generating'); setErrorMsg('');
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${AI_SYSTEM_PROMPT}\n\nİstek: ${prompt.trim()}` }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || 'API hatası'); }
      
      const data = await res.json();
      let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      // 🚀 ZIRH 1: Gemini'den gelen Markdown formatlı JSON'ı güvenli şekilde temizle
      rawText = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
      
      const parsed = JSON.parse(rawText);
      parsed.steps = (parsed.steps || []).map((s, i) => ({ ...s, id: Date.now() + i }));
      setResult(parsed);
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMsg(err.message.includes('JSON') ? 'AI geçersiz format döndürdü, tekrar deneyin.' : err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 rounded-t-3xl"/>
        <div className="px-6 pt-6 pb-4 flex justify-between items-start shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center">
              <Wand2 size={20} className="text-white"/>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">AI Test Asistanı</h3>
              <p className="text-xs text-slate-400">Google Gemini destekli</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18}/>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
          {(state === 'idle' || state === 'error') && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
                <Key size={16} className="text-indigo-500 shrink-0"/>
                <input
                  type="password" value={apiKey}
                  onChange={e => { setApiKey(e.target.value); localStorage.setItem('ng-gemini-key', e.target.value); }}
                  placeholder="Gemini API Key"
                  className="w-full bg-transparent text-xs outline-none dark:text-white placeholder:text-slate-400"
                />
              </div>
              <div className="relative">
                <textarea
                  value={prompt} onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
                  placeholder="Test etmek istediğiniz senaryoyu açıklayın..." rows={4}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-fuchsia-500/40 dark:text-white resize-none"
                />
                <span className="absolute bottom-3 right-3 text-xs text-slate-300 dark:text-slate-600">Ctrl+Enter</span>
              </div>
              {state === 'error' && (
                <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 px-4 py-3 rounded-xl text-sm">
                  <AlertCircle size={15} className="shrink-0 mt-0.5"/>{errorMsg}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {PROMPT_SUGGESTIONS.map(s => (
                  <button key={s.label} onClick={() => setPrompt(s.text)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${prompt === s.text ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 border-indigo-200' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button onClick={handleGenerate} disabled={!prompt.trim() || !apiKey.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-40 text-sm">
                <Sparkles size={17}/> Yapay Zeka ile Üret
              </button>
            </div>
          )}
          {state === 'generating' && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-5">
              <div className="relative">
                <div className="w-20 h-20 rounded-full border-4 border-slate-100 dark:border-slate-800"/>
                <div className="w-20 h-20 rounded-full border-4 border-fuchsia-500 border-t-transparent animate-spin absolute top-0 left-0"/>
                <div className="absolute inset-0 flex items-center justify-center"><Bot size={26} className="text-indigo-500"/></div>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">Analiz Ediliyor...</h3>
                <p className="text-sm text-slate-400 mt-1 animate-pulse">Test adımları hazırlanıyor</p>
              </div>
            </div>
          )}
          {state === 'success' && result && (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
              <div className="bg-slate-900 rounded-2xl p-5 border border-slate-700 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-fuchsia-500 rounded-l-2xl"/>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{result.type}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${result.priority === 'Kritik' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>{result.priority}</span>
                </div>
                <h4 className="text-white font-bold">{result.title}</h4>
                <p className="text-slate-400 text-xs mt-1">{result.steps.length} adım</p>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {result.steps.map((step, idx) => (
                  <div key={step.id || idx} className="flex gap-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 rounded-xl">
                    <span className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-700 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-slate-200 font-medium">{step.action}</p>
                      {step.expectedResult && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 flex items-start gap-1.5">
                          <CheckCircle2 size={12} className="shrink-0 mt-0.5"/>{step.expectedResult}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setState('idle'); setResult(null); }}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-sm hover:bg-slate-200 flex items-center justify-center gap-2 transition-colors">
                  <RefreshCw size={14}/> Yeniden Üret
                </button>
                <button onClick={() => { onImport(result); onClose(); }}
                  className="flex-[2] py-2.5 bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                  <Plus size={16}/> Forma Aktar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Ana Bileşen ────────────────────────────────────────────────
const TestCases = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { can }  = usePermission();

  const [testCases, setTestCases] = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [searchTerm,     setSearchTerm]     = useState('');
  const [statusFilter,   setStatusFilter]   = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [projectFilter,  setProjectFilter]  = useState(
    () => new URLSearchParams(window.location.search).get('project') || 'All'
  );
  const [typeFilter,     setTypeFilter]     = useState('All');
  const [execFilter,     setExecFilter]     = useState('All');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });

  const [selected,       setSelected]       = useState(new Set());
  const [bulkStatus,     setBulkStatus]     = useState('');
  const [isBulkSaving,   setIsBulkSaving]   = useState(false);

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [panel,          setPanel]          = useState(null);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [formError,      setFormError]      = useState('');
  const [deleteConfirm,  setDeleteConfirm]  = useState(null);
  const [isDeleting,     setIsDeleting]     = useState(false);
  const [showAIModal,    setShowAIModal]    = useState(false);

  const [activeTab,        setActiveTab]        = useState('manual');
  const [generatedCode,    setGeneratedCode]    = useState('');
  const [isGeneratingBDD,  setIsGeneratingBDD]  = useState(false);

  const toastTimerRef = useRef(null);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const defaultForm = {
    title: '', status: 'Taslak', priority: 'Orta', project_id: '',
    type: 'Functional', execution_type: 'Manual',
    steps: [{ id: Date.now(), action: '', expectedResult: '' }],
    gherkin_scenario: '',
    automation_script: '',
  };
  const [form, setForm] = useState(defaultForm);

  const fetchData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [pR, tR] = await Promise.all([projectsApi.getAll(), testCasesApi.getAll()]);
      setProjects(pR.data);
      setTestCases(tR.data);
    } catch (err) {
      setError(err.message || 'Sunucuya bağlanılamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const close = () => setActiveDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [fetchData]);

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('project');
    if (p) setProjectFilter(p);
  }, [location.search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, priorityFilter, projectFilter, typeFilter, execFilter]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const openCreate = () => {
    setFormError(''); setGeneratedCode(''); setActiveTab('manual');
    setForm({
      ...defaultForm,
      project_id: projects[0]?.id || '',
      steps: [{ id: Date.now(), action: '', expectedResult: '' }],
    });
    setPanel({ mode: 'create' });
  };

  const openView = (tc) => {
    const parsed = safeParseDesc(tc.description);
    setPanel({ mode: 'view', tc: { ...tc, ...parsed } });
    setActiveDropdown(null);
  };

  const openEdit = (tc) => {
    setFormError(''); setGeneratedCode('');
    const parsed = safeParseDesc(tc.description);

    let initialTab = 'manual';
    if (parsed.execution_type === 'Automated' && tc.automation_script) initialTab = 'automated';
    else if (tc.gherkin_scenario) initialTab = 'bdd';

    setActiveTab(initialTab);

    setForm({
      ...tc,
      steps: parsed.steps.length > 0 ? parsed.steps : [{ id: Date.now(), action: '', expectedResult: '' }],
      type: parsed.type,
      execution_type: parsed.execution_type,
      gherkin_scenario: tc.gherkin_scenario || '',
      automation_script: tc.automation_script || '',
    });
    setPanel({ mode: 'edit', tc });
    setActiveDropdown(null);
  };

  const handleDuplicate = async (tc) => {
    setActiveDropdown(null);
    try {
      const res = await testCasesApi.create({
        title:             `${tc.title} (Kopya)`,
        description:       tc.description,
        status:            'Taslak',
        priority:          tc.priority,
        project_id:        tc.project_id,
        gherkin_scenario:  tc.gherkin_scenario  || null,
        automation_script: tc.automation_script || null,
        tags:              '[]',
      });
      setTestCases(prev => [res.data, ...prev]);
      showToast('success', `"${tc.title}" kopyalandı.`);
    } catch (err) {
      showToast('error', err.message || 'Kopyalanamadı.');
    }
  };

  const switchToEdit = () => { if (panel?.tc) openEdit(panel.tc); };

  const closePanel = () => {
    const hasUnsaved = (activeTab === 'bdd' && generatedCode) ||
                       (activeTab === 'automated' && form.automation_script && panel?.mode === 'create');
    if (hasUnsaved) {
      if (!window.confirm('Kaydedilmemiş değişiklikler var. Çıkmak istiyor musunuz?')) return;
    }
    setPanel(null);
    setGeneratedCode('');
  };

  const handleAIImport = (aiResult) => {
    setFormError('');
    setForm({
      ...defaultForm,
      title:          aiResult.title,
      priority:       aiResult.priority,
      type:           aiResult.type,
      execution_type: aiResult.execution_type,
      project_id:     projects[0]?.id || '',
      steps:          aiResult.steps,
    });
    setPanel({ mode: 'create' });
    showToast('success', 'AI sonucu forma aktarıldı.');
  };

  const handleGenerateBDDCode = async () => {
    if (!form.gherkin_scenario.trim()) { showToast('error', 'Lütfen önce Gherkin senaryosu yazın.'); return; }
    setIsGeneratingBDD(true); setGeneratedCode('');
    try {
      const res = await testCasesApi.generateBDD({ gherkin: form.gherkin_scenario });
      setGeneratedCode(res.data.code);
      showToast('success', 'Pytest-BDD kodu üretildi!');
    } catch (err) {
      showToast('error', err.message || 'Kod üretilemedi.');
    } finally {
      setIsGeneratingBDD(false);
    }
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!form.project_id)   { setFormError('Lütfen bir proje seçiniz.'); return; }
    if (!form.title.trim()) { setFormError('Test başlığı boş bırakılamaz.'); return; }

    setIsSubmitting(true);
    try {
      const body = {
        title:             form.title.trim(),
        description:       JSON.stringify({
          steps:          form.steps,
          type:           form.type,
          execution_type: form.execution_type, 
        }),
        status:            form.status,
        priority:          form.priority,
        project_id:        parseInt(form.project_id),
        execution_type:    form.execution_type, 
        gherkin_scenario:  form.gherkin_scenario  || null,
        automation_script: form.automation_script || null,
        tags:              '[]', // Etiketler UI'dan kaldırıldı, backend boş JSON dizisi bekler
      };

      const req = panel?.mode === 'create'
        ? testCasesApi.create(body)
        : testCasesApi.update(form.id, body);

      const res  = await req;
      const saved = res.data;

      if (panel?.mode === 'create') {
        setTestCases(prev => [saved, ...prev]);
      } else {
        setTestCases(prev => prev.map(tc => tc.id === saved.id ? saved : tc));
      }
      setGeneratedCode('');
      setPanel(null);
      showToast('success', panel?.mode === 'create' ? 'Test senaryosu oluşturuldu.' : 'Test senaryosu güncellendi.');
    } catch (err) {
      setFormError(err.message || 'Sunucuya ulaşılamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      if (id === 'bulk') {
        const ids = [...selected];
        await Promise.all(ids.map(uid => testCasesApi.remove(uid)));
        setTestCases(prev => prev.filter(tc => !ids.includes(tc.id)));
        setSelected(new Set());
        showToast('success', `${ids.length} test senaryosu silindi.`);
      } else {
        await testCasesApi.remove(id);
        setTestCases(prev => prev.filter(tc => tc.id !== id));
        showToast('success', 'Test senaryosu silindi.');
        if (panel?.tc?.id === id) setPanel(null);
      }
    } catch (err) {
      showToast('error', err.message || 'Silinemedi.');
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selected.size === 0) return;
    setIsBulkSaving(true);
    try {
      await Promise.all([...selected].map(id => {
        const tc = testCases.find(t => t.id === id);
        if (!tc) return Promise.resolve();
        return testCasesApi.update(id, { ...tc, status: bulkStatus });
      }));
      setTestCases(prev => prev.map(tc => selected.has(tc.id) ? { ...tc, status: bulkStatus } : tc));
      setSelected(new Set());
      setBulkStatus('');
      showToast('success', `${selected.size} test senaryosunun durumu güncellendi.`);
    } catch (err) {
      showToast('error', err.message || 'Toplu güncelleme tamamlanamadı.');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleSendToAutomation = () => {
    const automatedIds = [...selected].filter(id => {
      const tc = testCases.find(t => t.id === id);
      if (!tc) return false;
      const parsed = safeParseDesc(tc.description);
      return parsed.execution_type === 'Automated' && Boolean(tc.automation_script?.trim());
    });

    if (automatedIds.length === 0) {
      showToast('error', 'Seçili testlerde otomasyona uygun (içinde kod olan) senaryo bulunamadı.');
      return;
    }

    const params = new URLSearchParams();
    params.set('cases', automatedIds.join(','));
    if (projectFilter !== 'All') params.set('project', projectFilter);
    navigate(`/automation?${params.toString()}`);
  };

  const toggleSelect    = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () =>
    selected.size === currentItems.length
      ? setSelected(new Set())
      : setSelected(new Set(currentItems.map(tc => tc.id)));

  const handleExportCSV = () => {
    const rows = [['ID','Başlık','Proje','Durum','Öncelik','Tür','Yürütme','BDD','Script']];
    sortedAndFilteredData.forEach(tc => {
      const parsed = safeParseDesc(tc.description);
      const safeTitle = String(tc.title).replace(/"/g, '""');
      rows.push([
        tc.id,
        `"${safeTitle}"`,
        getProjectName(tc.project_id),
        tc.status,
        tc.priority,
        parsed.type,
        parsed.execution_type,
        tc.gherkin_scenario  ? 'Evet' : 'Hayır',
        tc.automation_script ? 'Evet' : 'Hayır',
      ]);
    });
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'test-cases.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('success', `${sortedAndFilteredData.length} test senaryosu dışa aktarıldı.`);
  };

  const addStep    = () => setForm(p => ({ ...p, steps: [...p.steps, { id: Date.now(), action: '', expectedResult: '' }] }));
  const updateStep = (id, field, val) => setForm(p => ({ ...p, steps: p.steps.map(s => s.id === id ? { ...s, [field]: val } : s) }));
  const removeStep = (id) => setForm(p => ({ ...p, steps: p.steps.length > 1 ? p.steps.filter(s => s.id !== id) : p.steps }));

  const getProjectName = (id) => projects.find(p => p.id === id)?.name || '—';
  const getType        = (desc) => { try { return JSON.parse(desc)?.type || null; } catch { return null; } };

  const sortedAndFilteredData = useMemo(() => {
    let result = testCases.filter(tc => {
      const q      = trLower(searchTerm);
      const parsed = safeParseDesc(tc.description);
      return (
        (!q || trLower(tc.title).includes(q) || String(tc.id).includes(q)) &&
        (statusFilter   === 'All' || tc.status   === statusFilter) &&
        (priorityFilter === 'All' || tc.priority  === priorityFilter) &&
        (projectFilter  === 'All' || tc.project_id === parseInt(projectFilter)) &&
        (typeFilter     === 'All' || parsed.type  === typeFilter) &&
        (execFilter     === 'All' || parsed.execution_type === execFilter) 
      );
    });

    result.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      if (sortConfig.key === 'priority') {
        aValue = getPriorityConfig(a.priority).val;
        bValue = getPriorityConfig(b.priority).val;
      }
      if (sortConfig.key === 'project_id') {
        aValue = getProjectName(a.project_id);
        bValue = getProjectName(b.project_id);
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ?  1 : -1;
      return 0;
    });

    return result;
  }, [testCases, searchTerm, statusFilter, priorityFilter, projectFilter, typeFilter, execFilter, sortConfig]);

  const totalPages   = Math.ceil(sortedAndFilteredData.length / itemsPerPage);
  const currentItems = sortedAndFilteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const isPanelOpen = !!panel;
  const viewTC      = panel?.mode === 'view' ? panel.tc : null;
  const hasFilter   = searchTerm || statusFilter !== 'All' || priorityFilter !== 'All' ||
                      projectFilter !== 'All' || typeFilter !== 'All' || execFilter !== 'All';

  const selectedAutomatedCount = useMemo(() =>
    [...selected].filter(id => {
      const tc = testCases.find(t => t.id === id);
      return tc && safeParseDesc(tc.description).execution_type === 'Automated' && Boolean(tc.automation_script?.trim());
    }).length,
  [selected, testCases]);

  const SortableHeader = ({ label, sortKey, className = '' }) => {
    const isActive = sortConfig.key === sortKey;
    return (
      <th className={`px-6 py-3.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${className}`}
        onClick={() => handleSort(sortKey)}>
        <div className="flex items-center gap-1.5">
          {label}
          <span className="text-slate-400">
            {isActive
              ? (sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>)
              : <ChevronsUpDown size={14} className="opacity-50"/>}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">

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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Beaker size={24} className="text-indigo-500"/> Test Senaryoları
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Kurumsal standartlarda test yönetimi.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={fetchData}
            className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors"
            title="Yenile">
            <RefreshCw size={16}/>
          </button>
          {sortedAndFilteredData.length > 0 && (
            <button onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
              <Download size={15}/> Dışa Aktar
            </button>
          )}
          <PermissionGuard permission="test_cases.create">
            <button onClick={() => setShowAIModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white rounded-xl font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center gap-2 text-sm whitespace-nowrap">
              <Sparkles size={15}/> AI ile Üret
            </button>
          </PermissionGuard>
          <PermissionGuard permission="test_cases.create">
            <button onClick={openCreate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 flex items-center gap-2 whitespace-nowrap transition-colors text-sm">
              <Plus size={16}/> Yeni Test Ekle
            </button>
          </PermissionGuard>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle size={16} className="shrink-0"/> {error}
          <button onClick={fetchData} className="ml-auto text-rose-600 hover:underline font-medium">Tekrar Dene</button>
        </div>
      )}

      {/* Toplu İşlem Çubuğu */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-800 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">{selected.size} seçili</span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {can('automation.execute') && selectedAutomatedCount > 0 && (
              <button
                onClick={handleSendToAutomation}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 transition-colors">
                <Play size={12}/> Otomasyona Gönder ({selectedAutomatedCount})
              </button>
            )}
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
              className="text-xs font-medium bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 text-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              <option value="">Durum seç...</option>
              <option value="Taslak">Taslak</option>
              <option value="Test Edilmedi">Test Edilmedi</option>
              <option value="Başarılı">Başarılı</option>
              <option value="Başarısız">Başarısız</option>
            </select>
            <button onClick={handleBulkStatusChange} disabled={!bulkStatus || isBulkSaving}
              className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5 transition-colors">
              {isBulkSaving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>} Uygula
            </button>
            {can('test_cases.delete') && (
              <button onClick={() => setDeleteConfirm('bulk')}
                className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center gap-1.5 transition-colors">
                <Trash2 size={12}/> Sil ({selected.size})
              </button>
            )}
            <button onClick={() => setSelected(new Set())}
              className="p-1.5 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-colors">
              <X size={15}/>
            </button>
          </div>
        </div>
      )}

      {/* FİLTRELER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="xl:col-span-2 flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          <Search size={16} className="text-slate-400 shrink-0"/>
          <input type="text" placeholder="Test ara... (Türkçe destekli)" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 w-full"/>
          {searchTerm && <button onClick={() => setSearchTerm('')}><X size={13} className="text-slate-400"/></button>}
        </div>
        {[
          { icon: <Folder size={14}/>,      value: projectFilter,  onChange: setProjectFilter,  options: [['All','Tüm Projeler'], ...projects.map(p => [p.id, p.name])] },
          { icon: <Activity size={14}/>,    value: statusFilter,   onChange: setStatusFilter,   options: [['All','Tüm Durumlar'],['Taslak','Taslak'],['Başarılı','Başarılı'],['Başarısız','Başarısız'],['Test Edilmedi','Test Edilmedi']] },
          { icon: <AlertCircle size={14}/>, value: priorityFilter, onChange: setPriorityFilter, options: [['All','Tüm Öncelikler'],['Kritik','Kritik'],['Yüksek','Yüksek'],['Orta','Orta'],['Düşük','Düşük']] },
          { icon: <Cpu size={14}/>,         value: execFilter,     onChange: setExecFilter,     options: [['All','Tüm Yürütme'],['Manual','Manual'],['Automated','Automated']] }, 
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 rounded-xl">
            <span className="text-slate-400 shrink-0">{f.icon}</span>
            <select value={f.value} onChange={e => f.onChange(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full dark:text-white cursor-pointer">
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
        {hasFilter && (
          <button
            onClick={() => { setSearchTerm(''); setStatusFilter('All'); setPriorityFilter('All'); setProjectFilter('All'); setTypeFilter('All'); setExecFilter('All'); }}
            className="flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-indigo-600 font-medium border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 hover:border-indigo-300 transition-all bg-white dark:bg-slate-900">
            <X size={12}/> Temizle
          </button>
        )}
      </div>

      {/* TABLO */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 dark:border-slate-800 last:border-0">
              <Skeleton className="h-4 flex-1"/><Skeleton className="h-4 w-24"/><Skeleton className="h-6 w-16 rounded-lg"/><Skeleton className="h-6 w-20 rounded-lg"/>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase text-slate-500 font-semibold tracking-wide select-none">
                {can('test_cases.delete') && (
                  <th className="px-4 py-3.5 w-10">
                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-indigo-600 transition-colors">
                      {selected.size === currentItems.length && currentItems.length > 0
                        ? <CheckSquare size={15} className="text-indigo-500"/>
                        : <Square size={15}/>}
                    </button>
                  </th>
                )}
                <SortableHeader label="Test Senaryosu" sortKey="title"/>
                <SortableHeader label="Proje" sortKey="project_id" className="hidden md:table-cell"/>
                <th className="px-6 py-3.5 hidden lg:table-cell">Tür</th>
                <th className="px-6 py-3.5 hidden lg:table-cell">Yürütme</th>
                <SortableHeader label="Öncelik" sortKey="priority"/>
                <SortableHeader label="Durum"   sortKey="status"/>
                <th className="px-6 py-3.5 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                    <Beaker size={32} className="mx-auto mb-3 opacity-20"/>
                    <p className="text-sm font-medium">
                      {hasFilter ? 'Filtre kriterlerine uyan test senaryosu bulunamadı.' : 'Henüz test senaryosu yok.'}
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-3">
                      {hasFilter && (
                        <button
                          onClick={() => { setSearchTerm(''); setStatusFilter('All'); setPriorityFilter('All'); setProjectFilter('All'); setTypeFilter('All'); setExecFilter('All'); }}
                          className="text-sm text-slate-500 hover:underline">Filtreyi Temizle</button>
                      )}
                      {can('test_cases.create') && (
                        <button onClick={() => setShowAIModal(true)}
                          className="text-sm text-indigo-600 hover:underline flex items-center gap-1">
                          <Sparkles size={13}/> AI ile Oluştur
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : currentItems.map((tc, index) => {
                const prioConf   = getPriorityConfig(tc.priority);
                const statConf   = getStatusConfig(tc.status);
                const tcType     = getType(tc.description);
                const isSelected = selected.has(tc.id);
                const parsed     = safeParseDesc(tc.description);
                
                // 🚀 ZIRH: Eğer son 2 elemandaysak dropdown'ı YUKARI doğru (drop-up) aç ki kesilmesin.
                const isNearBottom = currentItems.length > 3 && index >= currentItems.length - 2;

                return (
                  <tr key={tc.id} onClick={() => openView(tc)}
                    className={`transition-colors group cursor-pointer ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : 'hover:bg-indigo-50/40 dark:hover:bg-indigo-500/5'}`}>
                    {can('test_cases.delete') && (
                      <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleSelect(tc.id)} className="text-slate-300 hover:text-indigo-500 transition-colors">
                          {isSelected ? <CheckSquare size={15} className="text-indigo-500"/> : <Square size={15}/>}
                        </button>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 opacity-0 group-hover:opacity-100 bg-indigo-500 transition-opacity"/>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate max-w-xs">
                            {tc.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <p className="text-xs text-slate-400 flex items-center gap-1"><Hash size={10}/>#{tc.id}</p>
                            {tc.gherkin_scenario && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-500/10 px-1.5 py-0.5 rounded-md border border-fuchsia-200 dark:border-fuchsia-800">
                                <Terminal size={9}/> BDD
                              </span>
                            )}
                            {tc.automation_script && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                                <Code2 size={9}/> AUTO
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell text-sm text-slate-500 dark:text-slate-400">{getProjectName(tc.project_id)}</td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      {tcType
                        ? <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">{tcType}</span>
                        : <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold border ${
                        parsed.execution_type === 'Automated' 
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800' 
                          : 'text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}>
                        {parsed.execution_type === 'Automated' ? <><Code2 size={12}/> Otomasyon</> : <><Square size={12}/> Manuel</>}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${prioConf.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${prioConf.dot}`}/>{tc.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${statConf.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statConf.dot}`}/>{tc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right relative" onClick={e => e.stopPropagation()}>
                      {(can('test_cases.edit') || can('test_cases.delete') || can('test_cases.create')) && (
                        <button
                          onClick={e => { e.stopPropagation(); setActiveDropdown(activeDropdown === tc.id ? null : tc.id); }}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                          <MoreVertical size={16}/>
                        </button>
                      )}
                      {activeDropdown === tc.id && (
                        <div className={`absolute right-8 ${isNearBottom ? 'bottom-8 mb-1' : 'top-10 mt-1'} w-52 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden text-left animate-in fade-in zoom-in-95 duration-150`}>
                          {can('test_cases.edit') && (
                            <button onClick={() => openEdit(tc)}
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors">
                              <Pencil size={13}/> Düzenle
                            </button>
                          )}
                          {can('test_cases.create') && (
                            <button onClick={() => handleDuplicate(tc)}
                              className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 transition-colors">
                              <Copy size={13}/> Kopyala
                            </button>
                          )}
                          {can('automation.execute') && parsed.execution_type === 'Automated' && tc.automation_script && (
                            <>
                              <div className="h-px bg-slate-100 dark:bg-slate-700"/>
                              <button
                                onClick={() => navigate(`/automation?cases=${tc.id}&project=${tc.project_id}`)}
                                className="w-full px-4 py-2.5 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 flex items-center gap-2 transition-colors">
                                <Play size={13}/> Otomasyona Gönder
                              </button>
                            </>
                          )}
                          {(can('test_cases.edit') || can('test_cases.create')) && can('test_cases.delete') && (
                            <div className="h-px bg-slate-100 dark:bg-slate-700"/>
                          )}
                          {can('test_cases.delete') && (
                            <button onClick={() => { setDeleteConfirm(tc.id); setActiveDropdown(null); }}
                              className="w-full px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2 transition-colors">
                              <Trash2 size={13}/> Sil
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {sortedAndFilteredData.length === 0
                ? 'Kayıt bulunamadı'
                : `${sortedAndFilteredData.length} kayıt · ${(currentPage-1)*itemsPerPage+1}–${Math.min(currentPage*itemsPerPage, sortedAndFilteredData.length)} arası`}
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1}
                className="p-1 disabled:opacity-30 dark:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><ChevronLeft size={18}/></button>
              <span className="text-xs font-medium dark:text-white px-1.5">{currentPage}/{totalPages || 1}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))} disabled={currentPage === totalPages || totalPages === 0}
                className="p-1 disabled:opacity-30 dark:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><ChevronRight size={18}/></button>
            </div>
          </div>
        </div>
      )}

      {showAIModal && <AIModal onClose={() => setShowAIModal(false)} onImport={handleAIImport}/>}
      {isPanelOpen && <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60]" onClick={closePanel}/>}

      {/* SIDE PANEL */}
      <div className={`fixed top-0 right-0 h-screen bg-white dark:bg-slate-900 shadow-2xl z-[70] transform transition-transform duration-300 flex flex-col
        ${panel?.mode === 'view' ? 'w-full sm:w-[720px]' : 'w-full sm:w-[660px]'}
        ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
              <Beaker size={16} className="text-indigo-500"/>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 font-medium">
                {panel?.mode === 'create' ? 'Yeni Test Senaryosu' : panel?.mode === 'edit' ? 'Düzenleniyor' : 'Test Senaryosu'}
              </p>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {panel?.mode === 'view' ? viewTC?.title : panel?.mode === 'edit' ? form.title || 'Başlıksız' : 'Yeni Senaryo'}
              </h2>
            </div>
          </div>
          <button onClick={closePanel}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
            <X size={18}/>
          </button>
        </div>

        {/* VIEW MODE */}
        {panel?.mode === 'view' && viewTC && (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
              <div className="lg:col-span-2 p-6 border-r-0 lg:border-r border-slate-100 dark:border-slate-800 overflow-y-auto space-y-6">

                {viewTC.automation_script && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Code2 size={16} className="text-emerald-500"/>
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Playwright Kodu</h3>
                      {can('automation.execute') && (
                        <button
                          onClick={() => navigate(`/automation?cases=${viewTC.id}&project=${viewTC.project_id}`)}
                          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors">
                          <Play size={11}/> Çalıştır
                        </button>
                      )}
                    </div>
                    <CodeBlock code={viewTC.automation_script} language="python"/>
                  </div>
                )}

                {viewTC.gherkin_scenario && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Terminal size={16} className="text-fuchsia-500"/>
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">BDD Senaryosu</h3>
                    </div>
                    <CodeBlock code={viewTC.gherkin_scenario} language="gherkin"/>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-5">
                    <PlayCircle size={17} className="text-indigo-500"/>
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Test Adımları</h3>
                    <span className="ml-auto text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-md">{viewTC.steps?.length || 0} adım</span>
                  </div>
                  {viewTC.steps?.length > 0
                    ? <div className="space-y-4">{viewTC.steps.map((step, i) => <StepCard key={step.id || i} step={step} index={i}/>)}</div>
                    : <div className="text-center py-12 text-slate-400"><PlayCircle size={32} className="mx-auto mb-3 opacity-20"/><p className="text-sm">Adım girilmemiş.</p></div>}
                </div>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800/30 space-y-1 overflow-y-auto">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Detaylar</p>
                <MetaRow icon={<Hash size={12}/>} label="ID">
                  <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">#{viewTC.id}</span>
                </MetaRow>
                <MetaRow icon={<Folder size={12}/>} label="Proje">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{getProjectName(viewTC.project_id)}</span>
                </MetaRow>
                <MetaRow icon={<Activity size={12}/>} label="Durum">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${getStatusConfig(viewTC.status).cls}`}>{viewTC.status}</span>
                </MetaRow>
                <MetaRow icon={<AlertCircle size={12}/>} label="Öncelik">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border ${getPriorityConfig(viewTC.priority).cls}`}>{viewTC.priority}</span>
                </MetaRow>
                <MetaRow icon={<FileText size={12}/>} label="Tür">
                  <span className="text-xs text-slate-600 dark:text-slate-300">{viewTC.type || 'Functional'}</span>
                </MetaRow>
                <MetaRow icon={<Cpu size={12}/>} label="Yürütme">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${viewTC.execution_type === 'Automated' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {viewTC.execution_type || 'Manual'}
                  </span>
                </MetaRow>
                {viewTC.gherkin_scenario && (
                  <MetaRow icon={<Terminal size={12}/>} label="BDD">
                    <span className="text-xs font-bold text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-500/10 px-2 py-0.5 rounded-md">Evet</span>
                  </MetaRow>
                )}
                {viewTC.automation_script && (
                  <MetaRow icon={<Code2 size={12}/>} label="Script">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md">Evet</span>
                  </MetaRow>
                )}
                {viewTC.created_at && (
                  <MetaRow icon={<Clock size={12}/>} label="Oluşturulma">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(viewTC.created_at)}</span>
                  </MetaRow>
                )}
                {viewTC.updated_at && (
                  <MetaRow icon={<Clock size={12}/>} label="Güncelleme">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{formatDate(viewTC.updated_at)}</span>
                  </MetaRow>
                )}
                
                <div className="pt-5 space-y-2">
                  {can('test_cases.edit') && (
                    <button onClick={switchToEdit}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-indigo-600/20">
                      <Pencil size={14}/> Düzenle
                    </button>
                  )}
                  {can('automation.execute') && viewTC.execution_type === 'Automated' && viewTC.automation_script && (
                    <button
                      onClick={() => navigate(`/automation?cases=${viewTC.id}&project=${viewTC.project_id}`)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                      <Play size={14}/> Otomasyona Gönder
                    </button>
                  )}
                  {can('test_cases.create') && (
                    <button onClick={() => { handleDuplicate(panel.tc); setPanel(null); }}
                      className="w-full py-2.5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                      <Copy size={14}/> Kopyala
                    </button>
                  )}
                  {can('test_cases.delete') && (
                    <button onClick={() => { setDeleteConfirm(viewTC.id); setPanel(null); }}
                      className="w-full py-2.5 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                      <Trash2 size={14}/> Sil
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CREATE / EDIT MODE */}
        {(panel?.mode === 'create' || panel?.mode === 'edit') && (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {formError && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm">
                  <AlertCircle size={15} className="shrink-0"/> {formError}
                </div>
              )}

              {/* Temel Bilgiler */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Temel Bilgiler</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Test Başlığı</label>
                  <input type="text" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))}
                    placeholder="Örn: Kullanıcı Giriş Senaryosu"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Bağlı Proje</label>
                  <select value={form.project_id} onChange={e => setForm(p => ({...p, project_id: e.target.value}))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="" disabled>Proje Seçiniz</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Sınıflandırma */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 space-y-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sınıflandırma</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Test Türü</label>
                    <select value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                      {GLOBAL_TEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Yürütme</label>
                    <select value={form.execution_type}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(p => ({...p, execution_type: val}));
                        if (val === 'Automated') setActiveTab('automated');
                        else if (activeTab === 'automated') setActiveTab('manual');
                      }}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="Manual">Manual</option>
                      <option value="Automated">Automated</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Öncelik</label>
                    <select value={form.priority} onChange={e => setForm(p => ({...p, priority: e.target.value}))}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                      <option>Düşük</option><option>Orta</option><option>Yüksek</option><option>Kritik</option>
                    </select>
                  </div>
                  {panel?.mode === 'edit' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Durum</label>
                      <select value={form.status} onChange={e => setForm(p => ({...p, status: e.target.value}))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                        <option>Taslak</option><option>Test Edilmedi</option><option>Başarılı</option><option>Başarısız</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Sekmeler */}
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
                <button onClick={() => setActiveTab('manual')}
                  className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'manual' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  <PlayCircle size={14}/> Adımlar
                </button>
                <button onClick={() => setActiveTab('bdd')}
                  className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'bdd' ? 'bg-white dark:bg-slate-700 text-fuchsia-600 dark:text-fuchsia-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                  <Terminal size={14}/> BDD Stüdyo
                </button>
                {form.execution_type === 'Automated' && (
                  <button onClick={() => setActiveTab('automated')}
                    className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'automated' ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                    <Code2 size={14}/> Playwright Kodu
                  </button>
                )}
              </div>

              {/* Adımlar */}
              {activeTab === 'manual' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-left-2 duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Test Adımları</p>
                    <span className="text-xs text-slate-400">{form.steps.length} adım</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pl-7">
                    <p className="text-xs text-slate-400 font-medium">Aksiyon</p>
                    <p className="text-xs text-slate-400 font-medium">Beklenen Sonuç</p>
                  </div>
                  {form.steps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-2">
                      <span className="mt-2.5 text-xs font-bold text-slate-300 dark:text-slate-600 w-5 shrink-0 text-right">{index + 1}</span>
                      <div className="flex-1 grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Adımı girin..." value={step.action}
                          onChange={e => updateStep(step.id, 'action', e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"/>
                        <input type="text" placeholder="Beklenen sonuç..." value={step.expectedResult}
                          onChange={e => updateStep(step.id, 'expectedResult', e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"/>
                      </div>
                      {form.steps.length > 1 && (
                        <button onClick={() => removeStep(step.id)}
                          className="mt-2.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors p-0.5 shrink-0">
                          <X size={15}/>
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addStep}
                    className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-400 flex items-center justify-center gap-2 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                    <Plus size={14}/> Adım Ekle
                  </button>
                </div>
              )}

              {/* BDD */}
              {activeTab === 'bdd' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
                  <div className="bg-fuchsia-50 dark:bg-fuchsia-500/5 border border-fuchsia-100 dark:border-fuchsia-500/20 rounded-2xl p-5">
                    <label className="text-xs font-bold text-fuchsia-600 dark:text-fuchsia-400 uppercase tracking-widest flex items-center gap-2 mb-2">
                      <Terminal size={13}/> Gherkin Senaryosu
                    </label>
                    <p className="text-xs text-slate-400 mb-3">Given/When/Then formatında BDD senaryonuzu yazın.</p>
                    <textarea rows={7} value={form.gherkin_scenario}
                      onChange={e => setForm(p => ({...p, gherkin_scenario: e.target.value}))}
                      placeholder={`Feature: Kullanıcı Girişi\n\nScenario: Başarılı giriş\n  Given Kullanıcı login sayfasındadır\n  When Geçerli e-posta ve şifre girer\n  Then Dashboard'a yönlendirilir`}
                      className="w-full bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-900/40 rounded-xl p-4 text-sm font-mono text-slate-800 dark:text-fuchsia-100 outline-none focus:ring-2 focus:ring-fuchsia-500/40 resize-none leading-relaxed"/>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {GHERKIN_SUGGESTIONS.map(s => (
                        <button key={s.label} onClick={() => setForm(p => ({...p, gherkin_scenario: s.text}))}
                          className="px-2.5 py-1 text-xs font-medium text-fuchsia-600 dark:text-fuchsia-400 bg-white dark:bg-slate-900 border border-fuchsia-200 dark:border-fuchsia-800 rounded-lg hover:bg-fuchsia-50 transition-colors">
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleGenerateBDDCode} disabled={isGeneratingBDD || !form.gherkin_scenario.trim()}
                      className="w-full mt-4 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md shadow-fuchsia-600/20">
                      {isGeneratingBDD ? <><Loader2 size={14} className="animate-spin"/> Üretiliyor...</> : <><Terminal size={14}/> Pytest-BDD Kodu Üret</>}
                    </button>
                  </div>
                  {generatedCode && (
                    <div className="animate-in zoom-in-95 duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Üretilen Pytest-BDD Kodu</p>
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Hazır</span>
                      </div>
                      <CodeBlock code={generatedCode} language="pytest-bdd"/>
                      <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                        <AlertCircle size={11}/> Kaydet butonuna basarak Gherkin senaryosunu test case ile birlikte saklayın.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Playwright Kod Editörü */}
              {activeTab === 'automated' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
                  <div className="bg-[#0d1117] rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
                    <div className="bg-[#161b22] px-4 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <div className="w-3 h-3 rounded-full bg-rose-500/70"/>
                          <div className="w-3 h-3 rounded-full bg-amber-500/70"/>
                          <div className="w-3 h-3 rounded-full bg-emerald-500/70"/>
                        </div>
                        <Code2 size={14} className="text-emerald-500"/>
                        <span className="text-xs font-mono text-slate-400">test_script.py</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {form.automation_script && (
                          <button onClick={() => setForm(p => ({...p, automation_script: ''}))}
                            className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors">
                            Temizle
                          </button>
                        )}
                        <button onClick={() => setForm(p => ({...p, automation_script: PLAYWRIGHT_TEMPLATE}))}
                          className="text-xs text-emerald-500 hover:text-emerald-400 font-medium transition-colors">
                          Şablon Yükle
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={form.automation_script}
                      onChange={e => setForm(p => ({...p, automation_script: e.target.value}))}
                      placeholder="# Python/Playwright test kodunuzu buraya yazın..."
                      className="w-full h-80 bg-transparent text-emerald-400 font-mono text-[13px] leading-relaxed p-4 outline-none resize-y placeholder:text-slate-600"
                      spellCheck="false"
                    />
                  </div>
                  <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800/50 p-3 rounded-xl">
                    <AlertCircle size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"/>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                      Buraya yazacağınız kodlar, <strong>Otomasyon Komuta Merkezi'nden</strong> doğrudan sunucunuzda çalıştırılacaktır. Sadece geçerli Python (Pytest/Playwright) kodları giriniz.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Panel Footer */}
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-400">
                {activeTab === 'automated' && form.automation_script
                  ? <span className="text-emerald-500 font-medium flex items-center gap-1"><Code2 size={11}/> Script Hazır</span>
                  : activeTab === 'bdd' && form.gherkin_scenario
                  ? <span className="text-fuchsia-500 font-medium flex items-center gap-1"><Terminal size={11}/> BDD senaryosu mevcut</span>
                  : <span>{form.steps.length} adım · {form.type}</span>}
              </p>
              <div className="flex gap-2">
                <button onClick={closePanel}
                  className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium">
                  İptal
                </button>
                <button onClick={handleSubmit} disabled={isSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2 transition-colors shadow-md shadow-indigo-600/20">
                  {isSubmitting ? <><Loader2 size={14} className="animate-spin"/> Kaydediliyor...</> : <><Zap size={14}/> Kaydet</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* SİLME ONAY */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={20} className="text-rose-500"/>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white text-center mb-2">
              {deleteConfirm === 'bulk' ? `${selected.size} Senaryoyu Sil` : 'Test Senaryosunu Sil'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-5">Bu işlem geri alınamaz.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-medium transition-colors text-sm">
                İptal
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {isDeleting ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestCases;