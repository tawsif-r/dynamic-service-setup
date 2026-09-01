import { describe, expect, it } from "vitest";
import { planInvocation } from "../../src/exec/package-manager.js";

describe("planInvocation", () => {
  it("install", () => {
    expect(planInvocation("npm", { kind: "install" })).toEqual({ command: "npm", args: ["install"] });
    expect(planInvocation("pnpm", { kind: "install" })).toEqual({ command: "pnpm", args: ["install"] });
  });

  it("addDev uses install -D for npm, add -D otherwise", () => {
    expect(planInvocation("npm", { kind: "addDev", packages: ["a", "b"] }).args).toEqual([
      "install",
      "-D",
      "a",
      "b",
    ]);
    expect(planInvocation("yarn", { kind: "addDev", packages: ["a"] }).args).toEqual(["add", "-D", "a"]);
  });

  it("run passes script args after -- only for npm", () => {
    expect(planInvocation("npm", { kind: "run", script: "build", args: ["--watch"] }).args).toEqual([
      "run",
      "build",
      "--",
      "--watch",
    ]);
    expect(planInvocation("pnpm", { kind: "run", script: "build", args: ["--watch"] }).args).toEqual([
      "build",
      "--watch",
    ]);
  });

  it("dlx maps to npx for npm, `<pm> dlx` otherwise", () => {
    expect(planInvocation("npm", { kind: "dlx", spec: "prettier", args: ["-w", "."] })).toEqual({
      command: "npx",
      args: ["prettier", "-w", "."],
    });
    expect(planInvocation("pnpm", { kind: "dlx", spec: "prettier" })).toEqual({
      command: "pnpm",
      args: ["dlx", "prettier"],
    });
  });
});
