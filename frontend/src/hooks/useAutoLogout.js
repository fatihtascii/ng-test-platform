import { useEffect, useCallback } from 'react';

const useAutoLogout = (timeoutInMinutes = 5) => {
  const timeoutMs = timeoutInMinutes * 60 * 1000;

  const logout = useCallback(() => {
    if (localStorage.getItem('user')) {
      localStorage.removeItem('user');
      localStorage.removeItem('lastActivityTime'); // İzleri temizle
      window.location.href = '/login'; 
    }
  }, []);

  // Aktivite zamanını kaydet (Tüm sekmeler buradan okuyacak)
  const updateActivity = useCallback(() => {
    localStorage.setItem('lastActivityTime', Date.now().toString());
  }, []);

  useEffect(() => {
    // Bileşen yüklendiğinde süreyi başlat
    updateActivity();

    // 1. KONTROL MEKANİZMASI: Her 10 saniyede bir sürenin dolup dolmadığını kontrol et
    const checkInterval = setInterval(() => {
      const lastActivity = parseInt(localStorage.getItem('lastActivityTime') || '0', 10);
      
      // Eğer şu anki zaman - son aktivite zamanı > belirlenen süre ise çıkış yap
      if (Date.now() - lastActivity > timeoutMs) {
        logout();
      }
    }, 10000); // Saniyede 60 kere değil, 10 saniyede 1 kere kontrol eder.

    // 2. PERFORMANS (THROTTLE) MEKANİZMASI: Fare her hareket ettiğinde localStorage'ı dövmemek için
    let throttleTimer;
    const handleActivity = () => {
      if (throttleTimer) return;
      
      throttleTimer = setTimeout(() => {
        updateActivity();
        throttleTimer = null;
      }, 1000); // Saniyede en fazla 1 kez aktivite kaydeder
    };

    // Dinlenecek olaylar (passive: true ile scroll performansı artırıldı)
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));

    // Temizlik zamanı
    return () => {
      clearInterval(checkInterval);
      if (throttleTimer) clearTimeout(throttleTimer);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [logout, timeoutMs, updateActivity]);
};

export default useAutoLogout;