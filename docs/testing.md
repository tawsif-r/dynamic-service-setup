# Testing

`create-app` is tested at three levels: **unit** (each merger / helper in
isolation), **snapshot** (whole generator into a temp dir), and **smoke** (generate
a real project and build/run it). All automated tests use [vitest](https://vitest.dev).

- [Running](#running)
- [Suite layout](#suite-layout)
- [Snapshots](#snapshots)
- [Writing a test](#writing-a-test)
- [The smoke test](#the-smoke-test)
- [What CI runs](#what-ci-runs)

---

## Running

```bash
npm test                    # everything, once
npm run test:watch          # re-run on change
npx vitest run test/engine  # one directory
npx vitest run -t "combo"   # tests whose name matches
npx vitest run -u           # update snapshots (see below — use deliberately)
npm run typecheck           # tsc --noEmit; treat a failure as a test failure
```

Config: `vitest.config.ts` — `include: ["test/**/*.test.ts"]`, node environment.

---

## Suite layout

```
test/
├── config/resolve.test.ts        preset < flags < answers precedence; zod validation errors
├── registry.test.ts              Registry.select() order, "none" skips, docker→infra,
│                                 unknown-id and stub-rejection errors, dup detection
├── components.test.ts            every built-in registers; templateDirs exist on disk;
│                                 select+validate real stacks (nestjs/nextjs × pg/mongo × redis)
├── engine/
│   ├── validate.test.ts          requires/conflicts, exclusive capabilities, redis-needs-runtime
│   ├── render.test.ts            .ejs render+strip, _foo→.foo, blank-render omission
│   └── merge.test.ts             each merger in isolation + collision cases
├── exec/
│   └── package-manager.test.ts   planInvocation() argv table for npm/pnpm/yarn
├── util/
│   └── target.test.ts            resolveTarget(): path-in-name, ~, absolute, --dir combine
├── snapshot.test.ts              generateProject() end-to-end into a temp dir, --no-install
├── helpers/tmp.ts                makeTmpDir(), writeTree()
└── __snapshots__/
    └── snapshot.test.ts.snap     committed snapshots
```

Rule of thumb for where a new test goes:

| You changed… | Test in… |
|---|---|
| a merger (`src/engine/merge-*.ts`) | `test/engine/merge.test.ts` |
| template/render rules (`src/engine/render.ts`) | `test/engine/render.test.ts` |
| validation rules | `test/engine/validate.test.ts` |
| registry selection/order | `test/registry.test.ts` |
| a component manifest | `test/components.test.ts` (+ `merge.test.ts` if it contributes non-trivially) |
| flag/preset resolution | `test/config/resolve.test.ts` |
| `--dir` / `[name]` path handling | `test/util/target.test.ts` |
| package-manager argv | `test/exec/package-manager.test.ts` |
| anything that shifts generated output for a headline stack | `test/snapshot.test.ts` + `-u` |

---

## Snapshots

`test/snapshot.test.ts` runs `generateProject()` with a fixed `ProjectConfig` into
a temp dir (`--no-install`, `--no-git` — fast, no network) and snapshots:

- the **file tree** (`result.files`);
- key composed files: `docker-compose.yml`, `package.json`, `.env`, `Dockerfile`,
  `src/app.module.ts` (Nest) / `src/lib/db.ts` (Next), `README.md`.

Two fixtures: **NestJS + Postgres + Redis + Docker (npm)** and **Next.js + Mongo +
Redis + Docker (pnpm)**, plus assertion-only cases (bare no-db/no-cache, overwrite
guard, dry-run, nested `--dir`).

### When a snapshot fails

1. **Read the diff.** vitest prints expected vs actual.
2. If the change is **unintended** — you broke something. Fix the code.
3. If the change is **intended** (you deliberately changed a merger or a template):
   ```bash
   npx vitest run -u
   git diff test/__snapshots__/    # review EVERY line before staging
   ```
   Never run `-u` reflexively — a wrong snapshot committed as "expected" hides the
   regression from every future run.

---

## Writing a test

Mergers are pure, so most tests are tiny. Pattern from `test/engine/merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeCompose } from "../../src/engine/merge-compose.js";
import type { Component } from "../../src/components/types.js";

const comp = (id: string, extra: Partial<Component>): Component =>
  ({ id, category: "database", label: id, ...extra });

it("appends every appDependsOn to services.app.depends_on", () => {
  const selected = [
    comp("docker-compose", { category: "infra", compose: { services: { app: { build: "." } } } }),
    comp("postgres", { compose: { appDependsOn: ["postgres"] } }),
    comp("redis", { category: "cache", compose: { appDependsOn: ["redis"] } }),
  ];
  const { files } = mergeCompose({} as any, selected);
  expect(files[0].contents).toContain("depends_on");
});
```

End-to-end pattern from `test/snapshot.test.ts`:

```ts
import { generateProject } from "../src/generate.js";
import { createRegistry } from "../src/registry.js";
import { resolveConfig } from "../src/config/resolve.js";
import { silentLogger } from "../src/util/logger.js";
import { makeTmpDir } from "./helpers/tmp.js";

const tmp = await makeTmpDir();
const config = resolveConfig({ flags: { name: "x", backend: "nestjs", install: false, git: false, docker: false } });
const result = await generateProject({
  config,
  run: { targetDir: tmp.dir, cwd: tmp.dir, dryRun: false, force: false },
  registry: createRegistry(),
  logger: silentLogger,   // keep test output quiet
});
// assert on result.files / read files under result.projectDir
await tmp.cleanup();
```

Guidelines:

- Use `silentLogger` in generator tests.
- Always `install: false, git: false` unless you're specifically testing
  post-generate — otherwise the test hits the network and mutates global git.
- `resolveConfig({ flags: { … } })` is the quickest way to a valid `ProjectConfig`.
- Prefer a focused merger test over a new snapshot fixture; add a fixture only for
  a stack combination worth locking down whole.

---

## The smoke test

Proves a generated project actually installs, builds, and boots. **Requires
Docker.** Not automated in this repo (needs a network + daemon); run it by hand
after a change that could affect generated output.

```bash
npm run build   # build create-app itself first

node bin/create-app.js voting-app \
  --backend nestjs --database postgres --cache redis --docker --pm npm -y

cd voting-app
npm install && npm run build      # nest build with the merged deps
docker compose config             # composed YAML parses and resolves
docker compose up -d --build
curl -sf localhost:3000           # -> {"status":"ok","uptime":...}
docker compose down -v
```

Next.js equivalent: `npm install && npx next build` produces
`.next/standalone/server.js`, which the generated Dockerfile's `CMD` runs.

Known environment issue: inside some sandboxes `docker compose up --build` hangs at
`npm install` reaching the registry from the build container (documented in
`tasks.md` T11). That is not a `create-app` defect — run the containerised step on
a normal dev machine or CI.

---

## What CI runs

At minimum, a PR must pass:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

The containerised smoke test is a manual / non-sandboxed gate — mention in your PR
whether you ran it and on what stack.
