# Phase 4: Metadata Editing — Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Inline editing of title, description, and tags per asset in the detail panel. Global custom metadata field definitions in a new Settings page. Per-asset values for custom fields editable inline in the detail panel. No new browse, search, or playback capabilities.

Requirements: META-02, META-03, META-04

</domain>

<decisions>
## Implementation Decisions

### Title & Description Editing
- **Trigger**: Click the value to edit inline — the text becomes an input on click. No separate edit mode or edit button.
- **Save**: Blur or Enter saves; Escape cancels and reverts to original value.
- **Description field**: Auto-expanding textarea — starts at 1 line, grows as user types. No fixed height.
- **Grid sync**: After saving, invalidate the `assets` TanStack Query so the card in the grid immediately reflects the new title.
- **Empty state placeholder**: "No description" for description when empty; title falls back to `originalFilename` when null.

### Tag Editing Interaction
- **Adding tags**: A `+` button after the last tag chip opens a text input. As the user types, a dropdown autocomplete shows matching tags already in the library (fetched from `/api/tags`). Enter or click a suggestion to add. A "Create \u2018x\u2019" option at the bottom of the dropdown allows creating a new tag not yet in the library.
- **Removing tags**: Click `✕` on a tag chip to remove instantly — saves immediately, no confirmation.
- **Sidebar sync**: After any tag add/remove, invalidate the `tags` TanStack Query so sidebar counts update immediately.

### Custom Fields — Definition (Settings Page)
- **Location**: New `⚙ Settings` nav item at the bottom of the left sidebar (below Tags).
- **Settings page content**: Lists all global custom field definitions. Each row shows: field name, type badge, delete (`✕`) button.
- **Adding a field**: `+ Add field` button opens an inline form: field name input + type selector (text only in Phase 4, schema supports more later). Submit creates the field.
- **Deleting a field**: Cascade delete — removes the field definition AND all per-asset values via `ON DELETE CASCADE` (already in schema). No warning dialog — cascade is silent.
- **Field types in Phase 4**: Text only. The `field_type` column exists in schema for future expansion (number, date, boolean) — don't implement other types now.

### Custom Fields — Per-Asset Values (Detail Panel)
- **Location**: Rendered as a "Custom Fields" section in the detail panel, below the standard metadata grid.
- **Editing**: Same click-to-edit inline pattern as title/description — click the value to edit, blur/Enter to save, Escape to cancel.
- **Empty values**: Show a muted placeholder (e.g., `—`) that's still clickable to add a value.
- **No custom fields defined**: Hide the section entirely (don't show an empty section).

### Save Feedback
- **Success**: Field border briefly flashes accent green (`#E11D48` → green) for ~800ms, then fades. No toast.
- **Failure**: Field reverts to its previous value; border briefly flashes red for ~800ms. No toast — silent revert.
- **Approach**: Optimistic update in the UI while the PATCH request is in-flight; revert on error.

### Claude's Discretion
- Exact animation timing and easing for the border flash
- Autocomplete dropdown positioning and scroll behavior
- Settings page layout beyond the custom fields list (can be a simple page for now)
- Whether to debounce the autocomplete query or fire on every keystroke

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design system
- `design-system/mam/MASTER.md` — Cinema Dark tokens, component patterns, spacing, typography. All new UI must follow this.

### Prior phase context
- `.planning/phases/03-browse-and-playback/03-CONTEXT.md` — Detail panel decisions (40vw width, slide-in, content order), tag chip styling, sidebar nav decisions
- `.planning/phases/02-ingest-pipeline/02-CONTEXT.md` — Ingest pipeline decisions (referenced for any pipeline-related context)

### Requirements
- `.planning/REQUIREMENTS.md` §META-02, META-03, META-04 — Acceptance criteria for this phase

### Schema
- `backend/src/db/schema.ts` — assets table (user-editable fields: title, description, tags), custom_fields table, asset_custom_values EAV table (with CASCADE)

No external specs or ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/components/detail/MetadataSection.tsx` — Currently read-only grid of label/value pairs. Phase 4 converts title and description rows to click-to-edit inline inputs. Custom fields section to be added below.
- `frontend/src/components/detail/DetailPanel.tsx` — Houses MetadataSection, VideoPlayer, TranscriptList. Custom fields section + tag editing wired here.
- `frontend/src/lib/api.ts` — Already has `patchAssetTags(id, tags[])`. Needs: `patchAsset(id, { title, description })`, `fetchCustomFields()`, `createCustomField(name)`, `deleteCustomField(id)`, `patchCustomValue(assetId, fieldId, value)`.
- `frontend/src/hooks/useAssets.ts` — TanStack Query hooks for asset list. Tag and asset list invalidation goes here.
- `frontend/src/components/layout/Sidebar.tsx` — Add Settings nav item at bottom.
- `frontend/src/types/asset.ts` — Already has `title`, `description`, `tags` fields.

### Established Patterns
- TanStack Query for all data fetching and mutation — invalidate queries after mutations (established in Phase 3)
- Framer Motion for animations (installed, used for panel slide-in and card fade-out)
- Tailwind CSS with Cinema Dark custom tokens (`bg-background`, `bg-panel`, `text-text`, `border-border`, `bg-cta`)
- Click-to-edit is a new pattern in this codebase — establish it here for reuse in Phase 5+

### Integration Points
- Detail panel (`DetailPanel.tsx`) — existing `asset` prop passes all Asset fields; Phase 4 adds mutation callbacks
- Sidebar (`Sidebar.tsx`) — existing nav items; Settings item added at bottom
- App router (`App.tsx`) — Settings page needs a route (or replace the main content area conditionally)
- Backend `PATCH /api/assets/:id` — already exists; verify it accepts `{ title, description }` updates, not just tags
- New backend routes needed: `GET /api/custom-fields`, `POST /api/custom-fields`, `DELETE /api/custom-fields/:id`, `PUT /api/assets/:id/custom-values/:fieldId`

</code_context>

<specifics>
## Specific Ideas

- Tag autocomplete pattern: `[interview ✕] [tutorial ✕] [+]` → click `+` → input with dropdown showing matching existing tags + "Create 'x'" at bottom
- Save feedback: field border flash (green success, red failure) — no toasts, keep the UI quiet
- Settings page is intentionally minimal for Phase 4 — just the custom fields list; other settings can be added later

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-metadata-editing*
*Context gathered: 2026-03-29*
