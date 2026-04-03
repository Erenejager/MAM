# Deployment Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the MAM app for split deployment — frontend on Vercel, backend on Hetzner via Tailscale Funnel — by adding password auth, production CORS, and environment-based API URLs.

**Architecture:** Backend gets cookie-based auth with in-memory sessions and rate limiting. Frontend gets a login page gate and a centralized API URL helper. CORS is configured via env var for production cross-origin requests.

**Tech Stack:** Fastify + bcryptjs + @fastify/cookie + @fastify/rate-limit (backend), React + Tailwind (frontend), Vercel (hosting)

---

### Task 1: Install backend auth dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd backend && npm install bcryptjs @fastify/cookie @fastify/rate-limit
```

- [ ] **Step 2: Install type definitions**

```bash
cd backend && npm install -D @types/bcryptjs
```

- [ ] **Step 3: Commit**

```bash
cd backend && git add package.json package-lock.json
git commit -m "chore: add auth dependencies — bcryptjs, @fastify/cookie, @fastify/rate-limit"
```

---

### Task 2: Add AUTH_PASSWORD to env validation

**Files:**
- Modify: `backend/src/bootstrap/validate-env.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Update validate-env.ts to require AUTH_PASSWORD**

Add this check after the existing GROQ_API_KEY check in `validate-env.ts`:

```typescript
// AUTH_PASSWORD — required, must be a bcrypt hash
if (!process.env.AUTH_PASSWORD) {
  errors.push(
    'AUTH_PASSWORD is not set. Generate a hash with: node -e "import(\'bcryptjs\').then(b=>b.hash(\'yourpassword\',10).then(console.log))" and add it to your .env file.'
  );
}
```

- [ ] **Step 2: Update .env.example**

Add these lines at the end of `backend/.env.example`:

```
AUTH_PASSWORD=$2a$10$examplehashhere
CORS_ORIGIN=
```

- [ ] **Step 3: Generate a real hash and add to .env**

```bash
cd backend && node -e "import('bcryptjs').then(b=>b.hash('changeme',10).then(console.log))"
```

Copy the output and add `AUTH_PASSWORD=<hash>` to `backend/.env`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/bootstrap/validate-env.ts backend/.env.example
git commit -m "feat: require AUTH_PASSWORD env var for backend auth"
```

---

### Task 3: Create auth library (session store + password verification)

**Files:**
- Create: `backend/src/lib/auth.ts`

- [ ] **Step 1: Create backend/src/lib/auth.ts**

```typescript
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const sessions = new Set<string>();

export function createSession(): string {
  const token = randomBytes(32).toString('hex');
  sessions.add(token);
  return token;
}

export function validateSession(token: string): boolean {
  return sessions.has(token);
}

export function removeSession(token: string): void {
  sessions.delete(token);
}

export async function verifyPassword(password: string): Promise<boolean> {
  const hash = process.env.AUTH_PASSWORD!;
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/lib/auth.ts
git commit -m "feat: add auth library — session store and password verification"
```

---

### Task 4: Create auth routes (login, check, logout)

**Files:**
- Create: `backend/src/routes/auth.ts`

- [ ] **Step 1: Create backend/src/routes/auth.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { createSession, removeSession, validateSession, verifyPassword } from '../lib/auth.js';

const COOKIE_NAME = 'mam_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function authRoutes(server: FastifyInstance) {
  server.post<{ Body: { password: string } }>('/api/auth/login', async (request, reply) => {
    const { password } = request.body ?? {};
    if (!password || typeof password !== 'string') {
      return reply.status(400).send({ error: 'Password is required' });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return reply.status(401).send({ error: 'Wrong password' });
    }

    const token = createSession();
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    });

    return { ok: true };
  });

  server.get('/api/auth/check', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (!token || !validateSession(token)) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    return { ok: true };
  });

  server.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (token) removeSession(token);
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/auth.ts
git commit -m "feat: add auth routes — login, check, logout endpoints"
```

---

### Task 5: Create auth middleware (onRequest hook)

**Files:**
- Create: `backend/src/middleware/auth.ts`

- [ ] **Step 1: Create backend/src/middleware/auth.ts**

```typescript
import type { FastifyInstance } from 'fastify';
import { validateSession } from '../lib/auth.js';

const PUBLIC_ROUTES = new Set([
  'POST:/api/auth/login',
  'GET:/api/health',
]);

export function registerAuthMiddleware(server: FastifyInstance) {
  server.addHook('onRequest', async (request, reply) => {
    const routeKey = `${request.method}:${request.url.split('?')[0]}`;
    if (PUBLIC_ROUTES.has(routeKey)) return;

    const token = request.cookies.mam_session;
    if (!token || !validateSession(token)) {
      reply.status(401).send({ error: 'Not authenticated' });
    }
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/middleware/auth.ts
git commit -m "feat: add auth middleware — cookie check on all routes"
```

---

### Task 6: Wire auth into server startup (index.ts)

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add imports**

Add these imports at the top of `backend/src/index.ts`, after the existing imports:

```typescript
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.js';
import { registerAuthMiddleware } from './middleware/auth.js';
```

- [ ] **Step 2: Register cookie plugin early in start()**

Add right after `validateEnv();` and before `await initOpenSearch();`:

```typescript
  // Cookie parsing
  await server.register(cookie);
```

- [ ] **Step 3: Update CORS block for production support**

Replace the existing CORS block (lines 29-34) with:

```typescript
  // 5. CORS
  if (process.env.NODE_ENV === 'development') {
    await server.register(cors, {
      origin: true,
      credentials: true,
    });
  } else if (process.env.CORS_ORIGIN) {
    await server.register(cors, {
      origin: process.env.CORS_ORIGIN,
      credentials: true,
    });
  }
```

- [ ] **Step 4: Register rate limiting on login endpoint**

Add after the CORS block:

```typescript
  // Rate limit login endpoint
  await server.register(rateLimit, {
    max: 5,
    timeWindow: '10 minutes',
    hook: 'onRequest',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too many attempts, try again later',
    }),
  });
```

Note: We apply the rate limit plugin globally but it only matters for login since other routes are behind auth. This is acceptable for a single-user app.

- [ ] **Step 5: Register auth routes and middleware**

Add after the rate limit registration, before the existing route registrations:

```typescript
  // Auth routes (login/check/logout)
  await server.register(authRoutes);

  // Auth middleware — must be after auth routes are registered
  registerAuthMiddleware(server);
```

- [ ] **Step 6: Verify backend starts**

```bash
cd backend && npm run dev
```

Expected: Server starts without errors. Hit `http://localhost:3001/api/health` — should return `{ status: 'ok' }`. Hit `http://localhost:3001/api/assets` — should return 401.

- [ ] **Step 7: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: wire auth into server — cookie, CORS, rate limit, middleware"
```

---

### Task 7: Frontend — API URL helper and credentials

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update API_BASE and add storageUrl helper in api.ts**

Replace the `API_BASE` line at the top of `frontend/src/lib/api.ts`:

```typescript
const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api`;
```

Add this exported helper right after:

```typescript
export function storageUrl(path: string): string {
  return `${import.meta.env.VITE_API_URL || ''}/storage/${path}`;
}
```

- [ ] **Step 2: Add credentials: 'include' to all fetch calls**

Every `fetch()` call in `api.ts` needs `credentials: 'include'` so the browser sends the auth cookie cross-origin. Update each function:

For GET requests (fetchAssets, fetchAsset, fetchTags, fetchCustomFields, fetchCustomValues, searchAssets), add the options object:

```typescript
const res = await fetch(url, { credentials: 'include' });
```

For requests with existing options (deleteAsset, patchAssetTags, patchAsset, createCustomField, deleteCustomField, patchCustomValue), add `credentials: 'include'` to the options:

```typescript
const res = await fetch(url, {
  method: 'DELETE',
  credentials: 'include',
});
```

```typescript
const res = await fetch(url, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
  credentials: 'include',
});
```

Apply this to every fetch call in the file. There are 11 fetch calls total.

- [ ] **Step 3: Add auth API functions at the end of api.ts**

```typescript
export async function login(password: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  });
  return res.ok;
}

export async function checkAuth(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/auth/check`, {
    credentials: 'include',
  });
  return res.ok;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add API URL env support, credentials, and auth functions"
```

---

### Task 8: Update all /storage/ references in components

**Files:**
- Modify: `frontend/src/components/assets/ScrubPreview.tsx`
- Modify: `frontend/src/components/assets/AssetTableRow.tsx`
- Modify: `frontend/src/components/assets/AssetCard.tsx`
- Modify: `frontend/src/components/assets/SearchTableRow.tsx`
- Modify: `frontend/src/components/assets/PreviewCard.tsx`
- Modify: `frontend/src/components/import/ImportCompletionToast.tsx`
- Modify: `frontend/src/components/detail/DetailPanel.tsx`
- Modify: `frontend/src/components/detail/VideoPlayer.tsx`

- [ ] **Step 1: Import storageUrl in each file and replace /storage/ references**

In each file listed above, add this import:

```typescript
import { storageUrl } from '../../lib/api';
// or '../lib/api' or '../../lib/api' depending on depth
```

Then replace each `/storage/...` template literal:

| File | Old | New |
|------|-----|-----|
| ScrubPreview.tsx | `` `/storage/${asset.id}/frame_${frameIndex}.jpg` `` | `storageUrl(`${asset.id}/frame_${frameIndex}.jpg`)` |
| AssetTableRow.tsx | `` `/storage/${asset.id}/thumbnail.jpg` `` | `storageUrl(`${asset.id}/thumbnail.jpg`)` |
| AssetCard.tsx | `` `/storage/${asset.id}/thumbnail.jpg` `` | `storageUrl(`${asset.id}/thumbnail.jpg`)` |
| SearchTableRow.tsx | `` `/storage/${asset.id}/thumbnail.jpg` `` | `storageUrl(`${asset.id}/thumbnail.jpg`)` |
| ImportCompletionToast.tsx | `` `/storage/${data.thumbnailPath}` `` | `storageUrl(data.thumbnailPath)` |
| PreviewCard.tsx | `` `/storage/${asset.id}/thumbnail.jpg` `` | `storageUrl(`${asset.id}/thumbnail.jpg`)` |
| PreviewCard.tsx | `` `/storage/${asset.id}/frame_${frameIndex}.jpg` `` | `storageUrl(`${asset.id}/frame_${frameIndex}.jpg`)` |
| DetailPanel.tsx | `` `/storage/${asset.id}/transcript.json` `` | `storageUrl(`${asset.id}/transcript.json`)` |
| VideoPlayer.tsx | `` `/storage/${asset.id}/thumbnail.jpg` `` | `storageUrl(`${asset.id}/thumbnail.jpg`)` |
| VideoPlayer.tsx | `` `/storage/${asset.filepath}` `` | `storageUrl(asset.filepath)` |

Also add `credentials: 'include'` to the fetch in DetailPanel.tsx:

```typescript
fetch(storageUrl(`${asset.id}/transcript.json`), { credentials: 'include' })
```

- [ ] **Step 2: Update the raw fetch calls in App.tsx and ImportView.tsx**

In `App.tsx` line 101, add credentials:

```typescript
const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/assets`, {
  method: 'POST',
  body: formData,
  credentials: 'include',
});
```

In `ImportView.tsx` line 62 and line 183, same pattern — add `credentials: 'include'` and prefix with `import.meta.env.VITE_API_URL || ''`:

```typescript
// line 62
const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/assets/${assetId}`, {
  credentials: 'include',
});

// line 183
const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/assets`, {
  method: 'POST',
  body: formData,
  credentials: 'include',
});
```

Better yet: add an `uploadAsset` and `pollAsset` function to `api.ts` and use those instead, to keep all fetch calls centralized. But that's optional — the inline approach works.

- [ ] **Step 3: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ frontend/src/App.tsx
git commit -m "feat: use storageUrl helper and credentials across all components"
```

---

### Task 9: Create useAuth hook

**Files:**
- Create: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Create frontend/src/hooks/useAuth.ts**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { checkAuth, login as apiLogin, logout as apiLogout } from '../lib/api';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth()
      .then(setIsAuthenticated)
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
    const ok = await apiLogin(password);
    setIsAuthenticated(ok);
    return ok;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, isLoading, login, logout };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useAuth.ts
git commit -m "feat: add useAuth hook — check, login, logout"
```

---

### Task 10: Create LoginPage component

**Files:**
- Create: `frontend/src/components/LoginPage.tsx`

- [ ] **Step 1: Create frontend/src/components/LoginPage.tsx**

```tsx
import { useState, type FormEvent } from 'react';

interface LoginPageProps {
  onLogin: (password: string) => Promise<boolean>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const ok = await onLogin(password);
    if (!ok) {
      setError('Wrong password');
      setPassword('');
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-8 w-80">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-semibold font-mono text-slate-50 tracking-tight">
            MAM
          </h1>
          <p className="text-slate-400 text-sm">Media Asset Management</p>
        </div>

        {/* Password field */}
        <div className="w-full flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            disabled={submitting}
            className="w-full px-4 py-3 bg-panel border border-border rounded-lg
                       text-slate-50 placeholder:text-slate-500
                       focus:outline-none focus:ring-2 focus:ring-cta/50 focus:border-cta
                       disabled:opacity-50 font-sans"
          />

          {error && (
            <p className="text-cta text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full py-3 bg-cta hover:bg-cta/90 text-white font-semibold
                       rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LoginPage.tsx
git commit -m "feat: add LoginPage component — password-only login screen"
```

---

### Task 11: Wire auth into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add auth gate to App.tsx**

Add imports at the top:

```typescript
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './components/LoginPage';
```

Add at the start of the `App` component function, before the existing state declarations:

```typescript
const { isAuthenticated, isLoading, login } = useAuth();

if (isLoading) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-slate-400">Loading...</div>
    </div>
  );
}

if (!isAuthenticated) {
  return <LoginPage onLogin={login} />;
}
```

- [ ] **Step 2: Verify the full flow works locally**

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173` — should see the login page
4. Enter the password you set — should redirect to the app
5. Refresh the page — should stay logged in (cookie persists)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: gate app behind login page with auth check"
```

---

### Task 12: Add vercel.json

**Files:**
- Create: `vercel.json` (project root)

- [ ] **Step 1: Create vercel.json**

```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Update .gitignore if needed**

Ensure `frontend/dist` is in `.gitignore` (it likely already is via the Vite default).

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel.json — SPA config for frontend deployment"
```

---

### Task 13: Final verification

- [ ] **Step 1: Full build check**

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

Both should succeed with no errors.

- [ ] **Step 2: End-to-end local test**

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev`
3. Open `http://localhost:5173`
4. Verify: login page appears → enter password → app loads → browse assets → play video → search works
5. Refresh: still logged in
6. Open devtools → Application → Cookies: `mam_session` cookie should be present, HttpOnly
