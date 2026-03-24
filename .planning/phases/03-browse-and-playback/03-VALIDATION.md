---
phase: 3
slug: browse-and-playback
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (backend — already configured) |
| **Config file** | `backend/vitest.config.ts` (exists) |
| **Quick run command** | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | BRWS-01, BRWS-03, BRWS-04, PLAY-04 | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | BRWS-01, BRWS-03, BRWS-04 | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 1 | PLAY-01 | manual | Manual: click card, verify video plays and seeks | N/A | ⬜ pending |
| 3-04-01 | 04 | 2 | PLAY-04 | unit | `cd backend && npx vitest run src/__tests__/assets-api.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/assets-api.test.ts` — test stubs for BRWS-01 (GET /api/assets), BRWS-03 (tag filter), BRWS-04 (DELETE endpoint), PLAY-04 (transcriptionStatus field)
- [ ] Seed helper in test file: inserts test asset rows with known tags/status values using `better-sqlite3` directly

*Existing vitest infrastructure in `backend/vitest.config.ts` covers all phase requirements — no new framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Video plays and seeking works (HTTP 206) | PLAY-01 | Browser video element behavior requires real browser, not vitest | 1. Start backend + frontend. 2. Upload a video. 3. Click card to open panel. 4. Verify video plays. 5. Drag seek bar — video should jump to new position without reload. |
| Detail panel slides in from right | BRWS-01 | CSS animation — not unit-testable | Click card, verify panel animates in from right at 40% width |
| Card fades out on delete | BRWS-04 | Framer Motion animation — not unit-testable | Delete an asset, verify card fades before grid reflows |
| Right-click context menu appears | BRWS-04 | Browser context menu event — not unit-testable | Right-click card, verify context menu with "Delete" appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
