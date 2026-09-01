/** A single file destined for the generated project. */
export type GeneratedFile = {
  /** POSIX-style path relative to the project root */
  path: string;
  contents: string | Buffer;
  /** octal mode; the writer applies a default when omitted */
  mode?: number;
};

/** Keyed by `GeneratedFile.path`. Later `set()` wins — that is the overlay rule. */
export type FileMap = Map<string, GeneratedFile>;

export function setFile(map: FileMap, file: GeneratedFile): void {
  map.set(file.path, file);
}

/** Shallow-merge `b` onto `a`, returning a new map (b wins on path collisions). */
export function mergeFileMaps(a: FileMap, b: FileMap): FileMap {
  return new Map([...a, ...b]);
}

/** What every composition merger returns: files to add, plus non-fatal notes. */
export type MergeResult = {
  files: GeneratedFile[];
  warnings: string[];
};

/** Fold a list of MergeResults into one FileMap + warning list (later files win). */
export function collectMergeResults(results: MergeResult[]): {
  files: FileMap;
  warnings: string[];
} {
  const files: FileMap = new Map();
  const warnings: string[] = [];
  for (const r of results) {
    for (const f of r.files) files.set(f.path, f);
    warnings.push(...r.warnings);
  }
  return { files, warnings };
}
