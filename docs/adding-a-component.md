# Adding a component

A **component** is one technology `create-app` can put into a generated project —
a backend, database, cache, infra piece, or tool. This guide walks through adding
one, from the minimal case to a full backend.

- [The shape of a component](#the-shape-of-a-component)
- [Checklist](#checklist)
- [Walkthrough: a database component (no template)](#walkthrough-a-database-component-no-template)
- [Walkthrough: a tooling component (template only)](#walkthrough-a-tooling-component-template-only)
- [Adding a backend](#adding-a-backend)
- [Adding template files](#adding-template-files)
- [Contribution reference](#contribution-reference)
- [Stubbing a not-yet-ready component](#stubbing-a-not-yet-ready-component)
- [Testing a new component](#testing-a-new-component)

---

## The shape of a component

```
src/components/<category>/<id>/
├── manifest.ts        exports a `Component` object
└── template/          optional — EJS + plain files, copied to the project root
```

`<category>` is one of `backend | database | cache | queue | infra | tooling | vcs`.
`<id>` is the string the user passes (`--database postgres`) — keep it short and
lowercase.

The full `Component` interface is in `src/components/types.ts`; the field-by-field
table is in [development.md](development.md#component-srccomponentstypests).

---

## Checklist

1. Create `src/components/<category>/<id>/manifest.ts` exporting a `Component`.
2. Add `template/` next to it **if** the component needs unique files. Not needed
   if it only contributes to shared files (deps, env, a compose service).
3. Import it in `src/components/index.ts` and add it to the `builtinComponents`
   array. **It is not live until this line exists.**
4. Set `requires` / `conflicts` / `provides` if it has relationships.
5. Add tests (see [Testing a new component](#testing-a-new-component)).
6. `npm run typecheck && npm test`.
7. If a snapshot fixture now covers it, `npx vitest run -u` and review the diff.
8. Update the backends/databases line in the root `README.md` and mention it in
   `tasks.md` if it belongs to a tracked phase.

You should **not** need to touch `src/config/schema.ts`, `src/engine/`, or
`scripts/copy-templates.mjs`. If you do, see
[When you need an engine change](#when-you-need-an-engine-change).

---

## Walkthrough: a database component (no template)

Databases wire into the backend's entry point rather than shipping files, so the
manifest is just contributions. This is `src/components/database/mysql/manifest.ts`:

```ts
import type { Component } from "../../types.js";

export const mysql: Component = {
  id: "mysql",
  category: "database",
  label: "MySQL",
  summary: "Relational database (TypeORM)",
  // capability tags — validate.ts treats "primary-datastore" as exclusive, so
  // picking mysql + postgres together is rejected with a readable error.
  provides: ["sql-db", "primary-datastore"],

  // backend-AGNOSTIC deps only. The @nestjs/typeorm glue is a `combos` entry on
  // the nestjs manifest, not here.
  node: {
    dependencies: {
      mysql2: "^3.11.0",
      typeorm: "^0.3.20",
    },
  },

  env: [
    {
      key: "DATABASE_URL",
      value: "mysql://app:app@mysql:3306/app",
      comment: "TypeORM connection string (host 'mysql' = the compose service)",
    },
    { key: "MYSQL_USER", value: "app" },
    { key: "MYSQL_PASSWORD", value: "app" },
    { key: "MYSQL_DATABASE", value: "app" },
  ],

  compose: {
    services: {
      mysql: {
        image: "mysql:8",
        restart: "unless-stopped",
        environment: {
          MYSQL_ROOT_PASSWORD: "root",
          MYSQL_USER: "app",
          MYSQL_PASSWORD: "app",
          MYSQL_DATABASE: "app",
        },
        ports: ["3306:3306"],
        volumes: ["mysql_data:/var/lib/mysql"],
        healthcheck: {
          test: ["CMD", "mysqladmin", "ping", "-h", "localhost"],
          interval: "5s",
          timeout: "5s",
          retries: 10,
        },
      },
    },
    volumes: { mysql_data: null },
    appDependsOn: ["mysql"],   // appended to services.app.depends_on
  },

  readme:
    "`DATABASE_URL` drives the TypeORM connection. Switch `synchronize` off and " +
    "use migrations before deploying.",
};
```

Then in `src/components/index.ts`:

```ts
import { mysql } from "./database/mysql/manifest.js";
// ...
export const builtinComponents: Component[] = [
  nestjs, nextjs, postgres, mongodb, mysql, redis, rabbitmq, docker, dockerCompose,
  eslint, prettier, git,
];
```

If a backend needs framework glue for this database, add a `combos` entry to that
**backend's** manifest — do not put it here:

```ts
// in src/components/backend/nestjs/manifest.ts
combos: [
  { when: ["postgres"], node: { dependencies: { "@nestjs/typeorm": "^10.0.2" } } },
  { when: ["mysql"],    node: { dependencies: { "@nestjs/typeorm": "^10.0.2" } } },
  { when: ["mongodb"],  node: { dependencies: { "@nestjs/mongoose": "^10.1.0" } } },
],
```

And add the connection branch to `backend/nestjs/template/src/app.module.ts.ejs`
(`<% if (has('mysql')) { -%> ... <% } -%>`) and, if Next.js should support it, a
branch in `backend/nextjs/template/src/lib/db.ts.ejs`.

---

## Walkthrough: a tooling component (template only)

`tooling/editorconfig` — ships one dotfile, contributes nothing else.

```
src/components/tooling/editorconfig/
├── manifest.ts
└── template/
    └── _editorconfig        →  becomes `.editorconfig` in the project
```

```ts
// manifest.ts
import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

export const editorconfig: Component = {
  id: "editorconfig",
  category: "tooling",
  label: "EditorConfig",
  summary: "Consistent editor settings",
  templateDir: join(moduleDir(import.meta.url), "template"),
};
```

`moduleDir(import.meta.url)` resolves to this folder in both `src/` (tests, `npm run
dev`) and `dist/` (built `bin`), because `copy-templates.mjs` mirrors the layout.

To have it selected by default, add `"editorconfig"` to the `tooling` default array
in `src/config/schema.ts`. To make it an opt-in only via `--tooling`, just register
it — but note the CLI has no `--tooling` flag yet (see
[cli-commands.md](cli-commands.md)).

---

## Adding a backend

A backend is the most involved component. Requirements:

1. **`runtime`** — `"node"` (works today) or `"dotnet"` (Phase 3, `merge-csproj`
   still a stub — don't).
2. **`provides: ["backend-framework", "http-server"]`** so validation knows a
   backend is present.
3. **`templateDir`** with at least a working app skeleton and an HTTP health
   endpoint on port 3000 (the compose `app` service and the Dockerfile `EXPOSE`
   assume 3000).
4. **`node.scripts`** must define `build` and `start:dev` — `generate.ts`'s
   `buildNextSteps()` prints `<pm> run start:dev`, and `merge-dockerfile` runs
   `<pm> run build`. (Next.js aliases `start:dev` → `next dev` for exactly this.)
5. **Dockerfile overrides** if the build output isn't a `tsc`-style `dist/`:
   ```ts
   dockerfile: {
     cmd: ["node", "server.js"],
     runtimeStage: [
       "COPY --from=build /app/public ./public",
       "COPY --from=build /app/.next/standalone ./",
       "COPY --from=build /app/.next/static ./.next/static",
     ],
   },
   ```
6. **Own your DB/cache wiring** — either `has(...)` branches in a central template
   file (NestJS) or per-client singleton `.ejs` files that render empty when the
   component isn't picked (Next.js). See
   [development.md](development.md#backend-specific-wiring).
7. **`combos`** for any framework-specific glue packages, keyed on the database id.
8. Guard against **cross-backend contamination**: if another component ships
   backend-shaped template files (like `cache/redis`), gate them with
   `has('<your-backend>')` or `has('nestjs')` as appropriate.
9. Register in `src/components/index.ts`; add select/validate coverage to
   `test/components.test.ts` and ideally a snapshot fixture in
   `test/snapshot.test.ts`.

---

## Adding template files

- Put files under `src/components/<category>/<id>/template/`. The tree under
  `template/` maps 1:1 onto the generated project root.
- **Dynamic file** → give it a `.ejs` extension. Context: `config`, `components`,
  `has(id)`. Example:
  ```ejs
  <% if (has('postgres')) { -%>
  export const DB_URL = process.env.DATABASE_URL;
  <% } -%>
  ```
  If every branch is false the file renders blank and is **omitted** — the
  supported way to make a file conditional.
- **Dotfile** → name a path segment `_name` → emitted as `.name`.
- **Static file** → any other extension, copied byte-for-byte.
- Don't put a `package.json`, `docker-compose.yml`, `.env`, `Dockerfile` or
  `README.md` in `template/` — those are merged, and a template would overwrite
  the merged result... actually the merger wins (it overlays last), so a stray one
  is just dead weight and confusing. Contribute `node` / `compose` / `env` /
  `dockerfile` / `readme` instead.

---

## Contribution reference

Quick semantics; full details in [development.md](development.md#how-each-shared-file-is-assembled).

| Manifest field | Merged into | Collision behaviour |
|---|---|---|
| `node.dependencies` / `devDependencies` | `package.json` | first version spec wins; mismatch → warning |
| `node.scripts` | `package.json` | last wins (`Object.assign`) |
| `env: [{ key, value, comment? }]` | `.env` + `.env.example` | first component to set a key wins; mismatch → warning |
| `compose.services` | `docker-compose.yml` | deep-merged by service name (objects recurse, arrays concat+dedupe) |
| `compose.volumes` | `docker-compose.yml` top-level `volumes` | last wins |
| `compose.appDependsOn: string[]` | `services.app.depends_on` | union, deduped, sorted |
| `dockerfile.stages: [{ lines, at }]` | `Dockerfile` | concatenated at the `prelude \| deps \| build \| runtime` anchor (`build` default) |
| `dockerfile.cmd` / `runtimeStage` | `Dockerfile` | backend-only override of the runtime `CMD` / `COPY` lines |
| `combos: [{ when: string[], node }]` | `package.json` | applied only if every `when` id is also selected |
| `readme` | `README.md` | appended as its own `### <label>` section |
| `postGenerate(ctx) => Command[]` | — | run after write, in component order, before install |

`requires` / `conflicts` / `provides` are checked by `src/engine/validate.ts`. A
token in `requires`/`conflicts` may be a component **id** or a capability **tag**
from some other component's `provides`. The exclusive tags (only one provider
allowed) are `sql-db`, `document-db`, `primary-datastore` — see
`EXCLUSIVE_CAPABILITIES` in `validate.ts`.

---

## Stubbing a not-yet-ready component

Set `unavailable` to a reason string. The registry filters it out of prompt menus
and throws a readable error if it's selected by flag:

```ts
export const aspnet: Component = {
  id: "aspnet",
  category: "backend",
  label: "ASP.NET",
  runtime: "dotnet",
  unavailable: "planned for Phase 3 — see tasks.md",
};
```

Still register it in `index.ts` — that's how the "known ids" list and the "not
available yet" error work.

---

## Testing a new component

- **`test/components.test.ts`** — add a case that `createRegistry().select(config)`
  returns your id in the right order and `validateSelection(...).errors` is empty
  for a realistic stack that includes it.
- **`test/engine/merge.test.ts`** — if the component contributes to a merged file
  in a non-trivial way (a compose service, a combo, an env clash), add a focused
  merger test.
- **`test/registry.test.ts`** — only if you added registry *behaviour* (a new
  category order, a new selection rule).
- **`test/snapshot.test.ts`** — add a fixture only if the component is part of a
  headline stack combination worth locking down end-to-end. Then `npx vitest run
  -u` and eyeball the new snapshot.

Manual check:

```bash
npm run dev -- probe --backend nestjs --database mysql --cache redis --docker --dir /tmp/ca --no-install --no-git -y
cat /tmp/ca/probe/docker-compose.yml /tmp/ca/probe/.env /tmp/ca/probe/package.json
```

---

## When you need an engine change

Adding a component should be additive. If it genuinely can't be expressed with the
current contribution types, add a **generic** capability to the engine rather than a
special case — that's how Phase 2 added `ComboContribution` and
`dockerfile.cmd`/`runtimeStage`. Then:

- update `src/components/types.ts`,
- update the consuming merger in `src/engine/`,
- add a merger test,
- document the new field in
  [development.md](development.md#how-each-shared-file-is-assembled) and `plan.md`'s
  component-spec section.
