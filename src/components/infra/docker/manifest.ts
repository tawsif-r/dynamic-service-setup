import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

/**
 * Enables the app image. The `Dockerfile` itself is assembled by
 * `merge-dockerfile` (package-manager aware); this component only ships the
 * `.dockerignore` and marks that a container runtime is present.
 */
export const docker: Component = {
  id: "docker",
  category: "infra",
  label: "Docker",
  summary: "Multi-stage Dockerfile for the app image",
  provides: ["container-runtime"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  readme: "`docker build -t <name> .` builds the runtime image; the Compose file uses it.",
};
