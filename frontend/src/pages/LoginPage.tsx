import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import BrandMark from '../components/BrandMark';
import { useAuthStore } from '../store/authStore';
import { Button, Card, Input } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import LangToggle from '../components/LangToggle';
import { useTr } from '../lib/til';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const tr = useTr();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(email, password);
      login(data);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        tr('Kirib bo‘lmadi', 'Login failed', 'Не удалось войти');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="absolute right-4 top-4 flex gap-2">
        <LangToggle variant="inline" />
        <ThemeToggle variant="inline" />
      </div>
      <Card padding="lg" className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          {/* Brend belgisi: qora kvadrat, oq aylanuvchi chiziqlar, orqasida
              yonib-o'chib turuvchi rangli nur. */}
          <BrandMark size={56} className="mb-5 mt-2" />
          <h1 className="text-xl font-bold text-ink">{tr('Xush kelibsiz', 'Welcome back', 'С возвращением')}</h1>
          <p className="mt-1 text-sm text-ink-2">{tr('McQueen AI akkauntingizga kiring', 'Sign in to your McQueen AI account', 'Войдите в аккаунт McQueen AI')}</p>
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-bad">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label={tr('Parol', 'Password', 'Пароль')}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            {loading ? tr('Kirilmoqda…', 'Signing in…', 'Вход…') : tr('Kirish', 'Sign in', 'Войти')}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-2">
          {tr('Akkauntingiz yo‘qmi?', "Don't have an account?", 'Нет аккаунта?')}{' '}
          <Link to="/register" className="font-semibold text-accent hover:underline">
            {tr('Ro‘yxatdan o‘tish', 'Register', 'Регистрация')}
          </Link>
        </p>

        {/*
          ⚠ Huquqiy havolalar OCHIQ sahifada turishi kerak. Meta
          tekshiruvchisi ularni loginsiz topa olishi shart — kirish
          ortiga yashirilgan siyosat "yo'q" bilan barobar.
        */}
        <nav className="mt-5 flex justify-center gap-4 text-xs text-ink-3">
          <Link to="/privacy" className="hover:text-ink-2">
            {tr('Maxfiylik', 'Privacy', 'Конфиденциальность')}
          </Link>
          <Link to="/terms" className="hover:text-ink-2">
            {tr('Shartlar', 'Terms', 'Условия')}
          </Link>
          <Link to="/data-deletion" className="hover:text-ink-2">
            {tr("Ma'lumotni o'chirish", 'Data deletion', 'Удаление данных')}
          </Link>
        </nav>
      </Card>
    </div>
  );
}
