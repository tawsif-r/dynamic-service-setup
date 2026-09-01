import type { PackageManager, ProjectConfig } from "../config/schema.js";
import type { Component, DockerfileStage } from "../components/types.js";
import type { MergeResult } from "./files.js";

const LOCKFILE: Record<PackageManager, string> = {
  npm: "package-lock.json",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
};

// --no-audit --no-fund skip extra registry round-trips that aren't needed for a
// build and are a common source of flaky installs on slow/constrained networks.
const INSTALL_CMD: Record<PackageManager, string> = {
  npm: "npm ci --no-audit --no-fund || npm install --no-audit --no-fund",
  pnpm: "corepack enable && pnpm install --frozen-lockfile",
  yarn: "corepack enable && yarn install --frozen-lockfile",
};

const RUN_PREFIX: Record<PackageManager, string> = {
  npm: "npm run",
  pnpm: "pnpm",
  yarn: "yarn",
};

function injected(stages: DockerfileStage[], at: DockerfileStage["at"]): string[] {
  return stages.filter((s) => (s.at ?? "build") === at).flatMap((s) => s.lines);
}

/**
 * Build a Node multi-stage `Dockerfile` for the app image, parameterised by the
 * chosen package manager. Components may inject extra lines via
 * `dockerfile.stages` anchored at `prelude | deps | build | runtime`.
 * Only emitted when the `docker` component is selected. dotnet backends will
 * get their own path in Phase 3.
 */
export function mergeDockerfile(config: ProjectConfig, selected: Component[]): MergeResult {
  const backend = selected.find((c) => c.category === "backend");
  if (!selected.some((c) => c.id === "docker")) return { files: [], warnings: [] };
  if (backend && backend.runtime !== "node") {
    return {
      files: [],
      warnings: [`Dockerfile generation for runtime "${backend.runtime}" is not implemented yet.`],
    };
  }

  const pm = config.packageManager;
  const stages = selected.flatMap((c) => c.dockerfile?.stages ?? []);

  // Runtime CMD and the runtime-stage COPY lines default to a `tsc`-style
  // `dist/` layout (NestJS); a backend manifest overrides both when its build
  // output differs (e.g. Next.js standalone).
  const cmd = backend?.dockerfile?.cmd ?? ["node", "dist/main.js"];
  const runtimeStage = backend?.dockerfile?.runtimeStage ?? [
    "COPY --from=deps /app/node_modules ./node_modules",
    "COPY --from=build /app/dist ./dist",
    "COPY package.json ./",
  ];
  const cmdJson = `[${cmd.map((s) => JSON.stringify(s)).join(", ")}]`;

  const lines = [
    "# syntax=docker/dockerfile:1",
    "FROM node:22-alpine AS base",
    "WORKDIR /app",
    ...injected(stages, "prelude"),
    "",
    "FROM base AS deps",
    "COPY package.json ./",
    `COPY ${LOCKFILE[pm]}* ./`,
    `RUN ${INSTALL_CMD[pm]}`,
    ...injected(stages, "deps"),
    "",
    "FROM deps AS build",
    "COPY . .",
    `RUN ${RUN_PREFIX[pm]} build`,
    ...injected(stages, "build"),
    "",
    "FROM base AS runtime",
    "ENV NODE_ENV=production",
    ...runtimeStage,
    ...injected(stages, "runtime"),
    "EXPOSE 3000",
    `CMD ${cmdJson}`,
    "",
  ];

  return { files: [{ path: "Dockerfile", contents: lines.join("\n") }], warnings: [] };
}
