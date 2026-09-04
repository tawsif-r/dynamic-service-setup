import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRegistry } from "../src/registry.js";
import { validateSelection } from "../src/engine/validate.js";
import { resolveConfig } from "../src/config/resolve.js";
import { builtinComponents } from "../src/components/index.js";

describe("built-in components", () => {
  it("register without id collisions", () => {
    expect(() => createRegistry()).not.toThrow();
  });

  it("every declared templateDir exists on disk (source tree)", async () => {
    for (const c of builtinComponents) {
      if (!c.templateDir) continue;
      await expect(access(c.templateDir), `${c.id} templateDir missing`).resolves.toBeUndefined();
    }
  });

  it("selects and validates the full v1 slice", () => {
    const registry = createRegistry();
    const config = resolveConfig({
      flags: {
        name: "voting-app",
        backend: "nestjs",
        database: "postgres",
        cache: "redis",
        docker: true,
      },
    });
    const selected = registry.select(config);
    expect(selected.map((c) => c.id)).toEqual([
      "nestjs",
      "postgres",
      "redis",
      "docker",
      "docker-compose",
      "eslint",
      "prettier",
      "git",
    ]);
    expect(validateSelection(config, selected).errors).toEqual([]);
  });

  it("selects and validates a nestjs + mongodb + redis stack", () => {
    const config = resolveConfig({
      flags: { name: "api", backend: "nestjs", database: "mongodb", cache: "redis", docker: true },
    });
    const selected = createRegistry().select(config);
    expect(selected.map((c) => c.id)).toContain("mongodb");
    expect(validateSelection(config, selected).errors).toEqual([]);
  });

  it("selects and validates nextjs with each database + redis", () => {
    for (const database of ["postgres", "mongodb"]) {
      const config = resolveConfig({
        flags: { name: "web", backend: "nextjs", database, cache: "redis", docker: true },
      });
      const selected = createRegistry().select(config);
      expect(selected.map((c) => c.id)).toEqual(
        expect.arrayContaining(["nextjs", database, "redis", "docker", "docker-compose"]),
      );
      expect(validateSelection(config, selected).errors).toEqual([]);
    }
  });

  it("selects and validates a nestjs + postgres + redis + rabbitmq stack", () => {
    const config = resolveConfig({
      flags: {
        name: "api",
        backend: "nestjs",
        database: "postgres",
        cache: "redis",
        queue: "rabbitmq",
        docker: true,
      },
    });
    const selected = createRegistry().select(config);
    expect(selected.map((c) => c.id)).toEqual([
      "nestjs",
      "postgres",
      "redis",
      "rabbitmq",
      "docker",
      "docker-compose",
      "eslint",
      "prettier",
      "git",
    ]);
    expect(validateSelection(config, selected).errors).toEqual([]);
  });

  it("rejects rabbitmq without docker or --external-rabbitmq", () => {
    const config = resolveConfig({
      flags: { name: "api", backend: "nestjs", queue: "rabbitmq", docker: false },
    });
    const selected = createRegistry().select(config);
    expect(validateSelection(config, selected).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("queue 'rabbitmq' has nowhere to run")]),
    );
  });

  it("selects and validates nextjs + rabbitmq without a database or cache", () => {
    const config = resolveConfig({
      flags: { name: "web", backend: "nextjs", queue: "rabbitmq", docker: true },
    });
    const selected = createRegistry().select(config);
    expect(selected.map((c) => c.id)).toEqual(
      expect.arrayContaining(["nextjs", "rabbitmq", "docker", "docker-compose"]),
    );
    expect(validateSelection(config, selected).errors).toEqual([]);
  });
});
