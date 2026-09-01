// Copies every `template/` directory under src/ to the matching path under dist/,
// so compiled manifests can resolve their template assets at runtime via
// `import.meta.dirname`. tsc only emits .js/.d.ts and would otherwise drop them.
import { cp, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const DIST = new URL("../dist/", import.meta.url).pathname;

/** @param {string} dir */
async function findTemplateDirs(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = join(dir, entry.name);
    if (entry.name === "template") {
      found.push(full);
    } else {
      found.push(...(await findTemplateDirs(full)));
    }
  }
  return found;
}

async function main() {
  try {
    await stat(SRC);
  } catch {
    console.error("copy-templates: src/ not found");
    process.exit(1);
  }

  const templateDirs = await findTemplateDirs(SRC);
  for (const dir of templateDirs) {
    const rel = relative(SRC, dir);
    const dest = join(DIST, rel);
    await cp(dir, dest, { recursive: true });
    console.log(`copied ${rel}`);
  }
  console.log(`copy-templates: ${templateDirs.length} template dir(s) copied`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
