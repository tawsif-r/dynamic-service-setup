import type { ProjectConfig } from "../config/schema.js";
import type { Component } from "../components/types.js";
import type { MergeResult } from "./files.js";
import { toDotnetIdentifier } from "../util/dotnet-identifier.js";

const TARGET_FRAMEWORK = "net10.0";
const DEFAULT_SDK = "Microsoft.NET.Sdk.Web";

function addPackages(
  target: Record<string, string>,
  incoming: Record<string, string> | undefined,
  owner: string,
  warnings: string[],
): void {
  for (const [name, version] of Object.entries(incoming ?? {})) {
    const existing = target[name];
    if (existing !== undefined && existing !== version) {
      warnings.push(
        `NuGet package "${name}": "${owner}" wants ${version} but ${existing} is already set; keeping ${existing}.`,
      );
      continue;
    }
    target[name] = version;
  }
}

/**
 * Build the `.csproj` for `runtime: "dotnet"` backends: a project shell (SDK,
 * target framework, root namespace/assembly name derived from `config.name` —
 * see `util/dotnet-identifier.ts`) plus the union of every selected component's
 * `dotnet.packages` as `<PackageReference>` entries. Mirrors `mergePackageJson`'s
 * shape: first-package-version wins, a differing later version is a warning.
 */
export function mergeCsproj(config: ProjectConfig, selected: Component[]): MergeResult {
  const backend = selected.find((c) => c.category === "backend");
  if (backend?.runtime !== "dotnet") return { files: [], warnings: [] };

  const warnings: string[] = [];
  const packages: Record<string, string> = {};
  for (const c of selected) {
    if (c.dotnet?.packages) addPackages(packages, c.dotnet.packages, c.id, warnings);
  }

  const ident = toDotnetIdentifier(config.name);
  const sdk = backend.dotnet?.sdk ?? DEFAULT_SDK;

  const packageRefs = Object.entries(packages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, version]) => `    <PackageReference Include="${name}" Version="${version}" />`);

  const lines = [
    `<Project Sdk="${sdk}">`,
    "",
    "  <PropertyGroup>",
    `    <TargetFramework>${TARGET_FRAMEWORK}</TargetFramework>`,
    "    <Nullable>enable</Nullable>",
    "    <ImplicitUsings>enable</ImplicitUsings>",
    `    <RootNamespace>${ident}</RootNamespace>`,
    `    <AssemblyName>${ident}</AssemblyName>`,
    "  </PropertyGroup>",
    "",
    ...(packageRefs.length ? ["  <ItemGroup>", ...packageRefs, "  </ItemGroup>", ""] : []),
    "</Project>",
    "",
  ];

  return {
    files: [{ path: `${ident}.csproj`, contents: lines.join("\n") }],
    warnings,
  };
}
