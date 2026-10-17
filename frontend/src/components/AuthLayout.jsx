import React from 'react';
import { BrandMark, ResultBar } from './ui';

// Giriş/kayıt ekranlarının sağındaki örnek koşum dökümü: ürünün ne yaptığını tek bakışta anlatır.
const SAMPLE_ROWS = [
  { id: 'TC-104', title: 'Kayıtlı kullanıcı giriş yapar',  status: 'pass' },
  { id: 'TC-118', title: 'Sepete ürün eklenir',            status: 'pass' },
  { id: 'TC-121', title: 'Kartla ödeme tamamlanır',        status: 'fail' },
  { id: 'TC-127', title: 'Fatura e-postası gönderilir',    status: 'blocked' },
  { id: 'TC-130', title: 'Şifre sıfırlama bağlantısı',     status: 'pass' },
];
const STATUS_LABEL = { pass: 'Geçti', fail: 'Kaldı', blocked: 'Bloklu' };
const STATUS_DOT   = { pass: 'bg-emerald-400', fail: 'bg-rose-400', blocked: 'bg-amber-400' };

const RunPreview = () => (
  <div className="w-full max-w-md">
    <p className="text-sm text-slate-400">Örnek koşum</p>
    <p className="mt-1 text-xl font-semibold text-white">Gece regresyonu, sürüm 4.12</p>

    <ResultBar
      className="mt-6"
      height="h-2.5"
      segments={[
        { label: 'Geçti',    value: 112, tone: 'pass' },
        { label: 'Kaldı',    value: 9,   tone: 'fail' },
        { label: 'Bloklu',   value: 4,   tone: 'blocked' },
        { label: 'Bekliyor', value: 3,   tone: 'pending' },
      ]}
    />
    <div className="mt-3 flex gap-6 text-sm">
      <span className="text-slate-300"><span className="font-semibold text-white">112</span> geçti</span>
      <span className="text-slate-300"><span className="font-semibold text-white">9</span> kaldı</span>
      <span className="text-slate-300"><span className="font-semibold text-white">4</span> bloklu</span>
    </div>

    <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
      {SAMPLE_ROWS.map(r => (
        <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="w-14 font-mono text-xs text-slate-500">{r.id}</span>
          <span className="flex-1 truncate text-slate-200">{r.title}</span>
          <span className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.status]}`} />
            {STATUS_LABEL[r.status]}
          </span>
        </li>
      ))}
    </ul>
  </div>
);

const AuthLayout = ({ title, subtitle, children, footer }) => (
  <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] dark:bg-slate-950">
    <div className="flex flex-col px-6 py-8 sm:px-12">
      <div className="flex items-center gap-2">
        <BrandMark />
        <span className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">NG Test</span>
      </div>

      <div className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-sm py-12">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-sm text-slate-500 dark:text-slate-400">{footer}</div>}
        </div>
      </div>
    </div>

    <aside className="hidden items-center justify-center border-l border-slate-800 bg-slate-900 px-12 lg:flex dark:bg-slate-900">
      <RunPreview />
    </aside>
  </div>
);

export default AuthLayout;

// ── Form parçaları ────────────────────────────────────────────
export const AuthField = ({ label, htmlFor, hint, children }) => (
  <div>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
    {children}
    {hint && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
);
