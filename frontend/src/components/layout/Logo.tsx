import { useState, useEffect } from 'react';

export function Logo() {
  const [hovering, setHovering] = useState(false);
  const [displayText, setDisplayText] = useState('MAM');

  useEffect(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      if (frame > 8) { setDisplayText('MAM'); clearInterval(interval); return; }
      setDisplayText(
        Array.from({ length: 3 }, (_, i) =>
          frame > i * 2 + 2 ? 'MAM'[i] : chars[Math.floor(Math.random() * chars.length)]
        ).join('')
      );
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="relative cursor-default select-none flex items-center gap-sm"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Main logo text */}
      <span
        className="font-mono text-[16px] font-semibold tracking-[4px] text-text relative inline-block leading-none"
        style={{ letterSpacing: '4px' }}
      >
        {displayText}
        {/* Red flare dot - sweeps right */}
        {hovering && (
          <span
            className="absolute top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, #E11D48, transparent)',
              boxShadow: '0 0 8px 4px rgba(225,29,72,0.6)',
              animation: 'flare-sweep-right 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            }}
          />
        )}
        {/* White flare dot - sweeps left */}
        {hovering && (
          <span
            className="absolute top-1/2 -translate-y-1/2 w-[4px] h-[4px] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.8), transparent)',
              boxShadow: '0 0 6px 3px rgba(255,255,255,0.4)',
              animation: 'flare-sweep-left 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            }}
          />
        )}
        {/* Anamorphic streak */}
        {hovering && (
          <span
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[1px] pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(225,29,72,0.4), transparent)',
              animation: 'anamorphic-stretch 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            }}
          />
        )}
      </span>
      {/* Subtitle - inline, reveals on hover */}
      <span
        className="font-sans text-[9px] tracking-[3px] uppercase transition-all duration-300 leading-none"
        style={{
          color: hovering ? 'var(--color-text-dim, #52525b)' : 'transparent',
          opacity: hovering ? 1 : 0,
          transform: hovering ? 'translateX(0)' : 'translateX(-4px)',
        }}
      >
        Media Asset Manager
      </span>
    </div>
  );
}
