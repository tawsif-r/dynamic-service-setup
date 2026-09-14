import type { PackageManager, ProjectConfig } from "../config/schema.js";
import type { Component, DockerfileStage } from "../components/types.js";
import type { MergeResult } from "./files.js";
import { toDotnetIdentifier } from "../util/dotnet-identifier.js";

const DOTNET_SDK_IMAGE = "mcr.microsoft.com/dotnet/sdk:10.0";
const DOTNET_RUNTIME_IMAGE = "mcr.microsoft.com/dotnet/aspnet:10.0";

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
 */
function buildNodeDockerfile(
  config: ProjectConfig,
  backend: Component | undefined,
  stages: DockerfileStage[],
): string {
  const pm = config.packageManager;

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

  return lines.join("\n");
}

/**
 * Build a dotnet SDK/runtime multi-stage `Dockerfile`: restore + publish against
 * the generated `.csproj` in the SDK image, then copy the publish output into the
 * slim ASP.NET runtime image. The entrypoint DLL name is derived from
 * `config.name` the same way `merge-csproj.ts` derives `AssemblyName`, so the two
 * always agree without either one needing to know about the other.
 */
function buildDotnetDockerfile(
  config: ProjectConfig,
  backend: Component | undefined,
  stages: DockerfileStage[],
): string {
  const ident = toDotnetIdentifier(config.name);
  const cmd = backend?.dockerfile?.cmd ?? ["dotnet", `${ident}.dll`];
  const cmdJson = `[${cmd.map((s) => JSON.stringify(s)).join(", ")}]`;

  const lines = [
    "# syntax=docker/dockerfile:1",
    `FROM ${DOTNET_SDK_IMAGE} AS build`,
    "WORKDIR /src",
    ...injected(stages, "prelude"),
    "COPY *.csproj ./",
    "RUN dotnet restore",
    ...injected(stages, "deps"),
    "COPY . .",
    "RUN dotnet publish -c Release -o /app/publish",
    ...injected(stages, "build"),
    "",
    `FROM ${DOTNET_RUNTIME_IMAGE} AS runtime`,
    "WORKDIR /app",
    "COPY --from=build /app/publish .",
    ...injected(stages, "runtime"),
    "EXPOSE 3000",
    "ENV ASPNETCORE_URLS=http://+:3000",
    `ENTRYPOINT ${cmdJson}`,
    "",
  ];

  return lines.join("\n");
}

/** Only emitted when the `docker` component is selected. */
export function mergeDockerfile(config: ProjectConfig, selected: Component[]): MergeResult {
  const backend = selected.find((c) => c.category === "backend");
  if (!selected.some((c) => c.id === "docker")) return { files: [], warnings: [] };

  const stages = selected.flatMap((c) => c.dockerfile?.stages ?? []);
  const contents =
    backend?.runtime === "dotnet"
      ? buildDotnetDockerfile(config, backend, stages)
      : buildNodeDockerfile(config, backend, stages);

  return { files: [{ path: "Dockerfile", contents }], warnings: [] };
}
