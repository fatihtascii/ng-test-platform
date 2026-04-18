// src/components/PermissionGuard.jsx
// ─────────────────────────────────────────────────────────────────
// İzin gerektiren UI elemanlarını sarmalar.
// İzin yoksa: null | tooltip | disabled buton (mod'a göre)
//
// Kullanım:
//
//   <PermissionGuard permission="projects.create">
//     <button>Yeni Proje</button>
//   </PermissionGuard>
//
//   <PermissionGuard permission="test_cases.delete" mode="disable">
//     <button onClick={handleDelete}>Sil</button>
//   </PermissionGuard>
//
//   <PermissionGuard permission="users.manage" mode="tooltip"
//     tooltip="Bu işlem için yönetici yetkisi gerekir">
//     <button>Kullanıcı Sil</button>
//   </PermissionGuard>
// ─────────────────────────────────────────────────────────────────

import React from 'react';
import { usePermission } from '../hooks/usePermission';
import { Lock } from 'lucide-react';

const PermissionGuard = ({
  permission,          // string — tek izin anahtarı
  permissions,         // string[] — birden fazla (herhangi biri yeterliyse)
  requireAll = false,  // true ise permissions dizisindeki tümü gerekir
  mode = 'hide',       // 'hide' | 'disable' | 'tooltip'
  tooltip,             // mode=tooltip için mesaj
  children,
}) => {
  const { can, canAny, canAll } = usePermission();

  const hasPermission = (() => {
    if (permission)   return can(permission);
    if (permissions)  return requireAll ? canAll(permissions) : canAny(permissions);
    return true;
  })();

  if (hasPermission) return <>{children}</>;

  // ── İzin yok ──────────────────────────────────────────────────

  if (mode === 'hide') return null;

  if (mode === 'disable') {
    return (
      <div className="relative inline-flex" title={tooltip || 'Bu işlem için yetkiniz yok'}>
        {React.Children.map(children, child =>
          React.cloneElement(child, {
            disabled: true,
            onClick: undefined,
            className: `${child.props.className || ''} opacity-40 cursor-not-allowed pointer-events-none`,
          })
        )}
      </div>
    );
  }

  if (mode === 'tooltip') {
    return (
      <div className="relative group inline-flex">
        {React.Children.map(children, child =>
          React.cloneElement(child, {
            disabled: true,
            onClick: undefined,
            className: `${child.props.className || ''} opacity-40 cursor-not-allowed`,
          })
        )}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-50 pointer-events-none">
          <Lock size={11}/>
          {tooltip || 'Bu işlem için yetkiniz yok'}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900"/>
        </div>
      </div>
    );
  }

  return null;
};

export default PermissionGuard;