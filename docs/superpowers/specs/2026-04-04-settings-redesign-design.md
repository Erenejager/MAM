# Settings Page Redesign

**Date:** 2026-04-04
**Status:** Approved

## Problem

The Settings page uses inconsistent styling (raw rgba colors, hardcoded zinc palette, cramped 8-10px typography) that doesn't match the Cinema Dark design system used throughout the rest of the app. It also lacks useful operational information (API service connectivity status) and user preferences.

## Solution

Redesign the Settings page with:
1. Cinema Dark glass panel styling consistent with other views
2. 2x2 grid layout using available width instead of narrow centered column
3. New Service Status section showing API key / connectivity health
4. New Preferences section with default view mode toggle

---

## Layout

Full-width 2x2 grid with generous padding (`px-xl`), no max-width centering constraint.

```
┌──────────────────┬──────────────────┐
│ Service Status   │ Storage          │
│ Groq       ● OK │ Root  ~/.mam/... │
│ Gemini     ● OK │ Assets  4 videos │
│ OpenSearch ● Dn │ Size    2.1 GB   │
├──────────────────┴──────────────────┤
│ Custom Fields                 3 fld │
│ Season [text] ✕                     │
│ Tournament [text] ✕                 │
│ [New field name...] [+ Add]        │
├─────────────────────────────────────┤
│ ⚙ Preferences     Default: [G] [L] │
└─────────────────────────────────────┘
```

Grid: `grid-template-columns: 1fr 1fr` with `gap-[12px]`. Custom Fields and Preferences span full width (`grid-column: 1 / -1`).

---

## Sections

### 1. Service Status

Displays connectivity for three external services. Each row shows: service name, description subtitle, and a status dot + label.

| Service | Description | Status Source |
|---------|-------------|---------------|
| Groq | Transcription | `GROQ_API_KEY` env var presence |
| Gemini | OCR + key moments | `GEMINI_API_KEY` env var presence |
| OpenSearch | Full-text search | Existing `searchUnavailable` flag from search hook |

**Status indicators:**
- Green dot + "Connected" — API key is set (for Groq/Gemini), or service is reachable (OpenSearch)
- Red dot + "Unavailable" — API key missing or service down
- Grey dot + "Not configured" — env var not set (informational, not an error)

**Data source:** New backend endpoint `GET /api/settings/status` returning:
```json
{
  "groq": { "configured": true },
  "gemini": { "configured": true },
  "opensearch": { "connected": true }
}
```

This endpoint checks env vars and pings OpenSearch. Called once on mount, no polling.

### 2. Storage (existing, restyled)

Same data as current: storage root path, total asset count, total file size. Restyled with glass panel, indigo borders, section icon (Package from Lucide). Storage root displayed as `~/.mam/storage` (shortened from absolute path). Values from `useAssets` hook.

### 3. Custom Fields (existing, restyled)

Same functionality: list fields, add field, delete field. Restyled with:
- Glass panel background (`rgba(30,27,75,0.3)`)
- Indigo borders (`rgba(45,42,94,0.6)`)
- Section header with Lucide icon (Columns from Lucide)
- Field count badge in header
- Type badge with indigo background (`rgba(45,42,94,0.4)`)
- Add form: dark input with indigo border, CTA red "Add" button
- Delete button: muted X icon, red on hover

### 4. Preferences

Single setting: default library view mode (Grid or List).

**Segmented control:** Two-button toggle styled identically to the TopBar view mode toggle. Active option gets CTA red background tint + text. Inactive is muted.

**Persistence:** Uses `localStorage` key `mam-view-mode` (already exists — the TopBar view mode toggle reads/writes it). Changing the preference here immediately updates the stored value and the current view mode via the existing `onViewModeChange` callback passed from App.tsx.

---

## Styling

All panels follow Cinema Dark design system:

- Panel background: `rgba(30,27,75,0.3)`
- Panel border: `1px solid rgba(45,42,94,0.6)`
- Panel radius: `10px`
- Section header: `padding: 10px 14px`, bottom border `rgba(45,42,94,0.4)`
- Section header icon: 13px Lucide icon in `#94A3B8`
- Section header text: Fira Code 10px semibold `#F8FAFC`
- Row padding: `7-10px 14px`
- Row divider: `1px solid rgba(45,42,94,0.15)`
- Label text: Fira Sans 10-11px `#94A3B8` (muted) or `#F8FAFC` (primary)
- Value text: Fira Code 9-10px `#F8FAFC`
- Status green: `#10B981`
- Status red: `#E11D48`

---

## Backend Change

One new endpoint:

**GET /api/settings/status**

Returns service configuration/connectivity status. Checks:
- `process.env.GROQ_API_KEY` — truthy = configured
- `process.env.GEMINI_API_KEY` — truthy = configured
- OpenSearch client ping — connected or not (with try/catch, non-blocking)

Response shape:
```json
{
  "groq": { "configured": true },
  "gemini": { "configured": true },
  "opensearch": { "connected": false }
}
```

---

## Component Changes

- **Modify:** `frontend/src/components/settings/SettingsPage.tsx` — full rewrite with grid layout, new sections
- **Create:** `frontend/src/hooks/useServiceStatus.ts` — fetch hook for `/api/settings/status`
- **Create:** `backend/src/routes/settings.ts` — new route file for status endpoint
- **Modify:** `backend/src/index.ts` — register settings routes
- **Modify:** `frontend/src/App.tsx` — pass `viewMode` + `onViewModeChange` to SettingsPage

---

## Props Threading

`SettingsPage` needs `viewMode` and `onViewModeChange` from App.tsx to render and control the Preferences toggle. These are already available in `AuthenticatedApp` — just pass them as props.

---

## Accessibility

- Section headers use `<section>` with `aria-label`
- Status dots have `aria-label` with service name + status text
- View mode toggle uses `role="radiogroup"` with `aria-checked`
- Delete buttons have `aria-label="Delete field {name}"`
- Form input has associated label via `aria-label`

---

## Scope Exclusions

- No re-run failed stages functionality
- No storage path configuration (read-only display)
- No theme switching
- No export/backup
- No pipeline concurrency settings
