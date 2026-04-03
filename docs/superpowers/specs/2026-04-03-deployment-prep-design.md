# Deployment Prep — Auth, CORS, API URL

**Date:** 2026-04-03
**Goal:** Prepare the MAM app for split deployment: frontend on Vercel, backend on Hetzner exposed via Tailscale Funnel.

## Scope

Three changes, all small:
1. Password-based auth with HttpOnly cookie sessions
2. Production CORS configuration
3. Environment-based API URL for frontend

## 1. Auth System

### Login Page (frontend)

Full-screen login page rendered when the user is not authenticated.

- **Layout:** Centered vertically and horizontally. MAM logo on top, password field below, submit button below that.
- **Styling:** Cinema Dark theme — `#0F0F23` background, `#E11D48` CTA button, Fira Sans body text, Fira Code for the logo.
- **Behavior:** On submit, POST to `/api/auth/login`. On success (200), redirect to the main app. On failure (401), show an inline error message ("Wrong password") and clear the field.
- **Auth check on load:** On app mount, `GET /api/auth/check`. If 401, show login page. If 200, render the app. Show a loading state during the check.

### Backend Auth

**Password storage:**
- `AUTH_PASSWORD` env var holds a bcrypt hash of the password.
- Generate with: `npx bcryptjs <password>` or a small script.

**Endpoints:**
- `POST /api/auth/login` — accepts `{ password: string }`. Compares against bcrypt hash. On match, generates a 64-char random hex session token, stores it in an in-memory `Set<string>`, sets an HttpOnly cookie, returns 200. On mismatch, returns 401.
- `GET /api/auth/check` — returns 200 if session cookie is valid, 401 otherwise.
- `POST /api/auth/logout` — clears cookie, removes token from the set.

**Session cookie:**
- Name: `mam_session`
- Value: 64-char random hex token
- Flags: `HttpOnly`, `Secure`, `SameSite=None`, `Path=/`
- Max-Age: 7 days
- `SameSite=None` is required because the frontend (Vercel) and backend (Hetzner/Funnel) are on different domains.

**Session store:**
- In-memory `Set<string>` — no database table needed.
- Sessions are lost on server restart. The user simply re-enters the password.

**Auth middleware:**
- Fastify `onRequest` hook registered globally.
- Skips: `POST /api/auth/login`, `GET /api/health`.
- Reads `mam_session` cookie, checks if token exists in the session set. If not, returns 401.

**Rate limiting:**
- `@fastify/rate-limit` on `POST /api/auth/login` only.
- 5 requests per IP per 10 minutes.
- Returns 429 with `{ error: "Too many attempts, try again later" }`.

**Dependencies to add:**
- `bcryptjs` (pure JS bcrypt, no native compilation issues)
- `@fastify/rate-limit`
- `@fastify/cookie`

### Files

- `backend/src/lib/auth.ts` — session store (Set), `createSession()`, `validateSession()`, `removeSession()`, `verifyPassword()`
- `backend/src/routes/auth.ts` — login/check/logout endpoints
- `backend/src/middleware/auth.ts` — onRequest hook
- `frontend/src/components/LoginPage.tsx` — login page component
- `frontend/src/hooks/useAuth.ts` — auth check hook, provides `isAuthenticated` / `isLoading` state

## 2. CORS Configuration

Current: CORS enabled only in `NODE_ENV=development` with `origin: true`.

Change:
- Add `CORS_ORIGIN` env var (e.g. `https://mam-app.vercel.app`).
- If `NODE_ENV=development`: `origin: true` (keep current behavior).
- If `CORS_ORIGIN` is set: `origin: CORS_ORIGIN`, `credentials: true`.
- If neither: no CORS (same-origin only).

`credentials: true` is required for the browser to send the `mam_session` cookie cross-origin.

**File:** `backend/src/index.ts` — modify the existing CORS registration block.

## 3. Frontend API URL

**Env var:** `VITE_API_URL`
- Dev: not set (empty string) — Vite proxy handles routing to `localhost:3001`.
- Prod (Vercel): set to the Tailscale Funnel URL (e.g. `https://hetzner.tail1234.ts.net`).

**Helper:**
- `frontend/src/lib/api.ts` — exports `apiUrl(path: string): string` that prepends `VITE_API_URL` if set.
- All existing `fetch('/api/...')` and `/storage/...` references updated to use `apiUrl()`.

**Vite proxy:** Unchanged. Still proxies `/api` and `/storage` to `localhost:3001` in dev.

## 4. Vercel Config

`vercel.json` at project root:
```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## 5. Backend Env Changes

New env vars added to `.env.example`:
- `AUTH_PASSWORD` (required) — bcrypt hash of the login password
- `CORS_ORIGIN` (optional) — allowed origin for CORS in production

## Out of Scope

- Username field / multi-user support
- OAuth / SSO
- JWT / refresh tokens
- Database-backed sessions
- Tailscale Funnel setup (infra, not code)
- Vercel project creation / deployment (done via dashboard)
