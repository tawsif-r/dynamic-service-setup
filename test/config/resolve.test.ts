import { describe, expect, it } from "vitest";
import {
  flagsToConfig,
  mergeConfig,
  resolveConfig,
} from "../../src/config/resolve.js";

describe("flagsToConfig", () => {
  it("maps pm -> packageManager and drops undefined", () => {
    expect(flagsToConfig({ backend: "nestjs", pm: "pnpm" })).toEqual({
      backend: "nestjs",
      packageManager: "pnpm",
    });
  });

  it("keeps explicit false values (e.g. --no-docker)", () => {
    expect(flagsToConfig({ docker: false })).toEqual({ docker: false });
  });
});

describe("mergeConfig", () => {
  it("later sources win, undefined never clobbers", () => {
    const merged = mergeConfig({
      preset: { backend: "nestjs", database: "postgres", docker: false },
      flags: { database: undefined, cache: "redis" },
      answers: { docker: true },
    });
    expect(merged).toEqual({
      backend: "nestjs",
      database: "postgres",
      cache: "redis",
      docker: true,
    });
  });
});

describe("resolveConfig", () => {
  it("fills defaults for anything unset", () => {
    const cfg = resolveConfig({ flags: { name: "voting-app", backend: "nestjs" } });
    expect(cfg).toMatchObject({
      name: "voting-app",
      backend: "nestjs",
      database: "none",
      cache: "none",
      queue: "none",
      docker: true,
      packageManager: "npm",
      tooling: ["eslint", "prettier"],
      git: true,
      install: true,
      externalRedis: false,
      externalRabbitmq: false,
    });
  });

  it("applies preset < flags < answers precedence", () => {
    const cfg = resolveConfig({
      preset: { backend: "nestjs", database: "mongodb", packageManager: "yarn" },
      flags: { name: "api", database: "postgres" },
      answers: { packageManager: "pnpm" },
    });
    expect(cfg.database).toBe("postgres");
    expect(cfg.packageManager).toBe("pnpm");
    expect(cfg.backend).toBe("nestjs");
  });

  it("rejects a missing backend", () => {
    expect(() => resolveConfig({ flags: { name: "api" } })).toThrowError(
      /backend must be selected/,
    );
  });

  it("rejects an invalid project name", () => {
    expect(() =>
      resolveConfig({ flags: { name: "-bad name", backend: "nestjs" } }),
    ).toThrowError(/project name|letters, digits/);
  });

  it("rejects an unknown package manager", () => {
    expect(() =>
      resolveConfig({
        flags: { name: "api", backend: "nestjs" },
        answers: { packageManager: "bun" as never },
      }),
    ).toThrowError(/Invalid project configuration/);
  });
});
