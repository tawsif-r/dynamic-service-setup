import { describe, expect, it } from "vitest";
import { Registry } from "../src/registry.js";
import { resolveConfig } from "../src/config/resolve.js";
import type { Component } from "../src/components/types.js";

function comp(id: string, category: Component["category"], extra: Partial<Component> = {}): Component {
  return { id, category, label: id, ...extra };
}

const fakes: Component[] = [
  comp("nestjs", "backend", { runtime: "node" }),
  comp("postgres", "database", { provides: ["sql-db"] }),
  comp("mongodb", "database", { unavailable: "planned for Phase 2" }),
  comp("redis", "cache"),
  comp("docker", "infra"),
  comp("docker-compose", "infra"),
  comp("eslint", "tooling"),
  comp("prettier", "tooling"),
  comp("git", "vcs"),
];

function registry() {
  return new Registry(fakes);
}

function config(overrides: Record<string, unknown>) {
  return resolveConfig({ flags: { name: "app", backend: "nestjs", ...overrides } });
}

describe("Registry", () => {
  it("rejects duplicate ids", () => {
    expect(() => new Registry([comp("x", "backend"), comp("x", "cache")])).toThrowError(
      /duplicate component id/,
    );
  });

  it("choicesFor returns id-sorted components in a category", () => {
    expect(registry().choicesFor("tooling").map((c) => c.id)).toEqual(["eslint", "prettier"]);
  });

  it("select resolves the full slice in category order", () => {
    const picked = registry().select(
      config({ database: "postgres", cache: "redis", docker: true, git: true }),
    );
    expect(picked.map((c) => c.id)).toEqual([
      "nestjs",
      "postgres",
      "redis",
      "docker",
      "docker-compose",
      "eslint",
      "prettier",
      "git",
    ]);
  });

  it("skips database/cache when 'none'", () => {
    const picked = registry().select(
      config({ database: "none", cache: "none", docker: false, git: false, tooling: [] }),
    );
    expect(picked.map((c) => c.id)).toEqual(["nestjs"]);
  });

  it("omits infra components unless docker is enabled", () => {
    const picked = registry().select(
      config({ docker: false, git: false, tooling: [] }),
    );
    expect(picked.some((c) => c.category === "infra")).toBe(false);
  });

  it("throws on an unknown component id", () => {
    expect(() => registry().select(config({ database: "cassandra" }))).toThrowError(
      /unknown database "cassandra"/,
    );
  });

  it("throws on a stubbed (unavailable) component", () => {
    expect(() => registry().select(config({ database: "mongodb" }))).toThrowError(
      /not available yet: planned for Phase 2/,
    );
  });
});
