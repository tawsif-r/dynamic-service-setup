import { execa } from "execa";
import type { PackageManager } from "../config/schema.js";

export type PmAction =
  | { kind: "install" }
  | { kind: "addDev"; packages: string[] }
  | { kind: "run"; script: string; args?: string[] }
  | { kind: "dlx"; spec: string; args?: string[] };

export type PmInvocation = { command: string; args: string[] };

/** Pure: translate an action into the argv for a given package manager. */
export function planInvocation(pm: PackageManager, action: PmAction): PmInvocation {
  switch (action.kind) {
    case "install":
      return { command: pm, args: ["install"] };
    case "addDev":
      return {
        command: pm,
        args: pm === "npm" ? ["install", "-D", ...action.packages] : ["add", "-D", ...action.packages],
      };
    case "run":
      return {
        command: pm,
        args:
          pm === "npm"
            ? ["run", action.script, ...(action.args?.length ? ["--", ...action.args] : [])]
            : [action.script, ...(action.args ?? [])],
      };
    case "dlx":
      return {
        command: pm === "npm" ? "npx" : pm,
        args: pm === "npm" ? [action.spec, ...(action.args ?? [])] : ["dlx", action.spec, ...(action.args ?? [])],
      };
  }
}

export type PmDriver = {
  readonly name: PackageManager;
  readonly lockfile: string;
  install(cwd: string): Promise<void>;
  addDev(cwd: string, packages: string[]): Promise<void>;
  run(cwd: string, script: string, args?: string[]): Promise<void>;
  dlx(cwd: string, spec: string, args?: string[]): Promise<void>;
};

const LOCKFILES: Record<PackageManager, string> = {
  npm: "package-lock.json",
  pnpm: "pnpm-lock.yaml",
  yarn: "yarn.lock",
};

export function getPackageManager(name: PackageManager): PmDriver {
  const exec = async (cwd: string, action: PmAction) => {
    const { command, args } = planInvocation(name, action);
    await execa(command, args, { cwd, stdio: "inherit" });
  };
  return {
    name,
    lockfile: LOCKFILES[name],
    install: (cwd) => exec(cwd, { kind: "install" }),
    addDev: (cwd, packages) => exec(cwd, { kind: "addDev", packages }),
    run: (cwd, script, args) => exec(cwd, { kind: "run", script, args }),
    dlx: (cwd, spec, args) => exec(cwd, { kind: "dlx", spec, args }),
  };
}
