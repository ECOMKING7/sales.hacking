import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, Card, Input } from '../components/ui';

const PASSWORD_ERROR = 'Password must be at least 8 characters';
const CONFIRM_ERROR = 'Passwords do not match';

export default function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(CONFIRM_ERROR);
      return;
    }
    if (password.length < 8) {
      setError(PASSWORD_ERROR);
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.register(name, email, password);
      login(data); // auto-login
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Registration failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Validatsiya mantiqi o'zgarmadi — xato matni tegishli maydonga yo'naltiriladi.
  const passwordError = error === PASSWORD_ERROR ? error : undefined;
  const confirmError = error === CONFIRM_ERROR ? error : undefined;
  const formError = passwordError || confirmError ? '' : error;

  const field = (
    label: string,
    type: string,
    value: string,
    setter: (v: string) => void,
    placeholder: string,
    fieldError?: string
  ) => (
    <Input
      label={label}
      type={type}
      required
      value={value}
      onChange={(e) => setter(e.target.value)}
      placeholder={placeholder}
      error={fieldError}
    />
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-ground px-4 py-8">
      <Card padding="lg" className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="mb-3 grid h-12 w-12 place-items-center rounded-md border-[1.5px] border-edge bg-tint text-accent shadow-glow-sm"
          >
            <BarChart3 className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold text-ink">Create account</h1>
          <p className="mt-1 text-sm text-ink-2">Start attributing your revenue</p>
        </div>

        {formError && (
          <p role="alert" className="mb-4 text-sm text-bad">
            {formError}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4">
          {field('Name', 'text', name, setName, 'Jane Doe')}
          {field('Email', 'email', email, setEmail, 'you@example.com')}
          {field('Password', 'password', password, setPassword, '••••••••', passwordError)}
          {field(
            'Confirm password',
            'password',
            confirm,
            setConfirm,
            '••••••••',
            confirmError
          )}
          <Button type="submit" variant="primary" fullWidth loading={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-2">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
