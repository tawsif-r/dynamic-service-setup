import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expandTilde, resolveTarget } from "../../src/util/target.js";

const CWD = "/work";

describe("expandTilde", () => {
  it("expands ~ and ~/…", () => {
    expect(expandTilde("~")).toBe(homedir());
    expect(expandTilde("~/code")).toBe(join(homedir(), "code"));
    expect(expandTilde("./rel")).toBe("./rel");
  });
});

describe("resolveTarget", () => {
  it("bare name → cwd as the base", () => {
    expect(resolveTarget("api", undefined, CWD)).toEqual({
      projectName: "api",
      targetDir: "/work",
    });
  });

  it("--dir sets the base for a bare name", () => {
    expect(resolveTarget("api", "projects", CWD)).toEqual({
      projectName: "api",
      targetDir: "/work/projects",
    });
    expect(resolveTarget("api", "/abs/place", CWD)).toEqual({
      projectName: "api",
      targetDir: "/abs/place",
    });
  });

  it("path in the name is split into dir + basename", () => {
    expect(resolveTarget("apps/web", undefined, CWD)).toEqual({
      projectName: "web",
      targetDir: "/work/apps",
    });
  });

  it("name path is resolved under --dir", () => {
    expect(resolveTarget("apps/web", "~/code", CWD)).toEqual({
      projectName: "web",
      targetDir: join(homedir(), "code", "apps"),
    });
  });

  it("absolute name path wins over --dir", () => {
    expect(resolveTarget("/srv/apps/web", "ignored", CWD)).toEqual({
      projectName: "web",
      targetDir: "/srv/apps",
    });
  });

  it("trailing slashes are trimmed", () => {
    expect(resolveTarget("api/", undefined, CWD)).toEqual({
      projectName: "api",
      targetDir: "/work",
    });
  });

  it("no name → just the resolved base", () => {
    expect(resolveTarget(undefined, "out", CWD)).toEqual({
      projectName: undefined,
      targetDir: "/work/out",
    });
  });
});
