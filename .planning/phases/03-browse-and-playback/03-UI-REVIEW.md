# Phase 03 — UI Review

**Audited:** 2026-03-29
**Baseline:** Abstract 6-pillar standards + Cinema Dark design system (design-system/mam/MASTER.md)
**Screenshots:** Not captured (no dev server running)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Copy is specific and contextual; one missing label on the icon-only close button |
| 2. Visuals | 3/4 | Hierarchy is clear; selected card state is weaker than design system spec (no glow) |
| 3. Color | 4/4 | Tokens used consistently throughout; no hardcoded hex values in component files |
| 4. Typography | 4/4 | Three font sizes, one explicit weight — clean scale; font-mono applied correctly |
| 5. Spacing | 3/4 | Several necessary arbitrary values; max-h-[3.25rem] is fragile for tag overflow |
| 6. Experience Design | 2/4 | Focus states absent, no prefers-reduced-motion guard, no focus trap in modal |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **No visible focus states on any interactive element** — keyboard users cannot determine which element is focused, violating WCAG 2.1 AA — add `focus-visible:outline-2 focus-visible:outline-cta focus-visible:outline-offset-2` as a global rule in `index.css` or in `tailwind.config.cjs` via a plugin, covering all `<button>` and `<a>` elements.

2. **Framer Motion animations have no prefers-reduced-motion guard** — users with vestibular disorders receive the full slide-in and fade-out animations regardless of system preference — wrap `transition` props in App.tsx and AssetGrid with a `useReducedMotion()` hook from `framer-motion` and set duration to 0 when it returns true.

3. **DeleteDialog modal has no focus trap and missing backdrop-blur** — keyboard users tab out of the modal into obscured content behind the overlay; the design system specifies `backdrop-filter: blur(4px)` on modal overlays — add `backdrop-blur-sm` to the overlay `div` in `DeleteDialog.tsx` and implement a focus trap (either a small custom hook or the `focus-trap-react` package).

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Copy is purposeful and domain-specific throughout. No generic "OK", "Submit", or "Click here" labels found.

**Passing:**
- Delete dialog copy is precise: "Remove from library" and "Delete file + library" clearly distinguish the two destructive actions, matching the context spec.
- Empty state in AssetGrid: "No assets found" with a Film icon — contextual and non-alarming.
- Status badge labels ("Ingesting...", "Transcribing...", "Transcription failed") match the pipeline stage language.
- Error copy in DetailPanel: "Asset not found" — brief and accurate.
- Transcript states: "Transcription pending...", "Transcribing..." — correct use of ellipsis for in-progress states.

**Issues:**
- `frontend/src/components/detail/DetailPanel.tsx:50` — The close button renders `<X className="w-5 h-5" />` with no `aria-label`. It has no visible text label. Screen readers will announce this as an unlabelled button. Fix: add `aria-label="Close detail panel"`.
- `frontend/src/components/shared/DeleteDialog.tsx:70` — The "Cancel" text link is technically valid copy but styled as the lowest-emphasis action using only `text-xs text-text-muted`. This is appropriate. No change needed.

---

### Pillar 2: Visuals (3/4)

Visual hierarchy is solid: TopBar anchors the layout, Sidebar provides navigation context, and the main content area has clear card structure. The detail panel slide-in creates a meaningful foreground/background relationship.

**Passing:**
- AppShell uses CSS Grid with explicit row/column sizing (`grid-rows-[48px_1fr]`, `grid-cols-[240px_1fr]`) — stable layout with no shifting.
- AssetCard respects the "no scale transforms on hover" rule — only border color changes on hover.
- StatusBadge uses the correct color coding from the design system: amber for processing, red for failed, muted for pending.
- Lucide icons used exclusively — no emojis.
- Thumbnail fallback uses a Film icon at `text-text-muted` — consistent with the dark aesthetic.

**Issues:**
- `frontend/src/components/assets/AssetCard.tsx:53` — Selected state uses `border-cta/50` (50% opacity CTA border). The design system card spec defines `border-color: #E11D48` at full opacity plus `box-shadow: 0 0 0 1px #E11D48, 0 0 12px rgba(225,29,72,0.2)` for selected cards. The current implementation is visually weaker — the 50% opacity border and absent glow make it harder to distinguish which card the detail panel belongs to. Fix: change to `border-cta shadow-accent` (using the `shadow-accent` token already in `tailwind.config.cjs`).
- `frontend/src/components/assets/AssetCard.tsx:54` — Unselected hover uses only `hover:border-border-hover` — no shadow lift. The design system card spec includes `box-shadow: 0 4px 16px rgba(0,0,0,0.5)` on hover. Fix: add `hover:shadow-md` (defined in Tailwind config).
- `frontend/src/components/detail/DetailPanel.tsx:50` — Close button has no visible label and no `aria-label` (see Copywriting). An icon-only button without a tooltip is a visual accessibility gap for new users.

---

### Pillar 3: Color (4/4)

Color discipline is excellent throughout all Phase 03 components.

**Passing:**
- Zero hardcoded hex values found in any `.tsx` file under `frontend/src/`.
- All color references use the custom Tailwind tokens: `bg-background`, `bg-panel`, `bg-cta`, `text-text`, `text-text-muted`, `border-border`, `text-status-*`, `bg-status-*`.
- Status colors map correctly: `text-status-processing` (amber `#F59E0B`), `text-status-failed` (red `#E11D48`), `text-status-pending` (muted `#94A3B8`).
- Accent color (`bg-cta`) used only on active/interactive elements: active sidebar tags, the "Delete file + library" primary button, the transcript active segment highlight (`bg-cta/20`). The 60/30/10 ratio is maintained.
- Muted text (`text-text-muted`) used correctly for secondary metadata — date, codec, timecodes.
- No light backgrounds introduced. All surfaces remain `bg-background` or `bg-panel`.

---

### Pillar 4: Typography (4/4)

Typography scale is tight and well-disciplined.

**Font sizes in use across Phase 03 components:**
- `text-xs` — metadata row labels, tag badges, timecodes, status badge text
- `text-sm` — primary body content in cards and detail panel, button labels
- `text-lg` — TopBar "MAM" heading

Three sizes across the entire UI is exemplary discipline for a data-dense dashboard. The design system does not restrict to fewer than four sizes, so this is compliant.

**Font weights in use:**
- `font-semibold` (600) — headings, active sidebar tags, metadata labels
- Default body weight (400) — all other text via `font-family: 'Fira Sans'` in `body` rule

Only two weights used — exactly matching the design system constraint (400 and 600 only; 500 excluded).

**Font families:**
- `font-mono` (Fira Code) applied correctly: TopBar heading, metadata values, timecodes in transcript. Matches design system rule: "Fira Code for headings/monospace data".
- Body copy inherits `font-sans` (Fira Sans) from `body` rule in `index.css`.

**Minor note:** Google Fonts loads weights 300, 400, 500, 600, 700 for both families (per `index.html`). The CLAUDE.md design system correction specifies only 400 and 600 are used. Weights 300, 500, and 700 are loaded but never applied — this is a minor bandwidth waste, not a visual issue. Not scored down since no incorrect weights appear in the rendered UI.

---

### Pillar 5: Spacing (3/4)

Spacing is predominantly consistent and uses Tailwind's standard scale. Arbitrary values are used where genuinely needed but include one fragile case.

**Passing:**
- Padding and gap values use numeric Tailwind tokens: `p-4`, `p-3`, `px-4`, `py-3`, `gap-1`, `gap-2`, `gap-3`, `gap-6` — all standard 4px increments.
- The custom spacing tokens defined in `tailwind.config.cjs` (`xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`) appear in `ImportView.tsx` but not yet in Phase 03 components — this inconsistency is minor since the numeric equivalents are used.

**Arbitrary values found:**
- `App.tsx:30` — `mr-[40vw]` and `w-[40vw]`: Required for the 40vw detail panel layout. Acceptable — this is a layout constraint from the design spec, not a magic number.
- `App.tsx:46` — `h-[calc(100vh-48px)]`: Required to account for the 48px TopBar. Acceptable — there is no standard token for this calculation.
- `TranscriptList.tsx:109` — `max-h-[40vh]`: Sets a viewport-relative max height for the transcript scroll area. Acceptable for a dynamic viewport constraint.
- `AssetCard.tsx:63` — `w-[260px]`: Fixed thumbnail width per design context decision. Acceptable.
- `AssetCard.tsx:95` — `max-h-[3.25rem]`: This is fragile. It attempts to clip tags to two lines but uses a magic pixel value (3.25rem = 52px) tied to line-height assumptions. If the tag font size or line-height changes, this clips at the wrong point. Fix: replace with `line-clamp-2` on the inner tag spans or use CSS `overflow: hidden` on the flex container with a `height: 2lh` (two line heights) approach. A simpler fix: add a maximum tag count render limit in the component logic rather than relying on height overflow.
- `AssetGrid.tsx:58` — `h-[140px]` on skeleton: Magic number for loading skeleton height. Should match the actual card height. Acceptable as a pragmatic skeleton approximation.
- `AssetContextMenu.tsx:44` — `min-w-[160px]`: Reasonable minimum width for a context menu. Acceptable.

---

### Pillar 6: Experience Design (2/4)

State coverage is comprehensive (loading, error, empty, in-progress all handled) but the interaction layer has three meaningful gaps: missing focus styles, no reduced-motion guard, and no focus trap in the modal.

**Passing — State coverage:**
- AssetGrid: loading skeleton (3 pulse cards), empty state with icon, error state deferred to component failure.
- DetailPanel: loading skeleton (3 pulse divs), error state ("Asset not found").
- Sidebar: loading skeleton (5 pulse bars), empty state ("No tags yet").
- TranscriptList: full state machine — pending, processing, loading, failed, empty, and ready states all handled with appropriate visual indicators.
- DeleteDialog: `disabled={isDeleting}` + `disabled:opacity-50` on both buttons prevents double-submit.
- StatusBadge: animated pulse dot for in-progress states.

**Passing — Interaction patterns:**
- Escape key closes both DetailPanel and DeleteDialog (independent `keydown` listeners).
- Context menu closes on Escape and click-outside.
- Context menu has viewport boundary correction via `getBoundingClientRect`.
- Framer Motion `AnimatePresence` used for card exit animations and panel slide-in.
- `cursor-pointer` applied to all interactive elements: cards, sidebar buttons, context menu items, dialog buttons, transcript segments, close button.
- Delete flow closes the detail panel when the open asset is deleted (`onSelectAsset(null)` in `handleDeleted`).

**Issues:**

1. **No focus styles on any interactive element** (`frontend/src/index.css`, all component files) — No `focus-visible` CSS is defined anywhere in the application. Tailwind's default focus styles are `outline: none` (removed in the Preflight base reset). This means keyboard users have no visual indicator when navigating with Tab. This affects every `<button>` in the application. Fix: add to `index.css`:
   ```css
   *:focus-visible {
     outline: 2px solid #E11D48;
     outline-offset: 2px;
   }
   ```

2. **No `prefers-reduced-motion` guard** — `App.tsx` uses `transition={{ type: 'tween', duration: 0.3 }}` for the panel slide and AssetGrid uses `exit={{ opacity: 0, transition: { duration: 0.3 } }}` for card removal. Neither checks the user's motion preference. Framer Motion exports `useReducedMotion()` — this is the correct fix:
   ```tsx
   import { useReducedMotion } from 'framer-motion';
   const shouldReduceMotion = useReducedMotion();
   // then pass duration: shouldReduceMotion ? 0 : 0.3
   ```

3. **No focus trap in DeleteDialog** (`frontend/src/components/shared/DeleteDialog.tsx`) — The modal renders without trapping keyboard focus. Users can Tab out of the dialog into the blurred background content. The design system modal spec implies proper modal behavior. Fix: use the `focus-trap-react` package or implement a small hook that queries focusable elements within the dialog ref and cycles Tab/Shift-Tab within them.

4. **Missing `backdrop-blur` on DeleteDialog overlay** (`frontend/src/components/shared/DeleteDialog.tsx:38`) — The overlay uses `bg-black/60` but the design system modal spec specifies `backdrop-filter: blur(4px)`. The current implementation lacks this. Fix: add `backdrop-blur-sm` to the overlay `div` className.

5. **No skip navigation link** — As a single-page desktop app this is lower priority, but for completeness: there is no skip link to jump to the main content area. For a keyboard user who opens the app, they must Tab through the entire TopBar and Sidebar before reaching the asset grid. Acceptable for a single-user internal tool but worth noting.

---

## Registry Safety

No `components.json` detected — shadcn not initialized. Registry audit skipped.

---

## Files Audited

**Layout:**
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/TopBar.tsx`
- `frontend/src/components/layout/Sidebar.tsx`

**Assets:**
- `frontend/src/components/assets/AssetCard.tsx`
- `frontend/src/components/assets/AssetGrid.tsx`
- `frontend/src/components/assets/StatusBadge.tsx`
- `frontend/src/components/assets/AssetContextMenu.tsx`

**Shared:**
- `frontend/src/components/shared/DeleteDialog.tsx`

**Detail:**
- `frontend/src/components/detail/DetailPanel.tsx`
- `frontend/src/components/detail/VideoPlayer.tsx`
- `frontend/src/components/detail/MetadataSection.tsx`
- `frontend/src/components/detail/TranscriptList.tsx`

**App shell / config:**
- `frontend/src/App.tsx`
- `frontend/src/index.css`
- `frontend/tailwind.config.cjs`
- `frontend/index.html`

**Hooks / types / utilities (reviewed for UX patterns):**
- `frontend/src/hooks/useAssets.ts`
- `frontend/src/hooks/useTagFilter.ts`
- `frontend/src/types/asset.ts`
- `frontend/src/lib/formatters.ts`
