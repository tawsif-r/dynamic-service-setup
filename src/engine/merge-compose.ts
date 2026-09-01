import { stringify } from "yaml";
import type { ProjectConfig } from "../config/schema.js";
import type { Component, ComposeService } from "../components/types.js";
import type { MergeResult } from "./files.js";
import { deepMerge } from "./deep-merge.js";

type ComposeDoc = {
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
};

/**
 * Assemble `docker-compose.yml` from each selected component's `compose`
 * contribution. Services and volumes are deep-merged by name; every
 * `appDependsOn` entry is appended to `services.app.depends_on`. The
 * `infra/docker-compose` component supplies the base `app` service.
 * Built as an object and serialized with the `yaml` package — never string glue.
 */
export function mergeCompose(_config: ProjectConfig, selected: Component[]): MergeResult {
  const hasCompose = selected.some((c) => c.id === "docker-compose");
  if (!hasCompose) return { files: [], warnings: [] };

  const services: Record<string, ComposeService> = {};
  const volumes: Record<string, unknown> = {};
  const appDependsOn = new Set<string>();

  for (const c of selected) {
    const contrib = c.compose;
    if (!contrib) continue;
    for (const [name, svc] of Object.entries(contrib.services ?? {})) {
      services[name] = deepMerge(services[name] ?? {}, svc);
    }
    for (const [name, vol] of Object.entries(contrib.volumes ?? {})) {
      volumes[name] = vol ?? null;
    }
    for (const dep of contrib.appDependsOn ?? []) appDependsOn.add(dep);
  }

  const warnings: string[] = [];
  if (!services.app) {
    warnings.push("no 'app' service was contributed; docker-compose.yml has no application container.");
  } else if (appDependsOn.size > 0) {
    const current = Array.isArray(services.app.depends_on) ? services.app.depends_on : [];
    services.app.depends_on = [...new Set([...current, ...appDependsOn])].sort();
  }

  const doc: ComposeDoc = { services };
  if (Object.keys(volumes).length) doc.volumes = volumes;

  const yaml = stringify(doc, { lineWidth: 0, sortMapEntries: false });
  return {
    files: [{ path: "docker-compose.yml", contents: yaml }],
    warnings,
  };
}
