import React, { useEffect, useRef, useState } from 'react';
import { Copy, Download, Maximize2, Minimize2, ArrowDownToLine } from 'lucide-react';
import { toast } from '../../components/ui/toast';

const CLS = { error: 'text-rose-400', success: 'text-emerald-400', warn: 'text-amber-300', running: 'text-sky-300', info: 'text-slate-300' };

/** Koşum çıktısı. Kullanıcı yukarı kaydırınca otomatik kaydırma durur; "Hatalar" yalnız hata/uyarı satırlarını gösterir. */
const RunConsole = ({ logs, live }) => {
  const ref = useRef(null);
  const [follow, setFollow] = useState(true);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [full, setFull] = useState(false);
  const shown = onlyErrors ? logs.filter(l => l.type === 'error' || l.type === 'warn') : logs;

  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [shown.length, follow]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== follow) setFollow(atBottom);
  };

  const text = () => logs.map(l => `${l.time} ${l.message}`).join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); toast.success('Çıktı panoya kopyalandı.'); }
    catch { toast.error('Panoya kopyalanamadı.'); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text()], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `otomasyon-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.log`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const btn = 'inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100';
  return (
    <div className={full ? 'fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-2xl' : 'flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950'}>
      <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-1.5">
        <span className="mr-auto font-mono text-xs text-slate-500">çıktı · {logs.length} satır{live && <span className="ml-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" />}</span>
        <button type="button" onClick={() => setOnlyErrors(v => !v)} aria-pressed={onlyErrors} className={`${btn} ${onlyErrors ? 'bg-slate-800 text-slate-100' : ''}`}>Hatalar</button>
        <button type="button" onClick={copy} disabled={!logs.length} className={btn} aria-label="Kopyala"><Copy size={13} /></button>
        <button type="button" onClick={download} disabled={!logs.length} className={btn} aria-label="İndir"><Download size={13} /></button>
        <button type="button" onClick={() => setFull(f => !f)} className={btn} aria-label={full ? 'Küçült' : 'Tam ekran'}>{full ? <Minimize2 size={13} /> : <Maximize2 size={13} />}</button>
      </div>
      <div ref={ref} onScroll={onScroll} role="log" aria-live="off"
        className={`${full ? 'flex-1' : 'h-72'} overflow-auto px-3 py-2 font-mono text-xs leading-relaxed`}>
        {shown.length === 0
          ? <p className="text-slate-500">{onlyErrors ? 'Hata veya uyarı satırı yok.' : 'Koşum başlayınca çıktı burada akar.'}</p>
          : shown.map(l => (
            <div key={l.id} className="flex gap-3 whitespace-pre-wrap break-all">
              <span className="shrink-0 select-none text-slate-600">{l.time}</span>
              <span className={CLS[l.type] || CLS.info}>{l.message}</span>
            </div>
          ))}
      </div>
      {!follow && shown.length > 0 && (
        <button type="button" onClick={() => setFollow(true)} className="flex items-center justify-center gap-1 border-t border-slate-800 py-1 text-xs text-slate-400 hover:text-slate-100">
          <ArrowDownToLine size={12} /> Sona git
        </button>
      )}
    </div>
  );
};

export default RunConsole;
