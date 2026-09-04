import type { ProjectConfig } from "../config/schema.js";
import type { Component } from "../components/types.js";

export type ValidationResult = {
  errors: string[];
  warnings: string[];
};

/** Capabilities that at most one selected component may provide. */
const EXCLUSIVE_CAPABILITIES = new Set([
  "sql-db",
  "document-db",
  "primary-datastore",
]);

/**
 * Check a resolved selection for internal consistency: `requires` / `conflicts`
 * (each token may be a component id or a `provides` capability tag), duplicate
 * exclusive capabilities, and a few cross-cutting rules. Pure — returns lists,
 * writes nothing.
 */
export function validateSelection(
  config: ProjectConfig,
  selected: Component[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ids = new Set(selected.map((c) => c.id));
  const capabilityProviders = new Map<string, string[]>();
  for (const c of selected) {
    for (const cap of c.provides ?? []) {
      capabilityProviders.set(cap, [...(capabilityProviders.get(cap) ?? []), c.id]);
    }
  }
  const satisfied = (token: string) => ids.has(token) || capabilityProviders.has(token);

  for (const c of selected) {
    for (const req of c.requires ?? []) {
      if (!satisfied(req)) {
        errors.push(`"${c.id}" requires "${req}", which is not part of this selection.`);
      }
    }
    for (const con of c.conflicts ?? []) {
      if (satisfied(con)) {
        errors.push(`"${c.id}" conflicts with "${con}", which is also selected.`);
      }
    }
  }

  for (const [cap, providers] of capabilityProviders) {
    if (EXCLUSIVE_CAPABILITIES.has(cap) && providers.length > 1) {
      errors.push(
        `capability "${cap}" is provided by more than one component: ${providers.join(", ")}.`,
      );
    }
  }

  if (config.cache === "redis" && !config.docker && !config.externalRedis) {
    errors.push(
      "cache 'redis' has nowhere to run: enable --docker, or pass --external-redis if you host Redis yourself.",
    );
  }

  if (config.queue === "rabbitmq" && !config.docker && !config.externalRabbitmq) {
    errors.push(
      "queue 'rabbitmq' has nowhere to run: enable --docker, or pass --external-rabbitmq if you host RabbitMQ yourself.",
    );
  }

  if (ids.has("docker-compose") && !ids.has("docker")) {
    errors.push("'docker-compose' requires the 'docker' component.");
  }

  const backend = selected.find((c) => c.category === "backend");
  if (!backend) {
    errors.push("no backend component is selected.");
  } else if (backend.runtime === "dotnet") {
    warnings.push(
      `package manager '${config.packageManager}' is ignored for the dotnet backend '${backend.id}'.`,
    );
  }

  return { errors, warnings };
}

/** Throw a combined error if invalid; otherwise return the (non-fatal) warnings. */
export function assertValid(config: ProjectConfig, selected: Component[]): string[] {
  const { errors, warnings } = validateSelection(config, selected);
  if (errors.length > 0) {
    throw new Error(
      `Configuration is not valid:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
  return warnings;
}
