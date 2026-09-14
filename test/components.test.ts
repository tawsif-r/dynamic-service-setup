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

  it("selects and validates each dotnet backend with each database + redis", () => {
    for (const backend of ["aspnet-minimal", "aspnet-webapi"]) {
      for (const database of ["postgres", "mongodb"]) {
        const config = resolveConfig({
          flags: { name: "orders-api", backend, database, cache: "redis", docker: true, tooling: [] },
        });
        const selected = createRegistry().select(config);
        expect(selected.map((c) => c.id)).toEqual(
          expect.arrayContaining([backend, database, "redis", "docker", "docker-compose"]),
        );
        // eslint/prettier are Node-only — confirm they aren't dragged in by default.
        expect(selected.map((c) => c.id)).not.toEqual(expect.arrayContaining(["eslint", "prettier"]));
        expect(validateSelection(config, selected).errors).toEqual([]);
      }
    }
  });
});
