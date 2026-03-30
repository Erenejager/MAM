interface AppShellProps {
  topBar: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ topBar, sidebar, children }: AppShellProps) {
  return (
    <div className="h-screen grid grid-rows-[auto_1fr] overflow-hidden bg-background">
      {topBar}
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
