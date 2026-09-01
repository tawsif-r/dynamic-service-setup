import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

/**
 * Next.js (App Router). Unlike NestJS there is no central module to register
 * things into, so database/cache "wiring" is done as standalone singleton files
 * under `src/lib/` that the template emits only when the relevant component is
 * selected (the `.ejs` renders to empty otherwise and is dropped).
 */
export const nextjs: Component = {
  id: "nextjs",
  category: "backend",
  label: "Next.js",
  summary: "React framework, App Router, standalone output",
  runtime: "node",
  provides: ["backend-framework", "http-server"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  node: {
    dependencies: {
      next: "^15.0.0",
      react: "^18.3.1",
      "react-dom": "^18.3.1",
    },
    devDependencies: {
      "@types/node": "^22.7.0",
      "@types/react": "^18.3.11",
      "@types/react-dom": "^18.3.0",
      typescript: "^5.6.2",
    },
    scripts: {
      dev: "next dev",
      // alias so the generic "Next:" steps (`<pm> run start:dev`) work here too
      "start:dev": "next dev",
      build: "next build",
      start: "next start",
    },
  },
  dockerfile: {
    // `output: 'standalone'` in next.config.mjs produces .next/standalone/server.js
    cmd: ["node", "server.js"],
    runtimeStage: [
      "COPY --from=build /app/public ./public",
      "COPY --from=build /app/.next/standalone ./",
      "COPY --from=build /app/.next/static ./.next/static",
    ],
  },
  readme:
    "App Router pages live in `src/app`. Database/cache clients are singletons in " +
    "`src/lib` (created only for the components you picked) — import them from route " +
    "handlers or server components.",
};
