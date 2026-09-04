Date created: 2026-09-04
Date last modified: 2026-09-04 (Phase 1 completed)

# Register, Login, and Logout - Technical PRD

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

All mutating routes validate the JSON body with Zod before calling the user service. Treat every field as untrusted.

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

Use existing shadcn/ui pieces (`button`, `card`, `field`, `input`, `label`) and theme tokens. Forms are client components so they can hash with `crypto.subtle` and `fetch` the POST endpoints.

#### Home (`/`)

- Replace the Next.js starter page with a simple Quiz Maker landing.
- Primary actions: navigate to Register and Log in.
- Short copy that this is a shared test-bank tool for teachers.

#### Register (`/register`)

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
- Server Components are not rendered in Testing Library. Test data/logic as functions; render only client components (`RegisterForm`, `LoginForm`, logout control).

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

### Phase 2: Password helper and user service - PLANNED

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

### Phase 3: Auth route handlers - PLANNED

**Objective**: Expose register, login, and logout as HTTP POST endpoints.

**TDD order**: Write handler tests that import `POST` and call it with `new Request(...)`. Mock the user service (and db) so tests never touch D1. Confirm red, then implement routes until green.

Zod is still **not installed**. Confirm with the user before adding it, then validate every body. If Zod is declined, validate with equivalent explicit checks; the tests still require the same 400 shapes.

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

**Implementation (make green)**:

1. Confirm Zod (or the agreed alternative), then schema-validate every body.
2. Implement `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`.
3. Register and login call the user service only. Logout does not.
4. Strip `password_hash` from every JSON response.
5. Use identical 401 messaging for unknown user and bad hash. Compare hashes with `crypto.timingSafeEqual` after length checks.

**Phase-complete signal**: `npm test` green including all auth `route.test.ts` files.

**Deliverables**:

- Three route handlers under `src/app/api/auth/`
- Validation schemas colocated with those routes
- Error status codes as specified
- Passing route tests

### Phase 4: UI pages and navigation - PLANNED

**Objective**: Teachers can register or log in from the browser and reach the MCQ stub.

**TDD order**: Extract client components (`RegisterForm`, `LoginForm`, logout control) so Testing Library can render them. Write the tests below with `render` / `userEvent`, mock `fetch` and `next/navigation`. Confirm red, then build the UI until green. Do not treat a screenshot as the phase-complete signal.

**Tests (write first — expect red)**:

| File | Behavior to prove |
|------|-------------------|
| `src/components/auth/register-form.test.tsx` | Renders first name, last name, username, email, password, confirm password, and a submit control (query by label/role, not test ids). |
| `src/components/auth/register-form.test.tsx` | Client validation: empty required fields and mismatched confirm password do not call `fetch`; matching username and email is allowed. |
| `src/components/auth/register-form.test.tsx` | On valid submit, `fetch` is called with `POST /api/auth/register` and a JSON body that includes `passwordHash` (64 hex chars) and **does not** include `password`. |
| `src/components/auth/register-form.test.tsx` | 201 response navigates to `/mcqs` (mocked `useRouter` / `router.push`). |
| `src/components/auth/register-form.test.tsx` | 409 surfaces an error the user can read (field or form). |
| `src/components/auth/login-form.test.tsx` | Renders username and password; submit hashes then `POST /api/auth/login` without plaintext `password` in the body; 200 navigates to `/mcqs`; 401 shows `"Invalid username or password."` |
| `src/components/auth/logout-button.test.tsx` | Activate logout → `POST /api/auth/logout`, then navigate to `/login`. If `fetch` rejects, still navigate to `/login`. |
| Landing / stub (optional extra) | If the landing and `/mcqs` copy live in client components, assert Register/Log in links and stub heading. If they stay Server Components, skip render tests and cover links in the browser in Phase 5. |

**Implementation (make green)**:

1. Replace `/` with the Quiz Maker landing.
2. Build `/register` and `/login` using the client forms under test.
3. Build `/mcqs` stub with the logout control under test.
4. Confirm in tests (and later in the browser) that `fetch` bodies use `passwordHash` only.

**Phase-complete signal**: `npm test` green including the new `*.test.tsx` files.

**Deliverables**:

- Landing, register, login, and MCQ stub routes
- Client hashing before `fetch`
- Redirects: register/login → `/mcqs`; logout → `/login`
- Passing component tests

### Phase 5: Verification - PLANNED

**Objective**: Prove the whole feature works: full Vitest suite, lint, build, and browser.

**TDD order**: Do **not** add a new red suite here unless a gap appeared. Run the existing suite as the regression signal. If a browser bug is found, add a failing unit test that reproduces it (red), fix it (green), then re-verify in the browser.

**Tests (run first — expect green; add only if something is missing)**:

| Command / file | Behavior to prove |
|----------------|-------------------|
| `npm test` | Entire suite from Phases 1–4 stays green. Any new bug-repro test starts red, then is made green. |

**Implementation / verification**:

1. Run `npm test`, `npm run lint`, and `npm run build` and record the actual result of each.
2. In the browser, exercise register, duplicate username/email, login success, login failure, and logout end to end.
3. Confirm local D1 data contains hashes, not plaintext.
4. Prefer `npm run preview` for D1-backed routes (Node `npm run dev` will not catch Workers-only issues).

**Phase-complete signal**: `npm test` green; lint and build reported from the commands; browser happy path and main error paths verified.

**Deliverables**:

- Full Vitest suite green
- Lint and build results from the commands, not from inspection
- Browser-verified happy path and main error paths

---

## Technical Implementation Details

### Key Files

| Path | Purpose |
|------|---------|
| `wrangler.jsonc` | Add D1 `DB` binding |
| `migrations/` | `users` table DDL |
| `src/lib/db.ts` | Server-only access to `env.DB` |
| `src/lib/password.ts` | SHA-256 hex helper (client- and server-safe) |
| `src/lib/services/user-service.ts` | Create, update, delete, and lookup users |
| `src/app/api/auth/register/route.ts` | `POST` register |
| `src/app/api/auth/login/route.ts` | `POST` login |
| `src/app/api/auth/logout/route.ts` | `POST` logout |
| `src/app/page.tsx` | Landing |
| `src/app/register/page.tsx` | Register form |
| `src/app/login/page.tsx` | Login form |
| `src/app/mcqs/page.tsx` | MCQ stub |
| `src/components/auth/` | Client forms and logout control (tested with Testing Library) |
| `src/components/ui/` | shadcn primitives — do not hand-edit |
| `vitest.config.ts` | Vitest + `@/` path resolution |
| `src/lib/*.test.ts` | Unit tests colocated with schema, db, password, user service |
| `src/app/api/auth/**/route.test.ts` | Route-handler tests |
| `src/components/auth/*.test.tsx` | Client component tests |

### Implementation Patterns

Client submit (register and login):

```typescript
const passwordHash = await hashPassword(password);
const response = await fetch("/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    firstName,
    lastName,
    username,
    email,
    passwordHash,
  }),
});
```

User service create (illustrative):

```typescript
await db
  .prepare(
    `INSERT INTO users (first_name, last_name, username, email, password_hash)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
  .bind(firstName, lastName, username, email, passwordHash)
  .run();
```

Prefer `all()` and `results[0]` over `first()` when reading a row, per D1 conventions.

Database access (Phase 1):

```typescript
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
```

See `src/lib/db.ts`.

### Important Notes

- D1 is server-only. Never import `src/lib/db.ts` or the user service into a `'use client'` file.
- `getCloudflareContext()` is the only way to reach `env.DB`. There is no global `env`.
- `npm run dev` runs on Node and will not catch Workers-only D1 issues. Prefer `npm run preview` when verifying database-backed routes.
- **Vitest is approved.** Follow `.cursor/skills/testing/SKILL.md`. Ask before adding Zod (planned for body validation) or any other new dependency.
- Each phase starts with failing tests. Do not implement production code for a phase until that phase's tests exist and have been observed red.
- Mock D1 and Cloudflare context. Do not introduce `@cloudflare/vitest-pool-workers` without asking.
- Remote D1 was not created in Phase 1 (`wrangler whoami` was unauthenticated). `wrangler.jsonc` uses placeholder `database_id` `local-dev-quiz-maker`. After `npx wrangler login`, run `npx wrangler d1 create quiz-maker` and replace that id. Do not apply migrations with `--remote` unless asked.
- Do not deploy. Do not apply migrations remotely.
- SHA-256 is fast and unsalted. It is a teaching baseline, not production-grade password storage. HTTPS in production still matters; hashing here mainly keeps plaintext out of JSON bodies and the `users` table.
- Because there is no session, "logged in" is only a client navigation to `/mcqs`. The next sprint that needs a current user must add a real session or token design.

---

## Acceptance Criteria

- [x] A local D1 database exists, `DB` is bound, and the `users` migration is applied locally.
- [ ] A teacher can register with first name, last name, username, email, and password.
- [ ] Username and email may be the same value and registration still succeeds.
- [ ] The register POST body contains `passwordHash` and does not contain the plaintext password.
- [ ] The `users.password_hash` column stores a hash, not the plaintext password.
- [ ] Duplicate username or duplicate email is rejected with 409 and a clear message.
- [ ] Invalid register payloads are rejected with 400.
- [ ] After successful registration the teacher is taken to `/mcqs`.
- [ ] A registered teacher can log in with username and password and is taken to `/mcqs`.
- [ ] Wrong password or unknown username returns 401 with `"Invalid username or password."` and does not distinguish which failed.
- [ ] Login POST body contains `passwordHash` and does not contain the plaintext password.
- [ ] Logout from `/mcqs` calls `POST /api/auth/logout` and then navigates to `/login`.
- [ ] `/mcqs` is a stub only: no MCQ create/edit/list behavior.
- [ ] API responses never include `password_hash`.
- [ ] User service can create, update, and delete users (update/delete need not have UI or HTTP routes).
- [x] Vitest is installed; `npm test` runs the suite.
- [ ] Each implementation phase was developed test-first: tests existed and failed before the phase's production code made them pass.
- [ ] `npm test` is green for schema/db, password, user service, auth routes, and client auth components.
- [ ] `npm run lint` and `npm run build` succeed after implementation.

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

- **Cloudflare D1** — user persistence. Must be created and bound as `DB`.
- **Web Crypto (`crypto.subtle`)** — SHA-256 in the browser and on Workers. Already available; not an npm package.
- **Zod** (proposed, not installed) — request-body validation in route handlers. Confirm before adding.
- **Vitest** (approved) — unit tests. Install at the start of Phase 1 with `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, and `vite-tsconfig-paths`.

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

Populate this section as issues are found during implementation. Starters:

### D1 binding missing at runtime

**Problem**: `env.DB` is undefined or TypeScript does not know `DB`.
**Cause**: Binding not added to `wrangler.jsonc`, or `cf-typegen` not run.
**Solution**: Add the `d1_databases` block, run `npm run cf-typegen`, restart the preview server.
**Code Reference**: `wrangler.jsonc`, `cloudflare-env.d.ts` (generated)

### Migration not visible locally

**Problem**: `no such table: users`.
**Cause**: Migration created but not applied with `--local`, or preview is using a different local D1 state.
**Solution**: `npx wrangler d1 migrations apply quiz-maker --local`. Never use `--remote`.

### Unique constraint becomes a 500

**Problem**: Registering an existing username returns 500 instead of 409.
**Cause**: D1 error not mapped in the user service.
**Solution**: Detect the constraint failure and throw a conflict error the route handler converts to 409.

### Wrangler not authenticated

**Problem**: `npx wrangler d1 create quiz-maker` cannot run; `database_id` is a local placeholder.
**Cause**: `wrangler whoami` reports not authenticated.
**Solution**: Run `npx wrangler login` locally, then `npx wrangler d1 create quiz-maker`, put the returned UUID in `wrangler.jsonc`, and run `npm run cf-typegen`. Apply migrations with `--local` only unless the user explicitly asks for remote.

### `@/` imports fail in Vitest

**Problem**: Tests cannot resolve `@/lib/...`.
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Add it as in `.cursor/skills/testing/SKILL.md`.

### `getCloudflareContext` blows up in tests

**Problem**: jsdom tests throw when importing db/user-service.
**Cause**: Real OpenNext context is not available in Vitest.
**Solution**: `vi.mock("@opennextjs/cloudflare")` (and/or mock `src/lib/db`) and supply a fake `env.DB`.

---

## Notes for AI Agents

When working with this PRD:

1. Start from Overview and Hypothesis so the work stays about teacher identity, not MCQs.
2. Honor Scope (In / Out / Cut). Do not add social login, tokens, cookies, sessions, or MCQ CRUD.
3. **Work test-first.** For each phase: write the listed Vitest tests, run `npm test` and confirm red, implement, run `npm test` until green. Do not skip the red step. Do not start the next phase while the current phase's tests are red.
4. Follow `.cursor/skills/testing/SKILL.md` (colocation, `vi.mock`, no real D1, Testing Library for client UI).
5. Update phase status markers (`PLANNED` → `IN PROGRESS` → `COMPLETED`) as work proceeds.
6. Record real file paths and patterns under Technical Implementation Details once code exists.
7. Check off Acceptance Criteria only when tests are green and behavior is verified (lint, build, and browser), not when the file merely exists.
8. Add Troubleshooting entries when a bug is found and fixed.
9. Vitest is approved. Ask before adding Zod or any other new dependency. Do not add `@cloudflare/vitest-pool-workers` without asking.
10. Never deploy. Never apply D1 migrations remotely.
11. Cite code as `filepath:line-number`.
12. Keep this document current; remove stale instructions rather than stacking contradictions.

---

## Current Status

**Last Updated**: 2026-09-04
**Current Phase**: Phase 2 - Password helper and user service
**Status**: Phase 1 COMPLETED; waiting for review before Phase 2
**Next Steps**: After review, write Phase 2 Vitest tests (password helper and user service), confirm red, then implement until green.
