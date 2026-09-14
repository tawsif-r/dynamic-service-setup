/**
 * Sanitize `config.name` (which allows `.` `_` `-`, per the schema's name regex)
 * into a valid C# identifier. Used as the single source of truth for the
 * `.csproj` filename, `RootNamespace` / `AssemblyName`, and the Dockerfile
 * `ENTRYPOINT` for dotnet backends — every dotnet-facing file needs the exact
 * same value, so it lives here once rather than being re-derived per call site.
 */
export function toDotnetIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(cleaned) ? `App_${cleaned}` : cleaned;
}
