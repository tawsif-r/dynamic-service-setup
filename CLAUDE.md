# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.
Humans should read [`docs/development.md`](docs/development.md) instead — it is the
canonical version of everything summarised here.

## What this project is

`create-app` is a **composable project scaffolding CLI**. The user picks a backend,
database, cache and infra options; the tool generates a working, self-contained
project with no runtime dependency on `create-app` itself.

The central idea: **choices and generation are separate**. Each technology is a
**component** (`src/components/<category>/<id>/`) that contributes *fragments* —
template files, dependencies, env vars, a Docker Compose service, Dockerfile lines,
README prose. A **composition engine** (`src/engine/`) merges those fragments into
the final project. Shared files (`package.json`, `docker-compose.yml`, `.env`,
`Dockerfile`, `README.md`) are **assembled by merging**, never copied whole.

Design rationale lives in `plan.md`; task-by-task history in `tasks.md`.

## Commands

```bash
npm install
npm run dev -- my-app --backend nestjs --database postgres --cache redis --docker --pm npm
npm test                 # vitest, all suites
npm run test:watch
npm run typecheck        # tsc --noEmit, must stay clean
npm run build            # tsc -> dist/ + scripts/copy-templates.mjs
npx vitest run -u        # update snapshots — only after a deliberate change
```

- Local dev toolchain: Node ≥ 20.11, npm. No pnpm/corepack locally — the pnpm smoke
  path is exercised only by generated projects, not by this repo.
- `bin/create-app.js` runs `dist/` — run `npm run build` before invoking the bin,
  or use `npm run dev` to run from source via `tsx`.

## Architecture in one paragraph

`src/cli.ts` (commander) parses flags → `src/config/resolve.ts` layers
**preset < flags < prompts** into a `ProjectConfig` validated by the zod schema in
`src/config/schema.ts` → `src/registry.ts` resolves the ordered `Component[]` →
`src/engine/validate.ts` checks `requires`/`conflicts` **before any write** →
`src/generate.ts` renders each component's `template/` (EJS) and runs every merger
in `src/engine/` into one `FileMap` → files are staged in a sibling temp dir and
**atomically moved** to `<targetDir>/<name>/` → `src/exec/post-generate.ts` runs
install, `git init`, formatter.

## Rules that are easy to break

- **Never edit `src/config/schema.ts` just to add a component.** Component ids are
  open strings; the registry + `validate.ts` are the source of truth for which ids
  exist. Touch the schema only for a genuinely new *config field*.
- **Shared files are merged, not templated.** There is no `package.json` or
  `docker-compose.yml` template. If you want to influence one, add a `node` /
  `compose` / `env` / `dockerfile` contribution to a manifest.
- **An `.ejs` file that renders to empty is dropped.** This is the mechanism for
  "emit this file only for some selections" (e.g. `nextjs/template/src/lib/db.ts.ejs`).
  Don't add a null-guard that makes it render whitespace.
- **A path segment starting with `_` becomes a dotfile** (`_gitignore` →
  `.gitignore`) so dotfiles survive `npm pack`. Name template dotfiles this way.
- **`src/components/index.ts` is an explicit list**, not filesystem globbing. A new
  component is not live until it is imported and added there.
- **`tsconfig.json` excludes `src/**/template/**`** — template files are copied
  verbatim by `scripts/copy-templates.mjs`, never compiled. Any new `template/`
  dir is picked up automatically by that script.
- **Backends own their own DB/cache wiring.** NestJS uses `has(...)` branches in
  `app.module.ts.ejs`; Next.js ships `src/lib/*.ts.ejs` singletons. Framework-
  specific glue packages (`@nestjs/typeorm`) are `combos` on the *backend*
  manifest, keyed on the database id — the database manifest stays backend-agnostic.
- Keep mergers **pure** — they take fragments and return a `MergeResult`, they do
  not touch disk. Disk writes happen only in `src/exec/`.

## When you change behaviour

1. `npm run typecheck` clean.
2. `npm test` green. If a merger/template changed on purpose, review the diff from
   `npx vitest run -u` before committing the updated snapshots.
3. Update `docs/` if you added/changed a component, a CLI flag, or an engine rule.
4. Note the change in `tasks.md` if it belongs to a tracked phase.

## Conventions

- ESM only (`"type": "module"`), `.js` extensions in relative imports (NodeNext).
- 2-space indent, LF, final newline (`.editorconfig`).
- Commit subjects: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`). See [`docs/contributing.md`](docs/contributing.md) for the PR
  flow.
- Match the terse, comment-explaining-*why* style of the surrounding code.
