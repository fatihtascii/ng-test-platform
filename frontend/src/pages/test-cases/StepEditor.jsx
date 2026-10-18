import React, { useRef } from 'react';
import { ArrowUp, ArrowDown, CopyPlus, Trash2, ImagePlus, X, Plus } from 'lucide-react';
import { Button } from '../../components/ui';
import { textareaCls } from '../../components/ui/tokens';
import { toast } from '../../components/ui/toast';
import { emptyStep, newStepId, MAX_IMAGE_BYTES } from './model';

const IconBtn = ({ label, onClick, disabled, children, tone }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
    className={`rounded p-1 text-slate-400 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-slate-800 ${tone === 'danger' ? 'hover:text-rose-600' : 'hover:text-slate-700 dark:hover:text-slate-200'}`}>
    {children}
  </button>
);

// Satır sayısı içerikle büyüsün (2–8 satır)
const rowsFor = (text) => Math.min(8, Math.max(2, (text || '').split('\n').length));

const StepEditor = ({ steps, onChange }) => {
  const listRef = useRef(null);

  const set = (next) => onChange(next);
  const patch = (id, field, value) => set(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  const move = (i, d) => {
    const next = steps.slice();
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const focusAction = (index) => setTimeout(() => {
    listRef.current?.querySelectorAll('textarea[data-field="action"]')[index]?.focus();
  }, 0);
  const insertAfter = (i, step = emptyStep()) => {
    const next = steps.slice();
    next.splice(i + 1, 0, step);
    set(next);
    focusAction(i + 1);
  };
  const remove = (id) => set(steps.length > 1 ? steps.filter(s => s.id !== id) : [emptyStep()]);

  const attach = (id, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Yalnızca görsel dosyaları eklenebilir.'); return; }
    if (file.size > MAX_IMAGE_BYTES) { toast.error('Görsel en fazla 1,5 MB olabilir.'); return; }
    const reader = new FileReader();
    reader.onload = () => patch(id, 'image', reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <ol ref={listRef} className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.id} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center gap-1">
              <span className="font-mono text-xs tabular-nums text-slate-400">Adım {String(i + 1).padStart(2, '0')}</span>
              <div className="ml-auto flex items-center">
                <IconBtn label="Yukarı taşı" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp size={14} /></IconBtn>
                <IconBtn label="Aşağı taşı" onClick={() => move(i, 1)} disabled={i === steps.length - 1}><ArrowDown size={14} /></IconBtn>
                <IconBtn label="Adımı çoğalt" onClick={() => insertAfter(i, { ...s, id: newStepId() })}><CopyPlus size={14} /></IconBtn>
                <label className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Görsel ekle">
                  <ImagePlus size={14} aria-hidden />
                  <span className="sr-only">Adım {i + 1} için görsel ekle</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={e => { attach(s.id, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <IconBtn label="Adımı sil" tone="danger" onClick={() => remove(s.id)}><Trash2 size={14} /></IconBtn>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <textarea data-field="action" value={s.action} rows={rowsFor(s.action)}
                onChange={e => patch(s.id, 'action', e.target.value)}
                placeholder="Aksiyon: ne yapılacak?" aria-label={`Adım ${i + 1} aksiyon`}
                className={`${textareaCls} resize-none`} />
              <textarea value={s.expectedResult} rows={rowsFor(s.expectedResult)}
                onChange={e => patch(s.id, 'expectedResult', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); insertAfter(i); } }}
                placeholder="Beklenen sonuç" aria-label={`Adım ${i + 1} beklenen sonuç`}
                className={`${textareaCls} resize-none`} />
            </div>
            {s.image && (
              <div className="relative mt-2 inline-block">
                <img src={s.image} alt={`Adım ${i + 1} görseli`} className="max-h-32 rounded border border-slate-200 bg-slate-50 object-contain dark:border-slate-700 dark:bg-slate-800" />
                <button type="button" onClick={() => patch(s.id, 'image', null)} aria-label="Görseli kaldır"
                  className="absolute -right-2 -top-2 rounded-full border border-slate-200 bg-white p-0.5 text-slate-500 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900">
                  <X size={12} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => insertAfter(steps.length - 1)}>Adım ekle</Button>
        <span className="text-xs text-slate-400">Beklenen sonuçta Ctrl+Enter yeni adım açar</span>
      </div>
    </div>
  );
};

export default StepEditor;
