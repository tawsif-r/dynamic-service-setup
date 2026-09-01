import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { resolveConfig } from "../../src/config/resolve.js";
import { mergePackageJson } from "../../src/engine/merge-package-json.js";
import { mergeCompose } from "../../src/engine/merge-compose.js";
import { mergeEnv } from "../../src/engine/merge-env.js";
import { mergeDockerfile } from "../../src/engine/merge-dockerfile.js";
import { assembleReadme } from "../../src/engine/assemble-readme.js";
import { mergeCsproj } from "../../src/engine/merge-csproj.js";
import { deepMerge } from "../../src/engine/deep-merge.js";
import type { Component } from "../../src/components/types.js";

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({ flags: { name: "voting-app", backend: "nestjs", ...overrides } });
}

const nestjs: Component = {
  id: "nestjs",
  category: "backend",
  label: "NestJS",
  runtime: "node",
  node: {
    dependencies: { "@nestjs/core": "^10.0.0", "@nestjs/common": "^10.0.0" },
    devDependencies: { typescript: "^5.6.0" },
    scripts: { build: "nest build", "start:dev": "nest start --watch" },
  },
  compose: {
    services: { app: { build: ".", env_file: [".env"], ports: ["3000:3000"] } },
  },
};

const postgres: Component = {
  id: "postgres",
  category: "database",
  label: "PostgreSQL",
  provides: ["sql-db"],
  node: { dependencies: { pg: "^8.12.0", typeorm: "^0.3.20" } },
  env: [{ key: "DATABASE_URL", value: "postgres://postgres:postgres@postgres:5432/app" }],
  compose: {
    services: {
      postgres: {
        image: "postgres:18-alpine",
        ports: ["5432:5432"],
        volumes: ["postgres_data:/var/lib/postgresql/data"],
      },
    },
    volumes: { postgres_data: null },
    appDependsOn: ["postgres"],
  },
};

const redis: Component = {
  id: "redis",
  category: "cache",
  label: "Redis",
  node: { dependencies: { ioredis: "^5.4.0" } },
  env: [{ key: "REDIS_URL", value: "redis://redis:6379" }],
  compose: {
    services: { redis: { image: "redis:8-alpine", ports: ["6379:6379"] } },
    appDependsOn: ["redis"],
  },
};

const dockerComposeComp: Component = { id: "docker-compose", category: "infra", label: "Docker Compose" };
const dockerComp: Component = { id: "docker", category: "infra", label: "Docker" };

describe("mergePackageJson", () => {
  it("unions deps/devDeps/scripts and sorts keys", () => {
    const { files } = mergePackageJson(config(), [nestjs, postgres, redis]);
    const pkg = JSON.parse(files[0]!.contents as string);
    expect(pkg.name).toBe("voting-app");
    expect(Object.keys(pkg.dependencies)).toEqual([
      "@nestjs/common",
      "@nestjs/core",
      "ioredis",
      "pg",
      "typeorm",
    ]);
    expect(pkg.scripts.build).toBe("nest build");
  });

  it("warns on a conflicting version and keeps the first", () => {
    const other: Component = {
      id: "other",
      category: "tooling",
      label: "other",
      node: { dependencies: { typeorm: "^0.2.0" } },
    };
    const { files, warnings } = mergePackageJson(config(), [nestjs, postgres, other]);
    const pkg = JSON.parse(files[0]!.contents as string);
    expect(pkg.dependencies.typeorm).toBe("^0.3.20");
    expect(warnings.join()).toMatch(/dependency "typeorm".*keeping \^0\.3\.20/);
  });

  it("emits nothing for a non-node backend", () => {
    const aspnet: Component = { id: "aspnet", category: "backend", label: "ASP.NET", runtime: "dotnet" };
    expect(mergePackageJson(config({ backend: "aspnet" }), [aspnet]).files).toEqual([]);
  });

  it("applies a combo contribution only when its `when` ids are all selected", () => {
    const backend: Component = {
      id: "nestjs",
      category: "backend",
      label: "NestJS",
      runtime: "node",
      node: { dependencies: { "@nestjs/core": "^10.0.0" } },
      combos: [{ when: ["mongodb"], node: { dependencies: { "@nestjs/mongoose": "^10.1.0" } } }],
    };
    const mongo: Component = {
      id: "mongodb",
      category: "database",
      label: "MongoDB",
      node: { dependencies: { mongoose: "^8.7.0" } },
    };

    const without = JSON.parse(mergePackageJson(config(), [backend]).files[0]!.contents as string);
    expect(without.dependencies).not.toHaveProperty("@nestjs/mongoose");

    const withMongo = JSON.parse(
      mergePackageJson(config({ database: "mongodb" }), [backend, mongo]).files[0]!.contents as string,
    );
    expect(withMongo.dependencies).toMatchObject({
      "@nestjs/mongoose": "^10.1.0",
      mongoose: "^8.7.0",
    });
  });
});

describe("mergeCompose", () => {
  it("composes app + services and accumulates depends_on", () => {
    const { files } = mergeCompose(config({ docker: true }), [
      nestjs,
      postgres,
      redis,
      dockerComp,
      dockerComposeComp,
    ]);
    const doc = parseYaml(files[0]!.contents as string);
    expect(Object.keys(doc.services).sort()).toEqual(["app", "postgres", "redis"]);
    expect(doc.services.app.depends_on).toEqual(["postgres", "redis"]);
    expect(doc.services.postgres.image).toBe("postgres:18-alpine");
    expect(doc.volumes).toHaveProperty("postgres_data");
  });

  it("returns nothing without the docker-compose component", () => {
    expect(mergeCompose(config({ docker: false }), [nestjs]).files).toEqual([]);
  });
});

describe("mergeEnv", () => {
  it("writes .env and .env.example grouped by component", () => {
    const { files } = mergeEnv(config(), [nestjs, postgres, redis]);
    expect(files.map((f) => f.path)).toEqual([".env", ".env.example"]);
    const body = files[0]!.contents as string;
    expect(body).toContain("# --- postgres ---");
    expect(body).toContain("DATABASE_URL=postgres://postgres:postgres@postgres:5432/app");
    expect(body).toContain("REDIS_URL=redis://redis:6379");
    expect(files[0]!.contents).toBe(files[1]!.contents);
  });

  it("dedupes a repeated key and warns on a value clash", () => {
    const a: Component = { id: "a", category: "tooling", label: "a", env: [{ key: "PORT", value: "3000" }] };
    const b: Component = { id: "b", category: "tooling", label: "b", env: [{ key: "PORT", value: "4000" }] };
    const { files, warnings } = mergeEnv(config(), [a, b]);
    expect((files[0]!.contents as string).match(/PORT=/g)).toHaveLength(1);
    expect(warnings.join()).toMatch(/env PORT.*keeping the first/);
  });
});

describe("mergeDockerfile", () => {
  it("emits a pm-aware multi-stage Dockerfile", () => {
    const { files } = mergeDockerfile(config({ packageManager: "pnpm", docker: true }), [nestjs, dockerComp]);
    const text = files[0]!.contents as string;
    expect(text).toContain("FROM node:22-alpine AS base");
    expect(text).toContain("COPY pnpm-lock.yaml* ./");
    expect(text).toContain("pnpm install --frozen-lockfile");
    expect(text).toContain('CMD ["node", "dist/main.js"]');
  });

  it("injects component stage lines at the right anchor", () => {
    const withStage: Component = {
      id: "x",
      category: "tooling",
      label: "x",
      dockerfile: { stages: [{ at: "runtime", lines: ["RUN apk add --no-cache curl"] }] },
    };
    const { files } = mergeDockerfile(config({ docker: true }), [nestjs, dockerComp, withStage]);
    const text = files[0]!.contents as string;
    expect(text).toMatch(/FROM base AS runtime[\s\S]*RUN apk add --no-cache curl[\s\S]*EXPOSE 3000/);
  });

  it("returns nothing without the docker component", () => {
    expect(mergeDockerfile(config({ docker: false }), [nestjs]).files).toEqual([]);
  });
});

describe("assembleReadme", () => {
  it("lists the stack and appends component sections", () => {
    const withReadme: Component = { ...postgres, readme: "Runs migrations on boot." };
    const { files } = assembleReadme(config({ docker: true, packageManager: "pnpm" }), [nestjs, withReadme]);
    const text = files[0]!.contents as string;
    expect(text).toContain("# voting-app");
    expect(text).toContain("- **Database:** PostgreSQL");
    expect(text).toContain("### PostgreSQL");
    expect(text).toContain("docker compose up -d");
    expect(text).toContain("pnpm start:dev");
  });
});

describe("mergeCsproj", () => {
  it("is a no-op for node backends", () => {
    expect(mergeCsproj(config(), [nestjs]).files).toEqual([]);
  });
  it("throws for dotnet until Phase 3", () => {
    const aspnet: Component = { id: "aspnet", category: "backend", label: "ASP.NET", runtime: "dotnet" };
    expect(() => mergeCsproj(config({ backend: "aspnet" }), [aspnet])).toThrowError(/not implemented yet/);
  });
});

describe("deepMerge", () => {
  it("merges objects, concatenates+dedupes arrays", () => {
    expect(deepMerge({ a: 1, list: [1, 2] }, { b: 2, list: [2, 3] })).toEqual({
      a: 1,
      b: 2,
      list: [1, 2, 3],
    });
  });
});
