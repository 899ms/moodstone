// Lets Node run the library's TypeScript source as is, for the scripts in this folder. Node strips the types itself
// (22.18+), but unlike Metro and tsc it won't resolve the extensionless and directory imports `src` uses.
import { registerHooks } from "node:module";

/** Endings to try, in order, for a relative import that doesn't resolve as written. */
const ENDINGS = [".ts", "/index.ts"];

function resolveTs(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith(".")) throw err;
    for (const ending of ENDINGS) {
      try {
        return nextResolve(specifier + ending, context);
      } catch {
        // Try the next ending.
      }
    }
    throw err;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = resolveTs(specifier, context, nextResolve);
    // The package has no "type" field, so name the format rather than have Node detect it and warn for every file.
    return resolved.url.endsWith(".ts")
      ? { ...resolved, format: "module-typescript" }
      : resolved;
  },
});
