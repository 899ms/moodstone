/**
 * Regenerate the avatars the README shows, in assets/:
 *
 *   npm run avatars
 *
 * Every `assets/<mood>-<cut>-<color>-<still|animated>.svg` that README.md links is exported again through
 * export-svg, and every other avatar SVG in assets/ is deleted, so a preview added to the README appears and one removed goes.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/** A file name export-svg gives an avatar. */
const AVATAR = "[a-z]+-[a-z]+-[0-9a-z]+-(?:still|animated)\\.svg";

// npm runs scripts from the package root, wherever it was invoked.
const root = process.cwd();
const assets = resolve(root, "assets");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const links = new Set(readme.match(new RegExp(`assets/${AVATAR}`, "g")));

const isAvatar = new RegExp(`^${AVATAR}$`);
for (const file of readdirSync(assets))
  if (isAvatar.test(file)) rmSync(resolve(assets, file));

for (const link of links) {
  const [mood, cut, color, kind] = link
    .slice("assets/".length, -".svg".length)
    .split("-");
  execFileSync(
    process.execPath,
    [
      ...process.execArgv, // The TypeScript loader this script runs under.
      "scripts/export-svg.ts",
      ...["--mood", mood, "--cut", cut, "--color", color],
      ...(kind === "animated" ? ["--animated"] : []),
      // Absolute, because export-svg resolves --out against INIT_CWD, where npm was invoked.
      ...["--out", resolve(root, link)],
    ],
    { stdio: "inherit" },
  );
}
