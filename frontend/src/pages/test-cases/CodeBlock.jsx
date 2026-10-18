import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const GHERKIN_KW = /^(\s*)(Feature|Özellik|Scenario Outline|Scenario|Senaryo Taslağı|Senaryo|Background|Examples|Given|When|Then|And|But|Diyelim ki|Eğer|O zaman|Ve|Fakat|Ama)\b(:?)(.*)$/;
const PY_KW = /^(\s*)(def|class|import|from|return|async|await|with|assert|if|else|elif|for|in|try|except)\b(.*)$/;

/** Basit, renk anlamı taşımayan vurgulama: anahtar kelime koyu, yorum soluk. */
const Line = ({ text, language }) => {
  const t = text || ' ';
  if (/^\s*#/.test(t)) return <span className="text-slate-500">{t}</span>;
  if (/^\s*@/.test(t)) return <span className="text-slate-400">{t}</span>;
  if (language === 'gherkin') {
    const m = GHERKIN_KW.exec(t);
    if (m) return <>{m[1]}<span className="font-semibold text-white">{m[2]}{m[3]}</span>{m[4]}</>;
  } else {
    const m = PY_KW.exec(t);
    if (m) return <>{m[1]}<span className="font-semibold text-white">{m[2]}</span>{m[3]}</>;
  }
  return t;
};

const CodeBlock = ({ code, language = 'python', filename, maxHeight = 'max-h-80', actions }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(code)
    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
    .catch(() => {});
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-slate-800 px-3">
        <span className="truncate font-mono text-xs text-slate-400">{filename || language}</span>
        <div className="flex items-center gap-1">
          {actions}
          <button type="button" onClick={copy}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-100">
            {copied ? <><Check size={12} /> Kopyalandı</> : <><Copy size={12} /> Kopyala</>}
          </button>
        </div>
      </div>
      <pre className={`overflow-auto py-3 font-mono text-[12.5px] leading-relaxed text-slate-300 ${maxHeight}`}>
        <code className="table w-full">
          {lines.map((l, i) => (
            <span key={i} className="table-row">
              <span className="table-cell w-10 select-none pr-3 text-right text-slate-600 tabular-nums">{i + 1}</span>
              <span className="table-cell whitespace-pre pr-4"><Line text={l} language={language} /></span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
};

export default CodeBlock;
