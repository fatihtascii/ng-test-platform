/**
 * Oturum yardımcıları.
 *
 * - getToken / clearSession: tek yerden token yönetimi
 * - installAuthFetch: backend'e giden tüm fetch() çağrılarına Authorization
 *   header'ı ekler, 401 gelirse oturumu kapatıp login'e yönlendirir.
 *   (Bazı sayfalar axios yerine doğrudan fetch kullandığı için gerekli.)
 * - withToken: header gönderemeyen WebSocket / EventSource URL'lerine ?token= ekler.
 */
export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const SESSION_KEYS = ['user', 'token', 'access_token', 'lastActivityTime'];

export const getToken = () =>
  localStorage.getItem('access_token') || localStorage.getItem('token');

export const clearSession = () => {
  SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith('ng-permissions-cache'))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch { /* sessionStorage erişilemezse yoksay */ }
};

export const redirectToLogin = () => {
  clearSession();
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
};

export const withToken = (url) => {
  const token = getToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};

const isApiUrl = (url) => {
  try {
    const target = new URL(url, window.location.origin);
    const base = new URL(API_BASE, window.location.origin);
    return target.origin === base.origin;
  } catch {
    return false;
  }
};

export const installAuthFetch = () => {
  if (window.__ngAuthFetchInstalled) return;
  window.__ngAuthFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!url || !isApiUrl(url)) return originalFetch(input, init);

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    const token = getToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    const res = await originalFetch(input, { ...init, headers });
    if (res.status === 401 && !url.includes('/auth/login')) redirectToLogin();
    return res;
  };
};

// Profil güncellenince Sidebar/Topbar gibi kullanıcıyı gösteren bileşenler dinler
export const USER_UPDATED_EVENT = 'ng:user-updated';

export const updateStoredUser = (patch) => {
  let current = {};
  try { current = JSON.parse(localStorage.getItem('user')) || {}; } catch { /* bozuk kayıt */ }
  const next = { ...current, ...patch };
  localStorage.setItem('user', JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT, { detail: next }));
  return next;
};
