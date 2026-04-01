# Liquid Glass Cinema Dark Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure MAM's frontend with liquid glass surfaces, collapsible sidebar navigation, command palette, spotlight cards, and ReactBits animations — all themed to Cinema Dark.

**Architecture:** Bottom-up approach. First install tooling (shadcn, ReactBits), then build the glass token system in Tailwind, then replace layout (sidebar + top bar), then upgrade each view component by component. Each task produces a working commit.

**Tech Stack:** React 18, Tailwind CSS 3, shadcn/ui (Radix primitives), ReactBits (animated components), Framer Motion, cmdk, Sonner.

**Spec:** `docs/superpowers/specs/2026-04-01-liquid-glass-redesign.md`

---

## Phase 1: Foundation

### Task 1: Initialize shadcn/ui

**Files:**
- Create: `frontend/components.json`
- Modify: `frontend/tailwind.config.cjs`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/lib/utils.ts` (if cn.ts needs moving)

- [ ] **Step 1: Initialize shadcn in the frontend directory**

```bash
cd frontend
npx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes
- Tailwind config path: `tailwind.config.cjs`
- Components alias: `@/components`
- Utils alias: `@/lib`

- [ ] **Step 2: Verify components.json was created**

```bash
cat frontend/components.json
```

Expected: JSON with registries containing `@shadcn`.

- [ ] **Step 3: Add ReactBits registry to components.json**

Edit `frontend/components.json` to add the ReactBits registry:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "registries": {
    "@react-bits": {
      "url": "https://reactbits.dev/r"
    }
  }
}
```

Keep all other fields shadcn generated.

- [ ] **Step 4: Verify the existing `cn.ts` utility works with shadcn**

Read `frontend/src/lib/cn.ts`. It should export `cn` using `clsx` + `twMerge`. If shadcn created a `utils.ts` with the same function, delete the duplicate and keep `cn.ts`. Update the import path in `components.json` if needed.

- [ ] **Step 5: Commit**

```bash
git add frontend/components.json frontend/tailwind.config.cjs frontend/src/index.css frontend/src/lib/
git commit -m "chore: initialize shadcn/ui with ReactBits registry"
```

---

### Task 2: Glass Token System

**Files:**
- Modify: `frontend/tailwind.config.cjs`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add glass color tokens to tailwind.config.cjs**

In the `extend.colors` section, add:

```js
glass: 'rgba(255,255,255,0.03)',
'glass-border': 'rgba(255,255,255,0.07)',
'glass-hover': 'rgba(255,255,255,0.06)',
'glass-strong': 'rgba(255,255,255,0.05)',
```

- [ ] **Step 2: Add glass backdrop-blur and glow utilities to tailwind.config.cjs**

Add a `plugins` section at the end of the config with custom utilities:

```js
plugins: [
  function({ addUtilities }) {
    addUtilities({
      '.glass-blur-sm': { 'backdrop-filter': 'blur(8px)', '-webkit-backdrop-filter': 'blur(8px)' },
      '.glass-blur': { 'backdrop-filter': 'blur(12px)', '-webkit-backdrop-filter': 'blur(12px)' },
      '.glass-blur-lg': { 'backdrop-filter': 'blur(20px)', '-webkit-backdrop-filter': 'blur(20px)' },
      '.glass-blur-xl': { 'backdrop-filter': 'blur(24px)', '-webkit-backdrop-filter': 'blur(24px)' },
      '.glow-cta-sm': { 'box-shadow': '0 0 8px rgba(225,29,72,0.2)' },
      '.glow-cta': { 'box-shadow': '0 0 12px rgba(225,29,72,0.25)' },
      '.glow-cta-lg': { 'box-shadow': '0 0 24px rgba(225,29,72,0.3)' },
    });
  },
],
```

- [ ] **Step 3: Add CSS custom properties for glass tokens to index.css**

After the existing `:root` block in `frontend/src/index.css`, add:

```css
:root {
  /* ... existing vars ... */
  --glass: rgba(255,255,255,0.03);
  --glass-border: rgba(255,255,255,0.07);
  --glass-hover: rgba(255,255,255,0.06);
  --glass-strong: rgba(255,255,255,0.05);
  --cta-glow: rgba(225,29,72,0.25);
  --cta-subtle: rgba(225,29,72,0.1);
}
```

- [ ] **Step 4: Add grainient background to body in index.css**

Replace the existing `body` rule:

```css
body {
  background: #0a0a14;
  background-image:
    radial-gradient(ellipse at 20% 50%, rgba(225,29,72,0.04) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 20%, rgba(45,42,94,0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 80%, rgba(225,29,72,0.03) 0%, transparent 50%);
  min-height: 100vh;
  color: var(--color-text);
}
```

- [ ] **Step 5: Add film grain overlay to index.css**

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 128px;
}
```

- [ ] **Step 6: Verify dev server starts with new tokens**

```bash
cd frontend && npm run dev
```

Open in browser. Background should show subtle red gradient bleed + film grain texture. No errors in console.

- [ ] **Step 7: Commit**

```bash
git add frontend/tailwind.config.cjs frontend/src/index.css
git commit -m "feat: add liquid glass token system and grainient background"
```

---

### Task 3: Install shadcn/ui Primitives

**Files:**
- Create: multiple files in `frontend/src/components/ui/`

- [ ] **Step 1: Install core shadcn components in batch**

```bash
cd frontend
npx shadcn@latest add button badge tabs dialog command context-menu tooltip progress separator card select switch alert-dialog skeleton slider scroll-area popover input
```

- [ ] **Step 2: Install sonner (toast notifications)**

```bash
cd frontend
npx shadcn@latest add sonner
```

- [ ] **Step 3: Install resizable panels**

```bash
cd frontend
npx shadcn@latest add resizable
```

- [ ] **Step 4: Verify components were created**

```bash
ls frontend/src/components/ui/
```

Expected: `button.tsx`, `badge.tsx`, `tabs.tsx`, `dialog.tsx`, `command.tsx`, `context-menu.tsx`, `tooltip.tsx`, `progress.tsx`, `separator.tsx`, `card.tsx`, `select.tsx`, `switch.tsx`, `alert-dialog.tsx`, `skeleton.tsx`, `slider.tsx`, `scroll-area.tsx`, `popover.tsx`, `input.tsx`, `sonner.tsx`, `resizable.tsx` (plus any supporting files).

- [ ] **Step 5: Install sidebar component**

```bash
cd frontend
npx shadcn@latest add sidebar
```

- [ ] **Step 6: Verify the dev server still builds**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add -A src/components/ui/ package.json package-lock.json
git commit -m "chore: install shadcn/ui primitives (20 components)"
```

---

### Task 4: Install ReactBits Components

**Files:**
- Create: files in `frontend/src/components/ui/` or ReactBits target directory

- [ ] **Step 1: Install ReactBits components via shadcn CLI**

```bash
cd frontend
npx shadcn@latest add @react-bits/spotlight-card
npx shadcn@latest add @react-bits/border-glow
npx shadcn@latest add @react-bits/star-border
npx shadcn@latest add @react-bits/animated-list
npx shadcn@latest add @react-bits/decrypted-text
npx shadcn@latest add @react-bits/glitch-text
npx shadcn@latest add @react-bits/count-up
npx shadcn@latest add @react-bits/click-spark
npx shadcn@latest add @react-bits/elastic-slider
```

Note: If any fail via shadcn CLI, install from npm (`npm install react-bits` — already in package.json as `react-bits: ^1.0.5`) and import directly.

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd frontend && git add -A
git commit -m "chore: install ReactBits animated components"
```

---

## Phase 2: Layout Restructure

### Task 5: Collapsible Sidebar

**Files:**
- Create: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create Sidebar component**

Create `frontend/src/components/layout/Sidebar.tsx`:

```tsx
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
            activeView === id
              ? 'bg-[var(--cta-subtle)] text-cta'
              : 'text-text-muted'
          )}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
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
```

- [ ] **Step 2: Update AppShell to use sidebar layout**

Replace `frontend/src/components/layout/AppShell.tsx` contents:

```tsx
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
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update App.tsx to pass sidebar**

In `frontend/src/App.tsx`:

1. Add import: `import { Sidebar } from './components/layout/Sidebar';`
2. Remove navigation-related props from TopBar (the `onNavigate` and `activeView` props — these move to Sidebar)
3. Add `<Sidebar activeView={view} onNavigate={handleNavigate} />` as the `sidebar` prop to AppShell
4. Update both AppShell instances (the detail-view one and the main one) to pass `sidebar={<Sidebar activeView={view} onNavigate={handleNavigate} />}`

- [ ] **Step 4: Verify the layout renders**

```bash
cd frontend && npm run dev
```

Open in browser. Left sidebar with 3 icons should appear. Clicking them should switch views.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/Sidebar.tsx frontend/src/components/layout/AppShell.tsx frontend/src/App.tsx
git commit -m "feat: add collapsible sidebar navigation with dock-style hover"
```

---

### Task 6: Inline Top Bar

**Files:**
- Modify: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 1: Rewrite TopBar as inline search bar**

Replace `frontend/src/components/layout/TopBar.tsx` with a slim top bar:

```tsx
import { Search, LayoutGrid, ArrowDownNarrowWide } from 'lucide-react';
import { FilterBar } from './FilterBar';

interface TopBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  searchQuery: string;
  searchUnavailable: boolean;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onOpenCommandPalette: () => void;
  viewTitle: string;
}

export function TopBar({
  searchQuery,
  searchUnavailable,
  selectedTags,
  onToggleTag,
  onOpenCommandPalette,
  viewTitle,
}: TopBarProps) {
  return (
    <div className="flex-shrink-0">
      {searchUnavailable && (
        <div className="px-md py-xs bg-cta/10 border-b border-cta/20 text-center text-xs text-cta">
          Search service unavailable — results limited to local database
        </div>
      )}
      <div className="h-[52px] bg-[rgba(15,15,30,0.5)] glass-blur-xl border-b border-glass-border flex items-center px-xl gap-sm">
        <span className="font-mono text-[13px] font-semibold text-text tracking-[0.5px]">
          {viewTitle}
        </span>

        <button
          onClick={onOpenCommandPalette}
          className="flex-1 max-w-[420px] py-[7px] px-sm bg-glass border border-glass-border rounded-[10px] text-xs text-text-dim flex items-center gap-sm cursor-pointer transition-all duration-200 hover:bg-glass-hover hover:border-border-hover glass-blur"
        >
          <Search size={14} className="opacity-50" />
          {searchQuery || 'Search assets...'}
          <span className="ml-auto py-[2px] px-[6px] bg-glass-hover rounded text-[10px] font-mono text-text-dim">
            ⌘K
          </span>
        </button>

        <div className="ml-auto flex gap-xs">
          <button className="w-[32px] h-[32px] rounded bg-glass border border-glass-border flex items-center justify-center text-text-muted hover:bg-glass-hover hover:text-text transition-all duration-200">
            <LayoutGrid size={15} />
          </button>
          <button className="w-[32px] h-[32px] rounded bg-glass border border-glass-border flex items-center justify-center text-text-muted hover:bg-glass-hover hover:text-text transition-all duration-200">
            <ArrowDownNarrowWide size={15} />
          </button>
        </div>
      </div>

      {selectedTags.length > 0 && (
        <FilterBar selectedTags={selectedTags} onToggleTag={onToggleTag} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update FilterBar to use glass chips**

Update `frontend/src/components/layout/FilterBar.tsx` to use glass-styled chips with CTA-subtle active backgrounds and a `+ Filter` button. Replace existing styling with glass tokens.

- [ ] **Step 3: Update App.tsx TopBar props**

Update both TopBar instances in App.tsx:
- Remove `onNavigate` and `activeView` props (now on Sidebar)
- Add `onOpenCommandPalette` prop (wire to a state variable `cmdOpen` — implement in Task 7)
- Add `viewTitle` prop: map `view` to display name (`'library' → 'Library'`, etc.)

- [ ] **Step 4: Verify top bar renders**

```bash
cd frontend && npm run dev
```

Open in browser. Slim top bar with search trigger, view title, and action buttons.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/TopBar.tsx frontend/src/components/layout/FilterBar.tsx frontend/src/App.tsx
git commit -m "feat: inline top bar with glass search trigger and filter chips"
```

---

### Task 7: Command Palette

**Files:**
- Create: `frontend/src/components/layout/CommandPalette.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create CommandPalette component**

Create `frontend/src/components/layout/CommandPalette.tsx` using shadcn's `command` and `dialog` components:

```tsx
import { useEffect, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { Video, Upload, Settings, Filter, Search } from 'lucide-react';
import { useAssets } from '../../hooks/useAssets';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectAsset: (id: string) => void;
  onNavigate: (view: 'library' | 'import' | 'settings') => void;
  onSearch: (query: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onSelectAsset,
  onNavigate,
  onSearch,
}: CommandPaletteProps) {
  const { data: assets } = useAssets();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search assets, tags, actions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => { onNavigate('import'); onOpenChange(false); }}>
            <Upload size={14} className="mr-sm opacity-50" />
            Import new video
            <span className="ml-auto font-mono text-[10px] text-text-dim">⌘I</span>
          </CommandItem>
          <CommandItem onSelect={() => { onSearch(query); onOpenChange(false); }}>
            <Search size={14} className="mr-sm opacity-50" />
            Search for "{query || '...'}"
          </CommandItem>
          <CommandItem onSelect={() => { onNavigate('settings'); onOpenChange(false); }}>
            <Settings size={14} className="mr-sm opacity-50" />
            Settings
            <span className="ml-auto font-mono text-[10px] text-text-dim">⌘,</span>
          </CommandItem>
        </CommandGroup>

        {assets && assets.length > 0 && (
          <CommandGroup heading="Assets">
            {assets.slice(0, 8).map((asset) => (
              <CommandItem
                key={asset.id}
                onSelect={() => { onSelectAsset(asset.id); onOpenChange(false); }}
              >
                <Video size={14} className="mr-sm opacity-50" />
                {asset.title || asset.originalFilename}
                <span className="ml-auto font-mono text-[10px] text-text-dim">
                  {asset.duration}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 2: Wire CommandPalette into App.tsx**

In `frontend/src/App.tsx`:

1. Add state: `const [cmdOpen, setCmdOpen] = useState(false);`
2. Add keyboard shortcut in a useEffect:
```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCmdOpen((prev) => !prev);
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```
3. Render `<CommandPalette>` with props
4. Pass `onOpenCommandPalette={() => setCmdOpen(true)}` to TopBar

- [ ] **Step 3: Style the command dialog with glass tokens**

Override the default shadcn dialog styles in `frontend/src/components/ui/command.tsx` or via className overrides:
- Dialog overlay: `bg-black/50 glass-blur-sm`
- Dialog content: `bg-[rgba(20,20,35,0.9)] glass-blur-xl border-glass-border rounded-xl`

- [ ] **Step 4: Verify Ctrl+K opens command palette**

```bash
cd frontend && npm run dev
```

Press Ctrl+K. Modal should appear with glass surface, search input, action items.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/CommandPalette.tsx frontend/src/App.tsx frontend/src/components/ui/command.tsx
git commit -m "feat: command palette with glass surface and keyboard shortcuts"
```

---

## Phase 3: Component Upgrades

### Task 8: Glass Asset Cards with Spotlight

**Files:**
- Modify: `frontend/src/components/assets/AssetCard.tsx`
- Modify: `frontend/src/components/assets/AssetGrid.tsx`
- Modify: `frontend/src/components/assets/StatusBadge.tsx`

- [ ] **Step 1: Add spotlight effect to AssetCard**

In `frontend/src/components/assets/AssetCard.tsx`, add a mouse-tracking spotlight:

1. Add `onMouseMove` handler that computes cursor position as percentage and sets CSS custom properties `--mx` and `--my`
2. Add a `::before` pseudo-element (via a div) with `radial-gradient(circle at var(--mx) var(--my), rgba(255,255,255,0.06), transparent 60%)`
3. Update card wrapper styles to use glass tokens: `border-glass-border`, `bg-panel`, hover: `border-border-hover`, `translateY(-3px) scale(1.01)`, `shadow-[0_12px_40px_rgba(0,0,0,0.5)]`
4. Selected state: `border-cta/40`, `glow-cta`, animated rotating border gradient

- [ ] **Step 2: Add glass styling to StatusBadge**

Update `frontend/src/components/assets/StatusBadge.tsx` to add `glass-blur-sm` and `border border-[rgba(255,255,255,0.08)]` to all badge variants.

- [ ] **Step 3: Add staggered entry animation to AssetGrid**

In `frontend/src/components/assets/AssetGrid.tsx`, wrap grid items with staggered animation:
- Each card gets `animation: listIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) backwards` with increasing `animation-delay` (index * 50ms)
- Define `listIn` keyframe: from `translateY(16px) scale(0.97) opacity(0) blur(4px)` to identity

- [ ] **Step 4: Update duration badge and tag pills with glass**

In AssetCard, update:
- Duration badge: add `glass-blur-sm border border-[rgba(255,255,255,0.08)]`
- Tag pills: add `glass-blur-sm border border-[rgba(255,255,255,0.08)]`

- [ ] **Step 5: Verify cards render with new effects**

```bash
cd frontend && npm run dev
```

Hover over cards — spotlight follows cursor. Selected card has red glow border. Cards stagger in on load.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/assets/
git commit -m "feat: glass asset cards with spotlight hover and staggered entry"
```

---

### Task 9: Detail Panel with Resizable Split

**Files:**
- Modify: `frontend/src/components/detail/DetailPanel.tsx`
- Modify: `frontend/src/components/detail/VideoPlayer.tsx`
- Modify: `frontend/src/components/detail/MetadataSection.tsx`
- Modify: `frontend/src/components/detail/TranscriptList.tsx`
- Modify: `frontend/src/components/detail/TranscriptSearch.tsx`
- Modify: `frontend/src/components/detail/TagEditor.tsx`
- Modify: `frontend/src/components/detail/CustomFieldsSection.tsx`

- [ ] **Step 1: Replace fixed split with shadcn resizable**

In `frontend/src/components/detail/DetailPanel.tsx`:

1. Import `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` from `../ui/resizable`
2. Replace the fixed 60/40 flex layout with:
```tsx
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={60} minSize={40}>
    <VideoPlayer ... />
  </ResizablePanel>
  <ResizableHandle className="w-[4px] bg-glass-border hover:bg-glass-hover transition-colors" />
  <ResizablePanel defaultSize={40} minSize={25}>
    {/* Tabs content */}
  </ResizablePanel>
</ResizablePanelGroup>
```

- [ ] **Step 2: Replace custom tabs with shadcn tabs**

Replace the custom tab implementation with shadcn `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. Style the trigger active state with CTA underline.

- [ ] **Step 3: Glass-ify metadata fields**

In `frontend/src/components/detail/MetadataSection.tsx`:
- Inline edit fields: `bg-glass border border-glass-border rounded-lg` with `hover:border-border-hover hover:bg-glass-hover`
- Focus state: `focus-within:border-cta/40 focus-within:shadow-[0_0_0_3px_rgba(225,29,72,0.1)]`
- File details grid: Each cell becomes a glass mini-card with `bg-glass border border-glass-border rounded-lg p-sm`

- [ ] **Step 4: Glass-ify tag editor**

In `frontend/src/components/detail/TagEditor.tsx`:
- Tag pills: `bg-glass glass-blur-sm border border-glass-border rounded-lg` with `hover:border-cta/30`
- Add button: dashed border, `hover:border-cta hover:text-cta`
- Dropdown: `bg-[rgba(20,20,35,0.9)] glass-blur-xl border-glass-border`

- [ ] **Step 5: Glass-ify transcript components**

In TranscriptList.tsx and TranscriptSearch.tsx:
- Search input: glass input style
- Active segment: left CTA border with subtle highlight background
- Segments: hover state with glass-hover background

- [ ] **Step 6: Update detail panel header**

Back button: glass icon button. Title: Fira Code font. Header background: `bg-[rgba(12,12,20,0.92)] glass-blur-xl`.

- [ ] **Step 7: Verify detail panel**

Open an asset. Drag the resize handle. Switch tabs. Edit a field. Check transcript.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/detail/
git commit -m "feat: resizable detail panel with glass surfaces and shadcn tabs"
```

---

### Task 10: Toast Notifications

**Files:**
- Modify: `frontend/src/App.tsx` (or layout root)
- Modify: `frontend/src/components/detail/MetadataSection.tsx`
- Modify: `frontend/src/components/detail/TagEditor.tsx`

- [ ] **Step 1: Add Sonner Toaster to app root**

In `frontend/src/App.tsx`, add:

```tsx
import { Toaster } from './components/ui/sonner';
// In the JSX, after the closing AppShell:
<Toaster position="bottom-right" theme="dark" />
```

- [ ] **Step 2: Replace flash states with toast calls**

In MetadataSection and TagEditor, replace the 800ms border flash on save/error with:

```tsx
import { toast } from 'sonner';

// On success:
toast.success('Tags updated');

// On error:
toast.error('Failed to save — ' + error.message);
```

- [ ] **Step 3: Style the toaster with glass tokens**

Override Sonner's default theme to match glass surface: `bg-[rgba(20,20,35,0.9)] glass-blur-lg border-glass-border`. Pass `toastOptions` className.

- [ ] **Step 4: Verify toasts appear**

Edit a tag, save. A glass toast should appear bottom-right. Auto-dismisses after 3s.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/detail/MetadataSection.tsx frontend/src/components/detail/TagEditor.tsx frontend/src/components/ui/sonner.tsx
git commit -m "feat: glass toast notifications replacing silent flash states"
```

---

### Task 11: Enhanced Import View

**Files:**
- Modify: `frontend/src/components/ImportView.tsx`

- [ ] **Step 1: Glass-ify the drop zone**

Update the drop zone container:
- Surface: `bg-glass glass-blur border border-dashed border-glass-border rounded-xl`
- Drag active: `border-cta glow-cta` + pulsing animation
- Icon and text: use existing Lucide icons, update colors to glass tokens

- [ ] **Step 2: Glass-ify the progress state**

Update the upload/polling progress UI:
- Progress bar: use shadcn `Progress` component, override track with glass, fill with CTA + glow
- Stage label: show current pipeline stage below the bar
- Elapsed time: Fira Code monospace

- [ ] **Step 3: Glass-ify success and error states**

- Success: green checkmark with glass card, count-up animation on the 100%
- Error: red X with glass card, retry button as CTA ghost

- [ ] **Step 4: Verify import flow**

Upload a file. Watch progress through stages. Verify glass styling on each state.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ImportView.tsx
git commit -m "feat: glass import view with enhanced progress states"
```

---

### Task 12: Settings Page

**Files:**
- Modify: `frontend/src/components/settings/SettingsPage.tsx`

- [ ] **Step 1: Wrap sections in glass cards**

Replace the flat layout with shadcn `Card` components for each section:

1. **Custom Fields** card — existing field CRUD with glass inputs
2. **Storage Info** card — display STORAGE_ROOT path, show basic stats
3. **Pipeline Status** card — show OpenSearch connectivity status

- [ ] **Step 2: Style the custom field form**

- Input: glass input style
- Add button: CTA with glow
- Field list: glass rows with separator between items
- Delete: `AlertDialog` for confirmation instead of immediate delete
- Type badge: show "text" as a glass badge

- [ ] **Step 3: Add storage and pipeline info sections**

These are read-only display cards. Fetch from existing API endpoints or show static config info. Use glass mini-cards similar to the file details grid in the detail panel.

- [ ] **Step 4: Verify settings page**

Navigate to settings via sidebar. All sections should render as glass cards.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/SettingsPage.tsx
git commit -m "feat: glass settings page with sectioned cards"
```

---

### Task 13: Context Menu for Asset Cards

**Files:**
- Modify: `frontend/src/components/assets/AssetContextMenu.tsx`
- Modify: `frontend/src/components/assets/AssetGrid.tsx`

- [ ] **Step 1: Replace custom context menu with shadcn**

Replace the hand-rolled context menu in `AssetContextMenu.tsx` with shadcn's `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`:

```tsx
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
```

- [ ] **Step 2: Style with glass tokens**

Override the content className: `bg-[rgba(20,20,35,0.9)] glass-blur-xl border-glass-border`

- [ ] **Step 3: Add menu items**

Items: Open, Edit tags, Rename, Separator, Delete (destructive — red text)

- [ ] **Step 4: Wire into AssetGrid**

Wrap each `AssetCard` in a `ContextMenuTrigger`. The `ContextMenuContent` renders the menu items with handlers.

- [ ] **Step 5: Verify right-click**

Right-click an asset card. Glass context menu should appear with options.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/assets/AssetContextMenu.tsx frontend/src/components/assets/AssetGrid.tsx
git commit -m "feat: glass context menu for asset cards using shadcn"
```

---

### Task 14: Logo with Decrypted Text

**Files:**
- Modify: `frontend/src/components/layout/Logo.tsx`

- [ ] **Step 1: Add decrypted text effect to logo**

If ReactBits `DecryptedText` component was installed, import and use it. Otherwise, implement a simple scramble effect:

In `Logo.tsx`, on mount, animate the "MAM" text through random characters before settling. Keep the existing lens flare hover animation.

- [ ] **Step 2: Update the sidebar logo to use the same component**

In `Sidebar.tsx`, replace the static "M" with a mini version of the decrypted text (single character, faster animation).

- [ ] **Step 3: Verify**

Refresh the page. Logo text should scramble-reveal on load.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Logo.tsx frontend/src/components/layout/Sidebar.tsx
git commit -m "feat: decrypted text animation on logo reveal"
```

---

## Phase 4: Final Polish

### Task 15: Delete Dialog Upgrade

**Files:**
- Modify: `frontend/src/components/shared/DeleteDialog.tsx`

- [ ] **Step 1: Replace custom modal with shadcn AlertDialog**

Use `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel`.

- [ ] **Step 2: Style with glass**

Content: glass surface. Cancel button: ghost glass. Delete button: CTA destructive with glow.

- [ ] **Step 3: Verify**

Right-click card → Delete. Glass alert dialog should appear.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/shared/DeleteDialog.tsx
git commit -m "feat: glass alert dialog for delete confirmation"
```

---

### Task 16: Build Verification & Cleanup

**Files:**
- Modify: any files with TypeScript errors or unused imports

- [ ] **Step 1: Run full build**

```bash
cd frontend && npm run build
```

Fix any TypeScript errors.

- [ ] **Step 2: Remove unused old components**

If any old components are fully replaced (e.g., old SearchInput.tsx if command palette replaced it, old FilterDropdown.tsx), delete them.

- [ ] **Step 3: Verify all views work end-to-end**

1. Library grid loads with staggered animation
2. Hover cards show spotlight
3. Click card opens detail panel with resizable split
4. Ctrl+K opens command palette
5. Right-click shows context menu
6. Edit metadata shows toast on save
7. Import view shows glass drop zone
8. Settings page shows sectioned cards
9. Sidebar navigation works
10. Film grain background is visible

- [ ] **Step 4: Final commit**

```bash
cd frontend && git add -A
git commit -m "chore: build verification and cleanup for liquid glass redesign"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Foundation | 1-4 | shadcn + ReactBits installed, glass tokens, grainient background |
| 2. Layout | 5-7 | Sidebar, inline top bar, command palette |
| 3. Components | 8-14 | Glass cards, detail panel, toasts, import, settings, context menu, logo |
| 4. Polish | 15-16 | Delete dialog, build verification, cleanup |
