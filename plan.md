# Plan: `create-app` — composable project scaffolding CLI

## Context

Every new project starts with the same manual boilerplate: pick a backend (NestJS,
Next.js, ASP.NET), a database (Postgres, Mongo), a cache (Redis), then wire up
Docker Compose, `.env`, package manager, linting, git. The combinations repeat but
each setup is redone by hand, and the `docker-compose.yml` / `.env` / `package.json`
have to be reconciled across whatever was chosen.

The goal is a single interactive command that asks for (or takes as flags) the stack
choices and generates a **working, self-contained project** — one that does not depend
on `create-app` to keep running afterward.

The core design decision: this is **not** "a better `npm init`". Choices and generation
are separate. Each technology is a **component** that contributes fragments (files,
dependencies, env vars, a compose service, config patches); a **composition engine**
merges those fragments into the final project. Shared files like `docker-compose.yml`
are built by merging per-component fragments, never copied whole.

### Decisions locked in

| Question | Choice |
|---|---|
| CLI runtime | **TypeScript / Node**, shipped as a global bin. CLI language is independent of what it scaffolds. |
| Template model | **Hybrid** — static EJS template files per component for unique parts + a manifest that programmatically contributes to shared files. |
| v1 scope | **One vertical slice, end-to-end**: NestJS + Postgres + Redis + Docker Compose + package manager + git/eslint/prettier. |
| Invocation | **Global bin** (`npm link` / `npm i -g`) + interactive prompts + full non-interactive flags + YAML presets in `~/.config/create-app/presets/`. |

> Note: local dev toolchain has Node 26 + npm 11, no pnpm/corepack. The `create-app`
> repo itself is built with **npm**. The generated projects can still target pnpm/yarn/npm
> via `--pm`; the pnpm smoke test is skipped locally until pnpm is installed.

---

## Architecture

```
CLI args ──┐
Preset ────┼──▶ resolve() ──▶ ProjectConfig ──▶ validate() ──▶ Registry.select()
Prompts ──┘                                                          │
                                                                    ▼
                                              selected Component[]  (each = manifest)
                                                                    │
                              ┌─────────────────────────────────────┼─────────────────────────┐
                              ▼                 ▼                    ▼                          ▼
                        render templates  merge package.json   merge compose            merge .env / Dockerfile
                        (EJS + config)    / .csproj            (YAML AST)                / assemble README
                              └─────────────────────────────────────┼─────────────────────────┘
                                                                    ▼
                                                            write-files → temp dir
                                                                    ▼
                                              post-generate: install · git init · format
                                                                    ▼
                                                          move into <name>/ · print "Next:" steps
```

### Layers

1. **Config resolution** (`src/config/`) — merge, in increasing priority: preset file →
   CLI flags → interactive prompt answers. Output is a single `ProjectConfig` validated
   by a `zod` schema. Interactive prompts are skipped for any value already supplied.
   *Where* to build is separate (`RunOptions.targetDir`): `src/util/target.ts`
   `resolveTarget()` combines the `[name]` arg (which may carry a path, `~/…`, or be
   absolute) with `--dir` (default cwd); the `<name>/` folder is created there, parents
   included.
2. **Registry** (`src/registry.ts`) — discovers component manifests, indexes them by
   `category` + `id`, resolves the selection from `ProjectConfig`.
3. **Validation** (`src/engine/validate.ts`) — checks `requires` / `conflicts` across
   selected components and a few cross-cutting rules. Fails with human-readable messages
   **before any file is written**.
4. **Composition engine** (`src/engine/`) — one module per output artifact.
5. **Executor** (`src/exec/`) — file writes, package-manager abstraction, post-generate
   commands.

---

## Component manifest specification

Each component is a directory under `src/components/<category>/<id>/` with `manifest.ts`
and an optional `template/` folder.

```ts
interface Component {
  id: string;                 // "nestjs", "postgres", "redis"
  category: "backend" | "database" | "cache" | "infra" | "tooling" | "vcs";
  label: string;              // shown in prompts
  runtime?: "node" | "dotnet"; // backends declare this; drives which mergers apply

  // Relationships — consumed by validate()
  requires?: string[];        // ids that must also be selected
  conflicts?: string[];       // ids that must not be selected
  provides?: string[];        // capability tags, e.g. "sql-db", "container-runtime"

  // Static files: every file under template/ is rendered through EJS with
  // { config, components } as context, then placed at the same relative path.
  templateDir?: string;

  // Contributions to SHARED files (merged, not copied)
  node?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  dotnet?: {
    packages?: Record<string, string>;
  };

  env?: EnvEntry[];           // { key, value, comment? } → .env + .env.example
  compose?: {
    services?: Record<string, ComposeService>;
    volumes?: Record<string, unknown>;
    appDependsOn?: string[];
  };
  dockerfile?: {
    stages?: DockerfileStage[];
    cmd?: string[];          // backend override for the runtime CMD
    runtimeStage?: string[]; // backend override for the runtime-stage COPY lines
  };
  combos?: {                 // contribution gated on OTHER ids also being selected
    when: string[];          // e.g. nestjs uses when:["postgres"] → @nestjs/typeorm
    node?: NodeContribution;
  }[];
  readme?: string;            // markdown section appended to generated README

  prompts?: PromptSpec[];     // component-specific follow-up questions (rare)
  postGenerate?: (ctx: GenerateCtx) => Command[];
}
```

### Template rules

- A `.ejs` file is rendered with `{ config, components, has(id) }` and the `.ejs`
  stripped; a leading `_` on a path segment becomes `.` (dotfiles survive `npm pack`).
- **An `.ejs` that renders to blank is dropped** — this is how one template emits a
  file only for some selections (e.g. Next.js `src/lib/db.ts.ejs` exists only when a
  database is picked; the Nest-shaped `redis.module.ts.ejs` is gated on `has('nestjs')`).

### How each shared artifact is produced

- **`docker-compose.yml`** (`merge-compose.ts`) — base `{ services: { app } }` from the
  `infra/docker-compose` component; for every selected component deep-merge its
  `compose.services` / `compose.volumes` and append `compose.appDependsOn` to
  `services.app.depends_on`. Built as a **YAML AST via the `yaml` package**. Verified
  with `docker compose config`.
- **`package.json`** (`merge-package-json.ts`) — `runtime: "node"` only. Base metadata +
  union of every component's `node.*`. Conflicting version specs → validation warning.
- **`.csproj`** (`merge-csproj.ts`) — `runtime: "dotnet"` only. Project shell
  (SDK/TargetFramework/RootNamespace/AssemblyName, the latter two from
  `util/dotnet-identifier.ts`) + union of every component's `dotnet.packages` as
  `<PackageReference>`, same collision policy as `merge-package-json.ts`.
- **`.env` / `.env.example`** (`merge-env.ts`) — union of `env` entries, deduped by key,
  grouped by contributing component. `postgres` → `DATABASE_URL`, `redis` → `REDIS_URL`.
- **`Dockerfile`** (`merge-dockerfile.ts`) — pm-aware Node multi-stage. Runtime `CMD`
  and the runtime-stage COPY lines default to a `tsc` `dist/` layout; a backend manifest
  overrides via `dockerfile.cmd` / `dockerfile.runtimeStage` (Next.js → standalone).
- **`README.md`** (`assemble-readme.ts`) — intro + each component's `readme` + generated
  "Getting started" block.

### Backend config wiring

Each backend owns *how* a database/cache wires in — there is no shared wiring step:

- **NestJS**: `app.module.ts.ejs` conditionally includes `TypeOrmModule.forRoot(...)` /
  `MongooseModule.forRoot(...)` / `RedisModule` based on `has(...)`. The Nest-specific
  glue package (`@nestjs/typeorm`, `@nestjs/mongoose`) is a `combos` entry on the
  `nestjs` manifest, keyed on the database id — the database manifests carry only
  backend-agnostic deps (`pg`, `typeorm`, `mongoose`).
- **Next.js**: no central module, so the backend template ships `src/lib/db.ts.ejs` and
  `src/lib/redis.ts.ejs` singletons that render empty (→ dropped) unless the matching
  component is selected.
- **ASP.NET Core** (`aspnet-minimal`, `aspnet-webapi`): same central-file pattern as
  NestJS — `Program.cs.ejs` conditionally registers `AddDbContext<AppDbContext>` (EF
  Core + Npgsql) / a singleton `IMongoClient` / a singleton `IConnectionMultiplexer`
  based on `has(...)`. No backend-specific glue package is needed (ASP.NET's DI needs
  none), so the NuGet packages (`Npgsql.EntityFrameworkCore.PostgreSQL`,
  `MongoDB.Driver`, `StackExchange.Redis`) live directly on the database/cache
  manifests' `dotnet.packages`, mirroring where their `node.dependencies` live.

No AST codemod. `ts-morph`-based `configPatches` is a reserved manifest field, unused in
v1.

---

## Repo layout

```
create-app/
├── package.json              # bin: { "create-app": "./bin/create-app.js" }
├── tsconfig.json
├── bin/create-app.js         # shim → dist/cli.js
├── src/
│   ├── cli.ts                # entrypoint; arg parsing (commander)
│   ├── prompts.ts            # interactive flow (@clack/prompts)
│   ├── generate.ts           # the resolve→validate→compose→write→post pipeline
│   ├── config/
│   │   ├── schema.ts         # ProjectConfig zod schema + inferred types
│   │   ├── resolve.ts        # preset < flags < prompts merge
│   │   └── presets.ts        # load ~/.config/create-app/presets/*.yaml
│   ├── registry.ts
│   ├── components/
│   │   ├── types.ts
│   │   ├── index.ts          # explicit list of built-in components
│   │   ├── backend/nestjs/{manifest.ts, template/}
│   │   ├── backend/nextjs/{manifest.ts, template/}
│   │   ├── backend/aspnet-minimal/{manifest.ts, template/}
│   │   ├── backend/aspnet-webapi/{manifest.ts, template/}
│   │   ├── database/postgres/{manifest.ts, template/}
│   │   ├── database/mongodb/manifest.ts
│   │   ├── cache/redis/{manifest.ts, template/}
│   │   ├── infra/docker/{manifest.ts, template/}
│   │   ├── infra/docker-compose/{manifest.ts, template/}
│   │   └── tooling/{eslint,prettier,git}/{manifest.ts, template/}
│   ├── engine/
│   │   ├── validate.ts
│   │   ├── render.ts
│   │   ├── merge-package-json.ts
│   │   ├── merge-compose.ts
│   │   ├── merge-env.ts
│   │   ├── merge-dockerfile.ts
│   │   ├── merge-csproj.ts
│   │   └── assemble-readme.ts
│   ├── exec/
│   │   ├── package-manager.ts
│   │   ├── write-files.ts
│   │   └── post-generate.ts
│   └── util/{fs.ts, logger.ts}
├── test/
│   ├── engine/*.test.ts
│   └── fixtures/
└── README.md
```

### Key libraries

`@clack/prompts` · `commander` · `zod` · `ejs` · `yaml` · `execa` · `picocolors` ·
`vitest` · `tsup` (bundle to `dist/`).

---

## v1 deliverable (the vertical slice)

```bash
create-app                       # fully interactive
create-app voting-app --backend nestjs --database postgres \
  --cache redis --docker --pm npm            # non-interactive
```

produces `voting-app/` with: NestJS project wired to TypeORM + cache · merged
`package.json` · `docker-compose.yml` (app + postgres:18 + redis:8 + volumes +
depends_on) · `Dockerfile` + `.dockerignore` · `.env` + `.env.example` · eslint/prettier
config · `.gitignore` · initialized git repo · deps installed · `README.md` with a
"Next:" block.

Interactive and non-interactive modes built together; prompts only ask for values not
already provided.

---

## Phased roadmap

| Phase | Adds | Proves | Status |
|---|---|---|---|
| **1** | Skeleton, config/registry/validate/engine/exec, the NestJS+Postgres+Redis+Docker+pm+git+eslint+prettier slice, both invocation modes | Composition engine works end-to-end | ✅ done |
| **2** | Next.js backend; MongoDB database | Second node backend + DB swap without engine changes | ✅ done — additive only: "empty `.ejs` dropped" rule, generic `combos`, `dockerfile.cmd`/`runtimeStage` |
| **3** | Two ASP.NET Core backends (Minimal API, Web API); `merge-csproj.ts` body | `runtime: "dotnet"` path | ✅ done — additive: `dotnetNamespace` render field, `DotnetContribution.sdk`, dotnet branch in `merge-dockerfile.ts`/`assemble-readme.ts`/`generate.ts`/`post-generate.ts`, `node-runtime` capability tag |
| **4** | More dotnet backend templates (MVC, Blazor, Worker Service); preset files (`--preset nest-api`); extra tooling (CI workflow, husky, commitlint) | Presets solve real-world repetition | not started |
| **5** | User component dir `~/.config/create-app/components/` loaded by the registry | Personal/company components without forking | not started |

---

## Verification

**Unit (`vitest`)** — each merge function in isolation: feed component fragments, assert
merged `docker-compose.yml` object, `package.json`, `.env`. Cover collisions (two
components adding `depends_on`, duplicate env keys, overlapping deps).

**Snapshot** — run the generator with a fixed `ProjectConfig` into a temp dir
(`--no-install`), snapshot the file tree + key file contents.

**Smoke (local + CI)** on the v1 slice:
1. `docker compose config` — composed YAML parses and resolves.
2. `npm install && npm run build` — the Nest project compiles with merged deps.
3. `docker compose up -d && curl localhost:3000 && docker compose down` — app boots,
   reaches Postgres + Redis.
4. `git -C voting-app log` — repo initialized with an initial commit.

**Non-interactive harness** — every test invokes the CLI with full flags so nothing
blocks on prompts.
