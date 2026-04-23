import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, Loader2, User, Mail, Lock, IdCard } from 'lucide-react';

// --- Şifre güç göstergesi ---
const getPasswordStrength = (pwd) => {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8)           score++;
  if (/[A-Z]/.test(pwd))         score++;
  if (/[0-9]/.test(pwd))         score++;
  if (/[^A-Za-z0-9]/.test(pwd))  score++;
  if (score <= 1) return { label: 'Zayıf',   color: 'bg-rose-500',   width: 'w-1/4', textColor: 'text-rose-400' };
  if (score === 2) return { label: 'Orta',    color: 'bg-amber-500',  width: 'w-2/4', textColor: 'text-amber-400' };
  if (score === 3) return { label: 'İyi',     color: 'bg-blue-500',   width: 'w-3/4', textColor: 'text-blue-400' };
  return              { label: 'Güçlü',   color: 'bg-emerald-500',width: 'w-full', textColor: 'text-emerald-400' };
};

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    username:  '',
    email:     '',
    password:  '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [isLoading, setIsLoading]             = useState(false);
  const [error, setError]                     = useState('');
  const [success, setSuccess]                 = useState(false);
  const navigate = useNavigate();

  const strength = getPasswordStrength(formData.password);

  const update = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

  // ✅ Dinamik API Base URL
  const API_BASE = import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000';

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    // Validasyon
    if (!formData.full_name.trim()) {
      setError('Ad Soyad alanı zorunludur.'); return;
    }
    if (formData.username.length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalıdır.'); return;
    }
    if (formData.password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.'); return;
    }
    if (formData.password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.'); return;
    }

    setIsLoading(true);
    try {
      // ✅ Dinamik URL kullanıldı
      const response = await fetch(`${API_BASE}/auth/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(formData),
      });

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => navigate('/login'), 2000);
      } else {
        const data = await response.json().catch(() => ({}));
        // ✅ FastAPI array (dizi) hata mesajlarını da düzgün okuması için zırh eklendi
        const errorMessage = Array.isArray(data.detail) 
          ? data.detail[0]?.msg 
          : data.detail;
        
        setError(errorMessage || 'Kayıt sırasında bir hata oluştu.');
      }
    } catch {
      setError('Sunucuya bağlanılamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-10"
      style={{ backgroundImage: 'radial-gradient(ellipse at 30% 80%, #1e1b4b 0%, #0f172a 60%)' }}
    >
      {/* Dekoratif arka plan */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">

        {/* Başarı Ekranı */}
        {success ? (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-10 shadow-2xl shadow-black/50 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Kayıt Başarılı!</h2>
            <p className="text-slate-400 text-sm">Giriş sayfasına yönlendiriliyorsunuz...</p>
            <div className="mt-4 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full animate-[width_2s_ease-in-out]" style={{ width: '100%', transition: 'width 2s ease-in-out' }} />
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/50">

            {/* Logo + Başlık */}
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-lg shadow-indigo-600/40">
                <ShieldCheck size={28} className="text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Hesap Oluştur</h1>
              <p className="text-slate-400 text-sm mt-2">NG TEST platformuna katılın</p>
            </div>

            {/* Hata Mesajı */}
            {error && (
              <div className="flex items-center gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm px-4 py-3 rounded-xl mb-6">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">

              {/* Ad Soyad */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Ad Soyad</label>
                <div className="relative">
                  <IdCard size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={update('full_name')}
                    placeholder="Adınız Soyadınız"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Kullanıcı Adı */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Kullanıcı Adı</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.username}
                    onChange={update('username')}
                    placeholder="kullaniciadi"
                    required
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              {/* E-posta */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">E-posta</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={update('email')}
                    placeholder="ornek@mail.com"
                    required
                    autoComplete="email"
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Şifre */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Şifre</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={update('password')}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className="w-full pl-10 pr-11 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-white placeholder-slate-500 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {/* Şifre güç göstergesi */}
                {formData.password && strength && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`} />
                    </div>
                    <p className={`text-xs font-medium ${strength.textColor}`}>{strength.label}</p>
                  </div>
                )}
              </div>

              {/* Şifre Tekrar */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Şifre Tekrar</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    className={`w-full pl-10 pr-11 py-3 bg-slate-800/60 border rounded-xl text-white placeholder-slate-500 text-sm outline-none focus:ring-2 transition-all ${
                      confirmPassword && confirmPassword !== formData.password
                        ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20'
                        : confirmPassword && confirmPassword === formData.password
                        ? 'border-emerald-500/60 focus:border-emerald-500 focus:ring-emerald-500/20'
                        : 'border-slate-700/60 focus:border-indigo-500 focus:ring-indigo-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== formData.password && (
                  <p className="text-xs text-rose-400 mt-1.5">Şifreler eşleşmiyor.</p>
                )}
                {confirmPassword && confirmPassword === formData.password && (
                  <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Şifreler eşleşiyor.
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || (confirmPassword !== formData.password)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 flex items-center justify-center gap-2 mt-2"
              >
                {isLoading
                  ? <><Loader2 size={18} className="animate-spin" /> Hesap Oluşturuluyor...</>
                  : 'Hesabı Oluştur'
                }
              </button>
            </form>

            {/* Giriş Linki */}
            <div className="mt-8 pt-6 border-t border-slate-800 text-center">
              <p className="text-slate-400 text-sm">
                Zaten hesabınız var mı?{' '}
                <Link to="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors">
                  Giriş Yapın
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* Alt yazı */}
        <p className="text-center text-slate-600 text-xs mt-6">
          NG TEST · Test Yönetim Platformu
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;