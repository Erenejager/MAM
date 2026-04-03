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
    <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
      {/* Sphere — 176x176px */}
      <div style={{ width: 176, height: 176, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
        {/* Inner orb — 109x109px */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={{
              width: 109,
              height: 109,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, rgba(255,140,160,0.5), rgba(225,29,72,0.4) 40%, rgba(225,29,72,0.1) 70%, transparent 85%)',
              boxShadow: '0 0 70px rgba(225,29,72,0.35), 0 0 140px rgba(225,29,72,0.15)',
              animation: 'orbBreath 3s ease-in-out infinite',
              position: 'relative',
            }}
          >
            {/* Specular highlight */}
            <div
              style={{
                position: 'absolute',
                top: 18,
                left: 28,
                width: 38,
                height: 22,
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
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'rgba(225,29,72,0.8)',
            boxShadow: '0 0 16px rgba(225,29,72,0.5)',
            animation: 'orbitDot1 4s linear infinite',
          }}
        />
        {/* Orbit dot 2 */}
        <div
          style={{
            position: 'absolute',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'rgba(225,29,72,0.8)',
            boxShadow: '0 0 16px rgba(225,29,72,0.5)',
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
            height: '2px',
            background: 'linear-gradient(90deg, transparent, rgba(225,29,72,0.3) 20%, rgba(255,255,255,0.15) 50%, rgba(225,29,72,0.3) 80%, transparent)',
            animation: 'streakSweep 4s ease-in-out infinite',
            pointerEvents: 'none',
            zIndex: 5,
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Text — stacked right */}
      <div style={{ lineHeight: 1.15 }}>
        <div>
          <span
            style={{
              fontFamily: "'Fira Sans', sans-serif",
              fontWeight: 600,
              fontSize: 58,
              letterSpacing: '3px',
              color: '#E11D48',
            }}
          >
            {displayText.media}
          </span>
          <span
            style={{
              fontFamily: "'Fira Sans', sans-serif",
              fontWeight: 600,
              fontSize: 58,
              letterSpacing: '3px',
              color: '#e4e4e7',
            }}
          >
            {displayText.sphere}
          </span>
        </div>
        <div
          style={{
            fontFamily: "'Fira Code', monospace",
            fontSize: 16,
            letterSpacing: '5px',
            textTransform: 'uppercase' as const,
            color: '#52525b',
            marginTop: 10,
          }}
        >
          Asset Management
        </div>
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
      <form onSubmit={handleSubmit} className="flex flex-col items-center" style={{ gap: 48, width: 540 }}>
        <LoginLogo />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 240, alignSelf: 'center' }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            disabled={submitting}
            className="w-full rounded font-sans
                       text-text placeholder:text-text-dim
                       focus:outline-none focus:ring-2 focus:ring-cta/50 focus:border-cta
                       disabled:opacity-50"
            style={{
              background: 'var(--glass-strong)',
              border: '1px solid var(--glass-border)',
              padding: '8px 12px',
              fontSize: 12,
            }}
          />

          {error && (
            <p className="text-cta text-center" style={{ fontSize: 11, marginTop: -2 }}>{error}</p>
          )}

          <Button
            type="submit"
            disabled={submitting || !password}
            className="w-full cursor-pointer"
            style={{
              background: '#E11D48',
              color: '#F8FAFC',
              padding: '7px 14px',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 12,
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
