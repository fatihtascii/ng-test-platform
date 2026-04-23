// frontend/src/api.js
import axios from 'axios';

// ── Base URL — .env dosyasından okunur ────────────────────────
// .env dosyasına ekle: VITE_API_URL=http://127.0.0.1:8000
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
  timeout: 15000, // 15 saniye timeout — cevap vermezse beklemez
  headers: { 'Content-Type': 'application/json' },
});

// ── REQUEST interceptor — her isteğe otomatik token ekle ──────
api.interceptors.request.use(
  (config) => {
    // localStorage'dan token oku (varsa Authorization header'a ekle)
    // Şu an token sistemi yoksa bu satırlar hazır bekler, zarar vermez
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── RESPONSE interceptor — hataları merkezi yakala ────────────
api.interceptors.response.use(
  // Başarılı cevap — dokunma, direkt geç
  (response) => response,

  // Hatalı cevap — merkezi yönet
  (error) => {
    const status  = error.response?.status;
    const detail  = error.response?.data?.detail;

    // 401 Unauthorized — oturum süresi dolmuş, login'e yönlendir
    if (status === 401) {
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      // Zaten login sayfasındaysa döngüye girme
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }

    // 403 Forbidden — yetkisiz işlem
    if (status === 403) {
      console.warn('[API] Yetkisiz işlem:', detail || 'Bu işlem için yetkiniz yok.');
    }

    // 500 Server Error — backend hatası
    if (status >= 500) {
      console.error('[API] Sunucu hatası:', detail || error.message);
    }

    // Hata nesnesine okunabilir mesaj ekle
    const message =
      detail ||
      error.message ||
      'Beklenmedik bir hata oluştu.';

    // Orijinal hata nesnesine mesajı ekleyerek fırlat
    // Sayfalarda: catch(err) => err.message ile okunabilir
    return Promise.reject(new Error(message));
  }
);

export default api;

// ── Modüler endpoint fonksiyonları (isteğe bağlı kullanım) ────
// Sayfada direkt api.get('/projects') yerine
// import { projectsApi } from '../api' şeklinde de kullanılabilir

export const projectsApi = {
  getAll:  ()       => api.get('/projects'),
  getOne:  (id)     => api.get(`/projects/${id}`),
  create:  (data)   => api.post('/projects', data),
  update:  (id, data) => api.put(`/projects/${id}`, data),
  remove:  (id)     => api.delete(`/projects/${id}`),
};

export const testCasesApi = {
  getAll:       (params) => api.get('/test-cases', { params }),
  getOne:       (id)     => api.get(`/test-cases/${id}`),
  create:       (data)   => api.post('/test-cases', data),
  update:       (id, data) => api.put(`/test-cases/${id}`, data),
  remove:       (id)     => api.delete(`/test-cases/${id}`),
  generateBDD:  (data)   => api.post('/test-cases/generate-bdd-code', data),
};

export const testPlansApi = {
  getAll:       ()         => api.get('/test-plans'),
  getOne:       (id)       => api.get(`/test-plans/${id}`),
  create:       (data)     => api.post('/test-plans', data),
  update:       (id, data) => api.put(`/test-plans/${id}`, data),
  remove:       (id)       => api.delete(`/test-plans/${id}`),
  addItem:      (id, data) => api.post(`/test-plans/${id}/items`, data),
  updateItem:   (planId, itemId, data) => api.patch(`/test-plans/${planId}/items/${itemId}`, data),
  removeItem:   (planId, itemId) => api.delete(`/test-plans/${planId}/items/${itemId}`),
};

export const testRunsApi = {
  getAll:  ()         => api.get('/test-runs'),
  getOne:  (id)       => api.get(`/test-runs/${id}`),
  create:  (data)     => api.post('/test-runs', data),
  update:  (id, data) => api.put(`/test-runs/${id}`, data),
  remove:  (id)       => api.delete(`/test-runs/${id}`),
};

export const usersApi = {
  getAll:         ()         => api.get('/users'),
  create:         (data)     => api.post('/users', data),
  update:         (id, data) => api.put(`/users/${id}`, data),
  remove:         (id)       => api.delete(`/users/${id}`),
  updateRole:     (id, data) => api.put(`/users/${id}/role`, data),
  updatePassword: (id, data) => api.put(`/users/${id}/password`, data),
};

export const authApi = {
  login:    (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
};

export const rolesApi = {
  getAll:           ()           => api.get('/roles'),
  update:           (id, data)   => api.put(`/roles/${id}`, data),
  updatePermissions:(id, data)   => api.put(`/roles/${id}/permissions`, data),
};

export const environmentsApi = {
  getAll:      () => api.get('/environments'),
  create:      (data)     => api.post('/environments', data),
  update:      (id, data) => api.put(`/environments/${id}`, data),
  remove:      (id)       => api.delete(`/environments/${id}`),
};

export const variablesApi = {
  getAll:  ()         => api.get('/variables'),
  create:  (data)     => api.post('/variables', data),
  update:  (id, data) => api.put(`/variables/${id}`, data),
  remove:  (id)       => api.delete(`/variables/${id}`),
};