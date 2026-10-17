import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { authApi } from '../api';
import AuthLayout, { AuthField } from '../components/AuthLayout';
import { Button } from '../components/ui';
import { inputCls } from '../components/ui/tokens';

const LoginPage = () => {
  const [identifier, setIdentifier]     = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data } = await authApi.login({ identifier, password });
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('token', data.access_token);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Kullanıcı adı veya şifre hatalı.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Giriş yap"
      subtitle="Test planlarınıza, koşumlarınıza ve hata kayıtlarınıza devam edin."
      footer={<>Hesabınız yok mu? <Link to="/register" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">Hesap oluşturun</Link></>}
    >
      <form onSubmit={handleLogin} className="space-y-5" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <AuthField label="Kullanıcı adı veya e-posta" htmlFor="identifier">
          <input id="identifier" name="identifier" type="text" autoComplete="username" required autoFocus
            value={identifier} onChange={e => setIdentifier(e.target.value)} className={inputCls} />
        </AuthField>

        <AuthField label="Şifre" htmlFor="password">
          <div className="relative">
            <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)} className={`${inputCls} pr-10`} />
            <button type="button" onClick={() => setShowPassword(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </AuthField>

        <Button type="submit" variant="primary" size="lg" loading={isLoading}
          disabled={!identifier || !password} className="w-full justify-center">
          {isLoading ? 'Giriş yapılıyor' : 'Giriş yap'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default LoginPage;
