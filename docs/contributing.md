# Contributing

Thanks for wanting to improve `create-app`. This doc covers the mechanics —
branches, commits, the PR flow, and what a reviewer looks for.

- [Before you start](#before-you-start)
- [Branch naming](#branch-naming)
- [Commit messages](#commit-messages)
- [The change checklist](#the-change-checklist)
- [Opening a PR](#opening-a-pr)
- [Review & merge](#review--merge)
- [Scope guidance](#scope-guidance)
- [Reporting bugs / proposing features](#reporting-bugs--proposing-features)

---

## Before you start

1. Read [development.md](development.md) — the architecture and module map.
2. For a non-trivial change, **open an issue first** describing the problem and the
   approach. Aligning on design before code saves a rewrite, especially for
   anything touching `src/engine/` or `src/config/schema.ts`.
3. Check `tasks.md` and `plan.md` — the work may already be planned into a phase,
   with a shape the maintainer has in mind.

Setup:

```bash
git clone https://github.com/tawsif-r/dynamic-service-setup.git
cd dynamic-service-setup
npm install
npm test && npm run typecheck   # confirm a green baseline
```

---

## Branch naming

Branch off `main`. Use a `type/short-description` slug:

```
feat/mysql-component
feat/aspnet-backend
fix/compose-depends-on-dedupe
docs/contributor-guide
refactor/merge-env-grouping
test/nextjs-snapshot-fixture
chore/bump-vitest
```

One logical change per branch. Keep it rebased on `main`:

```bash
git fetch origin
git rebase origin/main
```

---

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Subject in the
imperative, ≤ 72 chars, no trailing period.

```
<type>(<optional scope>): <summary>

<body: what changed and WHY — the reasoning that isn't obvious from the diff>
```

Types used here: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `perf`.

Examples:

```
feat(components): add mysql database component

Backend-agnostic deps + a mysql:8 compose service with a mysqladmin
healthcheck. The @nestjs/typeorm glue is a combo on the nestjs manifest,
keyed on "mysql", matching how postgres is wired.

---

fix(engine): dedupe services.app.depends_on when two components add the same id

mergeCompose appended without checking, so a stack selecting a component
twice via different paths produced `depends_on: [redis, redis]`.
```

Keep commits coherent — it's fine to squash WIP locally before pushing. Small,
reviewable history over one giant commit.

---

## The change checklist

Before pushing, from the repo root:

- [ ] `npm run typecheck` — clean.
- [ ] `npm test` — green.
- [ ] `npm run build` — succeeds (catches template-copy / ESM issues `tsc` alone
      misses).
- [ ] Snapshots: if they changed, you ran `npx vitest run -u` **and reviewed every
      line** of `test/__snapshots__/snapshot.test.ts.snap` in the diff.
- [ ] New behaviour has a test (see [testing.md](testing.md#writing-a-test) for
      where it goes).
- [ ] Docs updated if you changed a component, a CLI flag, an engine rule, or the
      manifest contract — `docs/` **and** the relevant section of `plan.md`.
- [ ] `README.md` updated if the change is user-visible (a new backend/database, a
      new flag).
- [ ] `tasks.md` updated if the work maps to a tracked task/phase.
- [ ] No stray files: generated scratch projects, `dist/`, `.env`, editor configs.
      `git status` clean apart from your intended changes.
- [ ] For anything affecting generated output: ran the
      [smoke test](testing.md#the-smoke-test) on at least one stack, and said so in
      the PR (with the stack and result).

---

## Opening a PR

Target `main`. In the description, cover:

1. **What & why** — the problem, and the approach. Link the issue (`Closes #123`).
2. **What changed** — the touched areas (`src/components/…`, `src/engine/…`, docs).
3. **Testing** — which suites you added/ran; whether you ran the containerised
   smoke test and on what stack.
4. **Breaking changes** — any change to the manifest contract, the zod schema, a
   flag name, or generated output that an existing preset/project depends on. Say
   so explicitly.
5. **Screenshots / transcript** — for prompt or output changes, paste the terminal
   session.

Keep the diff focused. Unrelated cleanups → their own PR. A reviewer should be
able to hold the whole change in their head.

If using the `gh` CLI:

```bash
gh pr create --base main --fill
```

---

## Review & merge

- CI (typecheck + test + build) must be green.
- At least one maintainer approval.
- Discussion happens on the PR; push follow-up commits (don't force-push away
  review context until the maintainer asks for a squash/rebase).
- Merge style: **squash** for a small/medium change (the PR title becomes the
  squash subject — make it a valid Conventional Commit), **rebase** to preserve a
  deliberately structured multi-commit change. The maintainer picks.
- After merge, delete the branch.

---

## Scope guidance

**Good first contributions**

- A new tooling component (`editorconfig`, a CI workflow, `husky`/`commitlint` —
  Phase 4 territory).
- A new database or cache component following the `postgres` / `redis` pattern
  (remember its `dotnet.packages` alongside its `node.dependencies` if it should
  work with the ASP.NET backends too).
- A new dotnet backend template (MVC, Blazor, Worker Service, ...) following the
  `aspnet-minimal` / `aspnet-webapi` pattern.
- Filling a `readme` section on a component that lacks one.
- Test coverage for an under-tested merger or edge case.
- Docs fixes.

**Discuss first**

- Anything in `src/engine/` beyond a bugfix — the merge rules are load-bearing and
  snapshot-locked.
- A new field on the `Component` interface — it must be *generic*, not a special
  case for one component (see
  [adding-a-component.md](adding-a-component.md#when-you-need-an-engine-change)).
- A new field on `projectConfigSchema`, or any flag rename/removal — preset
  compatibility.

**Please don't, in the same PR**

- Bundle a refactor with a feature.
- Re-format files you didn't otherwise touch.
- Bump unrelated dependencies.

---

## Reporting bugs / proposing features

Open a GitHub issue. For a bug, include:

- the **exact command** (flags and all);
- `node --version`, `npm --version`, OS;
- what you expected vs what happened, with the error output;
- if it's about generated output, the relevant generated file(s).

For a feature, describe the repetition or gap it removes — this project exists to
kill repeated setup work, so "I do X by hand every new project" is the strongest
case. Note which phase in `plan.md` it fits, if any.
