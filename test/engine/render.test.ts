import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRenderContext, renderTemplateDir } from "../../src/engine/render.js";
import { writeFileMap } from "../../src/exec/write-files.js";
import { resolveConfig } from "../../src/config/resolve.js";
import type { Component } from "../../src/components/types.js";
import { makeTmpDir, writeTree } from "../helpers/tmp.js";

const config = resolveConfig({ flags: { name: "voting-app", backend: "nestjs", cache: "redis" } });
const components: Component[] = [
  { id: "nestjs", category: "backend", label: "NestJS" },
  { id: "redis", category: "cache", label: "Redis" },
];
const ctx = makeRenderContext(config, components);

let tmp: Awaited<ReturnType<typeof makeTmpDir>>;
beforeEach(async () => {
  tmp = await makeTmpDir();
});
afterEach(() => tmp.cleanup());

describe("renderTemplateDir", () => {
  it("renders .ejs, copies plain files, and un-underscores dotfiles", async () => {
    const templateDir = join(tmp.dir, "template");
    await writeTree(templateDir, {
      "src/main.ts.ejs": "// <%= config.name %>\nconst port = 3000;\n",
      "src/app.module.ts.ejs":
        "<% if (has('redis')) { %>import { RedisModule } from './redis';\n<% } %>export class AppModule {}\n",
      "nest-cli.json": '{ "sourceRoot": "src" }\n',
      "_gitignore": "node_modules\n",
      "config/_env.example": "PORT=3000\n",
    });

    const files = await renderTemplateDir(templateDir, ctx);
    const paths = [...files.keys()].sort();

    expect(paths).toEqual([
      ".gitignore",
      "config/.env.example",
      "nest-cli.json",
      "src/app.module.ts",
      "src/main.ts",
    ]);
    expect(files.get("src/main.ts")!.contents).toBe("// voting-app\nconst port = 3000;\n");
    expect(files.get("src/app.module.ts")!.contents).toContain("import { RedisModule }");
  });

  it("omits a conditional block when the component is absent", async () => {
    const templateDir = join(tmp.dir, "template");
    await writeTree(templateDir, {
      "app.module.ts.ejs":
        "<% if (has('mongodb')) { %>MONGO<% } else { %>NO_MONGO<% } %>\n",
    });
    const files = await renderTemplateDir(templateDir, ctx);
    expect(files.get("app.module.ts")!.contents).toBe("NO_MONGO\n");
  });
});

describe("writeFileMap", () => {
  it("writes rendered files to disk with directories created", async () => {
    const templateDir = join(tmp.dir, "template");
    await writeTree(templateDir, {
      "src/main.ts.ejs": "export const name = '<%= config.name %>';\n",
      "_gitignore": "dist\n",
    });
    const files = await renderTemplateDir(templateDir, ctx);

    const outDir = join(tmp.dir, "out");
    const written = await writeFileMap(outDir, files);

    expect(written).toEqual([".gitignore", "src/main.ts"]);
    expect(await readFile(join(outDir, "src/main.ts"), "utf8")).toBe(
      "export const name = 'voting-app';\n",
    );
    expect(await readdir(outDir)).toContain(".gitignore");
  });
});
