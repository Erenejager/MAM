import type { ReactNode } from 'react';

interface AppShellProps {
  sidebar: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
}

export function AppShell({ sidebar, topBar, children }: AppShellProps) {
  return (
    <div className="flex h-screen relative z-[1]">
      {sidebar}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {topBar}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
