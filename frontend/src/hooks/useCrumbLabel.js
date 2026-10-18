import { useEffect } from 'react';

/** Detay sayfaları üst çubuktaki son konum parçasına okunur bir ad verir ("#1" yerine proje adı). */
export const CRUMB_EVENT = 'ng:crumb-label';

export const useCrumbLabel = (label) => {
  useEffect(() => {
    if (!label) return undefined;
    const path = window.location.pathname;
    window.dispatchEvent(new CustomEvent(CRUMB_EVENT, { detail: { path, label } }));
    return () => window.dispatchEvent(new CustomEvent(CRUMB_EVENT, { detail: { path, label: null } }));
  }, [label]);
};
