import { useState, useEffect, type FormEvent } from 'react';
import { Button } from './ui/button';

interface LoginPageProps {
  onLogin: (password: string) => Promise<boolean>;
}

function LoginLogo() {
  const [displayText, setDisplayText] = useState<{ media: string; sphere: string }>({
    media: 'Media',
    sphere: 'Sphere',
  });

  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const target = 'MediaSphere';
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame > 16) {
        setDisplayText({ media: 'Media', sphere: 'Sphere' });
        clearInterval(interval);
        return;
      }
      const scrambled = Array.from({ length: 11 }, (_, i) =>
        frame > i * 1.5 + 2 ? target[i] : chars[Math.floor(Math.random() * chars.length)]
      ).join('');
      setDisplayText({
        media: scrambled.slice(0, 5),
        sphere: scrambled.slice(5),
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Sphere — 80x80px scaled version */}
      <div style={{ width: 80, height: 80, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Spinning conic gradient ring */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'conic-gradient(from 0deg, rgba(225,29,72,0.6), transparent 25%, rgba(225,29,72,0.2) 50%, transparent 75%, rgba(225,29,72,0.6))',
            animation: 'ringSpinSlow 8s linear infinite',
            WebkitMask: 'radial-gradient(transparent 55%, black 58%, black 100%)',
            mask: 'radial-gradient(transparent 55%, black 58%, black 100%)',
          }}
        />
        {/* Inner orb — 50x50px */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, rgba(255,140,160,0.5), rgba(225,29,72,0.4) 40%, rgba(225,29,72,0.1) 70%, transparent 85%)',
              boxShadow: '0 0 40px rgba(225,29,72,0.35), 0 0 80px rgba(225,29,72,0.15)',
              animation: 'orbBreath 3s ease-in-out infinite',
              position: 'relative',
            }}
          >
            {/* Specular highlight */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 13,
                width: 18,
                height: 10,
                background: 'radial-gradient(ellipse, rgba(255,255,255,0.45), transparent)',
                borderRadius: '50%',
                transform: 'rotate(-15deg)',
              }}
            />
            {/* Inner glow ring */}
            <div
              style={{
                position: 'absolute',
                inset: -1,
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>
        </div>
        {/* Orbit dot 1 */}
        <div
          style={{
            position: 'absolute',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'rgba(225,29,72,0.8)',
            boxShadow: '0 0 10px rgba(225,29,72,0.5)',
            animation: 'orbitDot1 4s linear infinite',
          }}
        />
        {/* Orbit dot 2 */}
        <div
          style={{
            position: 'absolute',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'rgba(225,29,72,0.8)',
            boxShadow: '0 0 10px rgba(225,29,72,0.5)',
            animation: 'orbitDot2 5.5s linear infinite',
          }}
        />
        {/* Anamorphic streak */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '-20%',
            right: '-20%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(225,29,72,0.3) 20%, rgba(255,255,255,0.15) 50%, rgba(225,29,72,0.3) 80%, transparent)',
            animation: 'streakSweep 4s ease-in-out infinite',
            pointerEvents: 'none',
            zIndex: 5,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Text */}
      <div style={{ lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "'Fira Sans', sans-serif",
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '2px',
            color: '#E11D48',
          }}
        >
          {displayText.media}
        </span>
        <span
          style={{
            fontFamily: "'Fira Sans', sans-serif",
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '2px',
            color: '#e4e4e7',
          }}
        >
          {displayText.sphere}
        </span>
      </div>
    </div>
  );
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
      <form onSubmit={handleSubmit} className="flex flex-col items-center w-72" style={{ gap: 48 }}>
        <LoginLogo />

        <div className="w-full flex flex-col" style={{ gap: 16 }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            disabled={submitting}
            className="w-full px-4 py-3 rounded-lg font-sans text-sm
                       text-text placeholder:text-text-dim
                       focus:outline-none focus:ring-2 focus:ring-cta/50 focus:border-cta
                       disabled:opacity-50"
            style={{
              background: 'var(--glass-strong)',
              border: '1px solid var(--glass-border)',
            }}
          />

          {error && (
            <p className="text-cta text-sm text-center" style={{ marginTop: -4 }}>{error}</p>
          )}

          <Button
            type="submit"
            disabled={submitting || !password}
            className="w-full cursor-pointer"
            style={{
              background: '#E11D48',
              color: '#F8FAFC',
              padding: '10px 20px',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              transition: 'all 200ms ease',
              boxShadow: submitting ? undefined : '0 0 12px rgba(225,29,72,0.2)',
            }}
            onMouseEnter={(e) => {
              if (!submitting) {
                e.currentTarget.style.background = '#BE123C';
                e.currentTarget.style.boxShadow = '0 0 12px rgba(225,29,72,0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#E11D48';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(225,29,72,0.2)';
            }}
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}
