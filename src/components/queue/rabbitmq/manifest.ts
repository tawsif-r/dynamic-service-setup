import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

export const rabbitmq: Component = {
  id: "rabbitmq",
  category: "queue",
  label: "RabbitMQ",
  summary: "Message broker for async messaging / task queues",
  provides: ["message-queue"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  node: {
    dependencies: { amqplib: "^0.10.4" },
    devDependencies: { "@types/amqplib": "^0.10.5" },
  },
  env: [
    {
      key: "RABBITMQ_URL",
      value: "amqp://app:app@rabbitmq:5672",
      comment: "amqplib connection string (host 'rabbitmq' = the compose service)",
    },
    { key: "RABBITMQ_DEFAULT_USER", value: "app" },
    { key: "RABBITMQ_DEFAULT_PASS", value: "app" },
  ],
  compose: {
    services: {
      rabbitmq: {
        image: "rabbitmq:3-management-alpine",
        restart: "unless-stopped",
        environment: {
          RABBITMQ_DEFAULT_USER: "app",
          RABBITMQ_DEFAULT_PASS: "app",
        },
        // 5672 = AMQP, 15672 = management UI (http://localhost:15672)
        ports: ["5672:5672", "15672:15672"],
        volumes: ["rabbitmq_data:/var/lib/rabbitmq"],
        healthcheck: {
          test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"],
          interval: "10s",
          timeout: "5s",
          retries: 10,
        },
      },
    },
    volumes: { rabbitmq_data: null },
    appDependsOn: ["rabbitmq"],
  },
  readme:
    "amqplib client from `RABBITMQ_URL`. NestJS: inject the `@Global()` `RabbitmqService` " +
    "(`rabbitmqService.channel`). Next.js: import `getChannel` from `src/lib/rabbitmq.ts`. " +
    "Management UI at http://localhost:15672 (default compose port).",
};
