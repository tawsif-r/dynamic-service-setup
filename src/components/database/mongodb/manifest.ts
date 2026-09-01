import type { Component } from "../../types.js";

/**
 * MongoDB via Mongoose. Like `postgres`, only backend-agnostic deps live here
 * (`mongoose`); the Nest-specific `@nestjs/mongoose` glue is a `combos` entry on
 * the `nestjs` manifest. The connection is wired into a backend's entry point
 * (for NestJS, the `has('mongodb')` branch of `app.module.ts.ejs`).
 */
export const mongodb: Component = {
  id: "mongodb",
  category: "database",
  label: "MongoDB",
  summary: "Document database (Mongoose)",
  provides: ["document-db", "primary-datastore"],
  node: {
    dependencies: { mongoose: "^8.7.0" },
  },
  env: [
    {
      key: "MONGODB_URI",
      value: "mongodb://mongodb:27017/app",
      comment: "Mongoose connection string (host 'mongodb' = the compose service)",
    },
  ],
  compose: {
    services: {
      mongodb: {
        image: "mongo:8",
        restart: "unless-stopped",
        ports: ["27017:27017"],
        volumes: ["mongo_data:/data/db"],
        healthcheck: {
          test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"],
          interval: "5s",
          timeout: "5s",
          retries: 10,
        },
      },
    },
    volumes: { mongo_data: null },
    appDependsOn: ["mongodb"],
  },
  readme:
    "`MONGODB_URI` drives the Mongoose connection. Define schemas with " +
    "`@nestjs/mongoose` decorators and register them per feature module.",
};
