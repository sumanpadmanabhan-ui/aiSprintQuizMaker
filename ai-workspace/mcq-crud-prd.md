Date created: 2026-09-09
Date last modified: 2026-09-10 (Phase 8 completed)

# MCQ CRUD - Technical PRD

> **Sprint status:** Phase 8 COMPLETED. Identity (`ai-workspace/register-login-logout_prd.md`)
> is complete and must not be reopened. This document is the source of truth for the shared
> multiple-choice test bank. Do not convert MCQ CRUD to Server Actions or add Zod. There is
> no Phase 9.

## Overview/Problem

Teachers can register and log in, and they can author a shared multiple-choice test bank:
D1 tables, HTTP `/api/mcqs`, and ungated listing/create/edit/preview UI. There is still no
session. `createdBy` / attempt `userId` come from a `localStorage` stand-in plus an explicit
Author user ID field. This sprint is complete through Phase 8 (quality, documentation, and
final verification).

---

## Hypothesis

We believe that a D1-backed MCQ service with HTTP CRUD, a shadcn listing/form, and a
preview attempt flow will let teachers collaboratively build a shared question bank without
waiting for sessions, TEKS alignment, or AI generation.

---

## Scope

### In Scope

- D1 tables `mcqs`, `mcq_choices`, and `mcq_attempts` in a new local migration, with foreign
  keys to `users.id`.
- An MCQ service (create, read, update, delete, list with search/pagination, record attempt)
  that uses `getDb()` and numbered prepared-statement placeholders.
- HTTP endpoints under `/api/mcqs` for list, create, get, update, delete, and preview attempts.
- Replace the `/mcqs` stub with listing, create, edit, delete, and preview UI using existing
  shadcn components.
- **Vitest** unit tests, written test-first in every phase. A phase is not complete until its
  new tests are green and the phase deliverables are met.

### Out of Scope

- Cookies, JWT, server sessions, `Set-Cookie`, middleware, or route guards. Identity still
  has no current-user on the server; do not add one in this sprint.
- TEKS alignment, AI question generation, or any model-provider call.
- Quizzes as collections of questions, student gradebooks, or timed exams.
- Social login, password reset, MFA, roles, or changing SHA-256 hashing.
- `@cloudflare/vitest-pool-workers` and tests that hit real D1. Unit tests mock `@/lib/db`.
- New npm dependencies (including Zod). Ask first.

### Cut

- **Sessions / ownership enforcement** — identity has no session. `created_by` is still a
  required FK so questions are attributed. Mutating APIs take `createdBy` (a `users.id`) in
  the JSON body. That is not authorization; a later sprint can replace it with a session.
- **Drag-and-drop choice reordering** — up/down buttons are enough.
- **Auto-save drafts** — save is an explicit submit.
- **A new D1 client module** — reuse `src/lib/db.ts` `getDb()`. Do not add `d1-client.ts`.

---

## Technical Requirements

### Database Schema

Reuse the existing D1 database `quiz-maker`, binding `DB`, via `getDb()` in `src/lib/db.ts`.
Add a **new** migration. Do not alter `migrations/0001_create_users.sql`. Future MCQ tables
foreign-key `users.id` (`.cursor/rules/d1.mdc`).

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  description TEXT,
  question TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL REFERENCES mcqs(id) ON DELETE CASCADE,
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL REFERENCES mcqs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_choice_id TEXT NOT NULL REFERENCES mcq_choices(id) ON DELETE CASCADE,
  is_correct INTEGER NOT NULL,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcqs_created_by ON mcqs (created_by);
CREATE INDEX idx_mcqs_created_at ON mcqs (created_at);
CREATE INDEX idx_mcqs_title ON mcqs (title);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);
CREATE INDEX idx_mcq_choices_order ON mcq_choices (mcq_id, order_index);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_user_id ON mcq_attempts (user_id);
CREATE INDEX idx_mcq_attempts_attempted_at ON mcq_attempts (attempted_at);
```

Column notes:

- `id` values are opaque 32-character hex strings, same pattern as `users`.
- `description` is optional (`NULL` allowed).
- `created_by` and attempt `user_id` reference `users.id`. Deleting a user cascades to their
  questions and attempts.
- SQLite has no real boolean type. Store `is_correct` as **INTEGER 0/1**, not JS `true`/`false`
  and not the SQL `BOOLEAN` keyword (which still stores inconsistently). Read with `=== 1`.
- Deleting an MCQ must cascade to its choices and attempts (`ON DELETE CASCADE`).

Apply the migration **locally only**:

```bash
npx wrangler d1 migrations create quiz-maker add_mcq_tables
npx wrangler d1 migrations apply quiz-maker --local
```

Do not run `migrations apply` with `--remote`. Do not create a second D1 database.

### API Endpoints

Route handlers live under `src/app/api/mcqs/`. This is an HTTP CRUD surface (same exception as
auth): clients `fetch` these URLs. Validate JSON **before** calling the MCQ service. Zod is
**not** installed; use explicit checks in something like `src/app/api/mcqs/validation.ts`.

`createdBy` / `userId` in request bodies is the identity stand-in until a later sprint adds
a session. Reject missing or blank ids with 400. Do not return 401 in this sprint — there is
no credential to validate.

#### GET /api/mcqs

**Query parameters:** `page` (default 1), `limit` (default 10, max 50), `search` (optional,
matches title / description / question), `createdBy` (optional filter).

**Response:**

- Success (200): `{ mcqs, pagination: { page, limit, total, pages } }` — list rows omit
  choices.
- Error (400): invalid page/limit.
- Error (500): unexpected server or database error.

#### POST /api/mcqs

**Request Body:**

```json
{
  "title": "Photosynthesis",
  "description": "Grade 7 life science",
  "question": "What do plants use to make food?",
  "createdBy": "user-id-from-users-table",
  "choices": [
    { "choiceText": "Sunlight", "isCorrect": true, "orderIndex": 0 },
    { "choiceText": "Moonlight", "isCorrect": false, "orderIndex": 1 }
  ]
}
```

JSON fields are camelCase. Persist snake_case columns.

**Response:**

- Success (201): created MCQ with choices (ids included).
- Error (400): validation failure (see business rules).
- Error (500): unexpected server or database error.

#### GET /api/mcqs/[id]

**Response:**

- Success (200): MCQ with choices ordered by `order_index`.
- Error (404): `"MCQ not found."`
- Error (500): unexpected server or database error.

#### PUT /api/mcqs/[id]

**Request Body:** same shape as POST (including `createdBy`). Replace choices as a set.

**Response:**

- Success (200): updated MCQ with choices.
- Error (400): validation failure.
- Error (404): `"MCQ not found."`
- Error (500): unexpected server or database error.

This sprint does **not** check that `createdBy` matches the row’s `created_by`. Preserve the
original `created_by` and `created_at` on update.

#### DELETE /api/mcqs/[id]

**Response:**

- Success (204): empty body.
- Error (404): `"MCQ not found."`
- Error (500): unexpected server or database error.

#### POST /api/mcqs/[id]/attempts

**Request Body:**

```json
{
  "userId": "user-id-from-users-table",
  "selectedChoiceId": "choice-id"
}
```

**Response:**

- Success (201): `{ attemptId, isCorrect, selectedChoice: { id, choiceText }, correctChoice: { id, choiceText } }`.
- Error (400): missing fields, or selected choice does not belong to the MCQ.
- Error (404): `"MCQ not found."`
- Error (500): unexpected server or database error.

### User Interface Requirements

Use existing shadcn: `button`, `card`, `dialog`, `field`, `input`, `label`, `separator`,
`table`, `badge`. Ask before adding components (for example `select` or `dropdown-menu`).

#### Listing (`/mcqs`)

- Title "Multiple Choice Questions" as an `h1` (shadcn `CardTitle` is a `div` and has no
  heading role). Create Question → `/mcqs/create`. Table of title / description / question
  (truncated), created date, actions (Edit, Delete with `window.confirm`, Preview). Row
  actions use unique `aria-label`s that include the question title.
- Search box and pagination. Loading uses `role="status"`. Distinct empty vs error states.
- Keep a logout control on this page (identity contract).

#### Create (`/mcqs/create`) and Edit (`/mcqs/[id]/edit`)

- Headings **New Question** / **Edit Question** as `h1`. Cancel links to `/mcqs`. Save shows
  “Saving question…” while submitting. Edit load uses `role="status"`; 404 does not show Save.
- Title required, max 200. Description optional, max 500. Question required, max 1000.
- Choices: 2–6 rows, each with text + exactly one "correct" radio. Add/remove and up/down
  reorder. Choice text required.
- Submit via `fetch` to the APIs above. An **Author user ID** field (prefilled from
  `localStorage` `quiz-maker-user-id`) supplies `createdBy`. That is attribution, not
  authorization. Do not add cookies. Navigate to `/mcqs` on success.

#### Preview (`/mcqs/[id]/preview`)

- Title as `h1`, plus description, question, and radio choices. Submit is blocked until a
  choice is selected. POST body is only `{ userId, selectedChoiceId }` — correctness is
  computed on the server. Feedback uses the attempt response, not GET `choice.isCorrect`.
- **Try Again** clears feedback and selection and records another attempt. **Back to
  questions** links to `/mcqs`. Loading uses `role="status"`; 404 does not show Submit.

### Business rules (service + API)

1. Title and question required after trim; honor character limits.
2. Description optional; empty string stored as `NULL`.
3. 2–6 choices; every choice text non-empty after trim.
4. Exactly one choice with `isCorrect === true`.
5. Persist `is_correct` as `0` or `1`.
6. `createdBy` / attempt `userId` required (existing `users.id`; FK will fail if unknown).

---

## Testing Approach (Vitest, test-first)

Follow `.cursor/skills/testing/SKILL.md`. Same red → green loop as identity.

1. Write the tests listed for the phase.
2. Run `npm test` and confirm red for a real reason (missing file or failed assertion).
3. Implement only that phase until green.
4. Previous phases stay green. Do not implement the next phase’s production code.

Harness rules: colocate tests, `vi.mock` `@/lib/db`, `beforeEach` `vi.clearAllMocks()`, never
hit real D1, no `expect(true).toBe(true)`, cover failure paths. `@testing-library/jest-dom` is
not installed.

---

## Implementation Phases

### Phase 1: Database foundation - COMPLETED

**Objective**: Persist MCQs, choices, and attempts in local D1. Reuse `getDb()`. No APIs or
UI in this phase.

**TDD order**: Write the tests below, run `npm test` (expect red), then create and apply the
migration until green. Wrangler apply is not unit-tested; it is still a deliverable.

**Tests (write first — expect red)**:

| File | Behavior to prove |
|------|-------------------|
| `src/lib/mcq-schema.test.ts` | Combined SQL under `migrations/` creates `mcqs` (`id` PK, `title`, `description`, `question`, `created_by` referencing `users(id)` with `ON DELETE CASCADE`), `mcq_choices` (`mcq_id` FK, `choice_text`, `is_correct`, `order_index`), and `mcq_attempts` (`mcq_id`, `user_id`, `selected_choice_id`, `is_correct`). Fail if the migration is missing or the DDL is incomplete. Also require the indexes listed in the schema. |

**What happened**:

1. `src/lib/mcq-schema.test.ts` was written first. Isolated run: **4 failed** — combined
   migration SQL still only had `CREATE TABLE users`.
2. `wrangler d1 migrations create quiz-maker add_mcq_tables` created
   `migrations/0002_add_mcq_tables.sql`.
3. DDL landed with INTEGER `is_correct` (not BOOLEAN), FKs, `ON DELETE CASCADE`, and the
   indexes listed above.
4. Applied **locally only** (`CI=true wrangler d1 migrations apply quiz-maker --local`).
   Interactive apply without `CI=true` hangs waiting for a confirm prompt.
5. Local D1 `d1_migrations` contains `0001_create_users.sql` and `0002_add_mcq_tables.sql`.
   `sqlite_master` has `mcqs`, `mcq_choices`, `mcq_attempts` plus the eight `idx_mcq*` indexes.
6. Isolated schema tests then **4 passed**. Full suite: **45 passed / 11 files**.
7. No `mcq-service.ts`, API routes, UI, or second D1 helper. `getDb()` unchanged.

**Phase-complete signal**: met. `--remote` was not used.

**Deliverables**:

- `migrations/0002_add_mcq_tables.sql` with the three tables and indexes
- `src/lib/mcq-schema.test.ts` passing (4 tests)
- Local D1 schema applied (`quiz-maker` at `.wrangler/state/v3/d1`)
- This PRD updated to COMPLETED for Phase 1

### Phase 2: MCQ service - COMPLETED

**Objective**: Centralize MCQ persistence and business rules. Mock `@/lib/db`.

**Tests (write first)**: `src/lib/services/mcq-service.test.ts` — create with bound fields and
`is_correct` as 0/1; reject not-exactly-one-correct and <2 or >6 choices; get by id with
choices ordered; list pagination/search; update replaces choices; delete; recordAttempt
computes correctness; not-found errors.

**What happened**:

1. Tests written first. Isolated run failed: `Failed to resolve import "@/lib/services/mcq-service"`.
2. `src/lib/services/mcq-service.ts` uses `getDb()`, numbered `?1`/`?2` placeholders, `all()` /
   `results[0]`, and `.run()` for deletes.
3. Validation lives in the service (no Zod): title/question required; title ≤ 200,
   description ≤ 500, question ≤ 1000; blank description → `NULL`; 2–6 choices; exactly one
   correct; `createdBy` / attempt `userId` required.
4. `is_correct` is bound as INTEGER `1`/`0` and read with `=== 1`. Choices are selected
   `ORDER BY order_index` and also sorted in memory.
5. Update does **not** `SET created_by` (ownership preserved). `createdBy` on the update
   input is ignored. Delete is `DELETE FROM mcqs` only; choices/attempts rely on
   `ON DELETE CASCADE`.
6. Isolated service tests: **21 passed**. Full suite: **66 passed / 12 files**. No HTTP
   routes. No new dependencies.

**Implementation**: `src/lib/services/mcq-service.ts` — `createMcq`, `getMcqById` (null if
missing), `listMcqs`, `updateMcq`, `deleteMcq`, `recordAttempt`. Errors:
`McqValidationError`, `McqNotFoundError` (`"MCQ not found."`).

**Deliverables**:

- `src/lib/services/mcq-service.ts`
- `src/lib/services/mcq-service.test.ts` (21 tests)
- This PRD updated to COMPLETED for Phase 2

### Phase 3: HTTP APIs - COMPLETED

**Objective**: JSON CRUD + attempts as specified above.

**Tests**: route tests under `src/app/api/mcqs/` for status codes, validation 400s, 404
messages, 201/200/204 shapes, no service call on invalid bodies.

**What happened**:

1. Tests written first. Isolated run failed: `Failed to resolve import "./route"` for
   `src/app/api/mcqs/route.ts`, `[id]/route.ts`, and `[id]/attempts/route.ts`.
2. HTTP layer is **route handlers**, not Server Actions, matching this PRD and the auth
   pattern (`fetch` + JSON). Layering: Client → HTTP route → `mcq-service` → `getDb()`.
3. `src/app/api/mcqs/validation.ts` parses JSON and query params **before** the service.
   Invalid bodies/query return 400 and do not call the service. `McqValidationError` → 400,
   `McqNotFoundError` → 404 `"MCQ not found."`, anything else → 500 `"Internal server error."`
4. PUT accepts `createdBy` but does **not** enforce ownership (identity has no session).
   Attempt correctness is computed in `recordAttempt`, not by the client.
5. Isolated API tests: **16 passed**. Full suite: **82 passed / 15 files**. No cookies.
   No UI. No new dependencies.

**Implementation**:

- `src/app/api/mcqs/route.ts` — GET list, POST create
- `src/app/api/mcqs/[id]/route.ts` — GET, PUT, DELETE (`params` is a Promise, Next.js 16)
- `src/app/api/mcqs/[id]/attempts/route.ts` — POST attempt
- `src/app/api/mcqs/validation.ts` — `parseListQuery`, `parseMcqBody`, `parseAttemptBody`,
  `mcqErrorResponse`

**Deliverables**:

- The four files above plus colocated route tests (16 tests)
- This PRD updated to COMPLETED for Phase 3

### Phase 4: Authoring UI - COMPLETED

**Objective**: Replace the stub with listing, create, edit, delete, preview.

**Tests (write first — expect red)**: client form/list/preview components with Testing Library;
mock `fetch` and `next/navigation`. Isolated run failed: missing `@/lib/current-user`,
`@/components/mcq-form`, `@/components/mcq-list`, and `@/components/mcq-preview`.

**What happened**:

1. This phase is **authoring UI that `fetch`es Phase 3 HTTP APIs**, not Server Actions.
   Curriculum prompts that say “Server Actions” / Zod do not apply: Zod is not installed,
   and this PRD plus `.cursor/rules/nextjs.mdc` keep MCQ CRUD as HTTP like auth.
   Layering: Client → `fetch` `/api/mcqs` → route → `mcq-service` → `getDb()`.
2. `createdBy` / attempt `userId` without a session: login (200) and register (201) store
   `user.id` in `localStorage` (`quiz-maker-user-id`). Logout clears it. Create/edit/preview
   expose an **Author user ID** field (prefilled from that key) and document that it is
   attribution, not authorization. No cookies, JWT, or route guards.
3. Delete uses `window.confirm` (no new shadcn `dropdown-menu`). Choices: add/remove and
   up/down reorder. Preview submits `{ userId, selectedChoiceId }`; correctness comes from
   the API, not the client.
4. Isolated Phase 4 tests: **12 passed** (current-user 3, form 3, list 4, preview 2).
   Full suite: **94 passed / 19 files**. `npm run lint` exit 0 (pre-existing warning in
   `open-next.config.ts`). No new dependencies. `npm run build` not run (Phase 5).

**Implementation**:

- `src/lib/current-user.ts` — `getCurrentUserId` / `setCurrentUserId` / `clearCurrentUserId`
- `src/components/mcq-form.tsx` — create + edit (`McqEdit` loads GET `/api/mcqs/[id]`)
- `src/components/mcq-list.tsx` — listing, search, pagination, delete confirm
- `src/components/mcq-preview.tsx` — attempt + correct/incorrect
- `src/app/mcqs/page.tsx`, `create/page.tsx`, `[id]/edit/page.tsx`, `[id]/preview/page.tsx`

**Deliverables**:

- The files above plus colocated client tests (12 tests)
- Login/register persist the user id; logout clears it
- This PRD updated to COMPLETED for Phase 4

### Phase 5: Verification - COMPLETED

**Objective**: Full suite green; lint and build; dashboard list states; smoke of list/create/
edit/preview routes. No new product features beyond list UX the verification pass required.
Curriculum later added Phases 6–8; this phase did not start them.

**Tests (write first — expect red)**: `src/components/mcq-list.test.tsx` — Create Question
href, Edit/Preview hrefs, loading `role="status"`, list failure without empty state, delete
cancelled by `window.confirm`. Isolated run: **3 failed / 4 passed** (link still said
“Create”, no loading status, 500 body shown as empty-capable error).

**What happened**:

1. Curriculum “Dashboard MCQ List” is this PRD’s `/mcqs` listing, not a new route. Login/
   register still store `users.id` in `localStorage`; logout still clears it. No cookies.
2. List UX gaps closed without redoing Phases 1–4: **Create Question** → `/mcqs/create`,
   visible loading, distinct empty vs error, cancel-delete. Existing table and row actions
   stayed in place.
3. `npm run build` first failed TypeScript: `item.orderIndex` possibly `null` in
   `src/app/api/mcqs/validation.ts`. Narrowed that check; retry **succeeded**.
4. Isolated list tests: **7 passed**. Full suite: **97 passed / 19 files**. `npm run lint`
   exit 0 (pre-existing `open-next.config.ts` warning). `npm run build` **exit 0** (OpenNext
   worker at `.open-next/worker.js`). No new dependencies. `--remote` not used.
5. HTTP smoke on `npm run dev` (`localhost:3000`): `/mcqs`, `/mcqs/create`, `/login`,
   `/mcqs/dummy/edit`, `/mcqs/dummy/preview` all **200**. `/mcqs` HTML includes the heading,
   Create Question, logout, search, and loading status. No browser automation was available;
   Node `next dev` cannot exercise Workers/D1, so create → preview → edit → delete against
   real D1 was not clicked in a browser.

**Deliverables**:

- Dashboard list loading/empty/error + Create Question (McqList tests 7)
- `npm test`, `npm run lint`, `npm run build` recorded below
- This PRD updated to COMPLETED for Phase 5

### Phase 6: Create/Edit MCQ - COMPLETED

**Objective**: Finish New Question and Edit Question UX on the existing Phase 4 form.
Curriculum names this Phase 6; it is not a new stack. Do not redo Phases 1–5. Do not
start Phase 7 (preview).

**Tests (write first — expect red)**: `src/components/mcq-form.test.tsx` — New Question
heading, description, add/remove, Cancel → `/mcqs`, no submit without a correct choice,
save 400 stays on the form, `McqEdit` loading `role="status"` then populated fields, 404
without Save. Isolated run: **2 failed / 6 passed** (heading was “Create question”, Cancel
missing, edit loading had no `role="status"`). Add/remove, no-correct, save error, and
404 were already green.

**What happened**:

1. Create/edit already `fetch`ed `/api/mcqs` from Phase 4. This phase only closed form UX
   gaps: **New Question** / **Edit Question** headings, **Cancel** to `/mcqs`, Save shows
   “Saving question…” while submitting, edit load uses `role="status"`.
2. Existing behavior kept: title/description/question limits, 2–6 choices, exactly one
   correct radio, add/remove and up/down, `createdBy` from localStorage, POST 201 / PUT 200
   navigate to `/mcqs`. No cookies. No Zod. No new dependencies.
3. Isolated form tests: **8 passed**. Full suite: **102 passed / 19 files**. `npm run lint`
   recorded below. `npm run build` not re-run (Phase 5 already exit 0).

**Deliverables**:

- `src/components/mcq-form.tsx` + `mcq-form.test.tsx` (8 tests)
- This PRD updated to COMPLETED for Phase 6

### Phase 7: Preview & Attempts - COMPLETED

**Objective**: Finish preview/attempt UX on the existing Phase 4 preview page. Curriculum
names this Phase 7. Do not redo Phases 1–6. Do not start Phase 8.

**Tests (write first — expect red)**: `src/components/mcq-preview.test.tsx` — loading
`role="status"`, 404 without Submit, no POST until a choice is selected, POST body is
only `{ userId, selectedChoiceId }` (no `isCorrect`), Try Again then a second attempt.
Isolated run: **2 failed / 4 passed** (loading had no `role="status"`, no Try Again).

**What happened**:

1. Preview already `GET /api/mcqs/[id]` and `POST /api/mcqs/[id]/attempts`. Correctness is
   still computed in `recordAttempt`, never sent by the client.
2. UX gaps closed: loading status, **Try Again** (clears feedback and selection, records
   another attempt), Back to `/mcqs`. Feedback still uses the attempt response, not choice
   `isCorrect` from GET.
3. Isolated preview tests: **6 passed**. Full suite: **106 passed / 19 files**. `npm run lint`
   recorded below. `npm run build` not re-run (Phase 5). No new dependencies.

**Deliverables**:

- `src/components/mcq-preview.tsx` + `mcq-preview.test.tsx` (6 tests)
- This PRD updated to COMPLETED for Phase 7

### Phase 8: Quality, documentation & final verification - COMPLETED

**Objective**: Review the MCQ feature against this PRD and all acceptance criteria. Run the
full suite, lint, and build. Verify the complete user flow. Fix bugs, broken flows,
accessibility issues, or inconsistencies. Align this document with the implementation. Do
not add product features, dependencies, or scope. There is no Phase 9.

**What happened**:

1. PRD vs code: schema, `mcq-service`, `/api/mcqs`, listing/create/edit/preview UI, and
   identity stand-in match the agreed layering (Client → `fetch` `/api/mcqs` → route →
   `mcq-service` → `getDb()`). No cookies, sessions, Zod, or Server Actions. No TEKS or AI.
2. Accessibility gaps closed without new features: preview title is an `h1` (not
   `CardTitle`); list Edit/Preview/Delete have unique `aria-label`s that include the title.
3. `npm test` **106 passed / 19 files**. `npm run lint` **exit 0** (pre-existing warning in
   `open-next.config.ts`). `npm run build` first failed `EPERM` on `.open-next` because
   `next dev` / `workerd` still held the folder; after stopping those processes, retry
   **exit 0** (OpenNext worker at `.open-next/worker.js`).
4. HTTP smoke on `npm run dev` (`localhost:3000`): `/`, `/login`, `/register`, `/mcqs`,
   `/mcqs/create`, `/mcqs/dummy/edit`, `/mcqs/dummy/preview` all **200**. `/mcqs` HTML
   includes the heading, Create Question, logout, search, and loading status. Create HTML
   includes New Question, Cancel, Save, and Author user ID. Edit/preview SSR HTML is the
   client loading state (`Loading question…`); controls appear after `fetch`.
5. End-to-end against local D1 via HTTP (not a browser): register 201 → POST MCQ 201 → list
   search 200 → GET 200 → attempt 201 (`isCorrect: false`, correct choice Sunlight) → PUT
   200 (title updated, `createdBy` preserved) → DELETE 204 → GET 404 `"MCQ not found."`.
   No browser automation was available. No `--remote`. No new dependencies.

**Deliverables**:

- Accessibility consistency on list row actions and preview heading
- `npm test`, `npm run lint`, `npm run build` recorded below
- This PRD updated to COMPLETED for Phase 8

---

## Technical Implementation Details

### Key Files (as they land)

- `migrations/0001_create_users.sql` — existing users table; do not edit
- `migrations/0002_add_mcq_tables.sql` — MCQ tables (Phase 1)
- `src/lib/db.ts` — existing `getDb()`; reuse, do not replace
- `src/lib/mcq-schema.test.ts` — Phase 1 schema assertions (4 tests)
- `src/lib/services/mcq-service.ts` — Phase 2 persistence + validation
- `src/lib/services/mcq-service.test.ts` — Phase 2 (21 tests)
- `src/app/api/mcqs/validation.ts` — Phase 3 request parsing
- `src/app/api/mcqs/route.ts` — GET list, POST create
- `src/app/api/mcqs/[id]/route.ts` — GET / PUT / DELETE by id
- `src/app/api/mcqs/[id]/attempts/route.ts` — POST attempt
- `src/lib/current-user.ts` — localStorage stand-in for `users.id` (Phase 4)
- `src/components/mcq-form.tsx` / `mcq-list.tsx` / `mcq-preview.tsx` — authoring UI
- `src/app/mcqs/page.tsx` — listing
- `src/app/mcqs/create/page.tsx` — create
- `src/app/mcqs/[id]/edit/page.tsx` — edit (`params` is a Promise, Next.js 16)
- `src/app/mcqs/[id]/preview/page.tsx` — preview attempt

### Implementation Patterns

```typescript
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
```

Prepared statements with `?1`, `?2`. Prefer `all()` and `results[0]` over `first()`. Deletes
use `.run()` and `meta.changes`. Service validation runs **before** `getDb()` so invalid
input never touches D1.

```typescript
.bind(mcqId, choice.choiceText, choice.isCorrect ? 1 : 0, choice.orderIndex)
const normalized = row.is_correct === 1;
```

`listMcqs` binds `LIKE ?1` (same placeholder reused for title/description/question), then
`LIMIT ?n OFFSET ?n+1`. Default page 1, limit 10, max 50.

### Important Notes

- Identity contract still applies: no password hash in JSON, `/mcqs` ungated, logout stays.
- `createdBy` in the API is a teaching stand-in, not auth. Document it in the UI copy if a
  field is shown.
- Never apply D1 `--remote`. Never `npm run deploy` unless asked.
- Do not overlap `npm test` with `npm run build` on this Windows machine (Vitest OOM).

---

## Acceptance Criteria

- [x] Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` with the FKs and indexes above.
- [x] A teacher can create an MCQ with 2–6 choices and exactly one correct answer.
- [x] A teacher can list, search, edit, and delete MCQs.
- [x] Preview records an attempt and shows whether the selected choice was correct.
- [x] Validation rejects empty title/question, wrong choice counts, and not-exactly-one correct.
- [x] Deleting an MCQ removes its choices and attempts (cascade).
- [x] No cookies, sessions, or route guards were added.
- [x] No TEKS or AI generation.
- [x] `npm test` and `npm run lint` pass; `npm run build` is run in Phase 5 and re-run in
  Phase 8 (not Phase 1).

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Teacher can save a valid MCQ | Under 2 minutes on the happy path | Manual timing create → appears in list |
| Invalid MCQ is rejected | 100% of listed validation cases | Phase 2–3 unit tests |
| Schema is local-only | Migration applied with `--local` only | Wrangler migrations list (local) |

---

## Dependencies

### External Dependencies

- Cloudflare D1 (`quiz-maker`, binding `DB`) — already bound
- Wrangler — local migrations only

### Internal Dependencies

- `src/lib/db.ts` `getDb()` — database access
- D1 `users` table — `created_by` / `user_id` FKs
- Vitest harness — already installed
- shadcn components listed above — UI phases only

### Environment variables

None new. Do not add secrets for this sprint.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: JS booleans stored as `'true'`/`'false'` strings and break correctness checks.
- **Mitigation**: INTEGER 0/1 in schema and service; tests assert bind values are 0 or 1.

- **Risk**: Anonymous `?` placeholders fail under local Wrangler.
- **Mitigation**: Numbered `?1`, `?2` only.

- **Risk**: Remote migration applied by accident.
- **Mitigation**: Never pass `--remote`. Phase 1 verification uses `--local` only.

### User Experience Risks

- **Risk**: Teachers expect `/mcqs` to know who they are after login.
- **Mitigation**: This sprint does not add a session. Preview/create must still collect a
  user id (Phase 4 UX). Call that limitation out rather than faking a login cookie.

---

## Troubleshooting Guide

### Combined migration SQL in schema tests

**Problem**: `user-schema.test.ts` concatenates every `migrations/*.sql` file.
**Cause**: A new MCQ file is part of that string.
**Solution**: Keep `CREATE TABLE users` intact in `0001`. Put MCQ DDL only in `0002`.

### Local apply vs remote

**Problem**: Schema exists in the editor but not in local D1.
**Cause**: File written but not applied, or apply hung on the interactive confirm prompt.
**Solution**: `CI=true npx wrangler d1 migrations apply quiz-maker --local` (or the local
`node_modules/.bin/wrangler` binary). Confirm with
`wrangler d1 execute quiz-maker --local --command "SELECT name FROM d1_migrations;"`.
Never pass `--remote`.

### Update preserves created_by

**Problem**: A test that forbids `created_by` anywhere in the UPDATE SQL fails even when
ownership is not changed.
**Cause**: `RETURNING ... created_by` is required so the caller still sees the original author.
**Solution**: Assert the `SET` clause does not assign `created_by`. See
`src/lib/services/mcq-service.ts` and `src/lib/services/mcq-service.test.ts`.

### `npm run build` EPERM on `.open-next`

**Problem**: OpenNext fails immediately with `EPERM, Permission denied: ...\\.open-next`.
**Cause**: `next dev` or `workerd` still has the previous build folder open (common if a
dev server was used for HTTP smoke on the same Windows machine).
**Solution**: Stop `next dev` and any `workerd` processes, delete `.open-next` if it
remains, then re-run `npm run build`. Do not overlap `npm test` with `npm run build`.

### `orderIndex` possibly null in `parseChoices`

**Problem**: `npm run build` TypeScript fails on `item.orderIndex` possibly `null`.
**Cause**: JSON `number | null` is not a valid integer index.
**Solution**: Treat non-integer / missing / null `orderIndex` as omitted (derive from
array index). See `src/app/api/mcqs/validation.ts`.

### Page titles are not headings if you use `CardTitle`

**Problem**: Screen readers do not find “New Question”, “Edit Question”, or the preview
title as headings.
**Cause**: shadcn `CardTitle` is a `div`.
**Solution**: Render those titles as `h1`. Keep `CardTitle` for login/register cards.

### Preview / create attempt fails with a database error

**Problem**: Attempt or create returns 500 even though the JSON looks valid.
**Cause**: `createdBy` / `userId` must be a real `users.id` (FK). A stale `localStorage`
value after a local DB reset will fail.
**Solution**: Register or log in again so `quiz-maker-user-id` matches a row in `users`.

---

## Notes for AI Agents

1. Read Problem, Hypothesis, and Scope before coding. Do not build Out of Scope or Cut items.
2. Identity PRD remains the auth contract. Do not add cookies to make `created_by` “work”.
3. Update phase status markers as work progresses. Mark only the current phase COMPLETED.
4. Add implementation details (real filenames, commands, test counts) as they happen.
5. Cite code as `filepath:line-number`.
6. Phase 1 is schema only. Phase 2 is `mcq-service`. Phase 3 is `/api/mcqs` HTTP. Phase 4 is
   authoring UI that `fetch`es those APIs. Phase 5 is verification and dashboard list states.
   Phase 6 is create/edit form UX. Phase 7 is preview/attempts UX. Phase 8 is quality,
   documentation, and final verification. Do not convert MCQ CRUD to Server Actions. There
   is no Phase 9.
7. Ask before adding a dependency or a shadcn component that is not already installed.

---

## Current Status

**Last Updated**: 2026-09-10
**Current Phase**: Phase 8 - Quality, documentation & final verification — **COMPLETED**
**Status**: MCQ sprint verified against this PRD. Waiting for review.
**Branch**: `feature/mcq-crud`
**Verification**: `npm test` **106 passed / 19 files**. `npm run lint` **exit 0**
(pre-existing warning in `open-next.config.ts`). `npm run build` **exit 0** (OpenNext
worker at `.open-next/worker.js`). HTTP smoke 200 on authoring/auth routes. HTTP E2E
register → create → list → attempt → update → delete → 404. No `--remote`.
**Next Steps**: Wait for review. Do not start a Phase 9.
