import { createRequire } from "node:module";
import { Command } from "commander";
import pc from "picocolors";
import { flagsToConfig, mergeConfig, resolveConfig, type CliFlagValues } from "./config/resolve.js";
import type { ProjectConfigInput } from "./config/schema.js";
import { loadPreset } from "./config/presets.js";
import { createRegistry } from "./registry.js";
import { promptForConfig, type PromptResult } from "./prompts.js";
import { generateProject } from "./generate.js";
import { resolveTarget } from "./util/target.js";
import { consoleLogger } from "./util/logger.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string; description: string };

export type CliOptions = {
  backend?: string;
  database?: string;
  cache?: string;
  queue?: string;
  docker?: boolean;
  pm?: string;
  preset?: string;
  dir?: string;
  externalRedis?: boolean;
  externalRabbitmq?: boolean;
  install: boolean;
  git: boolean;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
};

/** Only the option values the user actually typed (commander's option source is "cli"). */
function explicitFlags(command: Command, name: string | undefined): CliFlagValues {
  const o = command.opts<CliOptions>();
  const explicit = (key: string) => command.getOptionValueSource(key) === "cli";
  return {
    name,
    backend: explicit("backend") ? o.backend : undefined,
    database: explicit("database") ? o.database : undefined,
    cache: explicit("cache") ? o.cache : undefined,
    queue: explicit("queue") ? o.queue : undefined,
    docker: explicit("docker") ? o.docker : undefined,
    pm: explicit("pm") ? o.pm : undefined,
    externalRedis: explicit("externalRedis") ? o.externalRedis : undefined,
    externalRabbitmq: explicit("externalRabbitmq") ? o.externalRabbitmq : undefined,
    install: explicit("install") ? o.install : undefined,
    git: explicit("git") ? o.git : undefined,
  };
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("create-app")
    .description(pkg.description)
    .version(pkg.version, "-v, --version")
    .argument("[name]", "project name; may include a path, e.g. apps/web or ~/code/api")
    .option("--dir <path>", "directory to create the project in (default: current directory)")
    .option("--backend <id>", "backend component id (e.g. nestjs)")
    .option("--database <id>", "database component id (postgres | mongodb | none)")
    .option("--cache <id>", "cache component id (redis | none)")
    .option("--queue <id>", "message queue component id (rabbitmq | none)")
    .option("--docker", "include Docker + Docker Compose")
    .option("--no-docker", "exclude Docker + Docker Compose")
    .option("--pm <manager>", "package manager (npm | pnpm | yarn)")
    .option("--preset <name>", "load a saved preset from ~/.config/create-app/presets")
    .option("--external-redis", "allow redis without a docker runtime")
    .option("--external-rabbitmq", "allow rabbitmq without a docker runtime")
    .option("--no-install", "skip dependency installation")
    .option("--no-git", "skip git repository initialization")
    .option("--dry-run", "print the generation plan without writing files")
    .option("-y, --yes", "accept defaults and skip interactive prompts")
    .option("--force", "overwrite the target directory if it already exists")
    .action(async (name: string | undefined, options: CliOptions, command: Command) => {
      const logger = consoleLogger;
      try {
        const cwd = process.cwd();
        const { projectName } = resolveTarget(name, options.dir, cwd);
        // The directory is already settled if --dir was passed or the name arg
        // carries its own path — in either case, skip the interactive question.
        const nameHasPath = !!name && /[/\\]/.test(name.trim().replace(/[/\\]+$/, ""));
        const settledDir = options.dir ?? (nameHasPath ? "." : undefined);

        const preset = options.preset ? await loadPreset(options.preset) : undefined;
        const flags = flagsToConfig(explicitFlags(command, projectName));
        const decided = mergeConfig({ preset, flags });

        const registry = createRegistry();
        const needsPrompts = !options.yes && (!decided.name || decided.backend === undefined);
        const prompt: PromptResult = needsPrompts
          ? await promptForConfig({ registry, decided, directory: settledDir })
          : { answers: {} as Partial<ProjectConfigInput>, directory: settledDir };

        const config = resolveConfig({ preset, flags, answers: prompt.answers });
        const { targetDir } = resolveTarget(name, prompt.directory ?? options.dir, cwd);

        const result = await generateProject({
          config,
          run: { targetDir, cwd, dryRun: !!options.dryRun, force: !!options.force },
          registry,
          logger,
        });

        for (const w of result.warnings) logger.warn(w);

        if (result.dryRun) {
          logger.info(pc.dim("(dry run — nothing was written)"));
          return;
        }

        logger.success(`created ${result.location}/ (${result.files.length} files)`);
        logger.info("");
        logger.info(pc.bold("Next:"));
        for (const step of result.nextSteps) logger.info(`  ${step}`);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

main().catch((err) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
