import { TopBar } from './TopBar';

interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="h-screen grid grid-rows-[48px_1fr] overflow-hidden bg-background">
      <TopBar />
      <div className="grid grid-cols-[240px_1fr] overflow-hidden">
        <aside className="bg-panel border-r border-border overflow-y-auto">
          {sidebar}
        </aside>
        <main className="overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
