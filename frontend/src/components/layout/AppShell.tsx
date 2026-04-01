import type { ReactNode } from 'react';

interface AppShellProps {
  topBar: ReactNode;
  children: ReactNode;
}

export function AppShell({ topBar, children }: AppShellProps) {
  return (
    <div className="flex flex-col h-screen relative z-[1]">
      {topBar}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
