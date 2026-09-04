import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateProject } from "../src/generate.js";
import { createRegistry } from "../src/registry.js";
import { resolveConfig } from "../src/config/resolve.js";
import { silentLogger } from "../src/util/logger.js";
import { makeTmpDir } from "./helpers/tmp.js";

let tmp: Awaited<ReturnType<typeof makeTmpDir>>;
beforeEach(async () => {
  tmp = await makeTmpDir();
});
afterEach(() => tmp.cleanup());

const read = (projectDir: string, rel: string) => readFile(join(projectDir, rel), "utf8");

describe("generateProject (v1 slice, no install/git)", () => {
  it("produces the expected file tree and composed artifacts", async () => {
    const config = resolveConfig({
      flags: {
        name: "voting-app",
        backend: "nestjs",
        database: "postgres",
        cache: "redis",
        docker: true,
        packageManager: "npm",
        install: false,
        git: false,
      },
    });

    const result = await generateProject({
      config,
      run: { targetDir: tmp.dir, cwd: tmp.dir, dryRun: false, force: false },
      registry: createRegistry(),
      logger: silentLogger,
    });

    expect(result.warnings).toEqual([]);
    expect(result.files).toMatchSnapshot("file tree");
    expect(result.nextSteps).toEqual(["cd voting-app", "npm install", "docker compose up -d", "npm run start:dev"]);

    expect(await read(result.projectDir, "docker-compose.yml")).toMatchSnapshot("docker-compose.yml");
    expect(await read(result.projectDir, "package.json")).toMatchSnapshot("package.json");
    expect(await read(result.projectDir, ".env")).toMatchSnapshot(".env");
    expect(await read(result.projectDir, "Dockerfile")).toMatchSnapshot("Dockerfile");
    expect(await read(result.projectDir, "src/app.module.ts")).toMatchSnapshot("src/app.module.ts");
    expect(await read(result.projectDir, "README.md")).toMatchSnapshot("README.md");
  });

  it("produces the expected file tree and artifacts for a RabbitMQ stack", async () => {
    const config = resolveConfig({
      flags: {
        name: "worker-app",
        backend: "nestjs",
        database: "none",
        cache: "none",
        queue: "rabbitmq",
        docker: true,
        packageManager: "npm",
        install: false,
        git: false,
      },
    });

    const result = await generateProject({
      config,
      run: { targetDir: tmp.dir, cwd: tmp.dir, dryRun: false, force: false },
      registry: createRegistry(),
      logger: silentLogger,
    });

    expect(result.warnings).toEqual([]);
    expect(result.files).toContain("src/rabbitmq/rabbitmq.module.ts");
    expect(result.files).toContain("src/rabbitmq/rabbitmq.service.ts");

    expect(await read(result.projectDir, "docker-compose.yml")).toMatchSnapshot("docker-compose.yml");
    expect(await read(result.projectDir, "package.json")).toMatchSnapshot("package.json");
    expect(await read(result.projectDir, ".env")).toMatchSnapshot(".env");
    expect(await read(result.projectDir, "src/app.module.ts")).toMatchSnapshot("src/app.module.ts");
  });

  it("produces the expected file tree and artifacts for a Next.js + Mongo stack", async () => {
    const config = resolveConfig({
      flags: {
        name: "web-app",
        backend: "nextjs",
        database: "mongodb",
        cache: "redis",
        docker: true,
        packageManager: "pnpm",
        install: false,
        git: false,
      },
    });

    const result = await generateProject({
      config,
      run: { targetDir: tmp.dir, cwd: tmp.dir, dryRun: false, force: false },
      registry: createRegistry(),
      logger: silentLogger,
    });

    expect(result.warnings).toEqual([]);
    expect(result.files).toMatchSnapshot("file tree");
    // no Nest-shaped files leaked in
    expect(result.files).not.toContain("src/app.module.ts");
    expect(result.files.some((f) => f.startsWith("src/redis/"))).toBe(false);
    expect(result.files).toContain("src/lib/db.ts");
    expect(result.files).toContain("src/lib/redis.ts");

    expect(await read(result.projectDir, "package.json")).toMatchSnapshot("package.json");
    expect(await read(result.projectDir, "Dockerfile")).toMatchSnapshot("Dockerfile");
    expect(await read(result.projectDir, "src/lib/db.ts")).toMatchSnapshot("src/lib/db.ts");
    expect(await read(result.projectDir, "docker-compose.yml")).toMatchSnapshot("docker-compose.yml");
  });

  it("omits database/cache wiring when neither is selected", async () => {
    const config = resolveConfig({
      flags: {
        name: "bare-api",
        backend: "nestjs",
        database: "none",
        cache: "none",
        queue: "none",
        docker: false,
        install: false,
        git: false,
      },
    });

    const result = await generateProject({
      config,
      run: { targetDir: tmp.dir, cwd: tmp.dir, dryRun: false, force: false },
      registry: createRegistry(),
      logger: silentLogger,
    });

    expect(result.files).not.toContain("docker-compose.yml");
    expect(result.files).not.toContain("Dockerfile");
    expect(result.files).not.toContain("src/redis/redis.module.ts");
    expect(result.files).not.toContain("src/rabbitmq/rabbitmq.module.ts");
    const appModule = await read(result.projectDir, "src/app.module.ts");
    expect(appModule).not.toContain("TypeOrmModule");
    expect(appModule).not.toContain("RedisModule");
    expect(appModule).not.toContain("RabbitmqModule");
  });

  it("refuses to overwrite an existing directory without --force", async () => {
    const config = resolveConfig({
      flags: { name: "dup", backend: "nestjs", install: false, git: false, docker: false },
    });
    const run = { targetDir: tmp.dir, dryRun: false, force: false };
    await generateProject({ config, run, registry: createRegistry(), logger: silentLogger });
    await expect(
      generateProject({ config, run, registry: createRegistry(), logger: silentLogger }),
    ).rejects.toThrowError(/already exists/);
  });

  it("creates a missing target directory and reports a nested location", async () => {
    const config = resolveConfig({
      flags: { name: "api", backend: "nestjs", install: false, git: false, docker: false },
    });
    const nested = join(tmp.dir, "does", "not", "exist", "yet");
    const result = await generateProject({
      config,
      run: { targetDir: nested, cwd: tmp.dir, dryRun: false, force: false },
      registry: createRegistry(),
      logger: silentLogger,
    });

    expect(result.projectDir).toBe(join(nested, "api"));
    expect(result.location).toBe(join("does", "not", "exist", "yet", "api"));
    expect(result.nextSteps[0]).toBe(`cd ${join("does", "not", "exist", "yet", "api")}`);
    expect(await read(result.projectDir, "package.json")).toContain('"name": "api"');
  });

  it("dry-run reports the plan without writing files", async () => {
    const config = resolveConfig({
      flags: { name: "planned", backend: "nestjs", install: false, git: false, docker: false },
    });
    const result = await generateProject({
      config,
      run: { targetDir: tmp.dir, cwd: tmp.dir, dryRun: true, force: false },
      registry: createRegistry(),
      logger: silentLogger,
    });
    expect(result.dryRun).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
    await expect(read(result.projectDir, "package.json")).rejects.toThrow();
  });
});
