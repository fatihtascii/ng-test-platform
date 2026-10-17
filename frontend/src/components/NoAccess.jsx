import React from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Panel } from './ui';

// Rolü bu sayfayı görmeye yetmeyen kullanıcıya gösterilir (backend zaten 403 döner).
const NoAccess = ({ permission }) => (
  <Panel className="mx-auto mt-10 max-w-lg" bodyClassName="px-6 py-10 text-center">
    <Lock size={20} className="mx-auto text-slate-400" />
    <h1 className="mt-3 text-base font-semibold text-slate-900 dark:text-white">Bu sayfaya erişim yetkiniz yok</h1>
    <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
      Rolünüzde bu sayfanın görüntüleme izni yok. Erişim gerekiyorsa yöneticinizden rolünüze
      {permission ? <> <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">{permission}</code> iznini</> : ' gerekli izni'} eklemesini isteyin.
    </p>
    <Link to="/" className="mt-5 inline-block text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
      Genel duruma dön
    </Link>
  </Panel>
);

export default NoAccess;
