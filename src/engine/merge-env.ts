import type { ProjectConfig } from "../config/schema.js";
import type { Component, EnvEntry } from "../components/types.js";
import type { MergeResult } from "./files.js";

/**
 * Union every selected component's `env` entries into `.env` and `.env.example`.
 * Keys are deduped (first component to declare a key wins; a differing later
 * value produces a warning). Output is grouped by contributing component.
 * v1 keeps `.env` and `.env.example` identical — values are dev defaults, not
 * secrets.
 */
export function mergeEnv(_config: ProjectConfig, selected: Component[]): MergeResult {
  const owners = new Map<string, { value: string; owner: string }>();
  const groups: { owner: string; entries: EnvEntry[] }[] = [];
  const warnings: string[] = [];

  for (const c of selected) {
    if (!c.env?.length) continue;
    const kept: EnvEntry[] = [];
    for (const entry of c.env) {
      const prior = owners.get(entry.key);
      if (prior) {
        if (prior.value !== entry.value) {
          warnings.push(
            `env ${entry.key}: "${c.id}" wants "${entry.value}" but "${prior.owner}" set "${prior.value}"; keeping the first.`,
          );
        }
        continue;
      }
      owners.set(entry.key, { value: entry.value, owner: c.id });
      kept.push(entry);
    }
    if (kept.length) groups.push({ owner: c.id, entries: kept });
  }

  if (groups.length === 0) return { files: [], warnings };

  const body =
    groups
      .map(({ owner, entries }) => {
        const lines = [`# --- ${owner} ---`];
        for (const e of entries) {
          if (e.comment) lines.push(`# ${e.comment}`);
          lines.push(`${e.key}=${e.value}`);
        }
        return lines.join("\n");
      })
      .join("\n\n") + "\n";

  return {
    files: [
      { path: ".env", contents: body },
      { path: ".env.example", contents: body },
    ],
    warnings,
  };
}
