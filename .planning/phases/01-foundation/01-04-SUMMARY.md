---
phase: 01-foundation
plan: 04
subsystem: infra
tags: [nginx, systemd, deployment, hetzner, tailscale]

# Dependency graph
requires: []
provides:
  - nginx reverse proxy config for frontend static files and API proxy
  - systemd service unit for Node.js backend process management
  - deployment guide with Hetzner server setup instructions
affects: [02-core-pipeline, 03-search, 04-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [nginx-reverse-proxy, systemd-service-management, security-hardened-deployment]

key-files:
  created:
    - .planning/deploy/nginx.conf.example
    - .planning/deploy/systemd/mam.service.example
    - .planning/deploy/README.md
  modified: []

key-decisions:
  - "No SSL in nginx — Tailscale handles encryption at the network layer"
  - "10G client_max_body_size for large video file uploads"
  - "proxy_buffering off for /api/stream/ to support video range requests"
  - "Dedicated mam user with ProtectSystem=strict and ReadWritePaths for security hardening"

patterns-established:
  - "Deployment configs live in .planning/deploy/ as .example files"
  - "systemd EnvironmentFile pattern for .env sourcing"

requirements-completed: []

# Metrics
duration: 1min
completed: 2026-03-22
---

# Phase 01 Plan 04: Deployment Config Summary

**nginx reverse proxy with 10G upload limit, video streaming location, systemd service with security hardening, and full Hetzner deployment guide**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-22T21:38:55Z
- **Completed:** 2026-03-22T21:40:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- nginx config proxying /api to Fastify on port 3001 with SPA fallback and static asset caching
- Dedicated streaming location with proxy_buffering off for video range requests
- systemd service with auto-restart, environment file sourcing, and security hardening (ProtectSystem=strict)
- Complete deployment README covering user creation, directory setup, env config, migrations, nginx, and systemd installation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create nginx reverse proxy configuration** - `1051ece` (chore)
2. **Task 2: Create systemd service unit and deployment documentation** - `ef3d572` (chore)

## Files Created/Modified
- `.planning/deploy/nginx.conf.example` - nginx reverse proxy serving frontend and proxying /api to Fastify
- `.planning/deploy/systemd/mam.service.example` - systemd unit for Node.js backend with security hardening
- `.planning/deploy/README.md` - Step-by-step Hetzner deployment guide

## Decisions Made
None - followed plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Deployment config templates ready for use when application code is built
- nginx config references /opt/mam/frontend/dist (will exist after frontend build)
- systemd service references /opt/mam/backend/dist/index.js (will exist after backend build)

---
*Phase: 01-foundation*
*Completed: 2026-03-22*
