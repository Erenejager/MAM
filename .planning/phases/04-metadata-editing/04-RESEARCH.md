# Phase 4: Metadata Editing - Research

**Researched:** 2026-03-29
**Domain:** Inline editing UI, CRUD API routes, optimistic mutations, OpenSearch re-indexing
**Confidence:** HIGH

## Summary

Phase 4 adds user-editable metadata to the MAM application. The work spans three layers: (1) backend API routes for editing title/description, managing custom field definitions, and persisting per-asset custom values; (2) frontend inline-edit components (a new pattern in this codebase); and (3) async OpenSearch re-indexing after any metadata write to keep the search index current.

The existing codebase provides strong foundations. The database schema already has all three tables (`assets`, `custom_fields`, `asset_custom_values`) with correct CASCADE constraints. The PATCH endpoint at `/api/assets/:id` exists but only handles `tags` -- it needs to be extended to accept `title` and `description`. TanStack Query v5 is already in use with established query key conventions. Framer Motion is installed for animations. No new dependencies are required.

**Primary recommendation:** Build the inline-edit components as reusable primitives (`InlineEditText`, `InlineEditTextarea`) that encapsulate the click-to-edit, save-on-blur, optimistic update, and border flash feedback patterns. Wire them through TanStack Query `useMutation` with `onMutate`/`onError`/`onSettled` for optimistic updates. Add backend routes in a new `custom-fields.ts` route file to keep separation of concerns. Trigger OpenSearch re-index as a fire-and-forget call after each successful SQLite write.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Title & Description Editing**: Click value to edit inline -- text becomes input on click. Blur or Enter saves; Escape cancels. Description uses auto-expanding textarea (starts 1 line, grows). Grid sync via TanStack Query invalidation. Empty title falls back to originalFilename; empty description shows "No description".
- **Tag Editing**: `+` button opens text input with autocomplete dropdown showing existing tags from `/api/tags`. Enter or click suggestion to add. "Create 'x'" option for new tags. Click `x` on chip to remove instantly. Sidebar sync via query invalidation.
- **Custom Fields Definition (Settings Page)**: New Settings nav item at bottom of sidebar. Lists all global custom field definitions. `+ Add field` inline form with name input + type selector (text only in Phase 4). Delete cascades silently -- no confirmation dialog.
- **Custom Fields Per-Asset Values (Detail Panel)**: "Custom Fields" section below standard metadata grid. Same click-to-edit pattern. Empty values show muted em dash. Section hidden when no custom fields defined.
- **Save Feedback**: Border flash (green success ~800ms, red failure ~800ms). Optimistic update; revert on error. No toasts.

### Claude's Discretion
- Exact animation timing and easing for the border flash
- Autocomplete dropdown positioning and scroll behavior
- Settings page layout beyond the custom fields list
- Whether to debounce the autocomplete query or fire on every keystroke

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| META-02 | User can edit title and description per asset | Extend existing PATCH `/api/assets/:id` to accept `{ title, description }`; InlineEditText/InlineEditTextarea components with optimistic mutation; OpenSearch re-index after write |
| META-03 | User can add and remove tags (multi-value) per asset | TagEditor component with autocomplete dropdown; reuse existing `patchAssetTags` API; client-side filtering from cached `/api/tags` data |
| META-04 | Admin can define global custom metadata fields applied to all assets | New CRUD routes for `custom_fields` table; new PUT route for `asset_custom_values`; SettingsPage component; CustomFieldsSection in detail panel |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.3.x | UI framework | Already installed |
| TanStack Query | 5.95.x | Server state, mutations, optimistic updates | Already installed, established patterns |
| Framer Motion | 12.38.x | AnimatePresence for autocomplete dropdown | Already installed |
| Lucide React | 1.6.x | Icons (X, Plus, Settings) | Already installed |
| Fastify | 4.x | Backend HTTP framework | Already installed |
| Drizzle ORM | 0.36.x | Database queries | Already installed |
| Tailwind CSS | 3.4.x | Styling | Already installed, locked to v3 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx + tailwind-merge | 2.1.x / 3.5.x | Conditional class merging via `cn()` | Already installed, use for all dynamic classes |

### Alternatives Considered
None -- no new dependencies needed. All required functionality is achievable with the existing stack.

**Installation:**
No new packages needed. All dependencies are already installed.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
  components/
    detail/
      InlineEditText.tsx       # NEW: reusable click-to-edit single-line
      InlineEditTextarea.tsx    # NEW: reusable click-to-edit textarea
      TagEditor.tsx             # NEW: tag chips + autocomplete
      CustomFieldsSection.tsx   # NEW: custom field values in detail panel
      MetadataSection.tsx       # MODIFIED: title/description become editable
      DetailPanel.tsx           # MODIFIED: add CustomFieldsSection, pass mutation callbacks
    settings/
      SettingsPage.tsx          # NEW: custom field definitions management
    layout/
      Sidebar.tsx               # MODIFIED: add Settings nav item
  hooks/
    useAssets.ts                # MODIFIED: add usePatchAsset, useCustomFields, etc.
  lib/
    api.ts                      # MODIFIED: add patchAsset, custom field API functions
  types/
    asset.ts                    # MODIFIED: add CustomField, CustomValue interfaces
  App.tsx                       # MODIFIED: view switching (library vs settings)

backend/src/
  routes/
    assets.ts                   # MODIFIED: extend PATCH to accept title/description + OpenSearch re-index
    custom-fields.ts            # NEW: CRUD for custom fields + custom values
```

### Pattern 1: Click-to-Edit with Optimistic Updates
**What:** A reusable inline edit component that swaps between read and edit mode on click, saves on blur/Enter, cancels on Escape, and provides visual feedback via border flash.
**When to use:** Title, description, and custom field value editing.
**Example:**
```typescript
// InlineEditText component pattern
function InlineEditText({ value, onSave, placeholder, ariaLabel }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [flashState, setFlashState] = useState<'idle' | 'success' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  // On entering edit mode: focus + select all
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const save = async () => {
    if (draft === value) { setIsEditing(false); return; }
    setIsEditing(false);
    try {
      await onSave(draft);
      setFlashState('success');
    } catch {
      setDraft(value); // revert
      setFlashState('error');
    }
    setTimeout(() => setFlashState('idle'), 800);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') { setDraft(value); setIsEditing(false); }
  };

  // Read mode: clickable text
  // Edit mode: input with border flash states
}
```

### Pattern 2: TanStack Query Optimistic Mutation
**What:** Use `useMutation` with `onMutate` for optimistic cache updates, `onError` for rollback, and `onSettled` for revalidation.
**When to use:** All metadata edits (title, description, tags, custom values).
**Example:**
```typescript
// Hook pattern for patching asset metadata
export function usePatchAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; description?: string } }) =>
      patchAsset(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['assets', id] });
      // Snapshot previous value
      const previous = queryClient.getQueryData(['assets', id]);
      // Optimistically update
      queryClient.setQueryData(['assets', id], (old: Asset) => ({ ...old, ...data }));
      return { previous };
    },
    onError: (_err, { id }, context) => {
      // Rollback to snapshot
      queryClient.setQueryData(['assets', id], context?.previous);
    },
    onSettled: (_data, _err, { id }) => {
      // Revalidate
      queryClient.invalidateQueries({ queryKey: ['assets', id] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}
```

### Pattern 3: View Switching Without Router
**What:** App-level state variable (`view: 'library' | 'settings'`) controls which content renders in the main area. No URL routing needed.
**When to use:** Switching between asset grid and Settings page.
**Example:**
```typescript
// In App.tsx
const [view, setView] = useState<'library' | 'settings'>('library');

// Pass setView to Sidebar for the Settings nav item
// Conditionally render:
{view === 'library' ? <AssetGrid ... /> : <SettingsPage />}
```

### Pattern 4: Backend OpenSearch Re-Index After Metadata Edit
**What:** After any SQLite write that changes searchable fields (title, description, tags), fire-and-forget an OpenSearch index update. Failure is non-fatal.
**When to use:** PATCH `/api/assets/:id` for title/description/tags changes.
**Example:**
```typescript
// In the PATCH handler, after SQLite update succeeds:
const updated = db.select().from(assets).where(eq(assets.id, id)).get();
if (updated) {
  // Fire-and-forget -- don't await, don't let failure affect the HTTP response
  indexInOpenSearch(id, {
    title: updated.title,
    description: updated.description,
    tags: updated.tags,
    transcriptText: updated.transcriptText,
    durationSeconds: updated.durationSeconds,
    codec: updated.codec,
    width: updated.width,
    height: updated.height,
    createdAt: updated.createdAt,
  }).catch(err => console.warn('OpenSearch re-index failed:', err.message));
}
```

### Anti-Patterns to Avoid
- **Awaiting OpenSearch in the HTTP response path:** OpenSearch re-index should be fire-and-forget. If it fails, the SQLite write already succeeded and the user should not see an error.
- **Separate PATCH endpoints for each field:** Use one PATCH `/api/assets/:id` that accepts any combination of `{ title?, description?, tags? }`. Avoid proliferating endpoints.
- **Storing custom field type logic in the frontend:** Phase 4 only supports `text` type. The `field_type` column exists in schema but do NOT implement type-specific rendering or validation for non-text types now.
- **Using `queryClient.refetchQueries` instead of `invalidateQueries`:** Invalidation is lazy (only refetches if query is actively observed), which is more efficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optimistic cache updates | Manual cache manipulation + refetch timers | TanStack Query `onMutate`/`onError`/`onSettled` | Handles race conditions, stale data, rollback automatically |
| Auto-expanding textarea | Manual height calculation with ResizeObserver | `scrollHeight` on `input` event + `overflow-hidden` + `resize-none` | Simple CSS technique -- set `textarea.style.height = 'auto'` then `textarea.style.height = scrollHeight + 'px'` on every input event |
| Dropdown outside-click dismissal | Custom event listeners on document | A small `useClickOutside` hook (or inline `useEffect` with ref) | 5-line hook, no library needed |
| Keyboard navigation in autocomplete | Complex state machine | Simple `activeIndex` state + arrow key handlers | Straightforward index manipulation with modular arithmetic for wrapping |

**Key insight:** All interaction patterns in this phase are achievable with React state + TanStack Query. No form library (react-hook-form, formik) is needed -- the edits are individual field saves, not multi-field form submissions.

## Common Pitfalls

### Pitfall 1: PATCH Endpoint Only Handles Tags
**What goes wrong:** The existing `PATCH /api/assets/:id` handler destructures only `{ tags }` from the request body. If you send `{ title: "new" }`, it is silently ignored.
**Why it happens:** Phase 3 only needed tag editing. The handler was written narrowly.
**How to avoid:** Extend the handler to accept `{ title?, description?, tags? }` and apply each present field. Use a single `db.update().set(updates)` call with a dynamically built update object.
**Warning signs:** Title/description PATCH returns 200 but the value does not change in the response.

### Pitfall 2: Escape Key Conflict with Detail Panel Close
**What goes wrong:** The `DetailPanel` component listens for `keydown` Escape to close the panel. If an inline edit input also uses Escape to cancel editing, both handlers fire -- the edit cancels AND the panel closes.
**Why it happens:** `DetailPanel.useEffect` adds a document-level `keydown` listener.
**How to avoid:** In the inline edit component, call `e.stopPropagation()` on Escape when in edit mode. This prevents the event from reaching the DetailPanel's document listener.
**Warning signs:** User presses Escape to cancel an edit and the entire detail panel closes.

### Pitfall 3: Stale Closure in Optimistic Update Rollback
**What goes wrong:** The `onError` rollback uses a stale reference to the previous value if the component re-rendered between mutation start and error.
**Why it happens:** JavaScript closure captures the value at `onMutate` call time.
**How to avoid:** Return the snapshot from `onMutate` as context (TanStack Query passes this to `onError` as the third argument). Always use `context?.previous` for rollback, never a component-level variable.
**Warning signs:** After a failed save, the field shows an older value instead of the pre-edit value.

### Pitfall 4: OpenSearch `description` Field Not in Current Mapping
**What goes wrong:** The OpenSearch index mapping in `opensearch.ts` includes `title` and `tags` but does NOT include a `description` field. The `indexInOpenSearch` function in `pipeline.ts` does not send `description` either.
**Why it happens:** Phase 2 created the mapping before description editing was a feature.
**How to avoid:** Add `description` to the OpenSearch mapping properties. Update `indexInOpenSearch` to include `description` in the indexed document. For existing indices, use a mapping update API call (OpenSearch allows adding new fields to an existing mapping).
**Warning signs:** Search by description never returns results (Phase 6 dependency).

### Pitfall 5: Tags Are Stored as JSON String, Not Array
**What goes wrong:** Frontend receives `tags` as a string (`'["a","b"]'`), but TagEditor expects `string[]`. Forgetting to `JSON.parse()` causes rendering issues.
**Why it happens:** SQLite stores tags as a JSON text column. Drizzle returns the raw string.
**How to avoid:** Parse tags in the API response layer or in the component. The existing codebase already documents this in `types/asset.ts` comment: "JSON string -- parse with JSON.parse() to get string[]".
**Warning signs:** Tags render as a single string instead of individual chips.

### Pitfall 6: Custom Field Name Uniqueness
**What goes wrong:** User creates a custom field with the same name as an existing one, causing a SQLite UNIQUE constraint error (500 response).
**Why it happens:** The `custom_fields.name` column has a UNIQUE constraint.
**How to avoid:** Return a 409 Conflict from the POST handler with a user-friendly message. Frontend should handle this gracefully (e.g., flash the input red).
**Warning signs:** Unhandled 500 error in the browser console.

## Code Examples

### Backend: Extended PATCH Handler
```typescript
// In routes/assets.ts -- replace existing PATCH handler
fastify.patch<{
  Params: { id: string };
  Body: { title?: string; description?: string; tags?: string[] };
}>('/api/assets/:id', async (request, reply) => {
  const { id } = request.params;
  const { title, description, tags } = request.body as {
    title?: string; description?: string; tags?: string[];
  };

  const asset = db.select().from(assets).where(eq(assets.id, id)).get();
  if (!asset) return reply.status(404).send({ error: 'Asset not found' });

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (tags !== undefined) updates.tags = JSON.stringify(tags);

  db.update(assets).set(updates).where(eq(assets.id, id)).run();

  const updated = db.select().from(assets).where(eq(assets.id, id)).get();

  // Fire-and-forget OpenSearch re-index
  reindexAsset(id, updated).catch(err =>
    console.warn('OpenSearch re-index failed:', err.message)
  );

  return updated;
});
```

### Backend: Custom Fields CRUD Routes
```typescript
// New file: routes/custom-fields.ts
import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { customFields, assetCustomValues } from '../db/schema.js';

export async function customFieldRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/custom-fields
  fastify.get('/api/custom-fields', async () => {
    return db.select().from(customFields).orderBy(customFields.name).all();
  });

  // POST /api/custom-fields
  fastify.post<{ Body: { name: string; type?: string } }>(
    '/api/custom-fields',
    async (request, reply) => {
      const { name, type } = request.body as { name: string; type?: string };
      if (!name?.trim()) return reply.status(400).send({ error: 'Name required' });

      const id = randomUUID();
      try {
        db.insert(customFields).values({
          id,
          name: name.trim(),
          fieldType: type || 'text',
        }).run();
      } catch (err: any) {
        if (err.message?.includes('UNIQUE')) {
          return reply.status(409).send({ error: 'Field name already exists' });
        }
        throw err;
      }

      return reply.status(201).send(
        db.select().from(customFields).where(eq(customFields.id, id)).get()
      );
    }
  );

  // DELETE /api/custom-fields/:id
  fastify.delete<{ Params: { id: string } }>(
    '/api/custom-fields/:id',
    async (request, reply) => {
      const { id } = request.params;
      const field = db.select().from(customFields).where(eq(customFields.id, id)).get();
      if (!field) return reply.status(404).send({ error: 'Field not found' });

      db.delete(customFields).where(eq(customFields.id, id)).run();
      // CASCADE handles asset_custom_values deletion
      return reply.status(204).send();
    }
  );

  // GET /api/assets/:id/custom-values
  fastify.get<{ Params: { id: string } }>(
    '/api/assets/:id/custom-values',
    async (request) => {
      const { id } = request.params;
      return db.select().from(assetCustomValues)
        .where(eq(assetCustomValues.assetId, id)).all();
    }
  );

  // PUT /api/assets/:id/custom-values/:fieldId
  fastify.put<{ Params: { id: string; fieldId: string }; Body: { value: string } }>(
    '/api/assets/:id/custom-values/:fieldId',
    async (request, reply) => {
      const { id, fieldId } = request.params;
      const { value } = request.body as { value: string };

      // Upsert: INSERT OR REPLACE
      db.$client.prepare(
        `INSERT INTO asset_custom_values (asset_id, field_id, value)
         VALUES (?, ?, ?)
         ON CONFLICT(asset_id, field_id) DO UPDATE SET value = excluded.value`
      ).run(id, fieldId, value);

      return { assetId: id, fieldId, value };
    }
  );
}
```

### Frontend: Auto-Expanding Textarea
```typescript
// Height auto-resize technique
const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
  const el = e.currentTarget;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

// In JSX:
<textarea
  ref={textareaRef}
  value={draft}
  onChange={e => setDraft(e.target.value)}
  onInput={handleInput}
  onBlur={save}
  onKeyDown={handleKeyDown}
  className="resize-none overflow-hidden bg-background border border-border rounded px-2 py-1 text-sm text-text font-sans w-full"
  rows={1}
/>
```

### Frontend: Border Flash Feedback
```typescript
// CSS transition approach (simpler than Framer Motion for this)
const borderClass = {
  idle: 'border-border',
  success: 'border-status-complete',
  error: 'border-status-failed',
}[flashState];

// The input wrapper gets:
// className={cn('transition-colors duration-200', borderClass)}
// After setting flashState to 'success' or 'error',
// setTimeout(() => setFlashState('idle'), 800) handles the revert
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TanStack Query v4 `onSuccess` in `useQuery` | TanStack Query v5 moves `onSuccess` to `useMutation` only | v5 (2023) | Invalidation happens in `onSettled`, not `onSuccess` on queries |
| Drizzle `upsert` via `.onConflictDoUpdate()` | Still supported in 0.36 but composite PK upsert can be tricky | Current | Use raw SQL `INSERT ... ON CONFLICT` for the `asset_custom_values` upsert |

**Deprecated/outdated:**
- None relevant to this phase. All libraries are at current versions.

## Open Questions

1. **OpenSearch mapping update for `description` field**
   - What we know: Current mapping does not include `description`. Adding fields to existing OpenSearch mappings is allowed without reindex.
   - What's unclear: Whether the `initOpenSearch` function should handle mapping updates or if it should be a separate migration step.
   - Recommendation: Add `description` to the `INDEX_MAPPING` constant and use `opensearchClient.indices.putMapping()` in `initOpenSearch` to add the field if the index already exists.

2. **SQLite foreign key enforcement**
   - What we know: SQLite requires `PRAGMA foreign_keys = ON` per connection for CASCADE to work. The test file enables this.
   - What's unclear: Whether the production `db/index.ts` enables this pragma.
   - Recommendation: Verify in `db/index.ts` and add if missing. Without it, `ON DELETE CASCADE` on `asset_custom_values` will not work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run src/__tests__/assets-api.test.ts` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| META-02 | PATCH /api/assets/:id updates title and description | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -t "updates title"` | Partially (PATCH test exists for tags, needs title/description cases) |
| META-02 | OpenSearch re-index fires after title/description update | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -t "reindex"` | No -- Wave 0 |
| META-03 | Tag add/remove via existing PATCH + tag array | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -t "updates tags"` | Yes (existing test covers this) |
| META-04 | GET /api/custom-fields returns all definitions | unit | `cd backend && npx vitest run src/__tests__/custom-fields.test.ts -t "returns all"` | No -- Wave 0 |
| META-04 | POST /api/custom-fields creates a field | unit | `cd backend && npx vitest run src/__tests__/custom-fields.test.ts -t "creates"` | No -- Wave 0 |
| META-04 | DELETE /api/custom-fields/:id cascades to values | unit | `cd backend && npx vitest run src/__tests__/custom-fields.test.ts -t "cascade"` | No -- Wave 0 |
| META-04 | PUT /api/assets/:id/custom-values/:fieldId upserts | unit | `cd backend && npx vitest run src/__tests__/custom-fields.test.ts -t "upsert"` | No -- Wave 0 |
| META-04 | Duplicate field name returns 409 | unit | `cd backend && npx vitest run src/__tests__/custom-fields.test.ts -t "duplicate"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/__tests__/custom-fields.test.ts` -- covers META-04 (CRUD + cascade + upsert)
- [ ] Add title/description PATCH tests to `backend/src/__tests__/assets-api.test.ts` -- covers META-02
- [ ] Verify `PRAGMA foreign_keys = ON` in production db connection (`backend/src/db/index.ts`)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `backend/src/routes/assets.ts` -- current PATCH handler only handles `tags`
- Codebase inspection: `backend/src/db/schema.ts` -- all three tables exist with correct constraints
- Codebase inspection: `backend/src/bootstrap/opensearch.ts` -- mapping lacks `description` field
- Codebase inspection: `backend/src/lib/pipeline.ts` -- `indexInOpenSearch` omits `description`
- Codebase inspection: `frontend/src/hooks/useAssets.ts` -- TanStack Query v5 patterns established
- Codebase inspection: `frontend/src/components/detail/DetailPanel.tsx` -- Escape key listener on document
- Codebase inspection: `frontend/src/lib/api.ts` -- `patchAssetTags` exists, no `patchAsset` for title/description

### Secondary (MEDIUM confidence)
- TanStack Query v5 optimistic update patterns -- based on established v5 API (`onMutate`/`onError`/`onSettled`)

### Tertiary (LOW confidence)
- None -- all findings are directly from codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all libraries already installed and versioned
- Architecture: HIGH -- patterns extend existing codebase conventions (TanStack Query hooks, Fastify route files, Drizzle queries)
- Pitfalls: HIGH -- identified from direct code inspection (PATCH handler limitation, Escape key conflict, missing OpenSearch field)

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- no fast-moving dependencies)
