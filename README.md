# create-app

A composable project scaffolding CLI. Pick a backend, database, cache and infra —
get a working, self-contained project. No lock-in: the generated project has no
runtime dependency on `create-app`.

> Status: **Phases 1–3 done** (see `tasks.md`). Design in `plan.md`.
>
> Backends: **NestJS**, **Next.js** (App Router), **ASP.NET Core** (Minimal API or
> Web API). Databases: **PostgreSQL**, **MongoDB**. Cache: **Redis**. Plus Docker +
> Compose, a package manager, ESLint/Prettier, git.

## How it works

Each technology is a **component** (`src/components/<category>/<id>/`) that contributes
fragments: static template files, dependencies, env vars, a Docker Compose service,
config wiring. A **composition engine** merges those fragments — so `docker-compose.yml`,
`.env` and `package.json`/`.csproj` are assembled from whatever you picked, never copied
whole.

Each **backend owns how a database/cache wires in**: NestJS injects modules into
`app.module.ts`; Next.js gets singleton clients in `src/lib/` (`db.ts`, `redis.ts`),
created only for the components you picked; ASP.NET Core wires them into `Program.cs`
(an `AppDbContext`/`IMongoClient`/`IConnectionMultiplexer` registration per selection).

## Backends

Pick one with `--backend <id>` (or interactively). Every backend ships a health
endpoint at `GET /` on port 3000 — `{"status":"ok","uptime":...}` — so the same
`docker compose up -d && curl localhost:3000` check works regardless of which you pick.

| `--backend <id>` | Runtime | What it is | Good for |
|---|---|---|---|
| `nestjs` | Node.js | Progressive Node framework (TypeScript, Express) | Structured, DI-driven REST APIs |
| `nextjs` | Node.js | Next.js, App Router, standalone output | Full-stack apps — UI + API routes together |
| `aspnet-minimal` | .NET | ASP.NET Core **Minimal API** — top-level `Program.cs`, routes as `MapGet`/`MapPost` calls | Lean REST APIs with the least ceremony |
| `aspnet-webapi` | .NET | ASP.NET Core **Web API** — `[ApiController]` classes under `Controllers/` | REST APIs that want MVC conventions / one class per resource |

```bash
create-app orders-api  --backend aspnet-minimal --database postgres --cache redis --docker
create-app catalog-api --backend aspnet-webapi  --database mongodb  --docker
```

Two things are different for a dotnet backend, and both are automatic — no flag to
remember:

- **`--pm` is ignored.** NuGet packages are resolved by `dotnet restore`; there's no
  package-manager choice to make. (`create-app` prints a one-line warning as a reminder
  if you passed `--pm` anyway.)
- **ESLint/Prettier are skipped**, even though they're the default `tooling` for Node
  backends — they're TypeScript-only tools and would just add irrelevant config files
  to a C# project.

## Develop

```bash
npm install
npm run dev -- my-app --backend nestjs --database postgres --cache redis --queue rabbitmq --docker --pm npm
npm test
npm run build      # emits dist/ + copies component templates
```

## Usage (target)

```bash
create-app                       # interactive
create-app voting-app --backend nestjs --database postgres --cache redis --queue rabbitmq --docker --pm npm
create-app web-app   --backend nextjs --database mongodb  --cache redis --docker --pm pnpm
create-app orders-api --backend aspnet-minimal --database postgres --docker

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

For an ASP.NET Core project, swap the npm-specific lines for the dotnet equivalent
(no `--pm`, no `npm install` — `dotnet restore`/`dotnet build` do the equivalent job):

```bash
npm run build   # build create-app itself first
node bin/create-app.js orders-api \
  --backend aspnet-minimal --database postgres --docker -y

cd orders-api
dotnet build                     # restores NuGet packages and compiles
docker compose config            # composed YAML parses and resolves
docker compose up -d --build
curl -sf localhost:3000          # -> {"status":"ok","uptime":...}
docker compose down -v
```

`npm test` also runs the fast, install-free checks: `test/snapshot.test.ts` generates
a NestJS, a Next.js, and both ASP.NET Core stacks into a temp dir (no
`npm install`/`dotnet restore`/`git init`) and snapshots the file tree plus
`docker-compose.yml`, `package.json`/`.csproj`, `.env`, `Dockerfile`, and the wiring
files (`src/app.module.ts`, `src/lib/db.ts`, `Program.cs`, ...). Run `npx vitest run -u`
to intentionally update snapshots after a deliberate change to a merger or template.
