#!/usr/bin/env node
// Thin shim: the real CLI lives in dist/cli.js (build with `npm run build`).
import("../dist/cli.js").catch((err) => {
  if (err && err.code === "ERR_MODULE_NOT_FOUND") {
    console.error(
      "create-app: build output missing. Run `npm run build` first (or `npm run dev` from source).",
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
