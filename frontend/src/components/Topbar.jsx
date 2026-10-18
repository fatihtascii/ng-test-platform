import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearPermissionCache, usePermission } from '../hooks/usePermission';
import { Sun, Moon, ChevronRight, User, Users, Shield, LogOut, Menu, ChevronDown } from 'lucide-react';
import { clearSession, USER_UPDATED_EVENT } from '../auth';
import { Avatar } from './ui';
import { ROLE_LABELS } from './ui/tokens';

// ── Konum başlıkları ──────────────────────────────────────────
const PATH_MAP = {
  '/projects':     'Projeler',
  '/test-cases':   'Test case\'ler',
  '/test-plans':   'Test planları',
  '/test-runs':    'Koşumlar',
  '/defects':      'Hatalar',
  '/automation':   'Otomasyon',
  '/reports':      'Raporlar',
  '/environments': 'Ortamlar',
  '/integrations': 'Entegrasyonlar',
  '/users':        'Kullanıcılar',
  '/roles':        'Roller',
  '/profile':      'Profilim',
};

// "/test-runs/42" → [{ label: 'Koşumlar', to: '/test-runs' }, { label: '#42' }]
const getCrumbs = (pathname) => {
  if (pathname === '/') return [{ label: 'Genel durum' }];
  for (const [base, label] of Object.entries(PATH_MAP)) {
    if (pathname === base) return [{ label }];
    if (pathname.startsWith(base + '/')) {
      const id = decodeURIComponent(pathname.slice(base.length + 1).split('/')[0]);
      const prefix = { '/test-runs': 'KS-', '/test-plans': 'TP-', '/defects': 'BUG-' }[base];
      return [{ label, to: base }, { label: /^\d+$/.test(id) ? `${prefix || '#'}${id}` : id }];
    }
  }
  return [{ label: 'Sayfa' }];
};

const readUser = () => {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
};

const Topbar = ({ onMenu = () => {} }) => {
  const { can } = usePermission();
  const location = useLocation();
  const navigate = useNavigate();

  const [user, setUser] = useState(readUser);
  useEffect(() => {
    const onUpdate = (e) => setUser(e.detail);
    window.addEventListener(USER_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(USER_UPDATED_EVENT, onUpdate);
  }, []);

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch { /* depolama erişilemez */ }
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('theme', theme); } catch { /* depolama yoksa yalnızca bu oturum */ }
  }, [theme]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey  = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const go = (path) => { setMenuOpen(false); navigate(path); };

  const handleLogout = useCallback(() => {
    clearSession();
    try { clearPermissionCache(); } catch { /* önbellek temizlenemezse sorun değil */ }
    window.location.href = '/login';
  }, []);

  const crumbs = getCrumbs(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-900/90">
      <button onClick={onMenu} className="-ml-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Menüyü aç">
        <Menu size={18} />
      </button>

      <nav aria-label="Konum" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />}
            {c.to ? (
              <Link to={c.to} className="truncate text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">{c.label}</Link>
            ) : (
              <span className={`truncate ${i === crumbs.length - 1 ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-500'}`}>{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
          title={theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-haspopup="menu" aria-expanded={menuOpen}
          >
            <Avatar user={user} size="sm" />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-sm font-medium text-slate-900 dark:text-white">{user?.full_name || user?.username}</span>
            </span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{user?.full_name || user?.username}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  @{user?.username} · {ROLE_LABELS[user?.role] || user?.role}
                </p>
              </div>
              <div className="p-1">
                <MenuItem icon={User} onClick={() => go('/profile')}>Profilim</MenuItem>
                {can('users.view') && <MenuItem icon={Users} onClick={() => go('/users')}>Kullanıcılar</MenuItem>}
                {can('roles.view') && <MenuItem icon={Shield} onClick={() => go('/roles')}>Roller</MenuItem>}
              </div>
              <div className="border-t border-slate-100 p-1 dark:border-slate-800">
                <MenuItem icon={LogOut} onClick={handleLogout}>Çıkış yap</MenuItem>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

const MenuItem = ({ icon, children, onClick }) => {
  const Icon = icon;
  return (
  <button role="menuitem" onClick={onClick}
    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
    <Icon size={15} strokeWidth={1.75} className="text-slate-400" />
    {children}
  </button>
  );
};

export default Topbar;
