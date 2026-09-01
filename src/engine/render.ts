import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ejs from "ejs";
import type { ProjectConfig } from "../config/schema.js";
import type { Component } from "../components/types.js";
import type { FileMap } from "./files.js";

/**
 * Data available to every `.ejs` template.
 *   <%= config.name %>            resolved project config
 *   <% if (has("redis")) { %>     is a component id selected?
 */
export type RenderContext = {
  config: ProjectConfig;
  components: Component[];
  has: (id: string) => boolean;
};

export function makeRenderContext(config: ProjectConfig, components: Component[]): RenderContext {
  const ids = new Set(components.map((c) => c.id));
  return { config, components, has: (id: string) => ids.has(id) };
}

/**
 * Template-path conventions applied to each output path:
 *   - a trailing `.ejs` is rendered with EJS and stripped
 *   - a path segment starting with `_` becomes a dotfile (`_gitignore` ->
 *     `.gitignore`), so dotfiles survive `npm pack`
 */
function finalizePath(relPosix: string): string {
  const stripped = relPosix.endsWith(".ejs") ? relPosix.slice(0, -4) : relPosix;
  return stripped
    .split("/")
    .map((seg) => (seg.startsWith("_") ? `.${seg.slice(1)}` : seg))
    .join("/");
}

/** Render one component's `template/` folder into a FileMap. */
export async function renderTemplateDir(dir: string, ctx: RenderContext): Promise<FileMap> {
  const out: FileMap = new Map();
  await walk(dir, dir, ctx, out);
  return out;
}

async function walk(root: string, current: string, ctx: RenderContext, out: FileMap): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, ctx, out);
      continue;
    }
    const relPosix = relative(root, abs).split(sep).join("/");
    const target = finalizePath(relPosix);

    if (entry.name.endsWith(".ejs")) {
      const template = await readFile(abs, "utf8");
      const contents = await ejs.render(template, ctx, { async: true, filename: abs });
      // An .ejs file that renders to nothing is treated as "not applicable" and
      // omitted — this is how a template emits a file only for some selections
      // (e.g. Next.js `src/lib/db.ts.ejs` exists only when a database is picked).
      if (contents.trim() === "") continue;
      out.set(target, { path: target, contents });
    } else {
      out.set(target, { path: target, contents: await readFile(abs) });
    }
  }
}
