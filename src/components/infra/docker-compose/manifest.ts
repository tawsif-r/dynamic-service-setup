import type { Component } from "../../types.js";

/**
 * Supplies the base `app` service that `merge-compose` extends. Database and
 * cache components add their own services and push onto `app.depends_on`.
 */
export const dockerCompose: Component = {
  id: "docker-compose",
  category: "infra",
  label: "Docker Compose",
  summary: "Compose file wiring the app to its services",
  requires: ["docker"],
  compose: {
    services: {
      app: {
        build: ".",
        env_file: [".env"],
        ports: ["3000:3000"],
        environment: { NODE_ENV: "${NODE_ENV:-development}" },
        restart: "unless-stopped",
      },
    },
  },
  readme: "`docker compose up -d` starts the app and its dependencies.",
};
