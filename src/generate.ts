import { mkdtemp, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { tmpdir } from "node:os";
import type { ProjectConfig, RunOptions } from "./config/schema.js";
import type { Runtime } from "./components/types.js";
import { Registry, createRegistry } from "./registry.js";
import { assertValid } from "./engine/validate.js";
import { makeRenderContext, renderTemplateDir } from "./engine/render.js";
import { collectMergeResults, mergeFileMaps, type FileMap } from "./engine/files.js";
import { mergePackageJson } from "./engine/merge-package-json.js";
import { mergeCsproj } from "./engine/merge-csproj.js";
import { mergeCompose } from "./engine/merge-compose.js";
import { mergeEnv } from "./engine/merge-env.js";
import { mergeDockerfile } from "./engine/merge-dockerfile.js";
import { assembleReadme } from "./engine/assemble-readme.js";
import { writeFileMap } from "./exec/write-files.js";
import { runPostGenerate } from "./exec/post-generate.js";
import { ensureDir, moveDir, pathExists } from "./util/fs.js";
import { consoleLogger, type Logger } from "./util/logger.js";

export type GenerateInput = {
  config: ProjectConfig;
  run: RunOptions;
  registry?: Registry;
  logger?: Logger;
};

export type GenerateResult = {
  projectDir: string;
  /** `projectDir` relative to the shell cwd when nested inside it, else absolute */
  location: string;
  files: string[];
  warnings: string[];
  nextSteps: string[];
  dryRun: boolean;
};

function buildNextSteps(config: ProjectConfig, cdTarget: string, backendRuntime: Runtime): string[] {
  const steps = [`cd ${cdTarget}`];
  if (backendRuntime === "dotnet") {
    if (!config.install) steps.push("dotnet restore");
    if (config.docker) steps.push("docker compose up -d");
    steps.push("dotnet run");
    return steps;
  }
  const pm = config.packageManager;
  if (!config.install) steps.push(`${pm} install`);
  if (config.docker) steps.push("docker compose up -d");
  steps.push(`${pm} run start:dev`);
  return steps;
}

/** `projectDir` written relative to `cwd` when it sits inside it, else absolute. */
function displayPath(cwd: string, projectDir: string): string {
  const rel = relative(cwd, projectDir);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : projectDir;
}

/** Render templates + run every merger into one FileMap. Pure (no disk writes). */
async function composeFiles(
  config: ProjectConfig,
  selected: ReturnType<Registry["select"]>,
): Promise<{ files: FileMap; warnings: string[] }> {
  const ctx = makeRenderContext(config, selected);

  const templateMaps = await Promise.all(
    selected
      .filter((c) => c.templateDir)
      .map((c) => renderTemplateDir(c.templateDir as string, ctx)),
  );
  let files: FileMap = new Map();
  for (const m of templateMaps) files = mergeFileMaps(files, m);

  const merged = collectMergeResults([
    mergePackageJson(config, selected),
    mergeCsproj(config, selected),
    mergeCompose(config, selected),
    mergeEnv(config, selected),
    mergeDockerfile(config, selected),
    assembleReadme(config, selected),
  ]);
  for (const [path, file] of merged.files) files.set(path, file);

  return { files, warnings: merged.warnings };
}

/**
 * End-to-end: validate the selection, compose the file set, write it atomically
 * into `<targetDir>/<name>`, then run post-generate steps. Honours `run.dryRun`
 * (plan only) and `run.force` (overwrite an existing directory).
 */
export async function generateProject(input: GenerateInput): Promise<GenerateResult> {
  const registry = input.registry ?? createRegistry();
  const logger = input.logger ?? consoleLogger;
  const { config, run } = input;

  const selected = registry.select(config);
  const validationWarnings = assertValid(config, selected);

  const { files, warnings: mergeWarnings } = await composeFiles(config, selected);
  const warnings = [...validationWarnings, ...mergeWarnings];

  const projectDir = join(run.targetDir, config.name);
  const cdTarget = displayPath(run.cwd ?? process.cwd(), projectDir);
  const exists = await pathExists(projectDir);
  if (exists && !run.force) {
    throw new Error(`${projectDir} already exists — pass --force to overwrite it.`);
  }

  const orderedPaths = [...files.keys()].sort();

  if (run.dryRun) {
    logger.info(`Would create ${projectDir} with ${files.size} file(s):`);
    for (const p of orderedPaths) logger.info(`  ${p}`);
    return { projectDir, location: cdTarget, files: orderedPaths, warnings, nextSteps: [], dryRun: true };
  }

  // Stage in a sibling temp dir so the final move is an atomic same-fs rename.
  await ensureDir(run.targetDir);
  let staging: string;
  try {
    staging = await mkdtemp(join(run.targetDir, ".create-app-"));
  } catch {
    staging = await mkdtemp(join(tmpdir(), "create-app-"));
  }

  let written: string[];
  try {
    written = await writeFileMap(staging, files);
    if (exists && run.force) await rm(projectDir, { recursive: true, force: true });
    await ensureDir(dirname(projectDir));
    await moveDir(staging, projectDir);
  } catch (err) {
    await rm(staging, { recursive: true, force: true });
    throw err;
  }

  const backendRuntime: Runtime = selected.find((c) => c.category === "backend")?.runtime ?? "node";

  const commands = selected.flatMap(
    (c) => c.postGenerate?.({ config, components: selected }) ?? [],
  );
  await runPostGenerate({ projectDir, config, commands, logger, runtime: backendRuntime });

  return {
    projectDir,
    location: cdTarget,
    files: written,
    warnings,
    nextSteps: buildNextSteps(config, cdTarget, backendRuntime),
    dryRun: false,
  };
}
