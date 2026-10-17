import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePermission, clearPermissionCache } from '../hooks/usePermission';
import Logo from '../assets/logo.svg';
import {
  LayoutDashboard, FolderKanban, Beaker, LogOut,
  Users, ClipboardList, PlayCircle, TrendingUp,
  Bug, Cpu, Globe, Blocks, Shield, ChevronDown
} from 'lucide-react';
import { clearSession, USER_UPDATED_EVENT } from '../auth';

// ── Menü Grupları ─────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} />, requiredPerm: null, color: 'text-blue-500 dark:text-blue-400' },
    ],
  },
  {
    label: 'Test Yönetimi',
    items: [
      { name: 'Projeler',       path: '/projects',    icon: <FolderKanban size={18} />, requiredPerm: 'projects.view', color: 'text-amber-500 dark:text-amber-400' },
      { name: 'Test Case',      path: '/test-cases',  icon: <Beaker size={18} />,       requiredPerm: 'test_cases.view', color: 'text-emerald-500 dark:text-emerald-400' },
      { name: 'Test Planları',  path: '/test-plans',  icon: <ClipboardList size={18} />,requiredPerm: 'test_plans.view', color: 'text-violet-500 dark:text-violet-400' },
      { name: 'Test Koşumları', path: '/test-runs',   icon: <PlayCircle size={18} />,   requiredPerm: 'test_runs.view',  color: 'text-rose-500 dark:text-rose-400' },
      { name: 'Hatalar',        path: '/defects',     icon: <Bug size={18} />,          requiredPerm: 'defects.view',    color: 'text-red-500 dark:text-red-400' },
    ],
  },
  {
    label: 'Araçlar',
    items: [
      { name: 'Otomasyon',      path: '/automation',   icon: <Cpu size={18} />,        requiredPerm: 'automation.view',   color: 'text-cyan-500 dark:text-cyan-400' },
      { name: 'Raporlar',       path: '/reports',      icon: <TrendingUp size={18} />, requiredPerm: 'reports.view',      color: 'text-fuchsia-500 dark:text-fuchsia-400' },
      { name: 'Ortamlar & Veri',path: '/environments', icon: <Globe size={18} />,      requiredPerm: 'environments.view', color: 'text-teal-500 dark:text-teal-400' },
      { name: 'Entegrasyonlar', path: '/integrations', icon: <Blocks size={18} />,     requiredPerm: 'integrations.view', color: 'text-pink-500 dark:text-pink-400' },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { name: 'Kullanıcılar',  path: '/users', icon: <Users size={18} />,  requiredPerm: 'users.view', color: 'text-sky-500 dark:text-sky-400' },
      { name: 'Rol Yönetimi',  path: '/roles', icon: <Shield size={18} />, requiredPerm: 'roles.view', color: 'text-orange-500 dark:text-orange-400' },
    ],
  },
];

// ── Rol Renk Haritası ─────────────────────────────────────────
const ROLE_STYLES = {
  admin:   'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50',
  manager: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
  tester:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
  viewer:  'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const ROLE_LABELS = {
  admin:   'Admin',
  manager: 'Yönetici',
  tester:  'Test Uzmanı',
  viewer:  'İzleyici',
};

const AVATAR_COLORS = [
  'bg-indigo-500','bg-violet-500','bg-blue-500',
  'bg-emerald-500','bg-rose-500','bg-amber-500','bg-pink-500','bg-teal-500',
];

const getAvatarColor = (str = '') => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getInitials = (name = '', username = '') => {
  if (name?.trim()) {
    const parts = name.trim().split(' ');
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : parts[0][0].toUpperCase();
  }
  return username?.[0]?.toUpperCase() || '?';
};

// ── Ana Bileşen ───────────────────────────────────────────────
const Sidebar = () => {
  const location = useLocation();
  const { can }  = usePermission();

  // ✅ Performans Sızıntısı Kapatıldı: Sadece ilk render'da çalışır
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  // Profil sayfasında ad/e-posta değişince anında yansıt
  useEffect(() => {
    const onUpdate = (e) => setUser(e.detail);
    window.addEventListener(USER_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(USER_UPDATED_EVENT, onUpdate);
  }, []);

  const [logoError, setLogoError] = useState(false);

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleLogout = () => {
    clearSession();
    try { clearPermissionCache(); } catch {}
    // ✅ Sayfayı tamamen yenileyerek SPA state kalıntılarını temizler (Güvenli Çıkış)
    window.location.replace('/login'); 
  };

  const roleCls   = ROLE_STYLES[user?.role] || ROLE_STYLES.viewer;
  const roleLabel = ROLE_LABELS[user?.role] || (user?.role || 'İzleyici');
  const avatarBg  = getAvatarColor(user?.username || '');

  return (
    <aside className="w-64 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 fixed left-0 top-0 z-50 flex flex-col transition-colors duration-300">
      
      {/* Logo Alanı */}
      <div className="py-5 px-4 flex items-center justify-center border-b border-slate-100 dark:border-slate-800/60 shrink-0">
        <Link to="/" className="w-full outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg transition-transform hover:scale-[1.02]">
          {!logoError ? (
            <img
              src={Logo}
              alt="New Generation Test Ana Sayfa"
              className="w-full max-h-24 object-contain mx-auto"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex items-center justify-center gap-2.5 py-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-md shrink-0">
                <Beaker size={16} className="text-white" />
              </div>
              <span className="text-xl font-black tracking-tight text-slate-900 dark:text-white truncate">
                NG <span className="text-indigo-600 dark:text-indigo-400">Test</span>
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Kullanıcı Kartı */}
      <div className="px-4 py-4 shrink-0">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 group">
          <div className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-inner`}>
            {getInitials(user?.full_name, user?.username)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {user?.full_name || user?.username || 'Kullanıcı'}
            </p>
            <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wide ${roleCls}`}>
              {roleLabel}
            </span>
          </div>
          <ChevronDown size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      </div>

      {/* Navigasyon */}
      <nav aria-label="Ana Menü" className="flex-1 overflow-y-auto px-4 py-2 space-y-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = group.items.filter(item => !item.requiredPerm || can(item.requiredPerm));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gi}>
              {group.label && (
                <h3 className="px-3 mb-2 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {group.label}
                </h3>
              )}
              <ul className="space-y-1">
                {visibleItems.map(item => {
                  const active = isActive(item.path);
                  return (
                    <li key={item.path}>
                      <Link 
                        to={item.path}
                        aria-current={active ? "page" : undefined}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 relative overflow-hidden ${
                          active
                            ? 'bg-indigo-50 dark:bg-indigo-500/10 text-slate-900 dark:text-white font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium'
                        }`}
                      >
                        {/* Aktif durum sol çizgi efekti */}
                        {active && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600 dark:bg-indigo-500 rounded-r-md" />
                        )}
                        <span className={`shrink-0 transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Çıkış */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 rounded-xl transition-all font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-rose-500 group">
          <LogOut size={18} className="shrink-0 transition-transform duration-300 group-hover:-translate-x-1" /> 
          <span>Çıkış Yap</span>
        </button>
      </div>
      
    </aside>
  );
};

export default Sidebar;