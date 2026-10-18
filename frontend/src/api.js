import axios from 'axios';
import { API_BASE, getToken, redirectToLogin } from './auth';

/**
 * ── YAPILAN DÜZELTMELER ───────────────────────────────────────
 * 1. Pydantic Hata Formatlama: Liste olarak gelen hatalar daha okunabilir hale getirildi.
 * 2. Token Yönetimi: 'access_token' ve 'token' anahtarları arasında tam uyum sağlandı.
 * 3. HTTP Metotları: Backend beklentilerine göre PATCH ve PUT metotları stabilize edildi.
 * 4. Defect Entegrasyonu: Backend yapısına uygun is_defect filtresi eklendi.
 * ─────────────────────────────────────────────────────────────
 */

const BASE_URL = API_BASE;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── REQUEST INTERCEPTOR (Kimlik Doğrulama) ────────────────────
api.interceptors.request.use(
  (config) => {
    // Hem 'access_token' hem 'token' anahtarlarını kontrol et
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── RESPONSE INTERCEPTOR (Hata Yönetimi) ──────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    // 401 Unauthorized: Oturumu temizle ve login'e yönlendir
    // (login denemesindeki 401 "şifre hatalı" demektir, yönlendirme yapılmaz)
    if (status === 401 && !error.config?.url?.includes('/auth/login')) {
      redirectToLogin();
    }

    // Pydantic/FastAPI validation hatalarını düzgün bir mesajda birleştir
    let message = 'Beklenmedik bir hata oluştu.';
    if (Array.isArray(detail)) {
      // Örn: "username: field required, password: too short"
      message = detail.map((d) => `${d.loc?.at(-1) || 'Hata'}: ${d.msg}`).join(' | ');
    } else if (typeof detail === 'string') {
      message = detail;
    } else {
      message = error.message;
    }

    return Promise.reject(new Error(message));
  }
);

export default api;

// ── MODÜLER ENDPOINT'LER ──────────────────────────────────────

export const authApi = {
  login:    (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me:       ()     => api.get('/auth/me'),
  updateMe: (data) => api.patch('/auth/me', data),
  changeMyPassword: (data) => api.post('/auth/me/password', data),
};

export const projectsApi = {
  getAll:  ()           => api.get('/projects'),
  getOne:  (id)         => api.get(`/projects/${id}`),
  create:  (data)       => api.post('/projects', data),
  update:  (id, data)   => api.put(`/projects/${id}`, data),
  remove:  (id)         => api.delete(`/projects/${id}`),
};

export const testCasesApi = {
  getAll:      (params)   => api.get('/test-cases', { params }),
  getOne:      (id)       => api.get(`/test-cases/${id}`),
  create:      (data)     => api.post('/test-cases', data),
  update:      (id, data) => api.put(`/test-cases/${id}`, data),
  remove:      (id)       => api.delete(`/test-cases/${id}`),
  bulkDelete:  (data)     => api.post('/test-cases/bulk/delete', data),
  bulkStatus:  (data)     => api.patch('/test-cases/bulk/status', data),
  generateBDD: (data)     => api.post('/test-cases/generate-bdd-code', data),
  history:     (id)       => api.get(`/test-cases/${id}/history`),
};

/** Sunucu tek istekte en fazla 1000 kayıt döndürür; liste ekranları hepsini sayfa sayfa çeker. */
export const fetchAllTestCases = async (params = {}) => {
  const PAGE = 1000;
  const all = [];
  for (let skip = 0; ; skip += PAGE) {
    const { data } = await api.get('/test-cases', { params: { ...params, skip, limit: PAGE } });
    all.push(...data);
    if (data.length < PAGE) return all;
  }
};

/** Koşum listesi de sunucuda sayfalı (en fazla 500); eski "defect koşumu" kayıtları hariç tutulur. */
export const fetchAllTestRuns = async (params = {}) => {
  const PAGE = 500;
  const all = [];
  for (let skip = 0; ; skip += PAGE) {
    const { data } = await api.get('/test-runs', { params: { is_defect: false, ...params, skip, limit: PAGE } });
    all.push(...data);
    if (data.length < PAGE) return all;
  }
};

export const mobileApi = {
  devices:  ()     => api.get('/api/mobile/devices', { timeout: 30000 }),
  run:      (data) => api.post('/api/mobile/run', data),
};

export const testPlansApi = {
  getAll:     ()              => api.get('/test-plans'),
  getOne:     (id)            => api.get(`/test-plans/${id}`),
  create:     (data)          => api.post('/test-plans', data),
  update:     (id, data)      => api.put(`/test-plans/${id}`, data),
  remove:     (id)            => api.delete(`/test-plans/${id}`),
  addItem:    (id, data)      => api.post(`/test-plans/${id}/items`, data),
  bulkAdd:    (id, ids)       => api.post(`/test-plans/${id}/bulk-add`, { test_case_ids: ids }),
  bulkItemStatus: (id, itemIds, runStatus) => api.post(`/test-plans/${id}/items/bulk-status`, { item_ids: itemIds, run_status: runStatus }),
  bulkRemoveItems: (id, itemIds) => api.post(`/test-plans/${id}/items/bulk-remove`, { item_ids: itemIds }),
  updateItem: (planId, itemId, data) => api.patch(`/test-plans/${planId}/items/${itemId}`, data),
  removeItem: (planId, itemId)       => api.delete(`/test-plans/${planId}/items/${itemId}`),
};

export const testRunsApi = {
  getAll:  (params)     => api.get('/test-runs', { params }),
  getOne:  (id)         => api.get(`/test-runs/${id}`),
  create:  (data)       => api.post('/test-runs', data),
  update:  (id, data)   => api.put(`/test-runs/${id}`, data),
  remove:  (id)         => api.delete(`/test-runs/${id}`),
};

export const usersApi = {
  getAll:         ()           => api.get('/users'),
  getOne:         (id)         => api.get(`/users/${id}`),
  create:         (data)       => api.post('/users', data),
  // Role güncellemesi için ayrı bir payload gönderilir
  update:         (id, data)   => api.put(`/users/${id}`, data),
  updateRole:     (id, role)   => api.put(`/users/${id}`, { role }),
  updatePassword: (id, data)   => api.patch(`/users/${id}/password`, data),
  remove:         (id)         => api.delete(`/users/${id}`),
};

export const rolesApi = {
  getAll:            ()           => api.get('/roles'),
  create:            (data)       => api.post('/roles', data),
  update:            (id, data)   => api.put(`/roles/${id}`, data),
  remove:            (id)         => api.delete(`/roles/${id}`),
  getPermissions:    ()           => api.get('/permissions'),
  updatePermissions: (id, data)   => api.put(`/roles/${id}/permissions`, data),
};

export const environmentsApi = {
  getAll:  (params)   => api.get('/environments', { params }),
  create:  (data)     => api.post('/environments', data),
  update:  (id, data) => api.put(`/environments/${id}`, data),
  remove:  (id)       => api.delete(`/environments/${id}`),
};

export const variablesApi = {
  getAll:  (params)   => api.get('/variables', { params }),
  create:  (data)     => api.post('/variables', data),
  update:  (id, data) => api.put(`/variables/${id}`, data),
  remove:  (id)       => api.delete(`/variables/${id}`),
};

export const defectsApi = {
  // Defect'ler backend'de ayrı "defects" tablosunda tutulur (otomatik + manuel)
  getAll:     (params)   => api.get('/defects', { params }),
  getOne:     (id)       => api.get(`/defects/${id}`),
  create:     (data)     => api.post('/defects', data),
  update:     (id, data) => api.patch(`/defects/${id}`, data),
  bulkStatus: (data)     => api.post('/defects/bulk-status', data),
  remove:     (id)       => api.delete(`/defects/${id}`),
};