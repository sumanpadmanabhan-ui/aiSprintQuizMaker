# AGENTS.md

Instructions for AI agents working in this repository. This file is loaded into every
agent conversation, so it describes only what is stable and true of the project.

## Project

Quiz Maker is a greenfield app for teachers who collaborate on a shared multiple-choice test bank. Identity is complete: D1 `users`, hashed-password auth APIs, and shadcn login/register. There is **no session or token**; `/mcqs` is ungated. MCQ Phases 1–7 are done: local D1 tables, `mcq-service`, HTTP `/api/mcqs`, authoring UI, dashboard list, create/edit form UX, and preview attempts (correctness computed on the server). Login/register store `users.id` in `localStorage` as the `createdBy` / attempt `userId` stand-in. Source of truth: `ai-workspace/mcq-crud-prd.md`. Identity details live in `ai-workspace/register-login-logout_prd.md`.

## Stack

- **Next.js 16** with the App Router and React 19
- **Cloudflare Workers** for hosting, via `@opennextjs/cloudflare`
- **Tailwind CSS v4**, configured in CSS rather than a JS config file
- **shadcn/ui** on Base UI, `base-nova` style, with Lucide icons
- **TypeScript** in strict mode
- **Wrangler** for Cloudflare configuration, secrets, and deployment
- **Cloudflare D1** for persistence (binding `DB`, local migrations only)
- **Vitest** for unit tests (`npm test`)

There is no session library, AI SDK, or Zod. Do not write code that imports an
uninstalled package without adding it first and telling the user. Auth uses explicit
validation in `src/app/api/auth/validation.ts`, not Zod.

## Layout

```
src/app/            Routes, layouts, and global styles (App Router)
src/app/mcqs/       MCQ listing, create, edit, and preview pages
src/app/api/auth/   Register, login, logout HTTP POST handlers
src/app/api/mcqs/   MCQ list/create/get/update/delete/attempts HTTP handlers
src/components/ui/  shadcn/ui components (generated; avoid hand-editing)
src/lib/            Shared utilities (`db.ts`, `password.ts`, `current-user.ts`)
src/lib/services/   Domain services (`user-service.ts`, `mcq-service.ts`)
ai-workspace/       Technical PRDs and planning documents
.cursor/rules/      File-scoped conventions (including `auth.mdc`, `d1.mdc`)
.cursor/skills/     Task-specific guidance loaded on demand
public/             Static assets
```

Import through the `@/` alias, which maps to `src/`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on Node at `localhost:3000` |
| `npm run preview` | Build and run on the local **Workers** runtime |
| `npm run build` | OpenNext/Workers production build (creates `.open-next/`) |
| `npm run build:next` | Next.js-only build (no Worker bundle) |
| `npm run lint` | ESLint |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing bindings |
| `npm test` | Run the Vitest unit suite once |

`npm run dev` runs on Node and will not surface Workers-specific problems. Verify
anything runtime-sensitive with `npm run preview`.

## Working agreements

- **Do not deploy.** Never run `npm run deploy` unless explicitly asked.
- **Do not touch the remote database.** Migrations may be applied locally only.
- **Ask before adding a dependency.** This is a teaching repository; an unexplained
  dependency is a cost. Propose it and say why.
- **Do not edit generated files.** `cloudflare-env.d.ts`, `next-env.d.ts`, and
  `package-lock.json` are generated.
- **Keep secrets out of the repo.** Local values belong in `.dev.vars`, which is
  gitignored. When adding a variable, also add an empty placeholder to
  `.dev.vars.example`. Production values go in `wrangler secret put`.
- **Verify before claiming completion.** Run `npm test`, `npm run lint`, and
  `npm run build` and report the actual result. Do not describe work as done based
  on inspection alone. Do not run those three in parallel on a memory-constrained
  Windows machine — Vitest has OOMed when overlapped with `next build`.
- **Say when you are unsure.** A flagged uncertainty is more useful than a confident
  guess that has to be unwound later.

## Cursor Cloud specific instructions

Cloud agents have no Cloudflare credentials and no `.dev.vars`. In that environment:

- `npm run dev`, `npm run build`, and `npm run lint` work normally.
- `npm run preview`, `npm run deploy`, and any `wrangler` command that needs
  authentication will fail. This is expected. Do not try to authenticate.
- If a task genuinely requires Cloudflare access, stop and report that it must be run
  locally instead.
