import { type ReactNode } from 'react';

interface AppShellProps {
  topBar: ReactNode;
  children: ReactNode;
}

export function AppShell({ topBar, children }: AppShellProps) {
  return (
    <div className="grid grid-rows-[auto_1fr] min-h-screen">
      {topBar}
      <main className="overflow-hidden">{children}</main>
    </div>
  );
}
