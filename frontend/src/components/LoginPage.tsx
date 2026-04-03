import { useState, type FormEvent } from 'react';

interface LoginPageProps {
  onLogin: (password: string) => Promise<boolean>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const ok = await onLogin(password);
    if (!ok) {
      setError('Wrong password');
      setPassword('');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-8 w-80">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-semibold font-mono text-slate-50 tracking-tight">
            MAM
          </h1>
          <p className="text-slate-400 text-sm">Media Asset Management</p>
        </div>

        {/* Password field */}
        <div className="w-full flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            disabled={submitting}
            className="w-full px-4 py-3 bg-panel border border-border rounded-lg
                       text-slate-50 placeholder:text-slate-500
                       focus:outline-none focus:ring-2 focus:ring-cta/50 focus:border-cta
                       disabled:opacity-50 font-sans"
          />

          {error && (
            <p className="text-cta text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full py-3 bg-cta hover:bg-cta/90 text-white font-semibold
                       rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
