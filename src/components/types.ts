import type { ProjectConfig } from "../config/schema.js";

export type ComponentCategory =
  | "backend"
  | "database"
  | "cache"
  | "infra"
  | "tooling"
  | "vcs";

export type Runtime = "node" | "dotnet";

/** One line contributed to `.env` / `.env.example`. */
export type EnvEntry = {
  key: string;
  value: string;
  comment?: string;
};

/**
 * A docker-compose service fragment. Loosely typed on purpose: the merger deep-
 * merges it into the composed file rather than interpreting most fields.
 */
export type ComposeService = {
  image?: string;
  build?: string | Record<string, unknown>;
  command?: string | string[];
  ports?: string[];
  environment?: Record<string, string> | string[];
  env_file?: string[];
  volumes?: string[];
  depends_on?: string[] | Record<string, unknown>;
  healthcheck?: Record<string, unknown>;
  restart?: string;
  [key: string]: unknown;
};

export type ComposeContribution = {
  services?: Record<string, ComposeService>;
  /** top-level named volumes */
  volumes?: Record<string, unknown>;
  /** service names appended to the app service's `depends_on` */
  appDependsOn?: string[];
};

export type NodeContribution = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

export type DotnetContribution = {
  packages?: Record<string, string>;
  /** `<Project Sdk="...">` — only meaningful on the backend component */
  sdk?: string;
};

export type DockerfileStage = {
  /** raw Dockerfile lines injected into the app image build */
  lines: string[];
  /** anchor point within the generated Dockerfile */
  at?: "prelude" | "deps" | "build" | "runtime";
};

export type DockerfileContribution = {
  stages?: DockerfileStage[];
  /** overrides the default runtime `CMD` — backend manifests set this */
  cmd?: string[];
  /**
   * replaces the default runtime-stage COPY lines (which assume `dist/` from a
   * `tsc`-style build) — backend manifests set this when their build output
   * differs, e.g. Next.js standalone output
   */
  runtimeStage?: string[];
};

/**
 * A contribution that only applies when every id in `when` is also selected —
 * e.g. the NestJS manifest uses this to add `@nestjs/mongoose` only when
 * `mongodb` is also picked, without making `node.dependencies` a function of
 * the whole selection. Extend with more fields (env, compose, ...) if a case
 * needs them; keep it additive to the base contribution, never a replacement.
 */
export type ComboContribution = {
  when: string[];
  node?: NodeContribution;
};

/** Context handed to dynamic manifest hooks. */
export type GenerateCtx = {
  config: ProjectConfig;
  components: Component[];
};

export type Command = {
  command: string;
  args: string[];
  /** relative to the generated project root when omitted */
  cwd?: string;
  label?: string;
};

/**
 * A composable unit of a generated project. Lives at
 * `src/components/<category>/<id>/manifest.ts` with an optional sibling
 * `template/` folder. See `plan.md` for the full contract.
 */
export type Component = {
  id: string;
  category: ComponentCategory;
  label: string;
  /** short line shown in prompts / summaries */
  summary?: string;
  runtime?: Runtime;

  /** set on stubs: not selectable yet, shown with this reason */
  unavailable?: string;

  requires?: string[];
  conflicts?: string[];
  /** capability tags other components can require, e.g. "sql-db" */
  provides?: string[];

  /** absolute path to a folder of EJS / plain template files */
  templateDir?: string;

  node?: NodeContribution;
  dotnet?: DotnetContribution;
  env?: EnvEntry[];
  compose?: ComposeContribution;
  dockerfile?: DockerfileContribution;
  /** contributions gated on other components also being selected */
  combos?: ComboContribution[];
  /** markdown section appended to the generated README */
  readme?: string;

  /** commands executed after files are written (e.g. framework init) */
  postGenerate?: (ctx: GenerateCtx) => Command[];
};
