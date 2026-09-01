import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Directory of the calling module. Pass `import.meta.url`. */
export function moduleDir(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}
