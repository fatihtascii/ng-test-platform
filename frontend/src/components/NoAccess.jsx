import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';

// Rolü bu sayfayı görmeye yetmeyen kullanıcıya gösterilir (backend zaten 403 döner).
const NoAccess = ({ permission }) => (
  <div className="flex flex-col items-center justify-center text-center py-24 px-6">
    <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center mb-4">
      <Lock size={24} className="text-rose-500" />
    </div>
    <h1 className="text-xl font-bold text-slate-900 dark:text-white">Bu sayfaya erişim yetkiniz yok</h1>
    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md">
      Rolünüz bu sayfayı görüntüleme iznine sahip değil. Erişime ihtiyacınız varsa bir yöneticiden
      rolünüze ilgili izni eklemesini isteyin.
    </p>
    {permission && (
      <code className="mt-3 text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        {permission}
      </code>
    )}
    <Link to="/" className="mt-6 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
      Dashboard'a dön
    </Link>
  </div>
);

export default NoAccess;
