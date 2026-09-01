import pc from "picocolors";

export type Logger = {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  step(msg: string): void;
};

export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(`${pc.yellow("!")} ${m}`),
  error: (m) => console.error(`${pc.red("✖")} ${m}`),
  success: (m) => console.log(`${pc.green("✓")} ${m}`),
  step: (m) => console.log(`${pc.cyan("→")} ${m}`),
};

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
  step: () => {},
};
