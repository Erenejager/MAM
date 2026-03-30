---
status: diagnosed
phase: 03-browse-and-playback
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-03-30T10:15:00Z
updated: 2026-03-30T10:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Start backend and frontend from scratch. App loads with AppShell layout (TopBar + Sidebar + main area). No console errors.
result: pass

### 2. Asset Card Grid Display
expected: With ingested assets, main area shows full-width row cards with thumbnail (260px), title, duration, file size, codec, tags, and date imported.
result: issue
reported: "Thumbnails show broken image icon — Vite proxy only forwards /api to backend, not /storage. Date shows 'Invalid Date' — createdAt stored as literal string '(datetime(now))' instead of evaluated timestamp."
severity: major

### 3. Tag Sidebar Filter
expected: Sidebar shows alphabetical tag list with count badges. Clicking a tag highlights it and filters cards. Multiple tags use AND logic.
result: pass

### 4. Asset Card Context Menu
expected: Right-clicking asset card opens context menu with Delete option. Escape dismisses.
result: pass

### 5. Delete Asset Dialog
expected: Delete in context menu opens confirmation with "Remove from library" and "Delete file + library" options. Asset removed with animation.
result: pass

### 6. Detail Panel Slide-In
expected: Clicking asset card opens detail panel sliding from right at ~40vw. Grid shifts left. Escape or close button dismisses.
result: pass

### 7. Video Playback
expected: Video player shows thumbnail poster. Play starts playback. Seeking works via range requests. No autoplay.
result: issue
reported: "Video player cannot load video or poster — /storage paths not proxied by Vite dev server to backend. Same root cause as thumbnail issue in Test 2."
severity: major

### 8. Metadata Display
expected: Metadata grid shows all 9 fields: title, duration, codec, resolution, frame rate, file size, date imported, hash, filepath.
result: issue
reported: "All 9 fields present and correct except Date Imported shows 'Invalid Date' — createdAt column has literal string '(datetime(now))' instead of an ISO timestamp."
severity: minor

### 9. Transcript Viewer with Sync
expected: Transcript section shows timestamped segments. Video sync highlights current segment. Click-to-seek works.
result: skipped
reason: Transcription requires valid GROQ_API_KEY — dummy key used for testing. Error message displayed correctly.

### 10. Ingesting Status Badge
expected: Asset being ingested shows status badge that updates through pipeline stages.
result: pass

## Summary

total: 10
passed: 5
issues: 3
pending: 0
skipped: 2

## Gaps

- truth: "Asset card displays thumbnail image"
  status: failed
  reason: "User reported: Thumbnails show broken image icon — Vite proxy only forwards /api to backend, not /storage paths"
  severity: major
  test: 2
  root_cause: "Vite dev server proxy in frontend/vite.config.ts only forwards /api to http://localhost:3001. The /storage/* path used for thumbnails and video files is not proxied, so requests go to Vite (port 5173) which returns 404."
  artifacts:
    - path: "frontend/vite.config.ts"
      issue: "Missing /storage proxy rule"
  missing:
    - "Add '/storage': 'http://localhost:3001' to Vite proxy config"

- truth: "Asset card shows correct date imported"
  status: failed
  reason: "User reported: Date shows 'Invalid Date' — createdAt stored as literal string '(datetime(now))' instead of evaluated timestamp"
  severity: minor
  test: 2
  root_cause: "Drizzle schema default for createdAt uses sql`(datetime('now'))` which is evaluated at INSERT time by SQLite. But the value stored is the literal string '(datetime('now'))' — likely the INSERT statement is passing the default expression as a string value instead of letting SQLite evaluate it."
  artifacts:
    - path: "backend/src/db/schema.ts"
      issue: "createdAt default may not be evaluated correctly by Drizzle"
    - path: "backend/src/routes/assets.ts"
      issue: "INSERT may be overriding the default with a string"
  missing:
    - "Verify Drizzle INSERT for assets sets createdAt correctly or relies on schema default"
    - "Fix so createdAt stores ISO timestamp string"

- truth: "Video player loads and plays video file"
  status: failed
  reason: "User reported: Video player cannot load — /storage paths not proxied by Vite dev server"
  severity: major
  test: 7
  root_cause: "Same as thumbnail issue — Vite proxy missing /storage rule. Backend serves files correctly at /storage/{id}/original.{ext} with range request support."
  artifacts:
    - path: "frontend/vite.config.ts"
      issue: "Missing /storage proxy rule"
  missing:
    - "Single fix: add '/storage' proxy covers both thumbnails and video playback"
