import { z } from "zod";

/** Package managers the executor knows how to drive. */
export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/**
 * The resolved description of a project to generate.
 *
 * Component ids (`backend`, `database`, `cache`, `queue`, `tooling[]`) are kept
 * as open strings on purpose: the registry + `validate()` are the source of
 * truth for which ids exist, so adding a component never requires editing this
 * schema. `"none"` is the conventional opt-out value for `database` / `cache` /
 * `queue`.
 */
export const projectConfigSchema = z.object({
  name: z
    .string()
    .min(1, "project name is required")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
      "must start with a letter or digit; only letters, digits, '.', '_', '-' allowed",
    ),
  backend: z
    .string({ required_error: "a backend must be selected" })
    .min(1, "a backend must be selected"),
  database: z.string().min(1).default("none"),
  cache: z.string().min(1).default("none"),
  queue: z.string().min(1).default("none"),
  docker: z.boolean().default(true),
  packageManager: z.enum(PACKAGE_MANAGERS).default("npm"),
  tooling: z.array(z.string()).default(["eslint", "prettier"]),
  git: z.boolean().default(true),
  install: z.boolean().default(true),
  /** Allow selecting `cache: redis` without a docker runtime to host it. */
  externalRedis: z.boolean().default(false),
  /** Allow selecting `queue: rabbitmq` without a docker runtime to host it. */
  externalRabbitmq: z.boolean().default(false),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type ProjectConfigInput = z.input<typeof projectConfigSchema>;

/** How the CLI run behaves, separate from what the project contains. */
export type RunOptions = {
  /** Directory the `<name>/` project folder is created inside (created if absent). */
  targetDir: string;
  /**
   * The shell's working directory, used only to render the "cd" hint in the
   * next-steps output. Defaults to `process.cwd()`.
   */
  cwd?: string;
  dryRun: boolean;
  force: boolean;
};
