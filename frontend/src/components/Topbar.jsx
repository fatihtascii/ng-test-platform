import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearPermissionCache } from '../hooks/usePermission';
import {
  Sun, Moon, Shield, ChevronRight,
  User, LogOut, Settings, ChevronDown
} from 'lucide-react';

// ── Breadcrumb Haritası ───────────────────────────────────────
const PATH_MAP = {
  '/':             ['Dashboard'],
  '/projects':     ['Projeler'],
  '/test-cases':   ['Test Senaryoları'],
  '/test-runs':    ['Test Koşumları'],
  '/test-plans':   ['Test Planları'],
  '/users':        ['Kullanıcılar'],
  '/roles':        ['Rol Yönetimi'],
  '/reports':      ['Raporlar'],
  '/defects':      ['Hatalar'],
  '/automation':   ['Otomasyon'],
  '/environments': ['Ortamlar & Veri'],
  '/integrations': ['Entegrasyonlar'],
};

// /test-runs/42 → ['Test Koşumları', '#42']
const getBreadcrumb = (pathname) => {
  for (const [base, crumbs] of Object.entries(PATH_MAP)) {
    if (base === '/') continue;
    if (pathname === base) return crumbs;
    if (pathname.startsWith(base + '/')) {
      const id = pathname.replace(base + '/', '').split('/')[0];
      return [...crumbs, `#${id}`];
    }
  }
  if (pathname === '/') return ['Dashboard'];
  return ['Sayfa'];
};

// ── Rol Renkleri ──────────────────────────────────────────────
const ROLE_STYLES = {
  admin:   'bg-rose-50  dark:bg-rose-500/10  text-rose-600  dark:text-rose-400',
  manager: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
  tester:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  viewer:  'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
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
const Topbar = () => {
  const location = useLocation();
  const navigate  = useNavigate();

  // ✅ Düzeltildi: user state'e alındı, her render'da parse yok
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  // ✅ Düzeltildi: Sayfa ilk yüklendiğinde dark class var mı kontrol ediliyor
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    // Sistem tercihine bak
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // ✅ Sayfa yüklendiğinde anında dark class uygula (flash önleme)
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Dışarı tıklanınca dropdown kapat
  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('user');
    try { clearPermissionCache(); } catch {}
    window.location.href = '/login';
  }, []);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const breadcrumb = getBreadcrumb(location.pathname);
  const roleCls    = ROLE_STYLES[user?.role]  || ROLE_STYLES.viewer;
  const roleLabel  = ROLE_LABELS[user?.role]  || (user?.role || 'İzleyici');
  const avatarBg   = getAvatarColor(user?.username || '');
  const initials   = getInitials(user?.full_name, user?.username);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors duration-300 flex items-center justify-between px-6 sticky top-0 z-40">

      {/* ✅ Geliştirilmiş Breadcrumb — çok seviyeli */}
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-400 dark:text-slate-500 font-medium">Platform</span>
        {breadcrumb.map((crumb, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 shrink-0"/>
            <span className={
              i === breadcrumb.length - 1
                ? 'font-bold text-slate-900 dark:text-white'
                : 'text-slate-400 dark:text-slate-500 font-medium'
            }>
              {crumb}
            </span>
          </React.Fragment>
        ))}
      </nav>

      <div className="flex items-center gap-2">

        {/* Tema Değiştirici */}
        <button onClick={toggleTheme} title={theme === 'light' ? 'Karanlık Mod' : 'Aydınlık Mod'}
          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
          {theme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}
        </button>

        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800"/>

        {/* ✅ Yeni: Profil Dropdown */}
        <div ref={profileRef} className="relative">
          <button onClick={() => setProfileOpen(p => !p)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all group">

            {/* Kullanıcı bilgisi — md ve üstü */}
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {user?.full_name || user?.username || 'Kullanıcı'}
              </p>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${roleCls}`}>
                <Shield size={9}/>
                {roleLabel}
              </span>
            </div>

            {/* Avatar */}
            <div className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-bold shadow-md shrink-0 ring-2 ring-transparent group-hover:ring-indigo-500/30 transition-all`}>
              {initials}
            </div>

            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}/>
          </button>

          {/* Dropdown Menü */}
          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">

              {/* Kullanıcı özeti */}
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {user?.full_name || user?.username}
                    </p>
                    <p className="text-xs text-slate-400 truncate">@{user?.username}</p>
                  </div>
                </div>
                <span className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${roleCls}`}>
                  <Shield size={10}/> {roleLabel}
                </span>
              </div>

              {/* Aksiyonlar */}
              <div className="p-1.5">
                <button onClick={() => { navigate('/users'); setProfileOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium">
                  <User size={15} className="text-slate-400"/> Profil & Kullanıcılar
                </button>
                <button onClick={() => { navigate('/roles'); setProfileOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium">
                  <Shield size={15} className="text-slate-400"/> Rol Yönetimi
                </button>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-800 mx-3"/>

              <div className="p-1.5">
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors font-semibold">
                  <LogOut size={15}/> Çıkış Yap
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;