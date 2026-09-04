import {
  projectConfigSchema,
  type ProjectConfig,
  type ProjectConfigInput,
} from "./schema.js";
import type { Preset } from "./presets.js";

/** Raw option values from the CLI, before mapping to config keys. */
export type CliFlagValues = {
  name?: string;
  backend?: string;
  database?: string;
  cache?: string;
  queue?: string;
  docker?: boolean;
  pm?: string;
  externalRedis?: boolean;
  externalRabbitmq?: boolean;
  install?: boolean;
  git?: boolean;
  tooling?: string[];
};

/** Drop keys whose value is `undefined` so they don't clobber lower-priority layers. */
function compact<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Map CLI option values to partial config. Only pass values the user actually
 * supplied — resolve `getOptionValueSource(...) === "cli"` in the caller so
 * unset flags don't override a preset.
 */
export function flagsToConfig(flags: CliFlagValues): Partial<ProjectConfigInput> {
  return compact({
    name: flags.name,
    backend: flags.backend,
    database: flags.database,
    cache: flags.cache,
    queue: flags.queue,
    docker: flags.docker,
    packageManager: flags.pm,
    tooling: flags.tooling,
    git: flags.git,
    install: flags.install,
    externalRedis: flags.externalRedis,
    externalRabbitmq: flags.externalRabbitmq,
  }) as Partial<ProjectConfigInput>;
}

export type ResolveSources = {
  /** Lowest priority (after built-in schema defaults). */
  preset?: Preset;
  /** Middle priority. */
  flags?: Partial<ProjectConfigInput>;
  /** Highest priority — answers gathered from interactive prompts. */
  answers?: Partial<ProjectConfigInput>;
};

/** Layer the partial sources, later winning, undefined ignored. */
export function mergeConfig(sources: ResolveSources): ProjectConfigInput {
  return {
    ...compact(sources.preset ?? {}),
    ...compact(sources.flags ?? {}),
    ...compact(sources.answers ?? {}),
  } as ProjectConfigInput;
}

/**
 * Merge all sources and validate. Schema `.default()`s fill anything still
 * missing. Throws with a readable, multi-line message on invalid input.
 */
export function resolveConfig(sources: ResolveSources): ProjectConfig {
  const merged = mergeConfig(sources);
  const parsed = projectConfigSchema.safeParse(merged);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid project configuration:\n${issues}`);
  }
  return parsed.data;
}
