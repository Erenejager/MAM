---
phase: 2
slug: ingest-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | backend/vitest.config.ts (Wave 0 installs) |
| **Quick run command** | `cd backend && npm test -- --run` |
| **Full suite command** | `cd backend && npm test -- --run && cd ../frontend && npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test -- --run`
- **After every plan wave:** Run `cd backend && npm test -- --run && cd ../frontend && npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-upload | TBD | 1 | IMP-01 | integration | `cd backend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 02-dedup | TBD | 1 | IMP-02 | unit | `cd backend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 02-metadata | TBD | 1 | META-01 | unit | `cd backend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 02-thumbnail | TBD | 1 | IMP-03 | integration | `cd backend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 02-transcription | TBD | 2 | IMP-03 | integration | `cd backend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 02-opensearch | TBD | 2 | BRWS-02 | integration | `cd backend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 02-frontend | TBD | 3 | IMP-01 | component | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/ingest.test.ts` — stubs for IMP-01, IMP-02, IMP-03, META-01, BRWS-02
- [ ] `backend/vitest.config.ts` — vitest config pointing to src
- [ ] `frontend/src/__tests__/ImportUI.test.tsx` — stubs for drop zone and progress UI
- [ ] `frontend/vitest.config.ts` — vitest config with jsdom environment

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop file acceptance | IMP-01 | Browser drag API not testable in vitest/jsdom | Open browser, drag a video file onto the drop zone, verify 202 response and pipeline starts |
| Groq transcription end-to-end | IMP-03 | Requires live Groq API key + real audio file | Import a short video, wait for transcription_status = 'complete', verify transcript_text is populated |
| Thumbnail accessible via HTTP | IMP-03 | Requires running server + real ffmpeg | Import a video, verify GET /api/assets/:id/thumbnail returns 200 with image/jpeg |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
