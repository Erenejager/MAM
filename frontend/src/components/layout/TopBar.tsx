import { Film } from 'lucide-react';

export function TopBar() {
  return (
    <header className="h-12 bg-panel border-b border-border flex items-center px-4 gap-2 shrink-0">
      <Film className="w-5 h-5 text-cta" />
      <h1 className="font-mono font-semibold text-text text-lg">MAM</h1>
    </header>
  );
}
