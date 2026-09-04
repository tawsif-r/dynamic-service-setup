import * as p from "@clack/prompts";
import { PACKAGE_MANAGERS, type ProjectConfigInput } from "./config/schema.js";
import type { Registry } from "./registry.js";
import type { ComponentCategory } from "./components/types.js";

function bailIfCancelled(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(130);
  }
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type PromptOptions = {
  registry: Registry;
  /** values already decided by preset/flags — those prompts are skipped */
  decided: Partial<ProjectConfigInput>;
  /** when set (from `--dir` or a name that carries a path), skip the directory question */
  directory?: string;
};

export type PromptResult = {
  answers: Partial<ProjectConfigInput>;
  /** chosen parent directory (relative or absolute); undefined means the cwd */
  directory?: string;
};

/**
 * Ask only for values not already `decided`. Returns the collected answers
 * (highest precedence in `resolveConfig`) plus the chosen target directory.
 */
export async function promptForConfig(opts: PromptOptions): Promise<PromptResult> {
  const { registry, decided } = opts;
  const answers: Partial<ProjectConfigInput> = {};
  let directory = opts.directory;

  p.intro("create-app");

  if (!decided.name) {
    const name = await p.text({
      message: "Project name",
      placeholder: "my-app",
      validate: (v) => (v && NAME_RE.test(v) ? undefined : "letters, digits, . _ - ; must start alphanumeric"),
    });
    bailIfCancelled(name);
    answers.name = name as string;
  }

  if (directory === undefined) {
    const dir = await p.text({
      message: "Directory to create it in",
      placeholder: ".",
      defaultValue: ".",
    });
    bailIfCancelled(dir);
    directory = (dir as string) || ".";
  }

  const pickOne = async (
    category: ComponentCategory,
    message: string,
    { allowNone = false, noneFirst = false } = {},
  ): Promise<string> => {
    const options = registry
      .choicesFor(category)
      .filter((c) => !c.unavailable)
      .map((c) => ({ value: c.id, label: c.label, hint: c.summary }));
    const none = { value: "none", label: "None" };
    const value = await p.select({
      message,
      options: allowNone ? (noneFirst ? [none, ...options] : [...options, none]) : options,
      initialValue: allowNone && noneFirst ? "none" : options[0]?.value,
    });
    bailIfCancelled(value);
    return value as string;
  };

  if (decided.backend === undefined) {
    answers.backend = await pickOne("backend", "Backend");
  }
  if (decided.database === undefined) {
    answers.database = await pickOne("database", "Database", { allowNone: true, noneFirst: true });
  }
  if (decided.cache === undefined) {
    answers.cache = await pickOne("cache", "Cache", { allowNone: true, noneFirst: true });
  }
  if (decided.queue === undefined) {
    answers.queue = await pickOne("queue", "Message queue", { allowNone: true, noneFirst: true });
  }

  if (decided.docker === undefined) {
    const docker = await p.confirm({ message: "Include Docker + Docker Compose?", initialValue: true });
    bailIfCancelled(docker);
    answers.docker = docker as boolean;
  }

  if (!decided.packageManager) {
    const pm = await p.select({
      message: "Package manager",
      options: PACKAGE_MANAGERS.map((m) => ({ value: m, label: m })),
      initialValue: "npm" as (typeof PACKAGE_MANAGERS)[number],
    });
    bailIfCancelled(pm);
    answers.packageManager = pm as (typeof PACKAGE_MANAGERS)[number];
  }

  if (decided.git === undefined) {
    const git = await p.confirm({ message: "Initialize a git repository?", initialValue: true });
    bailIfCancelled(git);
    answers.git = git as boolean;
  }

  p.outro("Generating project…");
  return { answers, directory };
}
