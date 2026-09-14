import type { Component } from "../../types.js";

/**
 * PostgreSQL via TypeORM. No template files: the connection is wired straight
 * into a backend's entry point (for NestJS, the `has('postgres')` branch of
 * `app.module.ts.ejs`). Only backend-agnostic deps live here — the Nest-specific
 * `@nestjs/typeorm` glue is a `combos` entry on the `nestjs` manifest.
 */
export const postgres: Component = {
  id: "postgres",
  category: "database",
  label: "PostgreSQL",
  summary: "Relational database (TypeORM)",
  provides: ["sql-db", "primary-datastore"],
  node: {
    dependencies: {
      pg: "^8.12.0",
      typeorm: "^0.3.20",
    },
  },
  // Backend-agnostic driver, same spirit as the node deps above — ASP.NET's
  // built-in DI needs no extra glue package to register a DbContext.
  dotnet: {
    packages: { "Npgsql.EntityFrameworkCore.PostgreSQL": "8.0.10" },
  },
  env: [
    {
      key: "DATABASE_URL",
      value: "postgres://app:app@postgres:5432/app",
      comment: "TypeORM connection string (host 'postgres' = the compose service)",
    },
    { key: "POSTGRES_USER", value: "app" },
    { key: "POSTGRES_PASSWORD", value: "app" },
    { key: "POSTGRES_DB", value: "app" },
  ],
  compose: {
    services: {
      postgres: {
        image: "postgres:18-alpine",
        restart: "unless-stopped",
        environment: {
          POSTGRES_USER: "app",
          POSTGRES_PASSWORD: "app",
          POSTGRES_DB: "app",
        },
        ports: ["5432:5432"],
        volumes: ["postgres_data:/var/lib/postgresql/data"],
        healthcheck: {
          test: ["CMD-SHELL", "pg_isready -U app -d app"],
          interval: "5s",
          timeout: "5s",
          retries: 10,
        },
      },
    },
    volumes: { postgres_data: null },
    appDependsOn: ["postgres"],
  },
  readme:
    "`DATABASE_URL` is the Postgres connection string. Node backends use TypeORM " +
    "(`synchronize` is enabled outside production; switch to migrations before " +
    "deploying). ASP.NET backends use EF Core via `Npgsql.EntityFrameworkCore." +
    "PostgreSQL`, registered on `AppDbContext` in `Program.cs`.",
};
