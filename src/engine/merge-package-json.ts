import type { ProjectConfig } from "../config/schema.js";
import type { Component, NodeContribution } from "../components/types.js";
import type { MergeResult } from "./files.js";
import { sortKeys } from "./deep-merge.js";

/**
 * A component's base `node` contribution plus any `combos` whose `when` ids are
 * all present in the selection. Exported so other node-facing steps can reuse
 * the same "combo-aware" resolution.
 */
export function effectiveNodeContributions(
  component: Component,
  selectedIds: ReadonlySet<string>,
): NodeContribution[] {
  const out: NodeContribution[] = [];
  if (component.node) out.push(component.node);
  for (const combo of component.combos ?? []) {
    if (combo.node && combo.when.every((id) => selectedIds.has(id))) {
      out.push(combo.node);
    }
  }
  return out;
}

function addDeps(
  target: Record<string, string>,
  incoming: Record<string, string> | undefined,
  owner: string,
  warnings: string[],
): void {
  for (const [name, version] of Object.entries(incoming ?? {})) {
    const existing = target[name];
    if (existing !== undefined && existing !== version) {
      warnings.push(
        `dependency "${name}": "${owner}" wants ${version} but ${existing} is already set; keeping ${existing}.`,
      );
      continue;
    }
    target[name] = version;
  }
}

/**
 * Build `package.json` for `runtime: "node"` backends by unioning every selected
 * component's `node.*` contribution. The backend component owns the base scripts
 * and its own framework deps; there is no `package.json` template.
 */
export function mergePackageJson(config: ProjectConfig, selected: Component[]): MergeResult {
  const backend = selected.find((c) => c.category === "backend");
  if (backend?.runtime !== "node") {
    return { files: [], warnings: [] };
  }

  const warnings: string[] = [];
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  const scripts: Record<string, string> = {};

  const selectedIds = new Set(selected.map((c) => c.id));
  for (const c of selected) {
    for (const contribution of effectiveNodeContributions(c, selectedIds)) {
      addDeps(dependencies, contribution.dependencies, c.id, warnings);
      addDeps(devDependencies, contribution.devDependencies, c.id, warnings);
      Object.assign(scripts, contribution.scripts);
    }
  }

  const pkg: Record<string, unknown> = {
    name: config.name,
    version: "0.1.0",
    private: true,
  };
  if (Object.keys(scripts).length) pkg.scripts = sortKeys(scripts);
  if (Object.keys(dependencies).length) pkg.dependencies = sortKeys(dependencies);
  if (Object.keys(devDependencies).length) pkg.devDependencies = sortKeys(devDependencies);

  return {
    files: [{ path: "package.json", contents: `${JSON.stringify(pkg, null, 2)}\n` }],
    warnings,
  };
}
