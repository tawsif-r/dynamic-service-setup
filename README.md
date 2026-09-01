# create-app

A composable project scaffolding CLI. Pick a backend, database, cache and infra —
get a working, self-contained project. No lock-in: the generated project has no
runtime dependency on `create-app`.

> Status: **Phases 1–2 done** (see `tasks.md`). Design in `plan.md`.
>
> Backends: **NestJS**, **Next.js** (App Router). Databases: **PostgreSQL**, **MongoDB**.
> Cache: **Redis**. Plus Docker + Compose, a package manager, ESLint/Prettier, git.

## How it works

Each technology is a **component** (`src/components/<category>/<id>/`) that contributes
fragments: static template files, dependencies, env vars, a Docker Compose service,
config wiring. A **composition engine** merges those fragments — so `docker-compose.yml`,
`.env` and `package.json` are assembled from whatever you picked, never copied whole.

Each **backend owns how a database/cache wires in**: NestJS injects modules into
`app.module.ts`; Next.js gets singleton clients in `src/lib/` (`db.ts`, `redis.ts`),
created only for the components you picked.

## Develop

```bash
npm install
npm run dev -- my-app --backend nestjs --database postgres --cache redis --docker --pm npm
npm test
npm run build      # emits dist/ + copies component templates
```

## Usage (target)

```bash
create-app                       # interactive
create-app voting-app --backend nestjs --database postgres --cache redis --docker --pm npm
create-app web-app   --backend nextjs --database mongodb  --cache redis --docker --pm pnpm

# where it lands
create-app api --dir ~/code/services   # -> ~/code/services/api  (dirs created as needed)
create-app apps/web --backend nextjs   # path in the name works too -> ./apps/web
```

Default target is the current directory. `--dir` sets the parent; a path in the
name arg (relative, `~/…`, or absolute) is honoured and combined with `--dir`.
The **interactive** flow asks "Directory to create it in" right after the name
(default `.`); it's skipped when `--dir` or a pathful name is already given.

## Smoke test (local)

Requires Docker. Generate the v1 slice, then verify it end-to-end:

```bash
npm run build   # build create-app itself first
node bin/create-app.js voting-app \
  --backend nestjs --database postgres --cache redis --docker --pm npm -y

cd voting-app
npm install && npm run build     # nest build
docker compose config            # composed YAML parses and resolves
docker compose up -d --build
curl -sf localhost:3000          # -> {"status":"ok","uptime":...}
docker compose down -v
```

For a Next.js project the equivalent is `npm install && npx next build` (produces
`.next/standalone/server.js`, which the generated Dockerfile runs).

`npm test` also runs the fast, install-free checks: `test/snapshot.test.ts` generates
both a NestJS and a Next.js stack into a temp dir (no `npm install`/`git init`) and
snapshots the file tree plus `docker-compose.yml`, `package.json`, `.env`, `Dockerfile`
and the wiring files. Run `npx vitest run -u` to intentionally update snapshots after a
deliberate change to a merger or template.
