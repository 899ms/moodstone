/**
 * Export avatars as SVG files, straight from the library source:
 *
 *   npm run export-svg -- --mood thinking --cut hexagon --color sky
 *   npm run export-svg -- --mood all --animated --out ~/Desktop/moodstone
 *
 * `--help` lists every option. Needs Node 22.18 or later, which runs TypeScript as is.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  computeFrame,
  CUT_KEYS,
  CUT_TUNES,
  DEFAULT_SEED,
  EYE_BLACK,
  EYE_WHITE,
  isPaletteKey,
  loopLength,
  MOOD_KEYS,
  PALETTE_KEYS,
  randomSeed,
  resolveColor,
  resolveSpec,
  stillFrame,
  tunedShape,
} from "../src/core";
import { renderAnimatedAvatarSvg, renderAvatarSvg } from "../src/svg";

import type { Cut, Mood, Seed, Tune, TuneKey } from "../src/core";

/** Every parameter some cut exposes for tuning, as flags named like the example's deep-link parameters. */
const TUNE_KEYS = [...new Set(Object.values(CUT_TUNES).flat())] as TuneKey[];

const USAGE = `Export Moodstone avatars as SVG files.

Usage: npm run export-svg -- [options]

  --color <c>       ${PALETTE_KEYS.join(", ")}, or a hex colour. Default pine.
  --cut <cut>       ${CUT_KEYS.join(", ")}. Default circle.
  --mood <mood>     ${MOOD_KEYS.join(", ")}. Default idle.
  --eyes <c>        white, black or a hex colour. Default white.
  --animated        The mood's whole loop as an animated SVG, instead of a still.
  --phase <0..1>    Loop position of a still. Default: the mood's key pose.
  --seed <a,b,c>    Light start angle, drift and orbit, each in 0..2π, or "random". Default DEFAULT_SEED.
  --size <px>       Width and height. Default 240.
  --background <c>  Solid background. Default transparent.
  --fps <n>         Samples per second of an animated loop. Default 24.
  --out <path>      Output directory, or a .svg file for a single avatar. Default ./avatars.
  --${TUNE_KEYS.join(" --")} <v>
                    Tune the cut. Each cut takes the parameters it exposes (CUT_TUNES) and ignores the rest.

--color, --cut and --mood take a comma-separated list or "all", and every combination is exported.
Quote hex colours ('#1f8a70') or leave off the "#".`;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function fail(message: string): never {
  console.error(`${message}\nRun with --help to see the options.`);
  process.exit(1);
}

function parse() {
  try {
    return parseArgs({
      options: {
        color: { type: "string", default: "pine" },
        cut: { type: "string", default: "circle" },
        mood: { type: "string", default: "idle" },
        eyes: { type: "string", default: "white" },
        animated: { type: "boolean", default: false },
        phase: { type: "string" },
        seed: { type: "string" },
        size: { type: "string", default: "240" },
        background: { type: "string" },
        fps: { type: "string", default: "24" },
        out: { type: "string", default: "avatars" },
        help: { type: "boolean", short: "h", default: false },
        ...(Object.fromEntries(
          TUNE_KEYS.map((k) => [k, { type: "string" }]),
        ) as Record<TuneKey, { type: "string" }>),
      },
    }).values;
  } catch (err) {
    return fail((err as Error).message);
  }
}

/** `c` as a hex colour with its "#", or undefined when it isn't one. */
function hexColor(c: string): string | undefined {
  return HEX.test(c) ? (c.startsWith("#") ? c : "#" + c) : undefined;
}

function num(flag: string, arg: string): number {
  const v = Number(arg);
  if (arg.trim() === "" || !Number.isFinite(v))
    fail(`--${flag} takes a number, not "${arg}".`);
  return v;
}

/** A comma-separated list, or every option for "all". */
function list(
  flag: string,
  arg: string,
  options: readonly string[],
  valid = (v: string) => options.includes(v),
): string[] {
  const items =
    arg === "all" ? [...options] : arg.split(",").map((v) => v.trim());
  for (const v of items)
    if (!valid(v))
      fail(`Unknown --${flag} "${v}". Options: ${options.join(", ")}.`);
  return items;
}

/** The seed for each avatar: one fixed seed, or a fresh one each for "random". */
function seeds(arg: string | undefined): () => Seed {
  if (arg === undefined) return () => DEFAULT_SEED;
  if (arg === "random") return randomSeed;
  const parts = arg.split(",").map((v) => num("seed", v));
  if (parts.length !== 3)
    fail(`--seed takes three comma-separated numbers or "random".`);
  const seed = parts as [number, number, number];
  return () => seed;
}

const args = parse();
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const colors = list(
  "color",
  args.color,
  PALETTE_KEYS,
  (c) => isPaletteKey(c) || hexColor(c) !== undefined,
);
const cuts = list("cut", args.cut, CUT_KEYS) as Cut[];
const moods = list("mood", args.mood, MOOD_KEYS) as Mood[];
const eyeColor =
  args.eyes === "white"
    ? EYE_WHITE
    : args.eyes === "black"
      ? EYE_BLACK
      : (hexColor(args.eyes) ??
        fail(`--eyes takes white, black or a hex colour, not "${args.eyes}".`));
const tune: Tune = {};
for (const k of TUNE_KEYS) {
  const v = args[k];
  if (v !== undefined) tune[k] = num(k, v);
}
const tuned = Object.keys(tune).length > 0;
const nextSeed = seeds(args.seed);
const size = num("size", args.size);
const fps = num("fps", args.fps);
const phase = args.phase === undefined ? undefined : num("phase", args.phase);
const background =
  args.background && (hexColor(args.background) ?? args.background);
if (phase !== undefined && args.animated)
  fail("--phase picks a still's frame; an animated SVG plays the whole loop.");

// npm runs scripts from the package root. INIT_CWD is where it was invoked, so relative paths mean what was typed.
const cwd = process.env.INIT_CWD ?? process.cwd();
const out = resolve(cwd, args.out);
const toFile = extname(out).toLowerCase() === ".svg";
const count = colors.length * cuts.length * moods.length;
if (toFile && count > 1)
  fail(`--out names one file, but these options make ${count} avatars.`);
mkdirSync(toFile ? dirname(out) : out, { recursive: true });

for (const color of colors)
  for (const cut of cuts)
    for (const mood of moods) {
      const seed = nextSeed();
      const spec = resolveSpec({
        seed,
        color: resolveColor(hexColor(color) ?? color),
        cut,
        mood,
        eyeColor,
        shape: tuned ? tunedShape(cut, tune) : undefined,
      });
      const svg = args.animated
        ? renderAnimatedAvatarSvg(spec, { size, fps, background })
        : renderAvatarSvg(
            spec,
            phase === undefined
              ? stillFrame(spec)
              : computeFrame(spec, phase * loopLength(mood)),
            { size, background },
          );
      const name = `${mood}-${cut}-${color.replace("#", "").toLowerCase()}${args.animated ? "-animated" : ""}.svg`;
      const file = toFile ? out : join(out, name);
      writeFileSync(file, svg);
      const shown = relative(cwd, file);
      console.log(
        (shown.startsWith("..") ? file : shown) +
          (args.seed === "random"
            ? `  seed ${seed.map((v) => +v.toFixed(4)).join(",")}`
            : ""),
      );
    }
