import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";

/** Expand a leading `~` / `~/` to the user's home directory. */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return resolve(homedir(), p.slice(2));
  return p;
}

export type ResolvedTarget = {
  /** the project (package) name — the last path segment of the name arg */
  projectName: string | undefined;
  /** absolute parent directory the `<projectName>/` folder is created in */
  targetDir: string;
};

/**
 * Work out where to build. `[name]` may itself carry path segments
 * (`apps/web`, `~/code/api`, or an absolute path); `--dir` supplies the base
 * for a bare name. Everything is resolved to an absolute path against `cwd`.
 */
export function resolveTarget(
  nameArg: string | undefined,
  dirOption: string | undefined,
  cwd: string,
): ResolvedTarget {
  const base = resolve(cwd, dirOption ? expandTilde(dirOption) : ".");
  if (!nameArg || nameArg.trim() === "") {
    return { projectName: undefined, targetDir: base };
  }

  const cleaned = expandTilde(nameArg).replace(/[/\\]+$/, "");
  const projectName = basename(cleaned);
  const nameDir = dirname(cleaned);
  // `resolve` lets an absolute nameDir win over `base`, which is what we want.
  const targetDir = nameDir === "." ? base : resolve(base, nameDir);
  return { projectName, targetDir };
}
