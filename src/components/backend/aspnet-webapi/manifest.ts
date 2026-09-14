import { join } from "node:path";
import { moduleDir } from "../../../util/dir.js";
import type { Component } from "../../types.js";

/**
 * ASP.NET Core Web API — controller-based, `AddControllers()`/`MapControllers()`
 * in `Program.cs`. Database/cache wiring lives in `Program.cs` (same `has(...)`
 * pattern as `aspnet-minimal`); endpoints live under `Controllers/`.
 */
export const aspnetWebapi: Component = {
  id: "aspnet-webapi",
  category: "backend",
  label: "ASP.NET Core (Web API)",
  summary: "Controller-based REST API — MVC conventions, no views",
  runtime: "dotnet",
  provides: ["backend-framework", "http-server"],
  templateDir: join(moduleDir(import.meta.url), "template"),
  dotnet: {
    sdk: "Microsoft.NET.Sdk.Web",
  },
  readme:
    "`Program.cs` registers database/cache and calls `AddControllers()`. Endpoints " +
    "live under `Controllers/` as `[ApiController]` classes — add one per resource.",
};
