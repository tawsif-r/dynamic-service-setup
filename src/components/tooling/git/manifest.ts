import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

/**
 * Owns `.gitignore`. The actual `git init` + initial commit runs in
 * `runPostGenerate` when `config.git` is set.
 */
export const git: Component = {
  id: "git",
  category: "vcs",
  label: "Git",
  summary: ".gitignore + initial commit",
  templateDir: join(moduleDir(import.meta.url), "template"),
};
