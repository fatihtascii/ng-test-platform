import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from '../../components/ui/toast';

/** Panoya kopyalar; kısa süre onay işareti gösterir. text bir fonksiyonsa (ör. sırrı sunucudan açmak) önce çağrılır. */
export const CopyButton = ({ text, label = 'Değer', className = '' }) => {
  const [done, setDone] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      const value = typeof text === 'function' ? await text() : text;
      await navigator.clipboard.writeText(value);
      setDone(true); setTimeout(() => setDone(false), 1200);
      toast.success(`${label} kopyalandı.`);
    } catch (err) { toast.error(err?.message || 'Kopyalanamadı.'); }
  };
  return (
    <button type="button" onClick={copy} aria-label={`${label} kopyala`} title="Kopyala"
      className={`rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${className}`}>
      {done ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
};
