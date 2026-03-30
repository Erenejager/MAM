---
phase: 6
slug: search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run` |
| **Full suite command** | `cd backend && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run`
- **After every plan wave:** Run `cd backend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SRCH-01 | integration | `cd backend && npx vitest run src/__tests__/search.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | SRCH-02 | integration | `cd backend && npx vitest run src/__tests__/search.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | SRCH-03 | integration | `cd backend && npx vitest run src/__tests__/search.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | SRCH-04 | integration | `cd backend && npx vitest run src/__tests__/search.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/search.test.ts` — stubs for SRCH-01 through SRCH-04
- [ ] Test fixtures for mock OpenSearch responses with highlights

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Highlighted search results render correctly in browser | SRCH-01 | Visual rendering of `<mark>` tags | Type query in search bar, verify yellow/amber highlight on matching text |
| Transcript timecode links navigate video to correct position | SRCH-03 | Requires video playback interaction | Search for spoken word, click timecode in result, verify video seeks to correct time |
| Tag filter narrows results correctly | SRCH-04 | UI interaction flow | Click a tag in search results, verify only matching assets remain |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
