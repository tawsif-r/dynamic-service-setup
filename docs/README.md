# Contributor documentation

Everything you need to work on `create-app`. Start with **Development** for the
map of the codebase, then jump to the task-specific guide.

| Doc | Read it when you want to… |
|---|---|
| [development.md](development.md) | Understand the architecture, the generation pipeline, and which module owns what. Local setup and the day-to-day loop. |
| [adding-a-component.md](adding-a-component.md) | Add a new backend / database / cache / infra / tooling technology, with or without template files. |
| [cli-commands.md](cli-commands.md) | Add, change, or remove a CLI flag or an interactive prompt. |
| [testing.md](testing.md) | Know which test suite covers what, how snapshots work, and how to run the smoke test. |
| [contributing.md](contributing.md) | Branch naming, commit style, the PR checklist, and how a change gets reviewed and merged. |

## Background reading (not contributor guides, but useful context)

- [`../plan.md`](../plan.md) — the original design doc: why the component/engine
  split exists, the manifest spec, the phased roadmap.
- [`../tasks.md`](../tasks.md) — task-by-task build log with verification notes.
- [`../README.md`](../README.md) — user-facing overview and the local smoke test.
- [`../CLAUDE.md`](../CLAUDE.md) — condensed rules for AI assistants (a subset of
  `development.md`).

## The 30-second model

```
flags / preset / prompts ─▶ ProjectConfig ─▶ Registry.select() ─▶ Component[]
                                                                      │
        render each component's template/ (EJS)  ◀───────────────────┤
        run every merger in src/engine/          ◀───────────────────┘
                          │
                          ▼
                 one FileMap  ─▶  stage in temp dir  ─▶  atomic move to <name>/
                                                              │
                                          post-generate: install · git · format
```

A **component** contributes fragments. The **engine** merges fragments. Nothing in
a generated project imports `create-app`.
