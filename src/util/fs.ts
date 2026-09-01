import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function isDirEmpty(p: string): Promise<boolean> {
  try {
    return (await readdir(p)).length === 0;
  } catch {
    return true; // absent counts as empty
  }
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

/** Move a directory, falling back to copy+remove across filesystems. */
export async function moveDir(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await cp(from, to, { recursive: true });
    await rm(from, { recursive: true, force: true });
  }
}
