import type { Component } from "./types.js";
import { nestjs } from "./backend/nestjs/manifest.js";
import { nextjs } from "./backend/nextjs/manifest.js";
import { postgres } from "./database/postgres/manifest.js";
import { mongodb } from "./database/mongodb/manifest.js";
import { redis } from "./cache/redis/manifest.js";
import { rabbitmq } from "./queue/rabbitmq/manifest.js";
import { docker } from "./infra/docker/manifest.js";
import { dockerCompose } from "./infra/docker-compose/manifest.js";
import { eslint } from "./tooling/eslint/manifest.js";
import { prettier } from "./tooling/prettier/manifest.js";
import { git } from "./tooling/git/manifest.js";

/**
 * Built-in components. Explicit list (not filesystem globbing) so the build is
 * deterministic. User components (Phase 5) will be appended on top of this.
 */
export const builtinComponents: Component[] = [
  nestjs,
  nextjs,
  postgres,
  mongodb,
  redis,
  rabbitmq,
  docker,
  dockerCompose,
  eslint,
  prettier,
  git,
];
