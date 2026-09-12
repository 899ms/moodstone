import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import {
  ArrowUpRight,
  Check,
  Copy,
  Moon,
  Shuffle,
  Sun,
} from "lucide-react-native";
import {
  type Cut,
  CUT_KEYS,
  CUT_TUNES,
  CUTS,
  type CutTune,
  isPaletteKey,
  type Mood,
  MOOD_KEYS,
  MOODS,
  Moodstone,
  PALETTE,
  PALETTE_KEYS,
  type PaletteKey,
  randomSeed,
  type Seed,
  SHAPE_DEFAULTS,
  type Tune,
  type TuneKey,
} from "moodstone";
import React, {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Linking,
  Platform,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/* ---------- knobs ---------- */

const pick = <T,>(a: readonly T[]): T =>
  a[Math.floor(Math.random() * a.length)];
const MOOD_SET = new Set<string>(MOOD_KEYS);
const CUT_SET = new Set<string>(CUT_KEYS);

interface Knob {
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}
const one = (v: number) => v.toFixed(1);
const int = (v: number) => String(Math.round(v));
const two = (v: number) => v.toFixed(2);
/** One slider per tunable parameter; each cut shows the ones CUT_TUNES lists for it. */
const KNOBS: Record<TuneKey, Knob> = {
  n: { label: "Squareness", min: 2, max: 16, step: 0.1, fmt: one },
  rot: { label: "Rotation", min: -90, max: 90, step: 1, fmt: int },
  ax: { label: "Width", min: 0.75, max: 1.35, step: 0.01, fmt: two },
  sides: { label: "Sides", min: 3, max: 8, step: 1, fmt: int },
  round: { label: "Roundness", min: 0.05, max: 0.5, step: 0.01, fmt: two },
  lobes: { label: "Lobes", min: 3, max: 16, step: 1, fmt: int },
  depth: { label: "Depth", min: 0.02, max: 0.25, step: 0.005, fmt: two },
  sharp: { label: "Sharpness", min: 0.3, max: 2.5, step: 0.05, fmt: two },
};
const TUNE_KEYS = Object.keys(KNOBS) as TuneKey[];

/**
 * Calls `onParams` with the query params of each deep link, like `exp://host:port/--/?mood=done&cut=burst`, so the app
 * can be driven from a script: first the link that opened the app, then each one opened while it runs.
 */
function useDeepLinkParams(onParams: (params: Record<string, string>) => void) {
  // An effect event, so one subscription lasts the app's lifetime while `onParams` still sees the latest render.
  const handle = useEffectEvent(onParams);
  useEffect(() => {
    const apply = (url: string | null) => {
      if (!url) return;
      const q = url.split("?")[1];
      if (!q) return;
      const out: Record<string, string> = {};
      for (const kv of q.split("&")) {
        const [k, v] = kv.split("=");
        if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
      }
      handle(out);
    };
    Linking.getInitialURL().then(apply);
    const sub = Linking.addEventListener("url", (e) => apply(e.url));
    return () => sub.remove();
  }, []);
}

/* ---------- app ---------- */

export default function App() {
  return (
    <SafeAreaProvider>
      <Studio />
    </SafeAreaProvider>
  );
}

function Studio() {
  const { height, width } = useWindowDimensions();
  // The root skips the bottom safe area and the controls pad for it instead, so they scroll under the home indicator
  // rather than being cut off above it.
  const insets = useSafeAreaInsets();
  const maxStage = Math.max(160, Math.min(240, height - 560));
  // A wide browser window gets the studio side by side. Narrower ones keep the phone layout, in a phone-width column.
  const wide = Platform.OS === "web" && width >= WIDE_MIN;
  const gutter = Platform.OS === "web" ? Math.max(14, (width - 480) / 2) : 14;
  // The wide stage leaves room for the header and the code below the avatar, and for the controls beside it.
  const bigStage = Math.round(
    Math.max(200, Math.min(440, width - 540, height - 420)),
  );

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [color, setColor] = useState<PaletteKey>("pine");
  const [cut, setCut] = useState<Cut>("circle");
  const [seed, setSeed] = useState<Seed | undefined>(undefined);
  const [tune, setTune] = useState<Tune | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [eyes, setEyes] = useState<"white" | "black">("white");
  const [motion, setMotion] = useState<"animated" | "still">("animated");
  const scroller = useRef<ScrollView>(null);
  const [copied, copy] = useCopy();

  const activeColor = PALETTE[color];
  const knobs = CUT_TUNES[cut].map((key) => ({ key, ...KNOBS[key] }));
  const preset = useMemo(
    () => ({ ...SHAPE_DEFAULTS, ...CUTS[cut].shape }),
    [cut],
  );
  const shape = tune ? { ...preset, ...tune } : preset;
  // `cut` is runtime state, so TypeScript can't pair it with `tune`. The sliders only write keys from
  // CUT_TUNES[cut], and the library ignores any others.
  const silhouette = { cut, tune: tune ?? undefined } as CutTune;
  const dark = theme === "dark";
  const c = dark ? DARK : LIGHT;
  const ThemeIcon = dark ? Moon : Sun;
  // Under the mouse (web only), chips and buttons lighten a step.
  const hover = { backgroundColor: c.chipHover };
  // The controls fade out as they scroll up to the stage rather than being sliced by the scroll view's top edge. The
  // fade ends at the background colour with zero alpha, not `transparent` (black at zero alpha), so the light theme
  // doesn't fade through grey.
  const fade = `linear-gradient(${c.bg}, ${c.bg}00)`;
  // react-native-web takes the gradient as the CSS `backgroundImage` and doesn't know React Native's experimental name.
  const fadeStyle: ViewStyle & { backgroundImage?: string } =
    Platform.OS === "web"
      ? { backgroundImage: fade }
      : { experimental_backgroundImage: fade };

  // Selecting a cut returns the knobs to that preset, in the same render so the old tune never reaches the new cut.
  const chooseCut = (k: Cut) => {
    setCut(k);
    setTune(null);
  };

  useDeepLinkParams((params) => {
    if (params.color && isPaletteKey(params.color)) setColor(params.color);
    if (params.cut && CUT_SET.has(params.cut)) chooseCut(params.cut as Cut);
    if (params.mood && MOOD_SET.has(params.mood)) setMood(params.mood as Mood);
    if (params.eyes === "white" || params.eyes === "black")
      setEyes(params.eyes);
    if (params.motion === "animated" || params.motion === "still")
      setMotion(params.motion);
    if (params.theme === "light" || params.theme === "dark")
      setTheme(params.theme);
    const tweak: Tune = {};
    for (const k of TUNE_KEYS)
      if (params[k] !== undefined) tweak[k] = Number(params[k]);
    if (Object.keys(tweak).length) setTune(tweak);
    if (params.scroll === "end")
      setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 150);
    if (params.scroll === "top")
      setTimeout(
        () => scroller.current?.scrollTo({ y: 0, animated: false }),
        150,
      );
  });

  const randomise = () => {
    setSeed(randomSeed());
    setColor(pick(PALETTE_KEYS));
    chooseCut(pick(CUT_KEYS));
    setMood(pick(MOODS).key);
    setEyes(Math.random() < 0.25 ? "black" : "white");
  };

  const ring = (on: boolean) => ({
    borderColor: on ? activeColor : "transparent",
  });
  // The accent is the selected colour, so an accent ring would vanish into the selected swatch. It gets a text-coloured
  // ring with a gap instead; the others fill that space with their own colour.
  const swatch = (k: PaletteKey) =>
    k === color
      ? { borderColor: c.text }
      : { borderColor: "transparent", backgroundColor: PALETTE[k] };

  // The icons ignore touches, so a tap on one lands on its button rather than on the SVG view.
  const themeButton = (
    <HapticPressable
      onPress={() => setTheme(dark ? "light" : "dark")}
      accessibilityLabel="Toggle theme"
      style={[styles.iconButton, { backgroundColor: c.chip }]}
      hoverStyle={hover}
    >
      <ThemeIcon size={18} color={c.muted} pointerEvents="none" />
    </HapticPressable>
  );
  const shuffleButton = (
    <HapticPressable
      onPress={randomise}
      accessibilityLabel="Randomise"
      style={[styles.iconButton, { backgroundColor: c.chip }]}
      hoverStyle={hover}
    >
      <Shuffle size={18} color={c.muted} pointerEvents="none" />
    </HapticPressable>
  );

  const avatar = (size: number) => (
    <Moodstone
      seed={seed}
      color={color}
      {...silhouette}
      mood={mood}
      eyeColor={eyes}
      size={size}
      animated={motion === "animated"}
    />
  );

  const controls = (paddingBottom: number) => (
    <>
      <ScrollView
        ref={scroller}
        contentContainerStyle={[styles.controls, { paddingBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Section label="Mood" c={c}>
          {MOODS.map((m) => (
            <HapticPressable
              key={m.key}
              onPress={() => setMood(m.key)}
              style={[
                styles.chip,
                { backgroundColor: c.chip },
                ring(m.key === mood),
              ]}
              hoverStyle={hover}
            >
              <Text style={[styles.chipText, { color: c.text }]}>
                {m.label}
              </Text>
            </HapticPressable>
          ))}
        </Section>
        <Section label="Motion" c={c}>
          {(["animated", "still"] as const).map((m) => (
            <HapticPressable
              key={m}
              onPress={() => setMotion(m)}
              style={[
                styles.chip,
                { backgroundColor: c.chip },
                ring(m === motion),
              ]}
              hoverStyle={hover}
            >
              <Text style={[styles.chipText, { color: c.text }]}>
                {m === "animated" ? "Animated" : "Still"}
              </Text>
            </HapticPressable>
          ))}
        </Section>
        <Section label="Cut" c={c}>
          {CUT_KEYS.map((k) => (
            <HapticPressable
              key={k}
              onPress={() => chooseCut(k)}
              style={[
                styles.chip,
                { backgroundColor: c.chip },
                ring(k === cut),
              ]}
              hoverStyle={hover}
            >
              <Text style={[styles.chipText, { color: c.text }]}>
                {CUTS[k].label}
              </Text>
            </HapticPressable>
          ))}
        </Section>
        <Section label="Colour" c={c}>
          {PALETTE_KEYS.map((k) => (
            <HapticPressable
              key={k}
              onPress={() => setColor(k)}
              style={[styles.swatch, swatch(k)]}
              hoverStyle={styles.swatchHover}
            >
              <View
                style={[styles.swatchFill, { backgroundColor: PALETTE[k] }]}
              />
            </HapticPressable>
          ))}
        </Section>
        <Section
          label="Tune"
          c={c}
          trailing={
            <HapticPressable
              onPress={() => setTune(null)}
              disabled={!tune}
              style={[
                styles.chip,
                styles.chipSmall,
                { backgroundColor: c.chip, opacity: tune ? 1 : 0.35 },
              ]}
              hoverStyle={tune ? hover : undefined}
            >
              <Text style={[styles.chipText, { color: c.text }]}>Reset</Text>
            </HapticPressable>
          }
          column
        >
          {knobs.map((k) => (
            <View key={k.key} style={styles.knob}>
              <Text style={[styles.knobLabel, { color: c.muted }]}>
                {k.label}
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={k.min}
                maximumValue={k.max}
                step={k.step}
                value={shape[k.key]}
                onValueChange={(v) => setTune({ ...(tune ?? {}), [k.key]: v })}
                minimumTrackTintColor={activeColor}
                maximumTrackTintColor={c.track}
                thumbTintColor="#ffffff"
              />
              <Text style={[styles.knobValue, { color: c.text }]}>
                {k.fmt(shape[k.key])}
              </Text>
            </View>
          ))}
        </Section>
        <Section label="Look" c={c}>
          {(["white", "black"] as const).map((e) => (
            <HapticPressable
              key={e}
              onPress={() => setEyes(e)}
              style={[
                styles.chip,
                { backgroundColor: c.chip },
                ring(e === eyes),
              ]}
              hoverStyle={hover}
            >
              <Text style={[styles.chipText, { color: c.text }]}>
                {e === "white" ? "White eyes" : "Black eyes"}
              </Text>
            </HapticPressable>
          ))}
        </Section>
      </ScrollView>
      <View style={[styles.fade, fadeStyle]} />
    </>
  );

  if (wide) {
    const code = snippetProps({ color, cut, tune, mood, eyes, motion, seed });
    const copyIcon = (key: string) =>
      copied === key ? (
        <Check size={16} color={c.text} pointerEvents="none" />
      ) : (
        <Copy size={16} color={c.muted} pointerEvents="none" />
      );
    const link = (label: string, url: string) => (
      <HapticPressable
        onPress={() => void Linking.openURL(url)}
        accessibilityRole="link"
        style={[styles.link, { backgroundColor: c.chip }]}
        hoverStyle={hover}
      >
        <Text style={[styles.chipText, { color: c.text }]}>{label}</Text>
        <ArrowUpRight size={14} color={c.muted} pointerEvents="none" />
      </HapticPressable>
    );

    return (
      <View style={[styles.wideRoot, { backgroundColor: c.bg }]}>
        {/* header: the logo is a still of the current cut and colour */}
        <View style={styles.wideHeader}>
          <Moodstone
            seed={seed}
            color={color}
            {...silhouette}
            eyeColor={eyes}
            size={32}
            animated={false}
          />
          <View style={styles.brand}>
            <Text style={[styles.wideTitle, { color: c.text }]}>Moodstone</Text>
            <Text style={[styles.tagline, { color: c.muted }]}>
              Animated avatars for AI agents in React Native
            </Text>
          </View>
          <HapticPressable
            onPress={() => copy("install", INSTALL)}
            accessibilityLabel="Copy the install command"
            style={[styles.install, { backgroundColor: c.chip }]}
            hoverStyle={hover}
          >
            <Text style={[styles.installText, { color: c.text }]}>
              {INSTALL}
            </Text>
            {copyIcon("install")}
          </HapticPressable>
          {link("GitHub", REPO_URL)}
          {link("npm", NPM_URL)}
          {themeButton}
          {shuffleButton}
        </View>

        <View style={styles.wideBody}>
          {/* stage, with the code for the avatar it shows */}
          <View style={[styles.wideStage, { backgroundColor: c.panel }]}>
            <View style={styles.wideAvatar}>{avatar(bigStage)}</View>
            <View style={[styles.snippet, { backgroundColor: c.bg }]}>
              <Snippet props={code} c={c} />
              <HapticPressable
                onPress={() => copy("code", snippetText(code))}
                accessibilityLabel="Copy the code"
                style={[styles.iconButton, { backgroundColor: c.chip }]}
                hoverStyle={hover}
              >
                {copyIcon("code")}
              </HapticPressable>
            </View>
          </View>

          {/* controls */}
          <View style={styles.wideControls}>{controls(28)}</View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[
        styles.root,
        { backgroundColor: c.bg, paddingHorizontal: gutter },
      ]}
    >
      <StatusBar style={dark ? "light" : "dark"} />

      {/* header */}
      <View style={styles.header}>
        {themeButton}
        <Text style={[styles.title, { color: c.text }]}>Moodstone</Text>
        {shuffleButton}
      </View>

      {/* stage */}
      <View
        style={[
          styles.stage,
          { height: maxStage + 16, backgroundColor: c.panel },
        ]}
      >
        {avatar(maxStage)}
      </View>

      {/* controls */}
      <View style={styles.controlsFrame}>{controls(40 + insets.bottom)}</View>
    </SafeAreaView>
  );
}

function Section({
  label,
  children,
  c,
  trailing,
  column = false,
}: {
  label: string;
  children: React.ReactNode;
  c: typeof DARK;
  trailing?: React.ReactNode;
  column?: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionLabel, { color: c.muted }]}>{label}</Text>
        {trailing}
      </View>
      <View style={column ? styles.column : styles.wrapRow}>{children}</View>
    </View>
  );
}

/**
 * Pressable for the page's buttons and toggles: it dims to half opacity while held and plays a light haptic on press.
 * On web, `hoverStyle` applies while the mouse is over it.
 */
function HapticPressable({
  onPress,
  style,
  hoverStyle,
  ...props
}: Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      {...props}
      onPress={(e) => {
        // On press rather than press-in, so starting a scroll on a chip doesn't buzz.
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
          () => undefined,
        );
        onPress?.(e);
      }}
      style={(state) => {
        // react-native-web also reports `hovered`, which React Native's types leave out.
        const { pressed, hovered } = state as typeof state & {
          hovered?: boolean;
        };
        return [style, hovered && hoverStyle, pressed && styles.pressed];
      }}
    />
  );
}

/* ---------- web ---------- */

/** The narrowest browser window that gets the side-by-side studio. */
const WIDE_MIN = 960;
/** Longest snippet kept on one line; longer ones put each prop on its own line. */
const SNIPPET_LINE = 64;
const INSTALL = "npm install moodstone";
const REPO_URL = "https://github.com/karacca/moodstone";
const NPM_URL = "https://www.npmjs.com/package/moodstone";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

type Prop = [name: string, value: string];

/**
 * The props of the avatar on the stage, as source code. Colour, cut and mood always show; tune, eyes, motion and seed
 * only when they differ from the defaults. The seed is rounded to two decimals, a difference too small to see.
 */
function snippetProps(p: {
  color: PaletteKey;
  cut: Cut;
  tune: Tune | null;
  mood: Mood;
  eyes: "white" | "black";
  motion: "animated" | "still";
  seed: Seed | undefined;
}): Prop[] {
  const props: Prop[] = [
    ["color", `"${p.color}"`],
    ["cut", `"${p.cut}"`],
  ];
  const tuned: string[] = [];
  for (const k of CUT_TUNES[p.cut]) {
    const v = p.tune?.[k];
    if (v !== undefined) tuned.push(`${k}: ${Number(KNOBS[k].fmt(v))}`);
  }
  if (tuned.length) props.push(["tune", `{{ ${tuned.join(", ")} }}`]);
  props.push(["mood", `"${p.mood}"`]);
  if (p.eyes === "black") props.push(["eyeColor", '"black"']);
  if (p.motion === "still") props.push(["animated", "{false}"]);
  if (p.seed)
    props.push(["seed", `{[${p.seed.map((n) => n.toFixed(2)).join(", ")}]}`]);
  return props;
}

function snippetText(props: Prop[]) {
  const inline = `<Moodstone ${props.map(([k, v]) => `${k}=${v}`).join(" ")} />`;
  if (inline.length <= SNIPPET_LINE) return inline;
  return `<Moodstone\n${props.map(([k, v]) => `  ${k}=${v}`).join("\n")}\n/>`;
}

/** The snippet as text, with the component name and the values in the text colour and the rest muted. */
function Snippet({ props, c }: { props: Prop[]; c: typeof DARK }) {
  const multiline = snippetText(props).includes("\n");
  return (
    <Text style={[styles.code, { color: c.muted }]}>
      {"<"}
      <Text style={[styles.codeTag, { color: c.text }]}>Moodstone</Text>
      {props.map(([k, v]) => (
        <React.Fragment key={k}>
          {multiline ? "\n  " : " "}
          {k}=<Text style={{ color: c.text }}>{v}</Text>
        </React.Fragment>
      ))}
      {multiline ? "\n/>" : " />"}
    </Text>
  );
}

/** Copies text to the clipboard and remembers which button did it for a moment, so that button can show a tick. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copy = (key: string, text: string) => {
    // `navigator.clipboard` is only there on secure pages: https and localhost, not a LAN address.
    void navigator.clipboard?.writeText(text).then(
      () => {
        clearTimeout(timer.current);
        setCopied(key);
        timer.current = setTimeout(() => setCopied(null), 1500);
      },
      () => undefined,
    );
  };
  return [copied, copy] as const;
}

const DARK = {
  bg: "#0b0e10",
  panel: "#141a1d",
  chip: "#1b2327",
  chipHover: "#243035",
  track: "#2a353a",
  text: "#eef2f3",
  muted: "#7d8a8f",
};
const LIGHT = {
  bg: "#f3f4f5",
  panel: "#ffffff",
  chip: "#e6eaec",
  chipHover: "#dae0e3",
  track: "#d3d9dc",
  text: "#1a2023",
  muted: "#6d7a7f",
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, height: 40 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  stage: {
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  controlsFrame: { flex: 1 },
  controls: { paddingTop: 22, gap: 22 },
  // As tall as the controls' top padding, so the first label only reaches it once scrolled.
  fade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    pointerEvents: "none",
  },
  section: { gap: 10 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  column: { gap: 10 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 2,
    padding: 2,
  },
  swatchFill: { flex: 1, borderRadius: 6 },
  swatchHover: { transform: [{ scale: 1.1 }] },
  knob: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34 },
  knobLabel: { width: 84, fontSize: 13 },
  slider: { flex: 1, height: 34 },
  knobValue: {
    width: 44,
    fontSize: 13,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  chip: {
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  chipSmall: { height: 28, paddingHorizontal: 10 },
  chipText: { fontSize: 13, fontWeight: "600" },
  pressed: { opacity: 0.5 },

  // The wide studio (web).
  wideRoot: { flex: 1, paddingHorizontal: 28 },
  wideHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 76,
  },
  brand: { flex: 1, marginLeft: 4, gap: 2 },
  wideTitle: { fontSize: 18, fontWeight: "700", letterSpacing: 0.2 },
  tagline: { fontSize: 13 },
  install: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 32,
    borderRadius: 9,
    paddingHorizontal: 12,
  },
  installText: { fontFamily: MONO, fontSize: 12.5 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    borderRadius: 9,
    paddingHorizontal: 12,
  },
  wideBody: { flex: 1, flexDirection: "row", gap: 28, paddingBottom: 28 },
  wideStage: { flex: 1, borderRadius: 28, padding: 24, gap: 24 },
  wideAvatar: { flex: 1, alignItems: "center", justifyContent: "center" },
  snippet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    padding: 12,
    paddingLeft: 20,
  },
  // Padded so a one-line snippet sits level with the 32 px copy button.
  code: {
    flex: 1,
    fontFamily: MONO,
    fontSize: 13,
    lineHeight: 21,
    paddingVertical: 5.5,
  },
  codeTag: { fontWeight: "700" },
  wideControls: { width: 400 },
});
