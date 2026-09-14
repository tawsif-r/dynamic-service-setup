import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

/**
 * ASP.NET Core Minimal API — a single top-level-statements `Program.cs`, no
 * controllers. Like NestJS, database/cache wiring is `has(...)` branches in one
 * central file rather than per-client singletons (contrast with Next.js).
 */
export const aspnetMinimal: Component = {
  id: "aspnet-minimal",
  category: "backend",
  label: "ASP.NET Core (Minimal API)",
  summary: "Lean top-level Program.cs — routes as MapGet/MapPost calls",
  runtime: "dotnet",
  provides: ["backend-framework", "http-server"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  dotnet: {
    sdk: "Microsoft.NET.Sdk.Web",
  },
  readme:
    "`Program.cs` wires up the app top-to-bottom: database/cache registration, then " +
    "route handlers. Add more `app.MapGet`/`app.MapPost` calls per endpoint, or move " +
    "groups of them into extension methods as the app grows.",
};
