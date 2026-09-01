import { execa } from "execa";
import type { ProjectConfig } from "../config/schema.js";
import type { Command } from "../components/types.js";
import type { Logger } from "../util/logger.js";
import { getPackageManager } from "./package-manager.js";

export type PostGenerateOptions = {
  projectDir: string;
  config: ProjectConfig;
  /** commands from component `postGenerate` hooks, already ordered */
  commands: Command[];
  logger: Logger;
  /** print intentions without running anything */
  dryRun?: boolean;
};

async function gitInit(projectDir: string, logger: Logger): Promise<void> {
  const git = (args: string[]) => execa("git", ["-C", projectDir, ...args], { stdio: "pipe" });
  await git(["init", "-q"]);

  // Ensure a committer identity so the initial commit never fails on a fresh box.
  const hasIdentity = await git(["config", "user.email"]).then(
    (r) => r.stdout.trim().length > 0,
    () => false,
  );
  if (!hasIdentity) {
    await git(["config", "user.email", "dev@example.com"]);
    await git(["config", "user.name", "create-app"]);
  }
  await git(["add", "-A"]);
  await git(["commit", "-q", "-m", "chore: scaffold project with create-app", "--no-gpg-sign"]);
  logger.success("initialized git repository");
}

/**
 * Post-write steps, in order: component hook commands, dependency install, git
 * init + initial commit, formatter. Each step honours the config flags and is
 * individually non-fatal where a failure should not abandon the project.
 */
export async function runPostGenerate(opts: PostGenerateOptions): Promise<void> {
  const { projectDir, config, commands, logger, dryRun } = opts;

  for (const cmd of commands) {
    const cwd = cmd.cwd ?? projectDir;
    logger.step(cmd.label ?? `${cmd.command} ${cmd.args.join(" ")}`);
    if (!dryRun) await execa(cmd.command, cmd.args, { cwd, stdio: "inherit" });
  }

  const pm = getPackageManager(config.packageManager);
  const isNodeProject = config.backend !== "aspnet"; // refined once dotnet lands

  if (config.install && isNodeProject) {
    logger.step(`installing dependencies with ${pm.name}`);
    if (!dryRun) {
      try {
        await pm.install(projectDir);
        logger.success("dependencies installed");
      } catch {
        logger.warn(`\`${pm.name} install\` failed — run it yourself in the project directory`);
      }
    }
  }

  if (config.git) {
    logger.step("initializing git repository");
    if (!dryRun) {
      try {
        await gitInit(projectDir, logger);
      } catch {
        logger.warn("git initialization failed — you can run `git init` manually");
      }
    }
  }

  if (config.install && isNodeProject && config.tooling.includes("prettier") && !dryRun) {
    try {
      await pm.run(projectDir, "format");
      logger.success("formatted with prettier");
    } catch {
      /* no format script or prettier missing — not important */
    }
  }
}
