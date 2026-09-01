import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

export const prettier: Component = {
  id: "prettier",
  category: "tooling",
  label: "Prettier",
  summary: "Opinionated formatter",
  templateDir: join(moduleDir(import.meta.url), "template"),
  node: {
    devDependencies: { prettier: "^3.3.3" },
    scripts: { format: "prettier --write ." },
  },
};
