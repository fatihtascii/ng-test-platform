/**
 * Uygulama geneli bildirimler. Herhangi bir yerden:
 *   import { toast } from '../components/ui/toast';
 *   toast.success('Kaydedildi');  toast.error('Bağlantı yok');
 * Ekranda gösterimi <Toaster/> yapar (AppLayout'ta bir kez kurulu).
 */
let items = [];
let seq = 0;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l(items));

export const subscribeToasts = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getToasts = () => items;

export const dismissToast = (id) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

const push = (type, message, { duration = type === 'error' ? 6000 : 3500 } = {}) => {
  const id = ++seq;
  // Aynı mesaj üst üste gelirse çoğaltma
  items = [...items.filter((t) => t.message !== message), { id, type, message }].slice(-4);
  emit();
  if (duration) setTimeout(() => dismissToast(id), duration);
  return id;
};

export const toast = {
  success: (m, o) => push('success', m, o),
  error:   (m, o) => push('error', m, o),
  info:    (m, o) => push('info', m, o),
};
