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

  // ✅ Güvenli Clone Fonksiyonu: Düz metinleri veya Fragment'leri çökmeden atlar
  const renderDisabledChildren = (extraClass = '') => {
    return React.Children.map(children, child => {
      if (!React.isValidElement(child)) return child;
      
      return React.cloneElement(child, {
        disabled: true,
        // ✅ onClick: undefined yerine kesin engelleme kalkanı
        onClick: (e) => { e.preventDefault(); e.stopPropagation(); }, 
        className: `${child.props.className || ''} opacity-40 cursor-not-allowed ${extraClass}`.trim(),
      });
    });
  };

  if (mode === 'disable') {
    return (
      <div className="relative inline-block w-fit" title={tooltip || 'Bu işlem için yetkiniz yok'}>
        {renderDisabledChildren('pointer-events-none')}
      </div>
    );
  }

  if (mode === 'tooltip') {
    return (
      // ✅ "Sağır Buton" Sorununu Çözen Wrapper:
      // cursor-not-allowed burada devreye girer, içindeki child pointer-events-none olur ki 
      // disabled buton hover event'lerini yutmasın, tooltip her tarayıcıda çalışsın.
      <div className="relative group inline-block w-fit cursor-not-allowed">
        
        <div className="pointer-events-none">
           {renderDisabledChildren()}
        </div>
        
        {/* Tooltip Tasarımı Geliştirildi (Karanlık mod uyumu ve animasyon eklendi) */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center gap-1.5 whitespace-nowrap bg-slate-900 dark:bg-slate-800 text-white border border-slate-700/50 text-xs px-3 py-1.5 rounded-lg shadow-xl z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-200">
          <Lock size={11} className="text-rose-400" />
          {tooltip || 'Bu işlem için yetkiniz yok'}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800"/>
        </div>
      </div>
    );
  }

  return null;
};

export default PermissionGuard;