import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import {
  LayoutDashboard, FolderKanban, FlaskConical, ClipboardList, PlayCircle, Bug,
  Cpu, LineChart, Globe, Blocks, Users, Shield, X,
} from 'lucide-react';
import { API_BASE } from '../auth';
import { BrandMark } from './ui';

// ── Menü ──────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { name: 'Genel durum', path: '/', icon: LayoutDashboard, perm: null, end: true },
    ],
  },
  {
    label: 'Test yönetimi',
    items: [
      { name: 'Projeler',       path: '/projects',   icon: FolderKanban,  perm: 'projects.view' },
      { name: 'Test case\'ler', path: '/test-cases', icon: FlaskConical,  perm: 'test_cases.view' },
      { name: 'Test planları',  path: '/test-plans', icon: ClipboardList, perm: 'test_plans.view' },
      { name: 'Koşumlar',       path: '/test-runs',  icon: PlayCircle,    perm: 'test_runs.view' },
      { name: 'Hatalar',        path: '/defects',    icon: Bug,           perm: 'defects.view' },
    ],
  },
  {
    label: 'Araçlar',
    items: [
      { name: 'Otomasyon',      path: '/automation',   icon: Cpu,       perm: 'automation.view' },
      { name: 'Raporlar',       path: '/reports',      icon: LineChart, perm: 'reports.view' },
      { name: 'Ortamlar',       path: '/environments', icon: Globe,     perm: 'environments.view' },
      { name: 'Entegrasyonlar', path: '/integrations', icon: Blocks,    perm: 'integrations.view' },
    ],
  },
  {
    label: 'Yönetim',
    items: [
      { name: 'Kullanıcılar', path: '/users', icon: Users,  perm: 'users.view' },
      { name: 'Roller',       path: '/roles', icon: Shield, perm: 'roles.view' },
    ],
  },
];

// ── API bağlantı durumu ───────────────────────────────────────
// Backend'e ulaşılamıyorsa kullanıcı bunu boş listelerden değil, buradan anlasın.
const useApiHealth = () => {
  const [state, setState] = useState('checking');
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(5000) });
        if (alive) setState(res.ok ? 'up' : 'down');
      } catch {
        if (alive) setState('down');
      }
    };
    check();
    const id = setInterval(check, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return state;
};

const HEALTH = {
  checking: { dot: 'bg-slate-400',   text: 'Bağlantı kontrol ediliyor' },
  up:       { dot: 'bg-emerald-500', text: 'Sunucu bağlı' },
  down:     { dot: 'bg-rose-500',    text: 'Sunucuya ulaşılamıyor' },
};

// ── Bileşen ───────────────────────────────────────────────────
const Sidebar = ({ open = false, onClose = () => {} }) => {
  const { can } = usePermission();
  const health = HEALTH[useApiHealth()];

  return (
    <>
      {/* Mobil karartma */}
      <div
        className={`fixed inset-0 z-40 bg-slate-950/40 transition-opacity lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 print:hidden flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Ana menü"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <NavLink to="/" className="flex items-center gap-2 rounded-md" onClick={onClose}>
            <BrandMark />
            <span className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">NG Test</span>
          </NavLink>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" aria-label="Menüyü kapat">
            <X size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {NAV_GROUPS.map((group, gi) => {
            const items = group.items.filter(item => !item.perm || can(item.perm));
            if (!items.length) return null;
            return (
              <div key={gi}>
                {group.label && (
                  <p className="mb-1 px-2.5 text-xs font-medium text-slate-400 dark:text-slate-500">{group.label}</p>
                )}
                <ul className="space-y-px">
                  {items.map((item) => { const { name, path, end } = item; const Icon = item.icon; return (
                    <li key={path}>
                      <NavLink
                        to={path}
                        end={end}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" aria-hidden />}
                            <Icon size={16} strokeWidth={1.75} className={isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'} />
                            {name}
                          </>
                        )}
                      </NavLink>
                    </li>
                  ); })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="flex h-10 shrink-0 items-center gap-2 border-t border-slate-200 px-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400" role="status">
          <span className={`h-1.5 w-1.5 rounded-full ${health.dot}`} aria-hidden />
          {health.text}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
