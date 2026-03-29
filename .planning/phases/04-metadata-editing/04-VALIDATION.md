---
phase: 4
slug: metadata-editing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run src/__tests__/` |
| **Full suite command** | `cd backend && npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run src/__tests__/`
- **After every plan wave:** Run `cd backend && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | META-02 | unit | `cd backend && npx vitest run src/__tests__/assets.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | META-02 | unit | `cd backend && npx vitest run src/__tests__/assets.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 1 | META-03 | unit | `cd backend && npx vitest run src/__tests__/assets.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 2 | META-04 | unit | `cd backend && npx vitest run src/__tests__/custom-fields.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | META-04 | unit | `cd backend && npx vitest run src/__tests__/custom-fields.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/__tests__/assets.test.ts` — stubs for META-02, META-03 (PATCH endpoint, tag operations)
- [ ] `backend/src/__tests__/custom-fields.test.ts` — stubs for META-04 (custom field CRUD, value storage)

*Existing vitest infrastructure is installed; only test files need creating.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline edit fields render in detail panel | META-02 | UI rendering requires browser | Open detail panel, verify title/description fields are editable inline |
| Tag autocomplete shows existing tags | META-03 | DOM interaction required | Start typing a tag, verify dropdown shows existing tags |
| Custom field appears on all asset panels | META-04 | Requires UI + multiple assets | Add custom field in Settings, open different asset detail panels |
| Escape in edit field cancels without closing panel | META-02 | Event propagation behavior | Enter edit mode, press Escape, verify field cancels but panel stays open |
| OpenSearch re-index after metadata save | META-02 | Async background job | Save metadata change, run search query, verify updated data returned |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
