# CLI flags & prompts

How the command line is defined, and how to add, change, or remove a flag or an
interactive question.

- [Where the CLI lives](#where-the-cli-lives)
- [How a flag becomes config](#how-a-flag-becomes-config)
- [Adding a flag](#adding-a-flag)
- [Renaming or removing a flag](#renaming-or-removing-a-flag)
- [Adding a config field](#adding-a-config-field)
- [Prompts](#prompts)
- [Presets](#presets)
- [Testing CLI changes](#testing-cli-changes)

---

## Where the CLI lives

| File | Role |
|---|---|
| `src/cli.ts` | commander program: every `.option(...)`, the `[name]` arg, and the `.action()` that runs the pipeline. Also `explicitFlags()` — reads which options the user *actually typed*. |
| `src/config/resolve.ts` | `CliFlagValues` (raw option shape) → `flagsToConfig()` maps them to `ProjectConfigInput` keys → `mergeConfig()` / `resolveConfig()` layer preset < flags < answers. |
| `src/config/schema.ts` | the zod `ProjectConfig` schema — the set of real config fields and their defaults. |
| `src/prompts.ts` | `promptForConfig()` — the interactive flow, one question per undecided value. |
| `src/util/target.ts` | `resolveTarget()` — turns `[name]` + `--dir` into `{ projectName, targetDir }`. Not part of `ProjectConfig`. |

Current options (see `buildProgram()` in `src/cli.ts`): `--dir`, `--backend`,
`--database`, `--cache`, `--docker` / `--no-docker`, `--pm`, `--preset`,
`--external-redis`, `--no-install`, `--no-git`, `--dry-run`, `-y/--yes`,
`--force`, plus `-v/--version` and the `[name]` positional.

---

## How a flag becomes config

The precedence chain, lowest to highest:

```
zod .default()   <   preset file   <   CLI flags   <   interactive answers
```

The subtlety: an unset flag must **not** override a preset. commander always gives
you a value (its own default), so `src/cli.ts` uses
`command.getOptionValueSource(key) === "cli"` in `explicitFlags()` to pass through
**only** the options the user literally typed. `flagsToConfig()` then `compact()`s
out `undefined`s so they don't clobber lower layers.

So a flag reaching config touches **three** places:

1. `src/cli.ts` — `.option(...)` declaration **and** a line in `explicitFlags()`.
2. `src/config/resolve.ts` — a field on `CliFlagValues` **and** a line in
   `flagsToConfig()` mapping it to the config key.
3. `src/config/schema.ts` — the field on `projectConfigSchema` (unless it's a
   run-option like `--dir` / `--dry-run` / `--force`, which live on `RunOptions`
   and are read straight off `options` in the `.action()`).

---

## Adding a flag

Example: add `--http-port <n>` to override the exposed port.

### 1. Decide: config field or run option?

- **Config field** — describes the generated project (port belongs here). Goes
  through the schema + resolve chain.
- **Run option** — affects only how *this run* behaves (`--dry-run`, `--force`,
  `--dir`). Read directly from `options` in `src/cli.ts`, no schema change.

Assume config field here.

### 2. `src/config/schema.ts`

```ts
export const projectConfigSchema = z.object({
  // ...
  httpPort: z.coerce.number().int().positive().default(3000),
});
```

### 3. `src/config/resolve.ts`

```ts
export type CliFlagValues = {
  // ...
  httpPort?: number;
};

export function flagsToConfig(flags: CliFlagValues): Partial<ProjectConfigInput> {
  return compact({
    // ...
    httpPort: flags.httpPort,
  }) as Partial<ProjectConfigInput>;
}
```

### 4. `src/cli.ts`

```ts
// in buildProgram()
.option("--http-port <n>", "port the app listens on", (v) => Number(v))

// in explicitFlags()
httpPort: explicit("httpPort") ? o.httpPort : undefined,
```

Add `httpPort?: number` to the `CliOptions` type in the same file.

### 5. Consume it

Something has to *use* `config.httpPort` — a merger, a template via
`<%= config.httpPort %>`, or a compose contribution. A config field with no
consumer is dead.

### 6. `src/prompts.ts` (optional)

If it should be asked interactively, add a question guarded by
`if (decided.httpPort === undefined)` — see [Prompts](#prompts).

### 7. Tests

`test/config/resolve.test.ts` — precedence (default vs preset vs flag). Plus
whatever covers the consumer.

---

## Renaming or removing a flag

Removing `--foo`:

1. Delete the `.option("--foo", …)` in `src/cli.ts` and its `explicitFlags()` line
   and its `CliOptions` field.
2. Delete the `CliFlagValues` field and the `flagsToConfig()` line in
   `src/config/resolve.ts`.
3. If nothing else uses the config field, remove it from
   `src/config/schema.ts` — but that is a **breaking change** to presets that set
   it. zod ignores unknown keys by default, so an old preset won't crash; it just
   silently loses that setting. Call it out in the PR and `README.md`.
4. Remove the matching prompt from `src/prompts.ts`.
5. `grep -rn "foo" src test` to catch references.

Renaming = remove + add, but keep the old form working for a release if it's
widely used: commander lets you declare `.option("--old-name <x>", "(deprecated, use --new-name)")`
and copy the value across in the action.

---

## Adding a config field

A field that is **not** a CLI flag (e.g. only settable via preset):

1. `src/config/schema.ts` — add it with a `.default(...)`.
2. `src/config/resolve.ts` — nothing needed unless a flag feeds it.
3. Presets already flow through — `loadPreset()` returns a partial config and
   `mergeConfig()` layers it in, so a new schema key is picked up from a preset
   file for free.
4. Add a consumer + a `test/config/resolve.test.ts` case.

**Do not** add component ids to the schema. `backend`/`database`/`cache`/`tooling`
are open `z.string()` on purpose — the registry validates them.

---

## Prompts

`src/prompts.ts` → `promptForConfig({ registry, decided, directory })`. Rules:

- **Ask only for undecided values.** Every question is wrapped in
  `if (decided.<key> === undefined)` (or `!decided.<key>` for `name`). `decided` is
  the merged preset+flags config, so a value supplied either way skips its prompt.
- **`--yes` skips prompts entirely** — `src/cli.ts` only calls `promptForConfig`
  when `!options.yes && (!decided.name || decided.backend === undefined)`.
- **Cancellation** (`Ctrl-C`) → `bailIfCancelled()` → `process.exit(130)`.
- **Component menus** come from `registry.choicesFor(category)`, filtered to drop
  `unavailable` stubs, mapped to `{ value: id, label, hint: summary }`.
  `database` / `cache` get a `None` option first (`allowNone`, `noneFirst`).
- The **directory** question is special: it's not a `ProjectConfig` field. It
  returns on `PromptResult.directory` and is skipped when `--dir` was passed or the
  `[name]` arg already carries a path (`src/cli.ts` computes `settledDir`).

### Adding a prompt

For a new config field `httpPort`:

```ts
if (decided.httpPort === undefined) {
  const port = await p.text({
    message: "Port the app listens on",
    placeholder: "3000",
    defaultValue: "3000",
    validate: (v) => (/^\d+$/.test(v) ? undefined : "digits only"),
  });
  bailIfCancelled(port);
  answers.httpPort = Number(port);
}
```

Order matters — questions run top to bottom. Name and directory come first, then
backend → database → cache → docker → package manager → git. Put stack-shaping
questions before dependent ones.

### Reordering / removing

Just move or delete the block. There's no declarative prompt registry — it's a
straight-line async function on purpose (keeps "skip if decided" trivial to read).

---

## Presets

A preset is a partial `ProjectConfigInput` as YAML or JSON in
`~/.config/create-app/presets/<name>.{yaml,yml,json}` (honours `XDG_CONFIG_HOME`).
Loaded by `--preset <name>` → `loadPreset()` in `src/config/presets.ts`.

```yaml
# ~/.config/create-app/presets/nest-api.yaml
backend: nestjs
database: postgres
cache: redis
docker: true
packageManager: pnpm
```

Any key valid on `projectConfigSchema` works. Presets sit **below** flags, so
`--preset nest-api --database mongodb` overrides just the database. Preset support
is otherwise Phase 4 — the loader and `listPresets()` exist, but there's no
`create-app presets` subcommand yet.

---

## Testing CLI changes

- `test/config/resolve.test.ts` — precedence and validation. The main place to
  prove a new flag layers correctly.
- `test/util/target.test.ts` — anything touching `--dir` / the `[name]` path.
- Prompts have **no unit test** (they need a TTY). Verify interactively:
  ```bash
  npm run dev                    # full interactive walk
  npm run dev -- x --backend nestjs   # only the non-decided prompts appear
  ```
- End-to-end sanity: `npm run dev -- demo --backend nestjs --http-port 8080 --dry-run`
  and check the plan / generated files reflect the flag.
- `npm run typecheck` catches most wiring mistakes (a `CliFlagValues` field with no
  `flagsToConfig` mapping, a missing `CliOptions` entry).
