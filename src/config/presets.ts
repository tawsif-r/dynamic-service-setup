import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { ProjectConfigInput } from "./schema.js";

/** A preset is a partial project config; missing keys fall back to defaults/flags/prompts. */
export type Preset = Partial<ProjectConfigInput>;

const PRESET_EXTS = [".yaml", ".yml", ".json"] as const;

/** `~/.config/create-app/presets` (honours `XDG_CONFIG_HOME`). */
export function presetsDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "create-app", "presets");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Load a named preset. Tries `<name>.yaml`, `.yml`, then `.json`.
 * Throws a readable error if the file is missing or not a mapping.
 */
export async function loadPreset(name: string): Promise<Preset> {
  const dir = presetsDir();
  for (const ext of PRESET_EXTS) {
    const file = join(dir, `${name}${ext}`);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    const data: unknown = parseYaml(raw) ?? {};
    if (!isPlainObject(data)) {
      throw new Error(`preset "${name}" (${file}) must be a mapping of config keys`);
    }
    return data as Preset;
  }
  throw new Error(
    `preset "${name}" not found in ${dir} (expected ${name}.yaml, .yml or .json)`,
  );
}

/** Names of all presets on disk, without extension. Empty if the dir is absent. */
export async function listPresets(): Promise<string[]> {
  try {
    const entries = await readdir(presetsDir());
    return entries
      .filter((f) => PRESET_EXTS.some((ext) => f.endsWith(ext)))
      .map((f) => f.replace(/\.(ya?ml|json)$/i, ""))
      .sort();
  } catch {
    return [];
  }
}
