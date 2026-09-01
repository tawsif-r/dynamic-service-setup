import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FileMap } from "../engine/files.js";

/**
 * Write every file in the map under `rootDir`, creating parent directories.
 * Paths are written in sorted order for deterministic logs. Returns the list of
 * relative paths written.
 */
export async function writeFileMap(rootDir: string, files: FileMap): Promise<string[]> {
  const ordered = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const written: string[] = [];
  for (const file of ordered) {
    const abs = join(rootDir, file.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.contents);
    if (file.mode !== undefined) {
      await chmod(abs, file.mode);
    }
    written.push(file.path);
  }
  return written;
}
