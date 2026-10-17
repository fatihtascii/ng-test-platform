// src/hooks/usePermission.js
import { useState, useEffect, useCallback, useRef } from 'react';

const CACHE_KEY    = 'ng-permissions-cache';
const CACHE_TTL_MS = 5 * 60 * 1000;

// FIX: API_BASE hardcoded 'http://127.0.0.1:8000' yerine env'den okunuyor.
// Eski haliyle production'da backend'e ulaşamazdı.
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

// Statik fallback — /roles 401 veya network hatası alırsa kullanılır
const STATIC_ROLE_PERMISSIONS = {
  admin: [
    'projects.view','projects.create','projects.edit','projects.delete',
    'test_cases.view','test_cases.create','test_cases.edit','test_cases.delete',
    'test_runs.view','test_runs.create','test_runs.execute','test_runs.delete',
    'test_plans.view','test_plans.create','test_plans.edit','test_plans.delete',
    'defects.view','defects.manage',
    'users.view','users.manage',
    'reports.view','reports.export',
    'automation.view','automation.execute',
    'environments.view','environments.manage',
    'roles.view','roles.manage',
    'integrations.view','integrations.manage',
  ],
  manager: [
    'projects.view','projects.create','projects.edit',
    'test_cases.view','test_cases.create','test_cases.edit','test_cases.delete',
    'test_runs.view','test_runs.create','test_runs.execute','test_runs.delete',
    'test_plans.view','test_plans.create','test_plans.edit','test_plans.delete',
    'defects.view','defects.manage',
    'users.view',
    'reports.view','reports.export',
    'automation.view','automation.execute',
    'environments.view','environments.manage',
    'roles.view',
  ],
  tester: [
    'projects.view',
    'test_cases.view','test_cases.create','test_cases.edit',
    'test_runs.view','test_runs.create','test_runs.execute',
    'test_plans.view',
    'defects.view','defects.manage',
    'reports.view',
    'automation.view',
    'environments.view',
  ],
  viewer: [
    'projects.view','test_cases.view','test_runs.view',
    'test_plans.view','defects.view','reports.view','environments.view',
  ],
};

// ── Cache yardımcıları ────────────────────────────────────────────
const loadCache = (role) => {
  try {
    const raw = sessionStorage.getItem(`${CACHE_KEY}:${role}`);
    if (!raw) return null;
    const { permissions, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(`${CACHE_KEY}:${role}`);
      return null;
    }
    return permissions;
  } catch { return null; }
};

const saveCache = (role, permissions) => {
  try {
    sessionStorage.setItem(
      `${CACHE_KEY}:${role}`,
      JSON.stringify({ permissions, ts: Date.now() })
    );
  } catch { /* ignore */ }
};

export const clearPermissionCache = () => {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(CACHE_KEY))
      .forEach(k => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
};

// ── Hook ─────────────────────────────────────────────────────────
export const usePermission = () => {
  const userRef = useRef(null);
  if (!userRef.current) {
    try { userRef.current = JSON.parse(localStorage.getItem('user')); } catch { /* bozuk kayıt → viewer */ }
  }
  const role = userRef.current?.role || 'viewer';

  const [permissions, setPermissions] = useState(() => {
    const cached = loadCache(role);
    return cached ?? STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer;
  });
  const [loading, setLoading] = useState(false);

  const fetchedRef = useRef(false);

  const fetchPermissions = useCallback(async () => {
    const cached = loadCache(role);
    if (cached) {
      setPermissions(cached);
      return;
    }

    setLoading(true);
    try {
      // /auth/me oturumdaki kullanıcının rol izinlerini döner (roles.view izni gerekmez)
      const res = await fetch(`${API_BASE}/auth/me`, {
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const me = await res.json();
        const perms = (me?.permissions ?? []).filter(Boolean);

        if (perms.length > 0) {
          saveCache(role, perms);
          setPermissions(perms);
        } else {
          setPermissions(STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer);
        }
      } else {
        console.warn(`[usePermission] /auth/me ${res.status} — statik fallback`);
        setPermissions(STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer);
      }
    } catch (err) {
      console.warn('[usePermission] Backend erişilemiyor — statik fallback:', err.message);
      setPermissions(STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const cached = loadCache(role);
    if (!cached) fetchPermissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const can    = useCallback((key)    => role === 'admin' || permissions.includes(key),  [permissions, role]);
  const canAny = useCallback((keys=[])=> role === 'admin' || keys.some(k => permissions.includes(k)),  [permissions, role]);
  const canAll = useCallback((keys=[])=> role === 'admin' || keys.every(k => permissions.includes(k)), [permissions, role]);

  return { can, canAny, canAll, permissions, role, loading, isAdmin: role === 'admin', isViewer: role === 'viewer', refetch: fetchPermissions };
};

export default usePermission;
