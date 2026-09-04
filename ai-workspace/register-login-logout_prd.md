Date created: 2026-09-04
Date last modified: 2026-09-04 (Phase 5 completed — identity sprint done)

# Register, Login, and Logout - Technical PRD

> **Sprint status:** COMPLETE. Phases 1–5 are done. Do not implement more identity
> features from this document. The next product sprint is MCQ authoring; write a
> **new** technical PRD for that work. Keep using this file as the identity contract
> (schema, APIs, hashing, no sessions).

## Overview/Problem

Quiz Maker is a greenfield application for teachers who want to collaboratively build a shared bank of multiple-choice questions. Before any of that collaboration can happen, the product has no way for a teacher to become a user of the system. There is no user store, no registration, and no login, so a second teacher cannot join the same application as a distinct person. This first phase solves that identity gap only: teachers can register, log in, and log out, then land on a placeholder MCQ page that the next sprint will turn into the real question-authoring experience.

---

## Hypothesis

We believe that a simple hashed-password register/login/logout flow, backed by a `users` table and a user service, will let multiple teachers enter the product as distinct accounts so later sprints can build a shared MCQ test bank on top of that identity.

---

## Scope

### In Scope

- A Cloudflare D1 `users` table and a local migration that creates it.
- A user service with create, update, and delete, plus the reads needed to look a user up for login and uniqueness checks.
- HTTP POST endpoints for register, login, and logout.
- Client-side password hashing before the register and login POST bodies are sent, so the plaintext password is not put on the wire.
- Server-side persistence of the hashed password only; plaintext passwords are never stored.
- Register and login pages that, on success, navigate to a stub MCQ page.
- A stub MCQ page with a logout control.
- A logout call that completes the API surface even though this phase has no session to invalidate.
- **Vitest** unit tests, written test-first in every phase. A phase is not complete until its new tests are green and the phase's other deliverables are met.

### Out of Scope

- Multiple-choice question authoring, editing, sharing, or any test-bank behavior beyond a stub page.
- Social logins (Google, Microsoft, GitHub, etc.).
- Tokens (JWT, opaque API tokens, refresh tokens).
- Session management of any kind: cookies, server sessions, `Set-Cookie`, or route guards that depend on a session.
- Password reset, email verification, account lockout, MFA, or role-based access control.
- HTTP endpoints for updating or deleting a user. Those methods live on the user service for later use, but are not exposed in this phase.
- `@cloudflare/vitest-pool-workers` and tests that hit a real D1 or the real Workers runtime. Unit tests mock D1 and `getCloudflareContext()`. Raise that pool with the user before introducing it.

### Cut

- **Cookies and server sessions** — deliberately deferred so this phase stays a thin identity layer. Logout therefore cannot revoke a server-side session; it is a client navigation plus a no-op POST.
- **Auth tokens** — same reason. Success responses return the user record (without the password hash) and the client routes to `/mcqs`. There is no credential to attach to later requests.
- **Protecting `/mcqs` from anonymous visits** — not possible without a session or token. Direct navigation to the stub page is accepted for this sprint.
- **Salted slow hashes (bcrypt / Argon2)** — considered for at-rest storage. Cut to avoid a new native/CPU-heavy dependency on Workers for a teaching first pass. SHA-256 via Web Crypto is the agreed baseline; a proper password KDF can replace it later without changing the table shape much.

---

## Technical Requirements

### Database Schema

This project has no database yet. This feature introduces **Cloudflare D1** (SQLite) with binding name `DB`, following `.cursor/rules/d1.mdc`.

Database name: `quiz-maker` (Wrangler D1 database name). Binding: `DB`.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
```

Column notes:

- `id` is an opaque text primary key. D1/SQLite generates it as a 32-character hex string.
- `username` and `email` are separate unique columns. They **may hold the same value** for a given user (for example both `jane@school.edu`). Uniqueness is per column, not "username must differ from email."
- Store `username` and `email` normalized to lowercase so uniqueness is case-insensitive.
- `password_hash` is the SHA-256 hex digest produced on the client. Never store the plaintext password. Never return this column from an API response.
- There is no foreign key in this phase. Future MCQ tables will reference `users.id`.

Apply the migration **locally only**:

```bash
npx wrangler d1 create quiz-maker
npx wrangler d1 migrations create quiz-maker create_users
npx wrangler d1 migrations apply quiz-maker --local
```

Do not run `migrations apply` with `--remote`. After the `d1_databases` block is added to `wrangler.jsonc`, run `npm run cf-typegen` so `env.DB` is typed.

### API Endpoints

Route handlers live under `src/app/api/`. This is an explicit exception to the usual "prefer Server Actions" convention: the product requirement is HTTP POST for register, login, and logout.

All mutating routes validate the JSON body **before** calling the user service. Treat every field as untrusted. Zod was proposed and **was not installed**. Validation lives in `src/app/api/auth/validation.ts` (`parseRegisterBody`, `parseLoginBody`, `RequestValidationError`). Ask before adding Zod.

#### POST /api/auth/register

Creates a user and returns the new record without `password_hash`.

**Request Body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "username": "jane@school.edu",
  "email": "jane@school.edu",
  "passwordHash": "hex-encoded-sha256-of-the-plaintext-password"
}
```

`username` and `email` may be identical. `passwordHash` is required; the server must reject a body that contains a `password` field instead of `passwordHash`.

**Response:**

- Success (201):

```json
{
  "user": {
    "id": "a1b2c3...",
    "firstName": "Jane",
    "lastName": "Doe",
    "username": "jane@school.edu",
    "email": "jane@school.edu"
  }
}
```

- Error (400): validation failure (missing fields, invalid email, empty names, `passwordHash` not a 64-character hex string).
- Error (409): `username` or `email` already taken. Message should name the colliding field when D1's unique constraint identifies it; otherwise use a generic "Username or email already in use."
- Error (500): unexpected server or database error.

On the client, a 201 redirects to `/mcqs`.

#### POST /api/auth/login

Looks up the user and compares password hashes.

**Request Body:**

```json
{
  "username": "jane@school.edu",
  "passwordHash": "hex-encoded-sha256-of-the-plaintext-password"
}
```

Login identifier is `username`. Because username may equal email, teachers who used their email as the username can type that same value here. This phase does not also accept a separate email field on login.

**Response:**

- Success (200): same `user` object shape as register (no `password_hash`).
- Error (400): validation failure.
- Error (401): unknown username **or** hash mismatch. Always the same message: `"Invalid username or password."` Do not reveal which one failed.
- Error (500): unexpected server or database error.

Hash comparison must be constant-time (`crypto.timingSafeEqual` via `nodejs_compat`), after confirming both buffers are the same length.

On the client, a 200 redirects to `/mcqs`.

#### POST /api/auth/logout

No server session exists, so this handler does not read or write the database.

**Request Body:** none (empty JSON object is acceptable).

**Response:**

- Success (200): `{ "ok": true }`
- Error (500): unexpected server error (should be rare).

The client then navigates to `/login`. Visiting `/mcqs` afterward is still possible in this phase because nothing is gated.

### User Interface Requirements

Use existing shadcn/ui pieces (`button`, `card`, `field`, `input`, `label`) and theme tokens. Styling is Tailwind via those components (no extra CSS modules). Forms are client components so they can hash with `crypto.subtle` and `fetch` the POST endpoints.

**Visual baseline:** official shadcn **Login** and **Signup** blocks. Page chrome is the block layout (full-viewport centered column, `max-w-sm`). Form markup starts from those blocks (`Card` + `FieldGroup` + `Field` + `FieldLabel` + `Input` + primary `Button`). Adapt the blocks as follows; do not ship stock demo features that contradict this PRD:

- **Do not** include “Login with Google” / “Sign up with Google” (social login is out of scope).
- **Do not** include “Forgot your password?” (password reset is out of scope).
- Login identifier is **Username**, not Email. Description copy should say username, not “enter your email”.
- Signup/register collects **First name** and **Last name** (not a single Full Name), plus **Username**, **Email**, **Password**, and **Confirm password**. Helper text may note that username and email may be the same.
- Cross-links use real routes: register → `/login` (“Sign in”), login → `/register` (“Sign up”).
- Components live at `@/components/login-form` and `@/components/signup-form` (the signup form is the register UI).

#### Home (`/`)

- Replace the Next.js starter page with a simple Quiz Maker landing.
- Primary actions: navigate to Register and Log in (shadcn `Button` as links).
- Short copy that this is a shared test-bank tool for teachers.

#### Register (`/register`)

- Page wrapper from the shadcn signup block:

```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    <SignupForm />
  </div>
</div>
```

- Fields: First name, Last name, Username, Email, Password, Confirm password.
- Validation (client, before hashing):
  - First and last name required, trimmed, non-empty.
  - Username required, trimmed, non-empty.
  - Email required and a valid email address.
  - Password required, minimum 8 characters.
  - Confirm password must match password.
- Username and email may be the same value; do not treat that as an error.
- On submit: hash the password with SHA-256, POST `/api/auth/register` with `passwordHash` (never the plaintext), then navigate to `/mcqs` on 201.
- Surface field and form errors via `FieldError`. Show the 409 uniqueness message on the matching field when possible.
- Link to `/login` for teachers who already have an account.

#### Log in (`/login`)

- Page wrapper from the shadcn login block:

```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    <LoginForm />
  </div>
</div>
```

- Fields: Username, Password.
- Validation: both required; password min length 8 (same rule as register, so a mistyped short string fails locally).
- On submit: hash the password with SHA-256, POST `/api/auth/login` with `passwordHash`, then navigate to `/mcqs` on 200.
- Show the generic 401 message without indicating whether the username existed.
- Link to `/register`.

#### MCQ stub (`/mcqs`)

- Placeholder page only. Title and a sentence that question authoring arrives in a later sprint. No MCQ forms, lists, or APIs.
- Logout button: POST `/api/auth/logout`, then navigate to `/login`. If the POST fails, still navigate to `/login` after showing a brief error — there is no session to preserve.
- No auth wall on this route in this phase.

#### Logout

- No dedicated `/logout` page. Logout is the control on `/mcqs` (and may be reused later in a header).

---

## Testing Approach (Vitest, test-first)

This feature is built **test-driven**. Vitest (`vi` for mocks) is the unit-testing framework, following `.cursor/skills/testing/SKILL.md`. The user has approved adding it.

### Red → green → next

For **every** implementation phase:

1. **Write the tests listed in that phase first.** Colocate them with the subject (`src/lib/password.ts` ↔ `src/lib/password.test.ts`).
2. **Run `npm test` and confirm red.** Failure must be for the right reason: missing module, missing export, or a real assertion miss. If a test cannot fail, it is not a test — rewrite it.
3. **Implement the minimum code** to make that phase's tests pass. Do not implement the next phase's production code while making this phase green.
4. **Re-run `npm test`.** The phase is not done until the new tests are green, previous phases stay green, and the phase deliverables are met.
5. Acceptance criteria in this PRD still apply. Green tests are necessary; they do not replace lint, build, or browser checks in Phase 5.

### Harness rules

- Install Vitest the first time it is needed (start of Phase 1), using the packages and `vitest.config.ts` from the testing skill: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`.
- Scripts: `"test": "vitest run"` and `"test:watch": "vitest"`.
- `vite-tsconfig-paths` is required so `@/` imports resolve.
- `beforeEach(() => { vi.clearAllMocks(); })` in files that mock.
- Never hit a real network, real D1, or real model provider. Mock `@opennextjs/cloudflare` / `src/lib/db` at the module boundary with `vi.mock`.
- Stub `server-only` with `vi.mock("server-only", () => ({}))` when importing server modules.
- Assert observable output and side effects (return values, HTTP status, `fetch` body, what the user can see). Do not assert `expect(true).toBe(true)` or other unfalsifiable checks.
- Cover failure paths, not only the happy path.
- Name tests so the failure message explains what broke.
- Each test must pass in isolation. Do not depend on order or leftover state.
- Server Components are not rendered in Testing Library. Test data/logic as functions; render only client components (`SignupForm`, `LoginForm`, logout control).

### What "red" looks like

The first `npm test` of a phase should fail because the subject does not exist yet or does not satisfy the assertion — for example `Cannot find module '@/lib/password'` or `expected 201, received 500`. That is the signal to implement. Do not "fix" red by weakening the assertion.

---

## Implementation Phases

### Phase 1: D1 and users migration - COMPLETED

**Objective**: Give the app a Vitest harness, a local D1 database, a `users` table, and a testable `getDb()` helper.

**TDD order**: Install the harness, write the tests below, run `npm test` (expect red), then implement until green. Wrangler D1 create/apply is not unit-tested; it is a deliverable that still must happen in this phase.

**Tests (write first — expect red)**:

| File | Behavior to prove |
|------|-------------------|
| `src/lib/user-schema.test.ts` | The migration SQL under `migrations/` creates `users` with `id` (primary key), `first_name`, `last_name`, `username`, `email`, `password_hash`, and unique constraints on `username` and `email`. Fail if the file is missing or the DDL is incomplete. |
| `src/lib/db.test.ts` | `getDb()` returns `env.DB` from a mocked `getCloudflareContext()`. Mock `@opennextjs/cloudflare`; do not call real bindings. Fail until `src/lib/db.ts` exists and reads the binding that way. |

**Implementation (make green)**:

1. Install Vitest and related packages per `.cursor/skills/testing/SKILL.md`. Add `vitest.config.ts` and the `test` / `test:watch` scripts. This is the only phase that sets up the harness.
2. Create the D1 database `quiz-maker` and add the `d1_databases` binding `DB` to `wrangler.jsonc`.
3. Run `npm run cf-typegen`. Do not hand-edit `cloudflare-env.d.ts`.
4. Create a migration that defines `users` as specified above (this is what turns `user-schema.test.ts` green).
5. Apply the migration locally (`--local` only).
6. Add `src/lib/db.ts` that returns `env.DB` via `getCloudflareContext()` so later code does not touch the binding directly.

**Phase-complete signal**: `npm test` green for the two files above; D1 bound; migration applied locally.

**Deliverables**:

- Vitest installed and `npm test` runnable
- D1 binding in `wrangler.jsonc`
- `migrations/` SQL for `users`
- Typed `env.DB`
- Local schema applied
- `src/lib/db.ts` + passing tests

### Phase 2: Password helper and user service - COMPLETED

**Objective**: Centralize hashing and all user persistence.

**TDD order**: Write the tests below against modules that do not exist yet. Confirm red (`Cannot find module` or failed assertions). Implement `hashPassword` and the user service until green. Mock `src/lib/db` (or a fake statement builder) — never a real D1.

**Tests (write first — expect red)**:

| File | Behavior to prove |
|------|-------------------|
| `src/lib/password.test.ts` | `hashPassword` returns a 64-character lowercase hex string; same plaintext hashes the same; different plaintext hashes differently; the return value is not the plaintext. |
| `src/lib/services/user-service.test.ts` | `createUser` persists bound fields (not concatenated SQL), normalizes username and email to lowercase, allows username === email, and returns a user **without** `passwordHash` / `password_hash`. |
| `src/lib/services/user-service.test.ts` | Duplicate username or email becomes a typed conflict error (the 409 mapping), not an untyped throw. |
| `src/lib/services/user-service.test.ts` | `getUserByUsername` returns the user when present and `null` when missing; lookup is case-insensitive because of stored lowercase. |
| `src/lib/services/user-service.test.ts` | `getUserById` returns the user or `null`. |
| `src/lib/services/user-service.test.ts` | `updateUser` changes provided fields and updates `updated_at` (or equivalent); missing id yields a not-found result/error that the test can distinguish from success. |
| `src/lib/services/user-service.test.ts` | `deleteUser` removes the row; deleting a missing id is a safe not-found, not a crash. |
| `src/lib/services/user-service.test.ts` | Internal login comparison can read the stored hash (separate internal type or method) without putting `password_hash` on the public `User` type used for API responses. |

**Implementation (make green)**:

1. Add `src/lib/password.ts` with `hashPassword(plaintext)` using `crypto.subtle.digest("SHA-256", ...)` and hex encoding. Safe to import from client components (no D1, no `server-only`).
2. Add `src/lib/services/user-service.ts` with `createUser`, `updateUser`, `deleteUser`, `getUserById`, and `getUserByUsername`. Prepared statements and numbered placeholders (`?1`, `?2`).
3. `createUser` / `updateUser` persist `password_hash` as provided. They do not hash plaintext.
4. Map D1 unique-constraint failures to a typed conflict error the route handlers can turn into 409.

**Phase-complete signal**: `npm test` green including Phase 1 and Phase 2 files.

**Deliverables**:

- Shared SHA-256 helper
- User service used later by register and login
- No SQL string concatenation with user input
- Passing colocated tests

### Phase 3: Auth route handlers - COMPLETED

**Objective**: Expose register, login, and logout as HTTP POST endpoints.

**TDD order**: Write handler tests that import `POST` and call it with `new Request(...)`. Mock the user service (and db) so tests never touch D1. Confirm red, then implement routes until green.

Zod is still **not installed**. Phase 3 used explicit request-body checks in `src/app/api/auth/validation.ts` instead of adding a dependency. The 400 shapes match this PRD. Zod can still be added later if approved.

**Tests (write first — expect red)**:

| File | Behavior to prove |
|------|-------------------|
| `src/app/api/auth/register/route.test.ts` | Valid body → 201 and a `user` object with id, names, username, email; **no** `passwordHash` / `password_hash` in the JSON. |
| `src/app/api/auth/register/route.test.ts` | Username and email may be the same; 201 still. |
| `src/app/api/auth/register/route.test.ts` | Missing/invalid fields, invalid email, or a `password` field instead of `passwordHash` → 400. `passwordHash` that is not 64 hex chars → 400. |
| `src/app/api/auth/register/route.test.ts` | User-service conflict → 409 with a usable message. |
| `src/app/api/auth/login/route.test.ts` | Valid credentials → 200 and the public user object (no hash). |
| `src/app/api/auth/login/route.test.ts` | Unknown username → 401 with exactly `"Invalid username or password."` |
| `src/app/api/auth/login/route.test.ts` | Hash mismatch → 401 with the **same** message (compare both 401 bodies in the test). |
| `src/app/api/auth/login/route.test.ts` | Invalid body → 400. |
| `src/app/api/auth/logout/route.test.ts` | POST → 200 `{ "ok": true }`. User service is **not** called (`expect(mockCreate).not.toHaveBeenCalled()` or equivalent). |

**Implementation (make green)** — what actually shipped:

1. Explicit validation in `src/app/api/auth/validation.ts` (no Zod).
2. `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`.
3. Register and login call the user service only. Logout does not.
4. Strip `password_hash` from every JSON response via `toPublicUser`.
5. Identical 401 messaging. Compare hashes with `timingSafeEqual` after length checks (`src/app/api/auth/password-compare.ts`). When the user is missing, still compare against dummy `"0".repeat(64)` so a missing user is not a fast-path skip.

**Phase-complete signal**: `npm test` green including all auth `route.test.ts` files.

**Deliverables**:

- Three route handlers under `src/app/api/auth/`
- Validation schemas colocated with those routes
- Error status codes as specified
- Passing route tests

### Phase 4: UI pages and navigation - COMPLETED

**Objective**: Teachers can register or log in from the browser and reach the MCQ stub.

**TDD order**: Extract client components (`SignupForm`, `LoginForm`, logout control) so Testing Library can render them. Write the tests below with `render` / `userEvent`, mock `fetch` and `next/navigation`. Confirm red, then build the UI until green. Do not treat a screenshot as the phase-complete signal.

**Tests (write first — expect red)**:

| File | Behavior to prove |
|------|-------------------|
| `src/components/signup-form.test.tsx` | Renders first name, last name, username, email, password, confirm password, and a submit control (query by label/role, not test ids). |
| `src/components/signup-form.test.tsx` | Client validation: empty required fields and mismatched confirm password do not call `fetch`; matching username and email is allowed. |
| `src/components/signup-form.test.tsx` | On valid submit, `fetch` is called with `POST /api/auth/register` and a JSON body that includes `passwordHash` (64 hex chars) and **does not** include `password`. |
| `src/components/signup-form.test.tsx` | 201 response navigates to `/mcqs` (mocked `useRouter` / `router.push`). |
| `src/components/signup-form.test.tsx` | 409 surfaces an error the user can read (field or form). |
| `src/components/login-form.test.tsx` | Renders username and password; submit hashes then `POST /api/auth/login` without plaintext `password` in the body; 200 navigates to `/mcqs`; 401 shows `"Invalid username or password."` |
| `src/components/logout-button.test.tsx` | Activate logout → `POST /api/auth/logout`, then navigate to `/login`. If `fetch` rejects, still navigate to `/login`. |
| Landing / stub (optional extra) | If the landing and `/mcqs` copy live in client components, assert Register/Log in links and stub heading. If they stay Server Components, skip render tests and cover links in the browser in Phase 5. |

**Implementation (make green)**:

1. Replace `/` with the Quiz Maker landing.
2. Build `/register` and `/login` from the shadcn block page wrappers, using `SignupForm` and `LoginForm`.
3. Build `/mcqs` stub with the logout control under test.
4. Confirm in tests (and later in the browser) that `fetch` bodies use `passwordHash` only.
5. Omit Google buttons and forgot-password from the stock blocks.

**Phase-complete signal**: `npm test` green including the new `*.test.tsx` files.

**Deliverables**:

- Landing, register, login, and MCQ stub routes
- Client hashing before `fetch`
- Redirects: register/login → `/mcqs`; logout → `/login`
- Passing component tests

### Phase 5: Verification - COMPLETED

**Objective**: Prove the whole feature works: full Vitest suite, lint, build, and browser.

**TDD order**: No new red suite unless a gap appeared. The existing suite is the regression signal.

**Command results recorded 2026-09-04 (run separately — not in parallel):**

| Command | Result |
|---------|--------|
| `npm test` | **41 passed / 10 files**, Vitest 3.2.4, exit 0. First attempt that overlapped `lint` + `build` OOMed (`fatal error: runtime: cannot allocate memory`) and reported 10 failed files with no tests collected. Re-ran `npm test` alone; that run is the recorded result. |
| `npm run lint` | **exit 0**. Two `@typescript-eslint/no-unused-vars` warnings (`logout` unused request param, test `bind` unused rest args) were then removed. ESLint does **not** ignore `_prefixed` unused args in this config — omit the parameter instead. |
| `npm run build` | **exit 0**. Next.js 16.2.12 Turbopack. Routes: `/`, `/login`, `/register`, `/mcqs` (static); `/api/auth/register`, `/login`, `/logout` (dynamic). |
| Browser | User confirmed the app works **locally and after deploy** (register / login / logout happy path). |

**Phase-complete signal**: Suite green; lint and build from the commands; user-verified browser (local + deployed).

**Deliverables**:

- Full Vitest suite green (41 tests)
- Lint and build results from the commands
- Browser-verified happy path (user)
- This PRD, `AGENTS.md`, and Cursor rules/skills updated for the next sprint

---

## Technical Implementation Details

### Key Files

| Path | Purpose |
|------|---------|
| `wrangler.jsonc` | D1 binding `DB`, database `quiz-maker`. May still use placeholder `database_id` `local-dev-quiz-maker` in git; do not overwrite a real UUID if one is present. |
| `migrations/0001_create_users.sql` | `users` table DDL |
| `src/lib/db.ts` | `getDb()` → `env.DB` via `getCloudflareContext({ async: true })` |
| `src/lib/password.ts` | SHA-256 hex helper (safe in client components) |
| `src/lib/services/user-service.ts` | create / update / delete / lookup; `User` vs `UserAuth` |
| `src/app/api/auth/validation.ts` | Request-body checks (no Zod) |
| `src/app/api/auth/password-compare.ts` | `timingSafeEqual` after length check |
| `src/app/api/auth/register/route.ts` | `POST` register → 201 `{ user }` |
| `src/app/api/auth/login/route.ts` | `POST` login → 200 `{ user }` or 401 |
| `src/app/api/auth/logout/route.ts` | `POST` logout → `{ ok: true }` (no DB) |
| `src/app/page.tsx` | Landing with Register / Log in |
| `src/app/register/page.tsx` | shadcn block wrapper + `SignupForm` |
| `src/app/login/page.tsx` | shadcn block wrapper + `LoginForm` |
| `src/app/mcqs/page.tsx` | Ungated stub + `LogoutButton` |
| `src/components/login-form.tsx` | Username + password; hash then `fetch` |
| `src/components/signup-form.tsx` | Register fields; hash then `fetch` |
| `src/components/logout-button.tsx` | POST logout then always `router.push("/login")` |
| `src/components/ui/` | shadcn primitives — do not hand-edit |
| `vitest.config.ts` | jsdom, globals, `vite-tsconfig-paths` for `@/` |
| colocated `*.test.ts(x)` | 10 files / 41 tests |

App Router pages (as of `next build`): `/`, `/login`, `/register`, `/mcqs`, plus the three auth APIs.

### Database access

`server-only` is **not** installed. `getDb` does not import it. Never import this module from `'use client'` files.

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }
  return env.DB;
}
```

### Password hashing (client-safe)

```typescript
export async function hashPassword(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

### User service contract

- Public `User`: `id`, `firstName`, `lastName`, `username`, `email` (no hash).
- `UserAuth`: `id`, `passwordHash` — login only, via `getUserAuthByUsername`.
- Username and email stored **lowercase** (`trim` + `toLowerCase`).
- `createUser` INSERT uses `RETURNING` + `all()` / `results[0]` (not `first()`).
- Unique violations → `UserConflictError` with `field: "username" | "email" | "unknown"` (regex on D1 message: `users.username` / `users.email`).
- Missing row on update/delete → `UserNotFoundError`.
- Prepared statements with numbered placeholders `?1`, `?2`.

```typescript
const { results } = await db
  .prepare(
    `INSERT INTO users (first_name, last_name, username, email, password_hash)
     VALUES (?1, ?2, ?3, ?4, ?5)
     RETURNING id, first_name, last_name, username, email`,
  )
  .bind(firstName, lastName, username, email, input.passwordHash)
  .all<UserRow>();
```

### Auth HTTP

Validation helpers (not Zod): `readJsonBody`, `parseRegisterBody`, `parseLoginBody`, `toPublicUser`, `INVALID_CREDENTIALS = "Invalid username or password."`. Reject a body that contains `password`. `passwordHash` must match `/^[a-f0-9]{64}$/i`.

Login compare:

```typescript
const auth = await getUserAuthByUsername(input.username);
const storedHash = auth?.passwordHash ?? "0".repeat(64);
const hashesMatch = passwordHashesEqual(storedHash, input.passwordHash);
if (!auth || !hashesMatch) {
  return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
}
```

`passwordHashesEqual` uses `timingSafeEqual` from `node:crypto` after confirming equal byte lengths (`nodejs_compat` is on in `wrangler.jsonc`).

Logout:

```typescript
export async function POST(): Promise<Response> {
  return Response.json({ ok: true });
}
```

Error JSON shape: `{ error: string }`. Success register/login: `{ user: User }`.

### Client submit

Register (`SignupForm`):

```typescript
const passwordHash = await hashPassword(password);
const response = await fetch("/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ firstName, lastName, username, email, passwordHash }),
});
if (response.status === 201) router.push("/mcqs");
```

Login uses `POST /api/auth/login` with `{ username, passwordHash }` and `router.push("/mcqs")` on 200.

Logout always navigates even if `fetch` throws.

Page wrappers:

```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    <LoginForm /> {/* or <SignupForm /> */}
  </div>
</div>
```

### Vitest harness (already installed)

Pinned: `vitest@3.2.4`, `@vitejs/plugin-react@4.5.2` (do **not** bump plugin-react to 6 — Babel 8 vs this repo's Babel 7). `vite-tsconfig-paths` required for `@/`. `@testing-library/jest-dom` is **not** installed — assert `.textContent`, not `toHaveTextContent`. Form tests need `waitFor` after submit because hashing is async. Mock `@/lib/db` (not real D1). `server-only` is not a dependency; do not add a mock for it unless a later module imports it.

### Important Notes

- D1 is server-only. Never import `src/lib/db.ts` or the user service into a `'use client'` file.
- `getCloudflareContext()` is the only way to reach `env.DB`. There is no global `env`.
- `npm run dev` runs on Node and will not catch Workers-only D1 issues. Prefer `npm run preview` for Workers-sensitive checks.
- Ask before adding Zod, a session library, an AI SDK, or any other new dependency.
- Mock D1. Do not introduce `@cloudflare/vitest-pool-workers` without asking.
- Agents must not run `npm run deploy` unless the user asks. The user has already deployed this sprint successfully.
- Agents must not apply D1 migrations with `--remote` unless the user asks. Local apply: `npx wrangler d1 migrations apply quiz-maker --local`. If Wrangler prompts in a non-interactive shell, `CI=true` can skip the confirmation.
- SHA-256 is unsalted and fast. It is a teaching baseline. The client hash **is** the stored secret, so a leaked `password_hash` is reusable as a login credential.
- Because there is no session, "logged in" is only a client navigation to `/mcqs`. Direct visits to `/mcqs` are allowed. A later sprint that needs a current user must add a real session or token **in a new PRD**.
- Corporate npm (`nexus.releng.pearsondev.com`) has hung during installs. Use `--registry https://registry.npmjs.org` if that happens.
- Do not run `npm test`, `npm run lint`, and `npm run build` at the same time on a memory-constrained Windows box.

---

## Acceptance Criteria

- [x] A local D1 database exists, `DB` is bound, and the `users` migration is applied locally.
- [x] A teacher can register with first name, last name, username, email, and password. (unit tests + user local/deploy)
- [x] Username and email may be the same value and registration still succeeds. (unit tests + user)
- [x] The register POST body contains `passwordHash` and does not contain the plaintext password.
- [x] The `users.password_hash` column stores a hash, not the plaintext password. (service persists the 64-char hex the client sent; no plaintext column)
- [x] Duplicate username or duplicate email is rejected with 409 and a clear message.
- [x] Invalid register payloads are rejected with 400.
- [x] After successful registration the teacher is taken to `/mcqs`.
- [x] A registered teacher can log in with username and password and is taken to `/mcqs`.
- [x] Wrong password or unknown username returns 401 with `"Invalid username or password."` and does not distinguish which failed.
- [x] Login POST body contains `passwordHash` and does not contain the plaintext password.
- [x] Logout from `/mcqs` calls `POST /api/auth/logout` and then navigates to `/login`.
- [x] `/mcqs` is a stub only: no MCQ create/edit/list behavior.
- [x] API responses never include `password_hash`.
- [x] User service can create, update, and delete users (update/delete need not have UI or HTTP routes).
- [x] Vitest is installed; `npm test` runs the suite.
- [x] Each implementation phase was developed test-first: tests existed and failed before the phase's production code made them pass.
- [x] `npm test` is green for schema/db, password, user service, auth routes, and client auth components (41 tests).
- [x] `npm run lint` and `npm run build` succeed after implementation (exit 0, 2026-09-04).

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Teacher can obtain an account and reach the MCQ stub | Under 2 minutes on the happy path | Manual timing of register → `/mcqs` |
| Plaintext passwords in transit (JSON body) | Zero | Network inspector on register and login |
| Plaintext passwords at rest | Zero | Inspect a local D1 row after register |
| Duplicate-account confusion | Duplicate username/email never creates a second row | Attempt register twice; second is 409 |
| Login failure leakage | No "user exists" vs "bad password" distinction | Compare 401 bodies for both cases (unit test + browser) |
| Phase completion | Tests for that phase green before moving on | `npm test` at the end of each phase |

---

## Dependencies

### External Dependencies

- **Cloudflare D1** — bound as `DB`, database name `quiz-maker`, table `users`.
- **Web Crypto (`crypto.subtle`)** — SHA-256 in the browser and on Workers. Already available; not an npm package.
- **Zod** (proposed, **not installed**) — do not add without asking. Auth uses `src/app/api/auth/validation.ts`.
- **Vitest** (installed) — `npm test`. Pin `vitest@3.2.4` + `@vitejs/plugin-react@4.5.2`. See `.cursor/skills/testing/SKILL.md`.

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — D1 access from server code.
- `src/lib/services/user-service.ts` — used by register and login handlers.
- shadcn/ui `button`, `card`, `field`, `input`, `label` — auth forms.
- Tailwind v4 theme tokens in `src/app/globals.css`.

No new environment secrets are required for this phase (no OAuth, no JWT signing key). If none are added, `.dev.vars.example` stays unchanged.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` (Node) and D1 (Workers) disagree, so auth appears broken only under `preview`.
- **Mitigation**: Verify register/login against `npm run preview` before calling the phase done.

- **Risk**: SHA-256 hashes in the database are reusable as login credentials if leaked (the client already sends the hash).
- **Mitigation**: Accepted for this sprint. Documented as a known limitation. A later phase should switch to a salted KDF on the server and stop treating the client hash as the stored secret.

- **Risk**: Unique-constraint error messages from D1 are opaque, leading to a generic 500 on duplicate signup.
- **Mitigation**: Catch constraint failures in the user service and map them to 409 before they reach a generic handler.

- **Risk**: Importing the user service or `db.ts` into a client form, which will fail at build time or leak server code.
- **Mitigation**: Keep D1 behind `src/lib/`; client forms only import `hashPassword` and call `fetch`.

- **Risk**: Unit tests accidentally talk to real D1 or fail because `getCloudflareContext()` is unmocked under jsdom.
- **Mitigation**: Mock `@opennextjs/cloudflare` and `src/lib/db`. Keep D1 behind that module. Follow the testing skill; do not add the Workers vitest pool unless asked.

- **Risk**: Tests are written after the code and never observed red, so they encode the implementation instead of the requirement.
- **Mitigation**: Each phase lists tests first. Agents must run `npm test` and record red before implementing that phase's production code.

### User Experience Risks

- **Risk**: Teachers expect to stay logged in after a refresh of `/mcqs` and instead see an ungated stub with no identity.
- **Mitigation**: Stub copy can say question tools are coming next; do not imply a persistent login. Session work is a later PRD.

- **Risk**: Logout feels like a no-op because `/mcqs` remains reachable by URL.
- **Mitigation**: Logout still returns to `/login`. Do not fake a protected page without a session.

- **Risk**: Teachers try to log in with email when they chose a distinct username.
- **Mitigation**: Login label is "Username". Register helper text can say email is allowed as the username if they want one value for both.

---

## Troubleshooting Guide

### D1 binding missing at runtime

**Problem**: `env.DB` is undefined or TypeScript does not know `DB`.
**Cause**: Binding not added to `wrangler.jsonc`, or `cf-typegen` not run.
**Solution**: Add the `d1_databases` block, run `npm run cf-typegen`, restart the preview server.
**Code Reference**: `wrangler.jsonc`, `cloudflare-env.d.ts` (generated)

### Migration not visible locally

**Problem**: `no such table: users`.
**Cause**: Migration created but not applied with `--local`, or preview is using a different local D1 state.
**Solution**: `npx wrangler d1 migrations apply quiz-maker --local`. Never use `--remote` unless the user asks. Non-interactive shells: prefix with `CI=true` if Wrangler waits for confirmation.

### Unique constraint becomes a 500

**Problem**: Registering an existing username returns 500 instead of 409.
**Cause**: D1 error not mapped in the user service.
**Solution**: `asConflictError` in `user-service.ts` looks for `/unique constraint/i` and `users.username` / `users.email`. Keep that mapping if D1 error text changes.

### Wrangler not authenticated / placeholder database_id

**Problem**: `npx wrangler d1 create quiz-maker` cannot run; `database_id` in git is `local-dev-quiz-maker`.
**Cause**: Phase 1 ran without `wrangler login`. Local D1 still works with the placeholder.
**Solution**: The user later deployed successfully, so a real remote DB may exist in the Cloudflare account even if git still has the placeholder. Do not invent a UUID. If `wrangler.jsonc` still says `local-dev-quiz-maker` and remote ops fail, the user should `npx wrangler login`, `npx wrangler d1 create quiz-maker` (or list existing), put the UUID in `wrangler.jsonc`, and run `npm run cf-typegen`. Apply new migrations `--local` unless they ask for `--remote`.

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Keep `tsconfigPaths()` in `vitest.config.ts`.

### `getCloudflareContext` blows up in tests

**Problem**: jsdom tests throw when importing db/user-service.
**Cause**: Real OpenNext context is not available in Vitest.
**Solution**: Mock `@/lib/db` (`vi.mock("@/lib/db")`) for user-service tests. `db.test.ts` mocks `@opennextjs/cloudflare`.

### Vitest OOM / "10 failed" with no tests collected

**Problem**: `fatal error: runtime: cannot allocate memory` or test files fail during collect.
**Cause**: `npm test` overlapping `npm run lint` and `npm run build` on Windows.
**Solution**: Run them one at a time.

### npm install hangs

**Problem**: `npm install` never finishes (corporate Nexus registry).
**Cause**: `nexus.releng.pearsondev.com` timeout.
**Solution**: `npm install … --registry https://registry.npmjs.org`

### `@vitejs/plugin-react@6` / Vitest 4 install fails

**Problem**: Peer/Babel conflict during install.
**Cause**: plugin-react 6 wants Babel 8; this repo still has Babel 7.
**Solution**: Stay on `vitest@3.2.4` and `@vitejs/plugin-react@4.5.2`.

### jest-dom matcher missing

**Problem**: `toHaveTextContent is not a function`.
**Cause**: `@testing-library/jest-dom` is not installed.
**Solution**: Assert `element.textContent` or add the matcher only after asking.

---

## Notes for AI Agents

This identity sprint is **done**. When you are in a later conversation:

1. Do **not** add social login, tokens, cookies, sessions, password reset, MFA, roles, or MCQ CRUD from this PRD. MCQ work needs a **new** PRD.
2. Honor the identity contract: `passwordHash` on the wire, SHA-256 client hash, username login, username may equal email, identical 401 message, no hash in JSON, `/mcqs` ungated.
3. Future MCQ tables: new migration, FK `users.id`, prepared statements, `?1`/`?2`, `all()`/`results[0]`.
4. Keep TDD: write Vitest tests first, observe red, then implement. Follow `.cursor/skills/testing/SKILL.md`. Mock `@/lib/db`. Ask before `@cloudflare/vitest-pool-workers`.
5. Ask before adding Zod, session libraries, AI SDK, or other dependencies. `server-only` is not installed.
6. Never run `npm run deploy` unless asked. Never apply D1 `--remote` unless asked.
7. File-scoped rules: `.cursor/rules/auth.mdc`, `.cursor/rules/d1.mdc`, `.cursor/rules/nextjs.mdc` (auth is an HTTP-POST exception; Zod is not required yet).
8. Cite code as `filepath:line-number`. Keep this document current; remove stale instructions rather than stacking contradictions.

---

## Handoff: next sprint (MCQ test bank)

Write `ai-workspace/` a new technical PRD before coding questions. Starting points that must stay true:

- Teachers already have accounts. Do not rebuild register/login.
- There is **no current-user** on the server. If MCQs must be attributed to an author, that requires a session/token design **in the new PRD** (out of scope here). Until then, either store `author_id` only when you have a real auth mechanism, or keep questions unscoped — decide in the new PRD, do not silently add cookies.
- `/mcqs` is a placeholder page. Replace it with real authoring UI when the new PRD says so; keep using shadcn `button`, `card`, `field`, `input`, `label` (and table/dialog already generated under `src/components/ui/`).
- Reuse `getDb()`, the `users` table, and Vitest. Do not reinstall the test harness.

---

## Current Status

**Last Updated**: 2026-09-04
**Current Phase**: Phase 5 - Verification — **COMPLETED**
**Status**: Identity sprint complete (register / login / logout + MCQ stub)
**Branch**: `feature/register-login-logout`
**Next Steps**: New PRD for MCQ authoring. Do not extend this PRD with question CRUD.
