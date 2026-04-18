// src/hooks/usePermission.js
import { useState, useEffect, useCallback, useRef } from 'react';

const CACHE_KEY    = 'ng-permissions-cache';
const CACHE_TTL_MS = 5 * 60 * 1000;

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

// Tüm permission cache'lerini temizle (logout'ta çağır)
export const clearPermissionCache = () => {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(CACHE_KEY))
      .forEach(k => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
};

// ── Hook ─────────────────────────────────────────────────────────
export const usePermission = () => {
  // Kullanıcı bilgisini bir kere oku — render döngüsü yaratmamak için ref kullan
  const userRef = useRef(null);
  if (!userRef.current) {
    try { userRef.current = JSON.parse(localStorage.getItem('user')); } catch {}
  }
  const role = userRef.current?.role || 'viewer';

  // Cache'den başlangıç değerini al — varsa fetch'e hiç gitme
  const [permissions, setPermissions] = useState(() => {
    const cached = loadCache(role);
    return cached ?? STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer;
  });
  const [loading, setLoading] = useState(false);

  // Sadece bir kere çalışsın — sonsuz döngüyü önlemek için mounted ref
  const fetchedRef = useRef(false);

  const fetchPermissions = useCallback(async () => {
    // Cache varsa backend'e gitme
    const cached = loadCache(role);
    if (cached) {
      setPermissions(cached);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/roles', {
        signal: AbortSignal.timeout(5000), // 5 saniye timeout
      });

      if (res.ok) {
        const roles = await res.json();
        const userRole = roles.find(r => r.name === role);
        // Backend RolePermission nesnesi döndürüyor, .key veya direkt string olabilir
        const perms = (userRole?.permissions ?? []).map(p =>
          typeof p === 'string' ? p : (p.key ?? '')
        ).filter(Boolean);

        if (perms.length > 0) {
          saveCache(role, perms);
          setPermissions(perms);
        } else {
          // Backend boş döndürdü — statik fallback kullan
          setPermissions(STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer);
        }
      } else {
        // 401, 403, 500 vb. — statik fallback
        console.warn(`[usePermission] /roles ${res.status} — statik fallback kullanılıyor`);
        setPermissions(STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer);
      }
    } catch (err) {
      // Network hatası, timeout vb. — statik fallback
      console.warn('[usePermission] Backend erişilemiyor — statik fallback kullanılıyor:', err.message);
      setPermissions(STATIC_ROLE_PERMISSIONS[role] ?? STATIC_ROLE_PERMISSIONS.viewer);
    } finally {
      setLoading(false);
    }
  }, [role]);

  // Sadece ilk mount'ta çalış — role değişiminde sonsuz döngüye girme
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const cached = loadCache(role);
    if (!cached) {
      fetchPermissions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sorgu fonksiyonları ──────────────────────────────────────────
  const can = useCallback((key) => {
    if (role === 'admin') return true;
    return permissions.includes(key);
  }, [permissions, role]);

  const canAny = useCallback((keys = []) => {
    if (role === 'admin') return true;
    return keys.some(k => permissions.includes(k));
  }, [permissions, role]);

  const canAll = useCallback((keys = []) => {
    if (role === 'admin') return true;
    return keys.every(k => permissions.includes(k));
  }, [permissions, role]);

  return {
    can,
    canAny,
    canAll,
    permissions,
    role,
    loading,
    isAdmin:  role === 'admin',
    isViewer: role === 'viewer',
    refetch:  fetchPermissions,
  };
};

export default usePermission;