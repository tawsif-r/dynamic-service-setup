# Tasks: `create-app`

Working one task at a time. Status: `[ ]` todo · `[~]` in progress · `[x]` done.
See `plan.md` for the full design.

---

## Phase 1 — Vertical slice (NestJS + Postgres + Redis + Docker + npm + git/eslint/prettier) — DONE ✅

T1–T11 complete; 54 tests passing. One caveat: containerized `docker compose up --build`
could not be verified inside this sandbox (see T11) — please run that one step yourself.

### T1 — Project scaffolding ✅
- [x] `package.json` (ESM, bin, scripts; deps: commander/zod/ejs/yaml/execa/@clack/prompts/picocolors)
- [x] `tsconfig.json` (NodeNext ESM, strict), `vitest.config.ts`, `scripts/copy-templates.mjs` (tsc build, not tsup)
- [x] `bin/create-app.js` shim → `dist/cli.js`
- [x] `.gitignore`, `.editorconfig`, `README.md`
- [x] `src/cli.ts` stub: commander arg parsing, `--help` / `--version` / echo parsed input
- [x] Verified: `npm install`, `npm run build`, `node bin/create-app.js --help`, `npx vitest run`

### T2 — Config layer ✅
- [x] `src/config/schema.ts` — zod `ProjectConfig` (+ `RunOptions`), component ids kept as open strings
- [x] `src/config/presets.ts` — `loadPreset` / `listPresets` from `~/.config/create-app/presets` (yaml|yml|json, XDG-aware)
- [x] `src/config/resolve.ts` — `flagsToConfig` / `mergeConfig` / `resolveConfig` (preset < flags < answers, defaults fill rest)
- [x] `test/config/resolve.test.ts` — 8 tests, precedence + validation
- [x] Verified: `npm test` green, `npm run typecheck` clean

### T3 — Component types + registry ✅
- [x] `src/components/types.ts` — `Component` + `ComposeService`/`EnvEntry`/`GenerateCtx`/`Command`/contribution types
- [x] `src/components/index.ts` — `builtinComponents` explicit list (empty until T9)
- [x] `src/registry.ts` — `Registry` (dup detection, `choicesFor`, `select`), `createRegistry`; category-ordered selection, `"none"` skip, docker→infra, stub rejection
- [x] `test/registry.test.ts` — 7 tests
- [x] Verified: `npm test` (15 passing), `npm run typecheck` clean

### T4 — Validation ✅
- [x] `src/engine/validate.ts` — `validateSelection` (requires/conflicts by id or `provides` tag, exclusive-capability dedupe, redis-needs-runtime, compose-needs-docker, dotnet-pm warning) + `assertValid`
- [x] `test/engine/validate.test.ts` — 10 tests
- [x] Verified: `npm test` (25 passing), `npm run typecheck` clean

### T5 — Template rendering + file writing ✅
- [x] `src/engine/files.ts` — `FileMap` / `GeneratedFile` / `mergeFileMaps` (overlay: later set wins)
- [x] `src/engine/render.ts` — `renderTemplateDir` + `makeRenderContext` (`config`, `components`, `has(id)`); `.ejs` render+strip, `_foo` → `.foo` dotfile convention
- [x] `src/exec/write-files.ts` — `writeFileMap` (sorted, mkdir -p, mode bits)
- [x] `test/engine/render.test.ts` + `test/helpers/tmp.ts` — 3 tests
- [x] Verified: `npm test` (28 passing), typecheck clean

### T6 — Composition mergers ✅
- [x] `src/engine/deep-merge.ts` — `deepMerge` (obj recurse, array concat+dedupe) + `sortKeys`
- [x] `src/engine/files.ts` — `MergeResult` + `collectMergeResults`
- [x] `src/engine/merge-package-json.ts` — node-only, unions `node.*`, version-clash warning (first wins)
- [x] `src/engine/merge-compose.ts` — YAML via `yaml`, deep-merge services/volumes, accumulate `app.depends_on`
- [x] `src/engine/merge-env.ts` — `.env` + `.env.example`, grouped by component, dedupe + clash warning
- [x] `src/engine/merge-dockerfile.ts` — pm-aware Node multi-stage + injected `dockerfile.stages` anchors
- [x] `src/engine/assemble-readme.ts` — stack list + component sections + Getting Started
- [x] `src/engine/merge-csproj.ts` — stub (no-op for node, throws for dotnet)
- [x] `test/engine/merge.test.ts` — 14 tests across all mergers + collisions
- [x] Verified: `npm test` (42 passing), typecheck clean

### T7 — Executor ✅
- [x] `src/exec/package-manager.ts` — `planInvocation` (pure argv table) + `getPackageManager` driver (install/addDev/run/dlx)
- [x] `src/exec/post-generate.ts` — component hook commands → install → `git init` + identity fallback + initial commit → prettier `format` (each non-fatal), `--dry-run` aware
- [x] `src/util/logger.ts` (`consoleLogger` / `silentLogger`), `src/util/fs.ts` (`pathExists`/`isDirEmpty`/`ensureDir`/`moveDir` w/ EXDEV fallback)
- [x] `test/exec/package-manager.test.ts` — 4 tests
- [x] Verified: `npm test` (46 passing), typecheck + build clean

### T8 — Interactive prompts ✅
- [x] `src/prompts.ts` — `promptForConfig` (`@clack/prompts`): name/backend/database/cache/docker/pm/git, each skipped when already `decided` by preset/flags; unavailable (stub) components filtered from menus; Ctrl-C exits 130
- [x] wired into `src/cli.ts` — prompts run unless `--yes` or both name+backend already decided
- Verified via non-interactive `-y` paths in T10/T11 (interactive TTY walkthrough left for manual check, see README)

### T9 — Built-in components (the slice) ✅
- [x] `backend/nestjs/` — manifest + `template/` (`main.ts.ejs`, `app.module.ts.ejs` with `has()` conditional TypeOrm/Redis imports, controller/service, tsconfig(.build), nest-cli.json)
- [x] `database/postgres/` — manifest: `@nestjs/typeorm`/`typeorm`/`pg`, `DATABASE_URL`+`POSTGRES_*` env, compose `postgres:18-alpine` + volume + healthcheck + `appDependsOn`
- [x] `cache/redis/` — manifest: `ioredis`, `REDIS_URL`, compose `redis:8-alpine` + volume + healthcheck; template `src/redis/redis.{module,service}.ts` (`@Global()`)
- [x] `infra/docker/` — manifest + template `_dockerignore` (Dockerfile itself built by merge-dockerfile)
- [x] `infra/docker-compose/` — manifest, base `app` service (`requires: docker`)
- [x] `tooling/eslint/` (flat `eslint.config.mjs`), `tooling/prettier/` (`_prettierrc`/`_prettierignore`), `tooling/git/` (`_gitignore`)
- [x] `database/mongodb/manifest.ts` — stub, `unavailable`
- [x] `src/components/index.ts` wired; tsconfig excludes `src/**/template/**`; build does `clean` first
- [x] `src/util/dir.ts` (`moduleDir`); `test/components.test.ts` — 4 tests
- [x] Verified: `npm test` (50 passing), typecheck + clean build, templates land in `dist/` with no stray compiled output

### T10 — Generate pipeline wiring ✅
- [x] `src/generate.ts` — `generateProject`: select → validate → render templates + run all mergers into one FileMap → stage in sibling temp dir → atomic move to `<name>/` (EXDEV-safe) → `runPostGenerate` → `nextSteps`; `--force` overwrite, `--dry-run` plan-only (no writes)
- [x] `src/cli.ts` — `explicitFlags()` reads commander's `getOptionValueSource` so unset flags never clobber a preset; wires preset → flags → prompts → `resolveConfig` → `generateProject`
- [x] Verified end-to-end: `node bin/create-app.js voting-app --backend nestjs --database postgres --cache redis --docker --pm npm --no-install --no-git -y` → 19 files written; then in the generated project: `npm install` (524 pkgs) succeeded, `npm run build` (`nest build`) succeeded, `docker compose config` resolved cleanly

### T11 — Snapshot + smoke tests
- [x] `test/snapshot.test.ts` — fixed config → temp dir, snapshot tree + key files (7 snapshots, 4 tests: full slice, bare/no-db-no-cache, overwrite guard, dry-run)
- [x] host-side smoke, verified: generate the v1 slice → `npm install` (524 pkgs) → `npm run build` (`nest build`) → `docker compose config` (resolves cleanly)
- [~] containerized smoke (`docker compose up -d --build`) — **blocked by this sandbox**, not a create-app defect: `npm ci` correctly fails fast on the missing lockfile and falls through to `npm install --no-audit --no-fund`, which then hangs indefinitely (~0% CPU, no output) reaching the npm registry from *inside* a Docker build container. Pulling `node:22-alpine`/`postgres:18-alpine`/`redis:8-alpine` and host-side `npm install` both work fine, which narrows it to this sandbox's Docker daemon allowing image pulls but stalling general outbound HTTPS from build containers. Verify this step **outside the sandbox** (a normal dev machine/CI) — see README "Smoke test (local)". Hardened `INSTALL_CMD` to skip audit/fund calls regardless (`src/engine/merge-dockerfile.ts`), which is a legitimate reliability improvement independent of this.
- [x] documented in `README.md` "Smoke test (local)"
- Verified: `npm test` (54/54 passing), typecheck clean; host smoke confirmed; containerized `up --build` deferred to a non-sandboxed environment

---

## Phase 2 — Next.js backend + MongoDB database

Goal: prove the engine on a second backend/database combo with no engine reshaping.

### T12 — MongoDB component ✅
- [x] `src/components/database/mongodb/manifest.ts` — real component: `mongoose` dep, `MONGODB_URI` env, compose `mongo:8` service + `mongo_data` volume + `mongosh` healthcheck + `appDependsOn`
- [x] **Design decision**: added generic `ComboContribution` (`{ when: string[]; node? }`) to the `Component` type + `combos?: ComboContribution[]`. `effectiveNodeContributions()` in `merge-package-json.ts` folds in each combo whose `when` ids are all selected. Backend-specific ORM glue now lives on the `nestjs` manifest as combos: `when:["postgres"] → @nestjs/typeorm`, `when:["mongodb"] → @nestjs/mongoose`. Removed `@nestjs/typeorm` from the `postgres` manifest (kept backend-agnostic `pg`/`typeorm`). Net package.json for the v1 slice is unchanged (snapshots still pass).
- [x] `app.module.ts.ejs` — `has('mongodb')` branch adds `MongooseModule.forRoot(...)`
- [x] tests: `merge.test.ts` combo test (15 now), `components.test.ts` nestjs+mongodb+redis select/validate
- [x] Verified: `npm test` (55 passing), typecheck clean; generated `mongo-api` (nestjs+mongodb+redis) → `npm install` (497 pkgs) + `nest build` succeeded, `docker compose config` resolved (`app.depends_on: [mongodb, redis]`)

### T13 — Next.js backend component ✅
- [x] `src/components/backend/nextjs/manifest.ts` + `template/` — `next`/`react`/`react-dom`, App Router skeleton (`layout`/`page`/`api/health/route`), `next.config.mjs` (`output: 'standalone'`), `next-env.d.ts`, `tsconfig.json`, dev/build/start scripts (+ `start:dev` alias so the generic "Next:" steps work)
- [x] **Design answer — conditional wiring**: Next has no central module to register into, so db/cache wiring is standalone singletons in `src/lib/db.ts` / `src/lib/redis.ts`, shipped by the *backend* template as `.ejs` that render to empty (and are dropped) when the relevant component isn't picked. New render rule: **an `.ejs` that renders to blank is omitted** (`src/engine/render.ts`).
- [x] `merge-package-json.ts` needed no change. `merge-dockerfile.ts` got a real generalization: `DockerfileContribution` gains `cmd?` + `runtimeStage?`; backend manifests set them (NestJS → `dist/main.js`; Next → standalone `server.js` + `.next/standalone` COPY lines). Removes the old NestJS-hardcoded `CMD`.
- [x] Fixed cross-backend contamination: `cache/redis` template files (`redis.module.ts`, `redis.service.ts`) are now `.ejs` gated on `has('nestjs')`; `tooling/eslint` config is now `.ejs` adding `.next/**` to ignores when `has('nextjs')`.
- [x] `src/components/index.ts` registers `nextjs`; `test/components.test.ts` covers nextjs × {postgres, mongodb} + redis
- [x] Verified: `npm test` (57), typecheck + clean build; generated `web-app` (nextjs+postgres+redis+docker) → `npm install` (249 pkgs) → `next build` **succeeded** (routes incl. `/api/health`, `.next/standalone/server.js` produced → Dockerfile CMD valid), `docker compose config` resolved
- Known rough edge (documented): generic ESLint flat config doesn't pull `eslint-config-next`, so `next build` prints one "Next.js plugin not detected" warning — non-fatal, left for a later polish pass

### T14 — Round out Phase 2 ✅
- [x] second snapshot fixture (nextjs + mongo + redis + docker, pnpm) in `test/snapshot.test.ts` — asserts no Nest-shaped files leak, `src/lib/*` present; 5 new snapshots
- [x] `plan.md` — added `ComboContribution`, the "empty `.ejs` is dropped" rule, and `dockerfile.cmd`/`runtimeStage` to the component-spec section; roadmap table marks P2 done
- [x] `README.md` — note both backends and the `src/lib` wiring model
- [x] Verified: `npm test` (57 passing), typecheck + clean build; host smoke green on nestjs+mongo (T12) and nextjs+postgres (T13)

**Phase 2 done ✅** — second backend + second database compose with no engine reshaping (only additive: one render rule, one generic `combos` field, one Dockerfile generalization).

### T15 — Choose the build directory ✅
- [x] `src/util/target.ts` `resolveTarget(name, --dir, cwd)` — combines the `[name]` arg (may carry a path / `~` / be absolute) with `--dir` (default cwd) into `{ projectName, targetDir }`
- [x] `--dir <path>` CLI option; `RunOptions.targetDir` now comes from `resolveTarget` (was hardcoded `process.cwd()`), `RunOptions.cwd` added for the "cd" hint
- [x] `generate.ts` — `ensureDir(targetDir)` before staging (nested/missing dirs created); `GenerateResult.location` = projectDir relative to cwd when nested, else absolute; "Next: cd …" uses it
- [x] `test/util/target.test.ts` (8) + snapshot test for a missing nested `--dir`; verified via CLI: `--dir builds/services`, `apps/web` as name, absolute `--dir`, `--dry-run`
- [x] docs: README usage + plan.md config-resolution layer
- [x] follow-up: interactive flow now also asks **"Directory to create it in"** (right after the name, default `.`) — `promptForConfig` returns `{ answers, directory }`; the question is skipped when `--dir` was passed or the name arg already carries a path. `npm run dev` (bare) now prompts for it.

---

## Phase 3 — ASP.NET Core backends (Minimal API + Web API)

Goal: prove the engine on a third runtime (`dotnet`) with two real, selectable
backend templates — same shape as NestJS/Next.js being two selectable node
backends, not a single backend with a hidden sub-choice.

### T16 — dotnet engine plumbing ✅
- [x] `src/util/dotnet-identifier.ts` — `toDotnetIdentifier(name)`, the single
      sanitizer for the `.csproj` filename, `RootNamespace`/`AssemblyName`, and the
      Dockerfile `ENTRYPOINT`
- [x] `src/engine/render.ts` — `RenderContext` gains `dotnetNamespace`
      (precomputed `toDotnetIdentifier(config.name)`) so dotnet `.ejs` templates
      match what the merger emits
- [x] `src/components/types.ts` — `DotnetContribution` gains `sdk?` (backend-only,
      `<Project Sdk="...">`)
- [x] `src/engine/merge-csproj.ts` implemented: project shell
      (SDK/TargetFramework/Nullable/ImplicitUsings/RootNamespace/AssemblyName) +
      union of every selected component's `dotnet.packages` as
      `<PackageReference>`, mirroring `merge-package-json`'s
      collision-warns-keeps-first policy
- [x] `src/engine/merge-dockerfile.ts` split into `buildNodeDockerfile` /
      `buildDotnetDockerfile`; the dotnet path is a
      `mcr.microsoft.com/dotnet/sdk:10.0` build stage (`dotnet restore` +
      `dotnet publish`) → `mcr.microsoft.com/dotnet/aspnet:10.0` runtime stage
- [x] `src/engine/assemble-readme.ts` — dotnet-aware "Getting started"
      (`dotnet restore`/`dotnet run`) and drops the "Package manager" stack line
      for a dotnet backend
- [x] `src/generate.ts` — `buildNextSteps()` branches on the resolved backend's
      `runtime`; `runPostGenerate` now receives that `runtime` instead of
      `post-generate.ts` string-matching `config.backend !== "aspnet"` (a dead
      check — no `aspnet` id had ever been registered)
- [x] `src/exec/post-generate.ts` — added the `dotnet restore` step (parallel to
      `pm.install`, same non-fatal try/catch pattern)
- [x] Verified: `npm run typecheck` clean, `npm test` green

### T17 — Two ASP.NET Core backend components ✅
- [x] `backend/aspnet-minimal/` — top-level-statements `Program.cs.ejs`,
      `has('postgres')`/`has('mongodb')`/`has('redis')` wiring (EF Core+Npgsql /
      native `IMongoClient` / `IConnectionMultiplexer`), `Data/AppDbContext.cs.ejs`
      (only when `has('postgres')`), `appsettings*.json`,
      `Properties/launchSettings.json` (port 3000)
- [x] `backend/aspnet-webapi/` — same wiring, plus `AddControllers()` /
      `MapControllers()` and a `Controllers/HealthController.cs.ejs`
      `[ApiController]`
- [x] Both `provides: ["backend-framework", "http-server"]`, `runtime: "dotnet"`;
      health endpoint returns `{"status":"ok","uptime":...}` on port 3000 (matches
      the NestJS/Next.js smoke-test shape)
- [x] `database/postgres`, `database/mongodb`, `cache/redis` manifests gained
      `dotnet.packages` (`Npgsql.EntityFrameworkCore.PostgreSQL`, `MongoDB.Driver`
      — pinned to the 3.x line, since 2.x carries known-vulnerable transitive
      `SharpCompress`/`Snappier` deps (NU1902/NU1903) — `StackExchange.Redis`),
      backend-agnostic like their existing `node.dependencies`; their `readme`
      text updated to describe both the Node and ASP.NET wiring
- [x] Registered in `src/components/index.ts`
- [x] Verified end-to-end (`dotnet` 10.0.400 SDK was available in this
      environment): `dotnet build` succeeded — 0 warnings, 0 errors — for
      `aspnet-minimal`+postgres+redis and `aspnet-webapi`+mongodb+redis;
      `dotnet run` served `GET /` → `{"status":"ok","uptime":0}`. Containerized
      `docker compose up --build` was not re-verified (no Docker daemon in this
      environment) — same caveat as T11.

### T18 — Default-tooling fix for dotnet ✅
- [x] `tooling` has no CLI flag or prompt yet, so its only input besides a preset
      is the schema default `["eslint", "prettier"]` — which would otherwise ship
      dead lint/format config into every dotnet project. `src/cli.ts` now zeroes
      `config.tooling` for a dotnet backend when it wasn't explicitly set.
- [x] Safety net: `eslint`/`prettier` gained `requires: ["node-runtime"]`;
      `nestjs`/`nextjs` gained `provides: [..., "node-runtime"]` — an explicit
      (e.g. preset-forced) combination now fails validation with a readable error
      instead of silently shipping the files.
- [x] `tooling/git/template/_gitignore` and `infra/docker/template/_dockerignore`
      gained `bin/`/`obj/`/`*.user` (inert for Node, needed for dotnet — both are
      single shared files, not gated by runtime)
- [x] Verified: `create-app app --backend aspnet-minimal -y` (defaults) emits no
      `.eslintrc`/`eslint.config.mjs`/`.prettierrc`

### T19 — Tests + docs ✅
- [x] `test/engine/merge.test.ts` — real `mergeCsproj` coverage (shell, package
      union, version-clash warning) replacing the old "throws" stub test; new
      `mergeDockerfile`/`assembleReadme` dotnet-branch tests
- [x] `test/engine/validate.test.ts` — `node-runtime` requires/provides coverage
- [x] `test/components.test.ts` — select/validate coverage for both dotnet
      backends × {postgres, mongodb} + redis
- [x] `test/snapshot.test.ts` — two new fixtures (`aspnet-minimal`+postgres+
      redis+docker, `aspnet-webapi`+mongodb+docker); `npx vitest run -u` reviewed
- [x] `README.md` — new **Backends** section (table + examples) covering all four
      backends; the smoke-test section gained the dotnet equivalent
- [x] `docs/development.md`, `docs/adding-a-component.md`, `docs/contributing.md`
      updated to reflect the real (non-stub) dotnet path
- [x] Verified: `npm test` (75 passing), `npm run typecheck` clean

**Phase 3 done ✅** — third runtime (`dotnet`), two real selectable backend
templates, no engine reshaping beyond the plumbing `merge-csproj.ts` was already
stubbed for. MVC/Blazor/Worker Service remain future backends (see P4).

---

## Later phases (not started)

- **P4**: additional dotnet backend templates (MVC, Blazor, Worker Service),
  preset files end-to-end, CI/husky/commitlint tooling components
- **P5**: user component dir `~/.config/create-app/components/`
