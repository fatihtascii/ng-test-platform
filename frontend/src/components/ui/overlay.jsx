/**
 * Katman bileşenleri: Modal, Drawer, ConfirmDialog, Menu, Toaster.
 *
 * Hepsi body'ye portal ile çizilir; Escape ile kapanır, açılınca odak içeri alınır ve
 * kapanınca odak tetikleyen öğeye döner. Menü, tablo gibi taşmayı kesen kapların
 * içinde kırpılmasın diye sabit konumla (fixed) açılır.
 */
import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { subscribeToasts, getToasts, dismissToast } from './toast';
import { Button } from './index';

const cx = (...p) => p.filter(Boolean).join(' ');
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Açık katmanlar yığını: Escape yalnızca en üsttekini kapatsın
const stack = [];

const useLayer = (open, onClose, { lockScroll = true, initialFocus } = {}) => {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    const token = {};
    stack.push(token);
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const t = setTimeout(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      // Açıkça istenen alan yoksa katmanın kendisi odaklanır; Tab ile içerideki ilk öğeye geçilir
      const target = (initialFocus && root.querySelector(initialFocus)) || root.querySelector('[data-autofocus]') || root;
      target.focus?.();
    }, 0);

    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); }
      if (e.key === 'Tab' && ref.current) {
        const nodes = [...ref.current.querySelectorAll(FOCUSABLE)].filter(n => n.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
    };
  }, [open, lockScroll, initialFocus]);

  return ref;
};

// ── Modal ─────────────────────────────────────────────────────
const MODAL_SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/**
 * dismissable=false iken arka plana tıklama ve Escape kapatmaz (ör. işlem sürerken).
 */
export const Modal = ({ open, onClose, title, description, icon, size = 'md', footer, children, dismissable = true, bodyClassName }) => {
  const close = dismissable ? onClose : undefined;
  const ref = useLayer(open, close);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-950/50" onClick={close} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}
        className={cx('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-slate-200 bg-white outline-none sm:rounded-2xl dark:border-slate-800 dark:bg-slate-900', MODAL_SIZES[size])}>
        {(title || dismissable) && (
          <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            {icon && <span className="mt-0.5 text-slate-500 dark:text-slate-400">{icon}</span>}
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>}
              {description && <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{description}</p>}
            </div>
            {dismissable && (
              <button onClick={onClose} className="-mr-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Kapat">
                <X size={18} />
              </button>
            )}
          </header>
        )}
        <div className={cx('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
        {footer && <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

// ── Drawer (sağdan açılan panel) ──────────────────────────────
const DRAWER_SIZES = { md: 'sm:w-[560px]', lg: 'sm:w-[720px]', xl: 'sm:w-[880px]' };

export const Drawer = ({ open, onClose, title, eyebrow, actions, footer, size = 'lg', children, bodyClassName }) => {
  const ref = useLayer(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-hidden />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}
        className={cx('absolute inset-y-0 right-0 flex w-full flex-col border-l border-slate-200 bg-white outline-none dark:border-slate-800 dark:bg-slate-900', DRAWER_SIZES[size])}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="text-xs text-slate-500 dark:text-slate-400">{eyebrow}</p>}
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          </div>
          {actions}
          <button onClick={onClose} className="-mr-1 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Paneli kapat">
            <X size={18} />
          </button>
        </header>
        <div className={cx('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
        {footer && <footer className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
};

// ── Onay penceresi ────────────────────────────────────────────
export const ConfirmDialog = ({ open, onClose, onConfirm, title, description, confirmLabel = 'Onayla', tone = 'danger', loading }) => (
  <Modal open={open} onClose={loading ? () => {} : onClose} size="sm" dismissable={!loading}
    title={title}
    icon={tone === 'danger' ? <AlertTriangle size={18} className="text-rose-500" /> : null}
    footer={<>
      <Button variant="ghost" onClick={onClose} disabled={loading}>Vazgeç</Button>
      <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>{confirmLabel}</Button>
    </>}>
    <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
  </Modal>
);

// ── Menü (satır aksiyonları vb.) ──────────────────────────────
/**
 * <Menu trigger={({ ref, toggle, open }) => <button ref={ref} onClick={toggle}/>}>
 *   <MenuItem icon={Pencil} onSelect={...}>Düzenle</MenuItem>
 *   <MenuSeparator/>
 * </Menu>
 */
export const Menu = ({ trigger, children, align = 'end', width = 220 }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback((e) => { e?.stopPropagation(); setOpen(o => !o); }, []);

  // Konum doğrudan DOM'a yazılır (state yerine): ölçüm boyamadan önce yapılır, ek render olmaz.
  // Sayfa kaydırılınca menü kapanmaz, tetikleyicinin yanında kalır; tetikleyici görünümden çıkarsa kapanır.
  const place = useCallback(() => {
    const menu = menuRef.current, btn = btnRef.current;
    if (!menu || !btn) return true;
    const r = btn.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const h = menu.offsetHeight || 240;
    const below = window.innerHeight - r.bottom;
    const top = below < h + 12 && r.top > h + 12 ? r.top - h - 4 : r.bottom + 4;
    let left = align === 'end' ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';
    return true;
  }, [align, width]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    const follow = () => { if (!place()) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
    };
  }, [open, place]);

  return (
    <>
      {trigger({ ref: btnRef, toggle, open })}
      {open && createPortal(
        <div ref={menuRef} role="menu" onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: 0, left: 0, width, visibility: 'hidden' }}
          className="z-[95] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <MenuContext.Provider value={close}>{children}</MenuContext.Provider>
        </div>,
        document.body,
      )}
    </>
  );
};

const MenuContext = React.createContext(() => {});

export const MenuItem = ({ icon, children, onSelect, tone, disabled, hint }) => {
  const close = React.useContext(MenuContext);
  const Icon = icon;
  return (
    <button role="menuitem" type="button" disabled={disabled}
      onClick={(e) => { e.stopPropagation(); close(); onSelect?.(); }}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm outline-none disabled:opacity-40',
        'focus:bg-slate-100 dark:focus:bg-slate-800',
        tone === 'danger'
          ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
      )}>
      {Icon && <Icon size={15} strokeWidth={1.75} className={tone === 'danger' ? '' : 'text-slate-400'} />}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </button>
  );
};

export const MenuSeparator = () => <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" role="separator" />;

// ── Bildirimler ───────────────────────────────────────────────
const TOAST_STYLE = {
  success: { icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  error:   { icon: AlertCircle,  cls: 'text-rose-600 dark:text-rose-400' },
  info:    { icon: Info,         cls: 'text-blue-600 dark:text-blue-400' },
};

export const Toaster = () => {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (!items.length) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
      role="region" aria-label="Bildirimler">
      {items.map(t => {
        const s = TOAST_STYLE[t.type] || TOAST_STYLE.info;
        const Icon = s.icon;
        return (
          <div key={t.id} role={t.type === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
            <Icon size={16} className={cx('mt-0.5 shrink-0', s.cls)} />
            <p className="flex-1">{t.message}</p>
            <button onClick={() => dismissToast(t.id)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" aria-label="Bildirimi kapat">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
};
