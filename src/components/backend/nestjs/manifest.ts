import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

export const nestjs: Component = {
  id: "nestjs",
  category: "backend",
  label: "NestJS",
  summary: "Progressive Node.js framework (TypeScript, Express)",
  runtime: "node",
  provides: ["backend-framework", "http-server", "node-runtime"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  node: {
    dependencies: {
      "@nestjs/common": "^10.4.0",
      "@nestjs/core": "^10.4.0",
      "@nestjs/platform-express": "^10.4.0",
      "reflect-metadata": "^0.2.2",
      rxjs: "^7.8.1",
    },
    devDependencies: {
      "@nestjs/cli": "^10.4.0",
      "@nestjs/schematics": "^10.1.4",
      "@types/express": "^4.17.21",
      "@types/node": "^22.7.0",
      "source-map-support": "^0.5.21",
      "ts-loader": "^9.5.1",
      "ts-node": "^10.9.2",
      typescript: "^5.6.2",
    },
    scripts: {
      build: "nest build",
      start: "node dist/main.js",
      "start:dev": "nest start --watch",
      "start:prod": "node dist/main.js",
    },
  },
  combos: [
    {
      // Nest-specific glue, pulled in only when these databases are also chosen.
      when: ["postgres"],
      node: { dependencies: { "@nestjs/typeorm": "^10.0.2" } },
    },
    {
      when: ["mongodb"],
      node: { dependencies: { "@nestjs/mongoose": "^10.1.0" } },
    },
  ],
  dockerfile: {
    // NestJS compiles to dist/main.js — this matches the merger default, kept
    // explicit now that the field is a real override point.
    cmd: ["node", "dist/main.js"],
  },
  readme:
    "Nest bootstraps in `src/main.ts`. Feature wiring (database, cache) is composed " +
    "into `src/app.module.ts` by the generator based on the components you picked.",
};
