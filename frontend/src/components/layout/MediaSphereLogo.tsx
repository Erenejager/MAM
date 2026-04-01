import { useState, useEffect } from 'react';

export function MediaSphereLogo() {
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
    <div
      className="relative flex items-center select-none cursor-default flex-shrink-0"
      style={{ gap: '8px' }}
    >
      {/* Sphere icon — 30x30px */}
      <div style={{ width: 30, height: 30, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        {/* Inner orb — 19x19px */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={{
              width: 19,
              height: 19,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, rgba(255,140,160,0.5), rgba(225,29,72,0.4) 40%, rgba(225,29,72,0.1) 70%, transparent 85%)',
              boxShadow: '0 0 20px rgba(225,29,72,0.35), 0 0 50px rgba(225,29,72,0.1)',
              animation: 'orbBreath 3s ease-in-out infinite',
              position: 'relative',
            }}
          >
            {/* Specular highlight */}
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: 5,
                width: 7,
                height: 4,
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
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: 'rgba(225,29,72,0.8)',
            boxShadow: '0 0 6px rgba(225,29,72,0.5)',
            animation: 'orbitDot1 4s linear infinite',
          }}
        />
        {/* Orbit dot 2 */}
        <div
          style={{
            position: 'absolute',
            width: 3,
            height: 3,
            borderRadius: '50%',
            background: 'rgba(225,29,72,0.8)',
            boxShadow: '0 0 6px rgba(225,29,72,0.5)',
            animation: 'orbitDot2 5.5s linear infinite',
          }}
        />
      </div>

      {/* Text */}
      <div style={{ lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "'Fira Sans', sans-serif",
            fontWeight: 600,
            fontSize: 14,
            letterSpacing: '1px',
            color: '#E11D48',
          }}
        >
          {displayText.media}
        </span>
        <span
          style={{
            fontFamily: "'Fira Sans', sans-serif",
            fontWeight: 600,
            fontSize: 14,
            letterSpacing: '1px',
            color: '#e4e4e7',
          }}
        >
          {displayText.sphere}
        </span>
      </div>

      {/* Anamorphic streak */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '-15%',
          right: '-15%',
          height: '0.5px',
          background: 'linear-gradient(90deg, transparent, rgba(225,29,72,0.3) 20%, rgba(255,255,255,0.15) 50%, rgba(225,29,72,0.3) 80%, transparent)',
          animation: 'streakSweep 4s ease-in-out infinite',
          pointerEvents: 'none',
          zIndex: 5,
          transform: 'translateY(-50%)',
        }}
      />
    </div>
  );
}
