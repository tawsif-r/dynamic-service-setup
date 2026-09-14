import type { ProjectConfig } from "../config/schema.js";
import type { Component } from "../components/types.js";
import type { MergeResult } from "./files.js";

const RUN_PREFIX: Record<string, string> = { npm: "npm run", pnpm: "pnpm", yarn: "yarn" };

/**
 * Build `README.md` from the config plus each component's `readme` section, and
 * append a generated "Getting started" block. Always emitted.
 */
export function assembleReadme(config: ProjectConfig, selected: Component[]): MergeResult {
  const byCategory = (cat: Component["category"]) =>
    selected.find((c) => c.category === cat);
  const isDotnet = byCategory("backend")?.runtime === "dotnet";

  const stackLines = [
    `- **Backend:** ${byCategory("backend")?.label ?? "—"}`,
    `- **Database:** ${byCategory("database")?.label ?? "none"}`,
    `- **Cache:** ${byCategory("cache")?.label ?? "none"}`,
    `- **Containerization:** ${config.docker ? "Docker + Docker Compose" : "none"}`,
    // packageManager is meaningless for dotnet (NuGet is implicit) — validate.ts
    // already warns about this, so don't repeat a misleading value here.
    ...(isDotnet ? [] : [`- **Package manager:** ${config.packageManager}`]),
  ];

  const sections = selected
    .filter((c) => c.readme?.trim())
    .map((c) => `### ${c.label}\n\n${c.readme!.trim()}\n`);

  const run = RUN_PREFIX[config.packageManager] ?? "npm run";
  const gettingStarted = [
    "## Getting started",
    "",
    "```bash",
    ...(isDotnet ? ["dotnet restore"] : [`${config.packageManager} install`]),
    ...(config.docker ? ["docker compose up -d"] : []),
    isDotnet ? "dotnet run" : `${run} start:dev`,
    "```",
    "",
  ];

  const body = [
    `# ${config.name}`,
    "",
    "Generated with `create-app`. This project has no runtime dependency on the generator.",
    "",
    "## Stack",
    "",
    ...stackLines,
    "",
    ...(sections.length ? ["## Components", "", ...sections] : []),
    ...gettingStarted,
  ].join("\n");

  return { files: [{ path: "README.md", contents: `${body.replace(/\n+$/, "")}\n` }], warnings: [] };
}
