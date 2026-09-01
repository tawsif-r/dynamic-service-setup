import type { ProjectConfig } from "../config/schema.js";
import type { Component } from "../components/types.js";
import type { MergeResult } from "./files.js";

/**
 * Stub. Phase 3 implements `.csproj` assembly for `runtime: "dotnet"` backends
 * (ASP.NET): union of every component's `dotnet.packages` into
 * `<ItemGroup><PackageReference .../></ItemGroup>`, mirroring `mergePackageJson`.
 * Kept as a named export now so the pipeline can wire the dotnet branch without
 * reshaping later.
 */
export function mergeCsproj(_config: ProjectConfig, selected: Component[]): MergeResult {
  const backend = selected.find((c) => c.category === "backend");
  if (backend?.runtime !== "dotnet") return { files: [], warnings: [] };
  throw new Error(
    "dotnet project generation (merge-csproj) is not implemented yet — see tasks.md Phase 3.",
  );
}
