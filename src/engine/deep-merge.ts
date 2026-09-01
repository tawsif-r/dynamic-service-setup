type Json = unknown;

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Recursive merge tuned for compose fragments:
 *   - plain objects merge key-by-key
 *   - arrays concatenate, then de-duplicate primitives (order preserved)
 *   - anything else: `b` replaces `a`
 * Neither input is mutated.
 */
export function deepMerge<T extends Json>(a: T, b: T): T {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: Json[] = [...a];
    for (const item of b) {
      const isPrimitive = item === null || typeof item !== "object";
      if (isPrimitive && out.includes(item)) continue;
      out.push(item);
    }
    return out as T;
  }
  if (isObject(a) && isObject(b)) {
    const out: Record<string, Json> = { ...a };
    for (const [key, bv] of Object.entries(b)) {
      out[key] = key in out ? deepMerge(out[key], bv) : bv;
    }
    return out as T;
  }
  return b;
}

/** Return a shallow copy of `obj` with keys sorted alphabetically. */
export function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  ) as T;
}
