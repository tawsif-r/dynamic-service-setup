import type { ProjectConfig } from "./config/schema.js";
import { builtinComponents } from "./components/index.js";
import type { Component, ComponentCategory } from "./components/types.js";

/** Order selected components are returned in — base layers first. */
const CATEGORY_ORDER: ComponentCategory[] = [
  "backend",
  "database",
  "cache",
  "infra",
  "tooling",
  "vcs",
];

export class Registry {
  private readonly byId = new Map<string, Component>();

  constructor(components: readonly Component[]) {
    for (const c of components) {
      if (this.byId.has(c.id)) {
        throw new Error(`duplicate component id: "${c.id}"`);
      }
      this.byId.set(c.id, c);
    }
  }

  get(id: string): Component | undefined {
    return this.byId.get(id);
  }

  all(): Component[] {
    return [...this.byId.values()];
  }

  /** Available (non-stub) components in a category, id-sorted — for prompt menus. */
  choicesFor(category: ComponentCategory): Component[] {
    return this.all()
      .filter((c) => c.category === category)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private demand(id: string, role: string): Component {
    const c = this.byId.get(id);
    if (!c) {
      const known = this.all()
        .map((x) => x.id)
        .sort()
        .join(", ");
      throw new Error(`unknown ${role} "${id}". Known ids: ${known}`);
    }
    if (c.unavailable) {
      throw new Error(`${role} "${id}" is not available yet: ${c.unavailable}`);
    }
    return c;
  }

  /**
   * Resolve the ordered set of components a config selects: the backend, a
   * database and cache unless "none", each tooling id, plus the implied infra
   * (`docker` + `docker-compose` when `config.docker`) and `git` when enabled.
   */
  select(config: ProjectConfig): Component[] {
    const picked = new Map<string, Component>();
    const add = (c: Component) => picked.set(c.id, c);

    add(this.demand(config.backend, "backend"));

    if (config.database && config.database !== "none") {
      add(this.demand(config.database, "database"));
    }
    if (config.cache && config.cache !== "none") {
      add(this.demand(config.cache, "cache"));
    }
    for (const tool of config.tooling) {
      add(this.demand(tool, "tooling component"));
    }
    if (config.docker) {
      add(this.demand("docker", "infra component"));
      add(this.demand("docker-compose", "infra component"));
    }
    if (config.git) {
      add(this.demand("git", "vcs component"));
    }

    return [...picked.values()].sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
        a.id.localeCompare(b.id),
    );
  }
}

/** Registry over the built-in components (optionally extended with more). */
export function createRegistry(extra: readonly Component[] = []): Registry {
  return new Registry([...builtinComponents, ...extra]);
}
