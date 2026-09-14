# Development guide

How `create-app` is put together, where each module lives, and how to work on it.

- [Local setup](#local-setup)
- [The daily loop](#the-daily-loop)
- [Architecture](#architecture)
- [The generation pipeline, step by step](#the-generation-pipeline-step-by-step)
- [Module map](#module-map)
- [Core data types](#core-data-types)
- [Template rules](#template-rules)
- [How each shared file is assembled](#how-each-shared-file-is-assembled)
- [Backend-specific wiring](#backend-specific-wiring)
- [Build output](#build-output)
- [Common tasks](#common-tasks)
- [Gotchas](#gotchas)

---

## Local setup

```bash
git clone https://github.com/tawsif-r/dynamic-service-setup.git
cd dynamic-service-setup
npm install
npm test           # 57+ tests should pass
npm run typecheck  # must be clean
```

Requirements:

- **Node ≥ 20.11** (`package.json#engines`). CI and the maintainers run a newer
  Node; anything ≥ 20.11 is fine.
- **npm**. This repo is built with npm. Generated *projects* can target
  `npm | pnpm | yarn` via `--pm`, but you do not need pnpm/yarn installed to work
  on `create-app` itself — the package-manager logic is unit-tested as pure argv
  tables (`test/exec/package-manager.test.ts`).
- **Docker** only for the full end-to-end smoke test (see [testing.md](testing.md)).

## The daily loop

```bash
# run the CLI from source (no build step) — args after `--` go to the CLI
npm run dev -- my-app --backend nestjs --database postgres --cache redis --docker --pm npm --no-install --no-git

# generate into a scratch dir and inspect the result
npm run dev -- scratch --backend nextjs --database mongodb --cache redis --dir /tmp/ca -y

# see the plan without writing anything
npm run dev -- demo --backend nestjs --dry-run

# fast feedback while editing engine/merger code
npm run test:watch
```

`npm run dev` uses `tsx` to run `src/cli.ts` directly. `bin/create-app.js` instead
loads `dist/cli.js`, so it needs `npm run build` first — use it only to test the
packaged path.

Before pushing:

```bash
npm run typecheck && npm test && npm run build
```

---

## Architecture

The one design decision everything follows from: **choosing a stack and generating
it are separate concerns.**

- A **component** is a self-contained description of one technology (NestJS,
  PostgreSQL, Redis, Docker…). It lives at `src/components/<category>/<id>/` and
  exports a `Component` manifest plus an optional `template/` folder. A component
  never knows about the final file layout — it only contributes *fragments*.
- The **composition engine** (`src/engine/`) takes the set of selected components
  and merges their fragments into concrete files. One engine module per output
  artifact (`merge-package-json.ts`, `merge-compose.ts`, …).
- The **executor** (`src/exec/`) is the only layer that touches the disk or spawns
  processes.

Consequences you must preserve:

- Shared files (`package.json`, `docker-compose.yml`, `.env`, `Dockerfile`,
  `README.md`) have **no template**. They are built by unioning contributions.
- Adding a component touches **only** `src/components/` + one line in
  `src/components/index.ts`. It never requires an engine or schema change. (If it
  does, that is a signal the engine needs a new *generic* capability — see how
  `ComboContribution` and `dockerfile.cmd` were added in Phase 2.)
- Every merger is **pure**: `(config, selected) => MergeResult`. No I/O.

```
CLI args ──┐
Preset ────┼──▶ resolve() ──▶ ProjectConfig ──▶ validate() ──▶ Registry.select()
Prompts ──┘                                                          │
                                                                    ▼
                                              selected Component[]  (each = a manifest)
                                                                    │
                    ┌───────────────────────────────────────────────┼───────────────────────────┐
                    ▼                     ▼                          ▼                            ▼
              render templates      merge package.json         merge compose             merge .env / Dockerfile
              (EJS + config)        / .csproj                  (YAML AST)                / assemble README
                    └───────────────────────────────────────────────┼───────────────────────────┘
                                                                    ▼
                                                       one FileMap  →  write to temp dir
                                                                    ▼
                                          post-generate: install · git init · format
                                                                    ▼
                                        atomic move into <name>/ · print "Next:" steps
```

---

## The generation pipeline, step by step

Entry point: `generateProject()` in `src/generate.ts`. Called by `src/cli.ts` after
config resolution.

1. **Resolve config** (`src/config/resolve.ts`) — merge `preset < flags < answers`,
   drop `undefined`s, let zod `.default()`s fill the rest, validate. Throws a
   readable multi-line error on invalid input. *Where* to build is resolved
   separately by `resolveTarget()` in `src/util/target.ts` (combines the `[name]`
   arg — which may carry a path, `~/…`, or be absolute — with `--dir`).
2. **Select components** (`Registry.select()` in `src/registry.ts`) — from the
   config, produce an ordered `Component[]`: backend, then database/cache unless
   `"none"`, then each tooling id, plus implied infra (`docker` + `docker-compose`
   when `config.docker`) and `git`. Order is `CATEGORY_ORDER`. Unknown or
   `unavailable` ids throw here with the list of known ids.
3. **Validate the selection** (`assertValid()` in `src/engine/validate.ts`) —
   `requires` / `conflicts` (each token is a component id *or* a `provides`
   capability tag), duplicate exclusive capabilities (`sql-db`, `document-db`,
   `primary-datastore`), and cross-cutting rules (redis needs a runtime,
   `docker-compose` needs `docker`). **Fails before any file is written.**
   Non-fatal issues come back as `warnings`.
4. **Compose files** (`composeFiles()` in `src/generate.ts`, pure):
   - render every selected component's `templateDir` through EJS
     (`renderTemplateDir` in `src/engine/render.ts`) into a `FileMap`;
   - run every merger — `mergePackageJson`, `mergeCsproj`, `mergeCompose`,
     `mergeEnv`, `mergeDockerfile`, `assembleReadme` — and overlay their files on
     top (merger output wins over templates on a path collision).
5. **Write + move** (`src/exec/write-files.ts`, `src/util/fs.ts`) — write the
   `FileMap` into a sibling temp dir (`.create-app-*` next to the target, falling
   back to the OS temp dir), then `rename()` it into place (`moveDir` falls back to
   copy+rm across filesystems). This makes generation atomic: a failure leaves no
   half-written project. `--force` removes an existing target first; `--dry-run`
   stops here and just prints the plan.
6. **Post-generate** (`src/exec/post-generate.ts`) — in order: component
   `postGenerate` hook commands → dependency install (`<pm> install` for a node
   backend, `dotnet restore` for a dotnet one — selected by the `runtime`
   `generate.ts` passes in, not by string-matching `config.backend`) → `git init` +
   identity fallback + initial commit → `prettier --write` if the `prettier`
   tooling component is present (node only). Each step is individually non-fatal
   where a failure should not abandon a project that is otherwise written.
7. **Report** — `GenerateResult` carries the file list, warnings, and the
   `Next:` steps the CLI prints.

---

## Module map

```
src/
├── cli.ts                     entrypoint — commander flags, wires the pipeline
├── prompts.ts                 interactive flow (@clack/prompts); asks only for
│                              values not already decided by preset/flags
├── generate.ts                generateProject(): the whole pipeline
├── registry.ts                Registry.select() — config → ordered Component[]
│
├── config/
│   ├── schema.ts              zod ProjectConfig + RunOptions. Component ids are
│   │                          OPEN STRINGS — do not enumerate them here.
│   ├── resolve.ts             flagsToConfig / mergeConfig / resolveConfig
│   │                          (preset < flags < answers)
│   └── presets.ts             loadPreset / listPresets from
│                              ~/.config/create-app/presets/*.{yaml,yml,json}
│
├── components/
│   ├── types.ts               the Component interface + all contribution types
│   ├── index.ts               builtinComponents — EXPLICIT import list
│   ├── backend/nestjs/        manifest.ts + template/
│   ├── backend/nextjs/        manifest.ts + template/
│   ├── backend/aspnet-minimal/ manifest.ts + template/ (top-level Program.cs)
│   ├── backend/aspnet-webapi/  manifest.ts + template/ (Controllers/)
│   ├── database/postgres/     manifest.ts (no template — wired via app.module /
│   │                          Program.cs)
│   ├── database/mongodb/      manifest.ts
│   ├── cache/redis/           manifest.ts + template/ (Nest-shaped, has('nestjs'))
│   ├── infra/docker/          manifest.ts + template/_dockerignore
│   ├── infra/docker-compose/  manifest.ts — supplies the base `app` service
│   └── tooling/{eslint,prettier,git}/  manifest.ts + template/ (eslint/prettier
│                              `requires: ["node-runtime"]` — rejected against a
│                              dotnet backend rather than shipping dead config)
│
├── engine/                    ← composition. Every module here is PURE.
│   ├── validate.ts            validateSelection / assertValid
│   ├── render.ts              renderTemplateDir, makeRenderContext (config/has())
│   ├── files.ts               FileMap, GeneratedFile, MergeResult, collectors
│   ├── deep-merge.ts          deepMerge (obj recurse, array concat+dedupe), sortKeys
│   ├── merge-package-json.ts  node backends: union of node.* + combos
│   ├── merge-compose.ts       docker-compose.yml as a YAML AST
│   ├── merge-env.ts           .env + .env.example, grouped by component
│   ├── merge-dockerfile.ts    pm-aware Node multi-stage Dockerfile, or a dotnet
│   │                          SDK/runtime multi-stage Dockerfile
│   ├── merge-csproj.ts        dotnet backends: project shell + dotnet.* union
│   └── assemble-readme.ts     README.md: stack list + component sections
│
├── exec/                      ← the only layer that does I/O
│   ├── write-files.ts         writeFileMap (sorted, mkdir -p, mode bits)
│   ├── post-generate.ts       install · git init · format (each non-fatal)
│   └── package-manager.ts     planInvocation (pure argv) + getPackageManager driver
│
└── util/
    ├── target.ts              resolveTarget — [name] + --dir → { projectName, targetDir }
    ├── fs.ts                  pathExists, isDirEmpty, ensureDir, moveDir (EXDEV-safe)
    ├── dir.ts                 moduleDir(import.meta.url) — for templateDir paths
    ├── dotnet-identifier.ts   toDotnetIdentifier(name) — C#-safe RootNamespace/
    │                          AssemblyName/.csproj filename, shared by
    │                          merge-csproj.ts, merge-dockerfile.ts and every
    │                          dotnet .ejs template (as `dotnetNamespace`)
    └── logger.ts              consoleLogger / silentLogger

scripts/copy-templates.mjs     build step: copy every src/**/template/ → dist/
bin/create-app.js              shim → dist/cli.js
test/                          see docs/testing.md
```

---

## Core data types

### `ProjectConfig` (`src/config/schema.ts`)

The validated description of *what to generate*. Key fields: `name`, `backend`,
`database` (default `"none"`), `cache` (default `"none"`), `docker`,
`packageManager`, `tooling: string[]` (default `["eslint", "prettier"]`), `git`,
`install`, `externalRedis`. Component-id fields are **open `z.string()`** — the
registry validates them, not the schema.

`RunOptions` (also in that file) is *how the run behaves*, separate from the
project contents: `targetDir`, `cwd` (for the "cd" hint only), `dryRun`, `force`.

### `Component` (`src/components/types.ts`)

A composable unit. The fields the engine reads:

| Field | Consumed by | Purpose |
|---|---|---|
| `id`, `category`, `label`, `summary` | registry, prompts | identity + menu display |
| `runtime` (`"node" \| "dotnet"`) | `merge-package-json`, `merge-dockerfile`, `merge-csproj`, `post-generate.ts` | which mergers/post-generate steps apply; backends declare it |
| `unavailable` | registry | stub marker — not selectable, shown with this reason |
| `requires`, `conflicts`, `provides` | `validate.ts` | relationships; tokens are ids or capability tags (e.g. `node-runtime`, provided by node backends and required by eslint/prettier) |
| `templateDir` | `render.ts` | absolute path to a folder of EJS/plain files |
| `node` | `merge-package-json` | `dependencies` / `devDependencies` / `scripts` |
| `dotnet` | `merge-csproj` | `packages`; `sdk` (backend only, e.g. `Microsoft.NET.Sdk.Web`) |
| `env` | `merge-env` | `{ key, value, comment? }[]` → `.env` + `.env.example` |
| `compose` | `merge-compose` | `services`, `volumes`, `appDependsOn` |
| `dockerfile` | `merge-dockerfile` | `stages[]` (anchored lines), `cmd`, `runtimeStage` |
| `combos` | `merge-package-json` | contributions gated on *other* ids also being selected |
| `readme` | `assemble-readme` | markdown section appended to the generated README |
| `postGenerate(ctx)` | `post-generate.ts` | commands to run after files are written |

### `FileMap` (`src/engine/files.ts`)

`Map<path, GeneratedFile>`. The overlay rule is **last `set()` wins**: templates go
in first, merger output overwrites on a path collision.

---

## Template rules

Implemented in `src/engine/render.ts`. Every file under a component's
`templateDir` is processed:

- **`.ejs` suffix** → rendered with EJS, suffix stripped. Context is
  `{ config, components, has(id) }`:
  ```ejs
  <% if (has('redis')) { -%>
  import { RedisModule } from './redis/redis.module';
  <% } -%>
  export const NAME = '<%= config.name %>';
  ```
  Use `-%>` to swallow the trailing newline on control-flow lines.
- **`.ejs` that renders to only whitespace is dropped.** This is how one template
  file emits output for some selections and nothing for others — e.g.
  `backend/nextjs/template/src/lib/db.ts.ejs` produces a Postgres `DataSource`, a
  Mongoose helper, or (no database) nothing.
- **A path segment starting with `_` becomes a dotfile**: `_gitignore` →
  `.gitignore`, `_prettierrc` → `.prettierrc`. Needed because `npm pack` won't
  ship real dotfiles.
- Non-`.ejs` files are copied byte-for-byte (read as a `Buffer`).
- Plain `.ts`/`.json` files in a `template/` dir are **not compiled** — `tsconfig`
  excludes `src/**/template/**`, and `scripts/copy-templates.mjs` copies them to
  `dist/` verbatim.

---

## How each shared file is assembled

| File | Module | Rule |
|---|---|---|
| `package.json` | `merge-package-json.ts` | `runtime: "node"` backends only. Base metadata (`name`, `version`, `private`) + union of every selected component's `node.dependencies` / `devDependencies` / `scripts`, plus any `combos` whose `when` ids are all selected. Conflicting version specs → **warning, first spec kept**. Keys sorted. No template. |
| `docker-compose.yml` | `merge-compose.ts` | Only when `docker-compose` is selected. Base `{ services: { app } }` from the `infra/docker-compose` manifest; for every component deep-merge `compose.services` / `compose.volumes` by name and append `compose.appDependsOn` to `services.app.depends_on` (deduped, sorted). Serialised with the `yaml` package — **never string glue**. |
| `.env` / `.env.example` | `merge-env.ts` | Union of every `env` entry, deduped by key (**first component to declare a key wins**; a differing later value → warning), grouped under a `# --- <component id> ---` header. v1 keeps the two files identical (dev defaults, not secrets). |
| `Dockerfile` | `merge-dockerfile.ts` | Only when `docker` is selected. Dispatches on `backend.runtime`: for `"node"`, a multi-stage `node:22-alpine` build parameterised by `packageManager` (lockfile name, install command) — the runtime `CMD` and runtime-stage `COPY` lines default to a `tsc` `dist/` layout, a backend overrides via `dockerfile.cmd` / `dockerfile.runtimeStage` (Next.js → standalone `server.js`); for `"dotnet"`, a `mcr.microsoft.com/dotnet/sdk` build stage (`dotnet restore` + `dotnet publish`) → `mcr.microsoft.com/dotnet/aspnet` runtime stage, `ENTRYPOINT ["dotnet", "<ident>.dll"]` (`<ident>` from `util/dotnet-identifier.ts`, same value `merge-csproj.ts` uses). Both paths accept `dockerfile.stages` injection at `prelude \| deps \| build \| runtime`. |
| `README.md` | `assemble-readme.ts` | Always emitted. Title + "no runtime dependency on the generator" note + a **Stack** list + one `### <label>` section per component that sets `readme` + a generated **Getting started** block. The "Package manager" stack line and the install/run commands in "Getting started" are dotnet-aware (`dotnet restore` / `dotnet run`, no package-manager line) when `backend.runtime === "dotnet"`. |
| `.csproj` | `merge-csproj.ts` | `runtime: "dotnet"` backends only (no-op for node). A project shell (`<Project Sdk="...">`, `TargetFramework`, `Nullable`/`ImplicitUsings`, `RootNamespace`/`AssemblyName` from `util/dotnet-identifier.ts`) plus the union of every selected component's `dotnet.packages` as `<PackageReference>` entries, mirroring `merge-package-json`'s version-collision-warns-and-keeps-first policy. |

---

## Backend-specific wiring

There is **no shared "wire the database in" step**. Each backend owns how a
database/cache connects:

- **NestJS** — `backend/nestjs/template/src/app.module.ts.ejs` has `has('postgres')`
  / `has('mongodb')` / `has('redis')` branches that conditionally add
  `TypeOrmModule.forRoot(...)`, `MongooseModule.forRoot(...)`, `RedisModule`. The
  framework glue package (`@nestjs/typeorm`, `@nestjs/mongoose`) is a **`combos`
  entry on the `nestjs` manifest**, keyed on the database id — so the database
  manifests carry only backend-agnostic deps (`pg`, `typeorm`, `mongoose`).
- **Next.js** — no central module, so `backend/nextjs/template/src/lib/db.ts.ejs`
  and `redis.ts.ejs` are singletons that render to nothing (→ dropped) unless the
  matching component is selected.
- **ASP.NET Core** (`aspnet-minimal`, `aspnet-webapi`) — same central-file pattern
  as NestJS: `Program.cs.ejs` has `has('postgres')` / `has('mongodb')` /
  `has('redis')` branches registering `AddDbContext<AppDbContext>` (EF Core +
  Npgsql), a singleton `IMongoClient`, or a singleton `IConnectionMultiplexer`.
  `Data/AppDbContext.cs.ejs` renders (and its `DbContext` subclass exists) only
  when `has('postgres')`. The NuGet packages themselves live on the database/cache
  manifests (`dotnet.packages`, mirroring where `pg`/`mongoose`/`ioredis` live on
  `node.dependencies`) rather than as backend `combos` — ASP.NET's built-in DI
  needs no extra glue package the way `@nestjs/typeorm` does.
- **Cross-backend contamination guard** — `cache/redis/template/` files are `.ejs`
  gated on `has('nestjs')` so the Nest-shaped `RedisModule`/`RedisService` don't
  leak into a Next.js project. `tooling/eslint`'s config is `.ejs` that adds
  `.next/**` to `ignores` only when `has('nextjs')`.

---

## Build output

`npm run build` = `npm run clean && tsc -p tsconfig.json && node scripts/copy-templates.mjs`:

1. `rm -rf dist`.
2. `tsc` compiles `src/**/*.ts` (minus `test/` and `src/**/template/**`) to
   `dist/` as ESM with source maps.
3. `scripts/copy-templates.mjs` walks `src/` for every directory literally named
   `template`, and copies it to the matching path under `dist/`. **A new
   `template/` folder needs no change to this script** — it is discovered.

The published package ships only `bin/` and `dist/` (`package.json#files`).

---

## Common tasks

| I want to… | Go to |
|---|---|
| Add a database / cache / backend / tool | [adding-a-component.md](adding-a-component.md) |
| Add or rename a CLI flag | [cli-commands.md](cli-commands.md#adding-a-flag) |
| Add / reorder an interactive prompt | [cli-commands.md](cli-commands.md#prompts) |
| Add a new config field (not a component id) | [cli-commands.md](cli-commands.md#adding-a-config-field) — touches `schema.ts`, `resolve.ts`, `cli.ts`, `prompts.ts` |
| Change how `docker-compose.yml` is built | `src/engine/merge-compose.ts` + `test/engine/merge.test.ts` + `npx vitest run -u` |
| Add a Dockerfile injection point | `src/components/types.ts` (`DockerfileStage["at"]`) + `src/engine/merge-dockerfile.ts` |
| Add a new package manager | `PACKAGE_MANAGERS` in `schema.ts` + the `Record<PackageManager, …>` tables in `merge-dockerfile.ts` and `package-manager.ts` |
| Change post-generate behaviour | `src/exec/post-generate.ts` |
| Add a validation rule | `src/engine/validate.ts` + `test/engine/validate.test.ts` |

---

## Gotchas

- **Relative imports need the `.js` extension** even though the files are `.ts` —
  `moduleResolution: NodeNext`. `import { x } from "./foo.js"`.
- **`npm run dev -- <args>`** — the `--` is required or npm eats the flags.
- **Snapshot churn** — a deliberate change to a merger or template will fail
  `test/snapshot.test.ts`. Review the diff, then `npx vitest run -u`. Never `-u`
  blindly.
- **`bin/create-app.js` needs a build.** Use `npm run dev` while iterating.
- **The staging dir** is created as a sibling of the target for an atomic rename;
  it falls back to the OS temp dir (then copy+rm) if that fails. Don't assume the
  project is built in place.
- **`tooling` has no CLI flag or prompt yet** — its only inputs are a preset or the
  schema default (`["eslint", "prettier"]`). `cli.ts` overrides that default to
  `[]` for a dotnet backend (right after `resolveConfig()`, checking
  `decided.tooling === undefined`) so a dotnet project doesn't get Node-only lint
  config by default; `eslint`/`prettier`'s `requires: ["node-runtime"]` is the
  safety net if a preset forces them on anyway.
- **`docker compose up -d --build` from inside some sandboxes hangs** on
  `npm install` reaching the registry from a build container (see `tasks.md` T11).
  It is not a `create-app` bug — run the containerised smoke on a normal machine.
