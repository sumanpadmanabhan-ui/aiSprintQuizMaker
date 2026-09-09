Date created: 2026-09-09
Date last modified: 2026-09-09 (Phase 2 completed)

# MCQ CRUD - Technical PRD

> **Sprint status:** Phase 2 COMPLETED. Identity (`ai-workspace/register-login-logout_prd.md`)
> is complete and must not be reopened. This document is the source of truth for the shared
> multiple-choice test bank. Implement one phase at a time, test-first. Do not start Phase 3
> until asked.

## Overview/Problem

Teachers can register and log in, but they still cannot put a multiple-choice question into
the shared test bank. `/mcqs` is an ungated stub with no tables, APIs, or authoring UI, so
two teachers cannot create, edit, list, delete, or preview questions together. This sprint
adds CRUD for MCQs (title, optional description, question stem, 2–6 choices, exactly one
correct answer) plus a preview attempt, on top of the existing D1 `users` table.

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

- Title "Multiple Choice Questions", Create control, table of title / description / question
  (truncated), created date, actions (Edit, Delete with confirm, Preview).
- Search box and pagination. Empty state when there are no rows.
- Keep a logout control on this page (identity contract).

#### Create (`/mcqs/create`) and Edit (`/mcqs/[id]/edit`)

- Title required, max 200. Description optional, max 500. Question required, max 1000.
- Choices: 2–6 rows, each with text + exactly one "correct" radio. Add/remove and up/down
  reorder. Choice text required.
- Submit via `fetch` to the APIs above. `createdBy` must be supplied somehow without a session
  (Phase 3 decides the UX; do not add cookies). Navigate to `/mcqs` on success.

#### Preview (`/mcqs/[id]/preview`)

- Show title, description, question, radio choices. Submit records an attempt and shows
  correct/incorrect plus the correct choice. Link back to `/mcqs`.

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

### Phase 3: HTTP APIs - PLANNED

**Objective**: JSON CRUD + attempts as specified above.

**Tests**: route tests under `src/app/api/mcqs/` for status codes, validation 400s, 404
messages, 201/200/204 shapes, no service call on invalid bodies.

**Implementation**: `src/app/api/mcqs/route.ts`, `[id]/route.ts`, `[id]/attempts/route.ts`,
explicit validation module. Do not add cookies.

### Phase 4: Authoring UI - PLANNED

**Objective**: Replace the stub with listing, create, edit, delete, preview.

**Tests**: client form/list/preview components with Testing Library; mock `fetch` and
`next/navigation`. Server Components: test data helpers, not render.

**Implementation**: pages under `src/app/mcqs/` and `src/components/`. Ask before adding
shadcn components.

### Phase 5: Verification - PLANNED

**Objective**: Full suite green; lint and build; browser smoke of create → list → preview →
edit → delete. No new features.

---

## Technical Implementation Details

### Key Files (as they land)

- `migrations/0001_create_users.sql` — existing users table; do not edit
- `migrations/0002_add_mcq_tables.sql` — MCQ tables (Phase 1)
- `src/lib/db.ts` — existing `getDb()`; reuse, do not replace
- `src/lib/mcq-schema.test.ts` — Phase 1 schema assertions (4 tests)
- `src/lib/services/mcq-service.ts` — Phase 2 persistence + validation
- `src/lib/services/mcq-service.test.ts` — Phase 2 (21 tests)
- `src/app/api/mcqs/` — Phase 3 (not started)
- `src/app/mcqs/` and `src/components/` — Phase 4 (stub still in place)

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
- [ ] A teacher can create an MCQ with 2–6 choices and exactly one correct answer.
- [ ] A teacher can list, search, edit, and delete MCQs.
- [ ] Preview records an attempt and shows whether the selected choice was correct.
- [x] Validation rejects empty title/question, wrong choice counts, and not-exactly-one correct.
- [ ] Deleting an MCQ removes its choices and attempts (cascade).
- [ ] No cookies, sessions, or route guards were added.
- [ ] No TEKS or AI generation.
- [ ] `npm test` and `npm run lint` pass; `npm run build` is run in Phase 5, not Phase 1.

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

---

## Notes for AI Agents

1. Read Problem, Hypothesis, and Scope before coding. Do not build Out of Scope or Cut items.
2. Identity PRD remains the auth contract. Do not add cookies to make `created_by` “work”.
3. Update phase status markers as work progresses. Mark only the current phase COMPLETED.
4. Add implementation details (real filenames, commands, test counts) as they happen.
5. Cite code as `filepath:line-number`.
6. Phase 1 is schema only. Phase 2 is `mcq-service` only — no `/api/mcqs` routes yet.
7. Ask before adding a dependency or a shadcn component that is not already installed.

---

## Current Status

**Last Updated**: 2026-09-09
**Current Phase**: Phase 2 - MCQ service — **COMPLETED**
**Status**: MCQ service + validation in place. No APIs or UI yet.
**Branch**: `feature/mcq-crud`
**Verification**: `npm test` **66 passed / 12 files**. `npm run lint` **exit 0** (pre-existing
warning in `open-next.config.ts`, unrelated). No `--remote`. `npm run build` not run (Phase 5).
**Next Steps**: Phase 3 — HTTP APIs under `src/app/api/mcqs/`, test-first. Do not start Phase 3
until asked.
