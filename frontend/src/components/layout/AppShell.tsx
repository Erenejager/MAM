import type { ReactNode } from 'react';

interface AppShellProps {
  topBar: ReactNode;
  children: ReactNode;
}

export function AppShell({ topBar, children }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen relative">
      <div className="relative z-20">{topBar}</div>
      <main className="flex-1 overflow-hidden relative z-10">{children}</main>
    </div>
  );
}
