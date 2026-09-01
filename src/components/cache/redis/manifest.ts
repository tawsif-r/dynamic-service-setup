import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

export const redis: Component = {
  id: "redis",
  category: "cache",
  label: "Redis",
  summary: "In-memory cache / store, exposed as a global Nest provider",
  provides: ["cache"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  node: {
    dependencies: { ioredis: "^5.4.1" },
  },
  env: [
    {
      key: "REDIS_URL",
      value: "redis://redis:6379",
      comment: "ioredis connection string (host 'redis' = the compose service)",
    },
  ],
  compose: {
    services: {
      redis: {
        image: "redis:8-alpine",
        restart: "unless-stopped",
        command: ["redis-server", "--appendonly", "yes"],
        ports: ["6379:6379"],
        volumes: ["redis_data:/data"],
        healthcheck: {
          test: ["CMD", "redis-cli", "ping"],
          interval: "5s",
          timeout: "3s",
          retries: 10,
        },
      },
    },
    volumes: { redis_data: null },
    appDependsOn: ["redis"],
  },
  readme:
    "ioredis client from `REDIS_URL`. NestJS: inject the `@Global()` `RedisService` " +
    "(`redisService.client`). Next.js: import `redis` from `src/lib/redis.ts`.",
};
