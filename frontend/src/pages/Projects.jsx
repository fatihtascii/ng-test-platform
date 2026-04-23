import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import PermissionGuard from '../components/PermissionGuard';
import {
  Plus, Search, Folder, MoreVertical, X,
  Pencil, Trash2, Filter, AlertCircle, CheckCircle2,
  Loader2, ArrowUpDown, LayoutGrid, List, ChevronRight
} from 'lucide-react'; // ✅ KULLANILMAYAN İKONLAR (Activity, Beaker) TEMİZLENDİ

// ── Yardımcı Stiller ──────────────────────────────────────────
const getStatusStyle = (status) => {
  switch (status) {
    case 'Tamamlandı': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30';
    case 'Beklemede':  return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/30';
    default:           return 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/30';
  }
};

const Skeleton = ({ className }) => (
  <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 ${className}`} />
);

// ── Ana Bileşen ────────────────────────────────────────────────
const Projects = () => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const [projects, setProjects]     = useState([]);
  const [testCases, setTestCases]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Filtre, Arama, Sıralama ve Görünüm
  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortBy, setSortBy]             = useState('newest'); // newest, name_asc, name_desc
  const [viewMode, setViewMode]         = useState('list');   // list, grid

  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isModalOpen, setIsModalOpen]       = useState(false);
  const [modalMode, setModalMode]           = useState('create');
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [formError, setFormError]           = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isDeleting, setIsDeleting]       = useState(false);

  const [toast, setToast] = useState(null);
  
  // ✅ Dinamik API Base URL
  const API_BASE = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000';

  const showToast = useCallback((type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const [currentProject, setCurrentProject] = useState({ name: '', description: '', status: 'Aktif' });

  // ── Veri Çekme ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [projRes, tcRes] = await Promise.all([
        fetch(`${API_BASE}/projects`).catch(() => ({ ok: false })),
        fetch(`${API_BASE}/test-cases`).catch(() => ({ ok: false })),
      ]);

      if (projRes.ok) setProjects(await projRes.json());
      else setError('Projeler yüklenemedi. Bağlantınızı kontrol edin.');

      if (tcRes.ok) setTestCases(await tcRes.json());
    } catch {
      setError('Backend servisine ulaşılamıyor.');
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchAll();
    const close = () => setActiveDropdown(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [fetchAll]);

  // ── Hesaplamalar & Veri İşleme ──────────────────────────────
  const projectStats = useMemo(() => {
    const statsMap = {};
    projects.forEach(p => {
      const tcs = testCases.filter(tc => tc.project_id === p.id);
      const passed = tcs.filter(tc => tc.status === 'Başarılı' || tc.status === 'Passed').length;
      statsMap[p.id] = {
        total: tcs.length,
        passed,
        rate: tcs.length > 0 ? Math.round((passed / tcs.length) * 100) : null
      };
    });
    return statsMap;
  }, [projects, testCases]);

  const processedProjects = useMemo(() => {
    // 1. Filtreleme
    let result = projects.filter(p => {
      const q = searchTerm.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(q) || 
                          (p.description?.toLowerCase().includes(q)) ||
                          String(p.id).includes(q);
      const matchStatus = statusFilter === 'All' || p.status === statusFilter;
      return matchSearch && matchStatus;
    });

    // 2. Sıralama
    if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name_desc') {
      result.sort((a, b) => b.name.localeCompare(a.name));
    } else {
      // Varsayılan: Yeniden Eskiye
      result.sort((a, b) => b.id - a.id);
    }

    return result;
  }, [projects, searchTerm, statusFilter, sortBy]);

  // ── İşlemler ────────────────────────────────────────────────
  const handleProjectSubmit = async (e) => {
    e.preventDefault();
    if (!currentProject.name.trim()) return setFormError('Proje adı gereklidir.');
    
    setIsSubmitting(true);
    setFormError('');
    
    try {
      const isCreate = modalMode === 'create';
      const url = isCreate ? `${API_BASE}/projects` : `${API_BASE}/projects/${currentProject.id}`;
      const method = isCreate ? 'POST' : 'PUT';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentProject.name.trim(),
          description: currentProject.description,
          status: currentProject.status
        }),
      });

      if (res.ok) {
        const savedProject = await res.json();
        if (isCreate) setProjects(prev => [savedProject, ...prev]);
        else setProjects(prev => prev.map(p => p.id === savedProject.id ? savedProject : p));
        
        setIsModalOpen(false);
        showToast('success', isCreate ? 'Proje başarıyla oluşturuldu.' : 'Proje güncellendi.');
      } else {
        const errData = await res.json().catch(() => ({ detail: 'İşlem başarısız oldu.' }));
        setFormError(errData.detail);
      }
    } catch {
      setFormError('Sunucu hatası oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        showToast('success', 'Proje sistemden kalıcı olarak silindi.');
      } else {
        showToast('error', 'Proje silinemedi.');
      }
    } catch {
      showToast('error', 'Sunucuya bağlanılamadı.');
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative pb-10">
      
      {/* Toast Bildirimi */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border animate-in slide-in-from-bottom-5 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-800 dark:text-emerald-300' 
                                   : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/40 dark:border-rose-800 dark:text-rose-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* HEADER & TOOLBAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Folder size={20} className="text-slate-400" />
              Proje Yönetimi
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Sistemdeki tüm projeleri ve genel test durumlarını görüntüleyin.</p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Görünüm Değiştirici */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} title="Liste Görünümü">
                <List size={16} />
              </button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`} title="Grid Görünümü">
                <LayoutGrid size={16} />
              </button>
            </div>

            {can('projects.create') && (
              <button 
                onClick={() => { setModalMode('create'); setFormError(''); setCurrentProject({ name: '', description: '', status: 'Aktif' }); setIsModalOpen(true); }}
                className="px-4 py-2 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
              >
                <Plus size={16} /> Yeni Proje
              </button>
            )}
          </div>
        </div>

        {/* Filtre ve Arama Çubuğu */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="relative w-full sm:flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Proje ara (İsim veya ID)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors dark:text-white"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-40">
              <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:border-indigo-500 appearance-none">
                <option value="All">Tüm Durumlar</option>
                <option value="Aktif">Aktif</option>
                <option value="Beklemede">Beklemede</option>
                <option value="Tamamlandı">Tamamlandı</option>
              </select>
            </div>

            <div className="relative w-full sm:w-44">
              <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:border-indigo-500 appearance-none">
                <option value="newest">Yeniden Eskiye</option>
                <option value="name_asc">İsim (A-Z)</option>
                <option value="name_desc">İsim (Z-A)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm font-medium">
          <AlertCircle size={16} /> {error}
          <button onClick={fetchAll} className="ml-auto underline underline-offset-2">Tekrar Dene</button>
        </div>
      )}

      {/* İÇERİK ALANI */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48 rounded" /><Skeleton className="h-3 w-32 rounded" /></div>
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          ))}
        </div>
      ) : processedProjects.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl border-dashed">
          <Folder size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Gösterilecek Proje Yok</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {searchTerm || statusFilter !== 'All' ? 'Filtrelerinize uygun bir sonuç bulunamadı.' : 'Sistemde henüz kayıtlı bir proje yok.'}
          </p>
          {(searchTerm || statusFilter !== 'All') && (
            <button onClick={() => { setSearchTerm(''); setStatusFilter('All'); }} className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline">
              Filtreleri Temizle
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        // LİSTE GÖRÜNÜMÜ
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-medium">
                  <th className="px-5 py-3.5 font-medium">Proje Adı</th>
                  <th className="px-5 py-3.5 font-medium">Durum</th>
                  <th className="px-5 py-3.5 font-medium w-1/3">Test Kapsamı</th>
                  <th className="px-5 py-3.5 text-right font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {processedProjects.map((project) => {
                  const stats = projectStats[project.id] || { total: 0, passed: 0, rate: null };
                  return (
                    <tr 
                      key={project.id} 
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 border border-slate-200 dark:border-slate-700">
                            <Folder size={16} />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              {project.name}
                            </h3>
                            <p className="text-xs text-slate-500 truncate max-w-[250px] mt-0.5">
                              {project.description || 'Açıklama yok'}
                            </p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getStatusStyle(project.status)}`}>
                          {project.status || 'Aktif'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {stats.total === 0 ? (
                          <span className="text-xs text-slate-400 font-medium">Test yok</span>
                        ) : (
                          <div className="flex items-center gap-3 max-w-[200px]">
                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  stats.rate >= 80 ? 'bg-emerald-500' : stats.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${stats.rate ?? 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums w-12 text-right">
                              %{stats.rate}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === project.id ? null : project.id); }}
                          className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <MoreVertical size={16} />
                        </button>
                        
                        {activeDropdown === project.id && (
                          <div className="absolute right-8 top-10 w-40 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50 py-1 animate-in fade-in zoom-in-95 text-left">
                            <button onClick={() => navigate(`/projects/${project.id}`)} className="w-full px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                              <ChevronRight size={14} /> Detaylara Git
                            </button>
                            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                            {can('projects.edit') && (
                              <button onClick={() => { setModalMode('edit'); setFormError(''); setCurrentProject(project); setIsModalOpen(true); setActiveDropdown(null); }} className="w-full px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2">
                                <Pencil size={14} /> Düzenle
                              </button>
                            )}
                            {can('projects.delete') && (
                              <button onClick={() => { setDeleteConfirm(project.id); setActiveDropdown(null); }} className="w-full px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2">
                                <Trash2 size={14} /> Sil
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
          </div>
        </div>
      ) : (
        // GRİD GÖRÜNÜMÜ
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {processedProjects.map((project) => {
            const stats = projectStats[project.id] || { total: 0, passed: 0, rate: null };
            return (
              <div 
                key={project.id}
                onClick={() => navigate(`/projects/${project.id}`)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md transition-all cursor-pointer flex flex-col h-full group"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 border border-slate-200 dark:border-slate-700">
                    <Folder size={18} />
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${getStatusStyle(project.status)}`}>
                    {project.status || 'Aktif'}
                  </span>
                </div>
                
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-1 truncate">
                  {project.name}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-4 flex-1">
                  {project.description || 'Proje açıklaması belirtilmemiş.'}
                </p>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-500 font-medium">{stats.total} Senaryo</span>
                    {stats.total > 0 && (
                      <span className={`font-semibold ${stats.rate >= 80 ? 'text-emerald-600' : stats.rate >= 50 ? 'text-amber-500' : 'text-rose-600'}`}>
                        %{stats.rate}
                      </span>
                    )}
                  </div>
                  {stats.total > 0 ? (
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${stats.rate >= 80 ? 'bg-emerald-500' : stats.rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${stats.rate ?? 0}%` }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: PROJE FORMU */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {modalMode === 'create' ? 'Yeni Proje Oluştur' : 'Proje Detaylarını Düzenle'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {formError && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2.5 rounded-lg text-sm mb-4">
                  <AlertCircle size={16} /> {formError}
                </div>
              )}

              <form id="project-form" onSubmit={handleProjectSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Proje Adı</label>
                  <input 
                    type="text" 
                    required 
                    autoFocus
                    value={currentProject.name}
                    onChange={(e) => setCurrentProject({ ...currentProject, name: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    placeholder="Örn: Müşteri Portalı API"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Açıklama</label>
                  <textarea 
                    rows="3" 
                    value={currentProject.description}
                    onChange={(e) => setCurrentProject({ ...currentProject, description: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-colors"
                    placeholder="Proje kapsamı veya hedefleri..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Durum</label>
                  <select
                    value={currentProject.status || 'Aktif'}
                    onChange={(e) => setCurrentProject({ ...currentProject, status: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Beklemede">Beklemede</option>
                    <option value="Tamamlandı">Tamamlandı</option>
                  </select>
                </div>
              </form>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl flex justify-end gap-2 shrink-0">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                İptal
              </button>
              <button 
                type="submit" 
                form="project-form"
                disabled={isSubmitting} 
                className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium text-sm rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 flex items-center justify-center min-w-[100px] transition-colors"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SİLME ONAY MODALI */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-xl shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="p-5">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center shrink-0">
                  <Trash2 size={20} className="text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Projeyi Sil</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Bu projeyi silmek üzeresiniz. İşlem geri alınamaz ve projeye bağlı tüm test kayıtları silinir. Devam etmek istiyor musunuz?
                  </p>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors">Vazgeç</button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={isDeleting} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center min-w-[80px]">
                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;