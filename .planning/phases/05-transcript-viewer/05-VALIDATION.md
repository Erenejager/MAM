---
phase: 5
slug: transcript-viewer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `frontend/vitest.config.ts` (if exists) or inline vite config |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | PLAY-02 | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | PLAY-02 | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | PLAY-03 | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | PLAY-03 | manual | see manual verifications | n/a | ⬜ pending |
| 05-02-02 | 02 | 2 | PLAY-02 | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `frontend/src/__tests__/TranscriptList.test.tsx` — stubs for PLAY-02 (click-to-seek, active highlight, auto-scroll)
- [ ] `frontend/src/__tests__/TranscriptSearch.test.tsx` — stubs for PLAY-03 (search highlighting, match navigation)

*Wave 0 creates test stubs before implementation tasks run.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Video seeks to correct timestamp on segment click | PLAY-02 | Requires live browser + video file | Open asset detail, click a transcript segment, verify video currentTime matches segment start |
| Active segment highlights during playback | PLAY-02 | Requires live video playback | Play video, observe transcript panel — active segment should show CTA red left border and bg-cta/20 tint |
| Auto-scroll keeps active segment visible | PLAY-02 | Requires live video playback | Play video, let it advance — transcript should scroll to keep active segment visible |
| Search highlights correct words in amber | PLAY-03 | Requires DOM inspection | Enter search query, verify matched words have amber background tint |
| Next/prev navigation jumps to correct match | PLAY-03 | Requires interaction testing | Search with multiple matches, use nav arrows to cycle through them |
| Tab switch preserves video playback state | PLAY-02 | Requires live interaction | Start video, switch to Info tab and back — video should continue playing from same position |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
