import { cn } from '../../lib/cn';
import { Grid3X3, Upload, Settings, HelpCircle } from 'lucide-react';

type View = 'library' | 'import' | 'settings';

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  importCount?: number;
}

const navItems: { id: View; icon: typeof Grid3X3; label: string }[] = [
  { id: 'library', icon: Grid3X3, label: 'Library' },
  { id: 'import', icon: Upload, label: 'Import' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export function Sidebar({ activeView, onNavigate, importCount }: SidebarProps) {
  return (
    <nav className="w-[56px] flex flex-col items-center py-md gap-xs flex-shrink-0 bg-[rgba(15,15,30,0.7)] glass-blur-xl border-r border-glass-border z-10">
      <div className="font-mono font-semibold text-sm text-cta mb-xl tracking-[2px] [text-shadow:0_0_20px_var(--cta-glow)]">
        M
      </div>
      {navItems.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          title={label}
          className={cn(
            'w-[36px] h-[36px] rounded-[10px] flex items-center justify-center relative',
            'transition-all duration-200 cursor-pointer',
            'hover:scale-[1.3] hover:bg-glass-hover hover:text-text',
            activeView === id ? 'bg-[var(--cta-subtle)] text-cta' : 'text-text-muted'
          )}
          style={{ transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          {activeView === id && (
            <span className="absolute left-[-14px] w-[3px] h-[20px] bg-cta rounded-r-sm glow-cta-sm" />
          )}
          <Icon size={18} />
          {id === 'import' && importCount != null && importCount > 0 && (
            <span className="absolute -top-[2px] -right-[2px] w-[14px] h-[14px] bg-cta rounded-full text-[8px] flex items-center justify-center text-white font-semibold glow-cta-sm">
              {importCount}
            </span>
          )}
        </button>
      ))}
      <div className="flex-1" />
      <button
        title="Keyboard shortcuts"
        className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center text-text-dim opacity-40 hover:opacity-70 transition-opacity"
      >
        <HelpCircle size={18} />
      </button>
    </nav>
  );
}
