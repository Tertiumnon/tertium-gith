import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Finds the package.json of gith by walking up from this file. It works from the source tree and
// from the built bin/gith.js alike.
export function packageJsonPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, "package.json");
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, "utf8")) as {
        name?: string;
      };
      if (pkg.name === "@tertium/gith") return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("gith package.json not found");
    dir = parent;
  }
}
