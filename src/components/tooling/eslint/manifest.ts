import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

export const eslint: Component = {
  id: "eslint",
  category: "tooling",
  label: "ESLint",
  summary: "Flat-config lint via typescript-eslint",
  // Node-only tooling — meaningless (and file-polluting) against a dotnet backend.
  requires: ["node-runtime"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  node: {
    devDependencies: {
      eslint: "^9.11.0",
      "typescript-eslint": "^8.7.0",
      "eslint-config-prettier": "^9.1.0",
    },
    scripts: { lint: "eslint ." },
  },
};
