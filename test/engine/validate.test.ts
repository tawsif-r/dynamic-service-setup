import { describe, expect, it } from "vitest";
import { assertValid, validateSelection } from "../../src/engine/validate.js";
import { resolveConfig } from "../../src/config/resolve.js";
import type { Component } from "../../src/components/types.js";

function comp(id: string, category: Component["category"], extra: Partial<Component> = {}): Component {
  return { id, category, label: id, ...extra };
}

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({ flags: { name: "app", backend: "nestjs", ...overrides } });
}

const nestjs = comp("nestjs", "backend", { runtime: "node" });
const postgres = comp("postgres", "database", { provides: ["sql-db"] });
const redis = comp("redis", "cache");
const rabbitmq = comp("rabbitmq", "queue");
const docker = comp("docker", "infra");
const dockerCompose = comp("docker-compose", "infra", { requires: ["docker"] });

describe("validateSelection", () => {
  it("passes the clean slice", () => {
    const res = validateSelection(
      config({ database: "postgres", cache: "redis", docker: true }),
      [nestjs, postgres, redis, docker, dockerCompose],
    );
    expect(res.errors).toEqual([]);
  });

  it("flags redis with no docker and no --external-redis", () => {
    const res = validateSelection(config({ cache: "redis", docker: false }), [nestjs, redis]);
    expect(res.errors.join()).toMatch(/nowhere to run/);
  });

  it("accepts redis without docker when --external-redis is set", () => {
    const res = validateSelection(
      config({ cache: "redis", docker: false, externalRedis: true }),
      [nestjs, redis],
    );
    expect(res.errors).toEqual([]);
  });

  it("flags rabbitmq with no docker and no --external-rabbitmq", () => {
    const res = validateSelection(config({ queue: "rabbitmq", docker: false }), [nestjs, rabbitmq]);
    expect(res.errors.join()).toMatch(/nowhere to run/);
  });

  it("accepts rabbitmq without docker when --external-rabbitmq is set", () => {
    const res = validateSelection(
      config({ queue: "rabbitmq", docker: false, externalRabbitmq: true }),
      [nestjs, rabbitmq],
    );
    expect(res.errors).toEqual([]);
  });

  it("reports an unsatisfied requires", () => {
    const needsQueue = comp("worker", "backend", { requires: ["rabbitmq"] });
    const res = validateSelection(config(), [needsQueue]);
    expect(res.errors.join()).toMatch(/"worker" requires "rabbitmq"/);
  });

  it("satisfies requires via a provides capability tag", () => {
    const orm = comp("typeorm", "tooling", { requires: ["sql-db"] });
    const res = validateSelection(config({ database: "postgres" }), [nestjs, postgres, orm]);
    expect(res.errors).toEqual([]);
  });

  it("reports a conflict", () => {
    const a = comp("a", "tooling", { conflicts: ["b"] });
    const b = comp("b", "tooling");
    const res = validateSelection(config(), [nestjs, a, b]);
    expect(res.errors.join()).toMatch(/"a" conflicts with "b"/);
  });

  it("rejects two providers of an exclusive capability", () => {
    const pg = comp("postgres", "database", { provides: ["sql-db"] });
    const mysql = comp("mysql", "database", { provides: ["sql-db"] });
    const res = validateSelection(config(), [nestjs, pg, mysql]);
    expect(res.errors.join()).toMatch(/capability "sql-db" is provided by more than one/);
  });

  it("warns (not errors) for a dotnet backend package manager", () => {
    const aspnet = comp("aspnet", "backend", { runtime: "dotnet" });
    const res = validateSelection(config({ backend: "aspnet" }), [aspnet]);
    expect(res.errors).toEqual([]);
    expect(res.warnings.join()).toMatch(/ignored for the dotnet backend/);
  });
});

describe("assertValid", () => {
  it("throws a combined message on errors", () => {
    expect(() => assertValid(config({ cache: "redis", docker: false }), [nestjs, redis])).toThrowError(
      /Configuration is not valid:/,
    );
  });

  it("returns warnings when only warnings exist", () => {
    const aspnet = comp("aspnet", "backend", { runtime: "dotnet" });
    expect(assertValid(config({ backend: "aspnet" }), [aspnet])).toHaveLength(1);
  });
});
