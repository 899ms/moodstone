import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Slider from '@react-native-community/slider';
import {
  CUTS,
  CUT_KEYS,
  CUT_TUNES,
  MOODS,
  MOOD_KEYS,
  Moodstone,
  PALETTE,
  PALETTE_KEYS,
  SHAPE_DEFAULTS,
  isPaletteKey,
  randomSeed,
  type Cut,
  type CutTune,
  type Mood,
  type PaletteKey,
  type Seed,
  type Tune,
  type TuneKey,
} from 'moodstone';

/* ---------- knobs ---------- */

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
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
  n: { label: 'Squareness', min: 2, max: 16, step: 0.1, fmt: one },
  rot: { label: 'Rotation', min: -90, max: 90, step: 1, fmt: int },
  ax: { label: 'Width', min: 0.75, max: 1.35, step: 0.01, fmt: two },
  sides: { label: 'Sides', min: 3, max: 8, step: 1, fmt: int },
  round: { label: 'Roundness', min: 0.05, max: 0.5, step: 0.01, fmt: two },
  lobes: { label: 'Lobes', min: 3, max: 16, step: 1, fmt: int },
  depth: { label: 'Depth', min: 0.02, max: 0.25, step: 0.005, fmt: two },
  sharp: { label: 'Sharpness', min: 0.3, max: 2.5, step: 0.05, fmt: two },
};
const TUNE_KEYS = Object.keys(KNOBS) as TuneKey[];

/** Query params from `exp://host:port/--/?mood=done&cut=burst` so the app can be driven from a script. */
function useDeepLinkParams(): Record<string, string> {
  const [params, setParams] = useState<Record<string, string>>({});
  useEffect(() => {
    const apply = (url: string | null) => {
      if (!url) return;
      const q = url.split('?')[1];
      if (!q) return;
      const out: Record<string, string> = {};
      for (const kv of q.split('&')) {
        const [k, v] = kv.split('=');
        if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      }
      out._t = String(Date.now());
      setParams(out);
    };
    Linking.getInitialURL().then(apply);
    const sub = Linking.addEventListener('url', (e) => apply(e.url));
    return () => sub.remove();
  }, []);
  return params;
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
  const params = useDeepLinkParams();
  const { height } = useWindowDimensions();
  const maxStage = Math.max(160, Math.min(240, height - 560));

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [color, setColor] = useState<PaletteKey>('pine');
  const [cut, setCut] = useState<Cut>('circle');
  const [seed, setSeed] = useState<Seed | undefined>(undefined);
  const [tune, setTune] = useState<Tune | null>(null);
  const [mood, setMood] = useState<Mood>('idle');
  const [eyes, setEyes] = useState<'white' | 'black'>('white');
  const scroller = useRef<ScrollView>(null);

  const activeColor = PALETTE[color];
  const knobs = CUT_TUNES[cut].map((key) => ({ key, ...KNOBS[key] }));
  const preset = useMemo(() => ({ ...SHAPE_DEFAULTS, ...CUTS[cut].shape }), [cut]);
  const shape = tune ? { ...preset, ...tune } : preset;
  // `cut` is runtime state, so TypeScript can't pair it with `tune`. The sliders only write keys from
  // CUT_TUNES[cut], and the library ignores any others.
  const silhouette = { cut, tune: tune ?? undefined } as CutTune;
  const dark = theme === 'dark';
  const c = dark ? DARK : LIGHT;

  // Selecting a cut returns the knobs to that preset, in the same render so the old tune never reaches the new cut.
  const chooseCut = (k: Cut) => {
    setCut(k);
    setTune(null);
  };

  useEffect(() => {
    if (params.color && isPaletteKey(params.color)) setColor(params.color);
    if (params.cut && CUT_SET.has(params.cut)) chooseCut(params.cut as Cut);
    if (params.mood && MOOD_SET.has(params.mood)) setMood(params.mood as Mood);
    if (params.eyes === 'white' || params.eyes === 'black') setEyes(params.eyes);
    if (params.theme === 'light' || params.theme === 'dark') setTheme(params.theme);
    const tweak: Tune = {};
    for (const k of TUNE_KEYS) if (params[k] !== undefined) tweak[k] = Number(params[k]);
    if (Object.keys(tweak).length) setTune(tweak);
    if (params.scroll === 'end') setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 150);
    if (params.scroll === 'top') setTimeout(() => scroller.current?.scrollTo({ y: 0, animated: false }), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const randomise = () => {
    setSeed(randomSeed());
    setColor(pick(PALETTE_KEYS));
    chooseCut(pick(CUT_KEYS));
    setMood(pick(MOODS).key);
    setEyes(Math.random() < 0.25 ? 'black' : 'white');
  };

  const ring = (on: boolean) => ({ borderColor: on ? activeColor : 'transparent' });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />

      {/* header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>Moodstone</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setTheme(dark ? 'light' : 'dark')} style={[styles.iconButton, { backgroundColor: c.chip }]}>
          <Text style={[styles.icon, { color: c.muted }]}>{dark ? '☾' : '☀'}</Text>
        </Pressable>
        <Pressable onPress={randomise} style={[styles.pill, { backgroundColor: activeColor }]}>
          <Text style={styles.pillText}>Randomise</Text>
        </Pressable>
      </View>

      {/* stage */}
      <View style={[styles.stage, { height: maxStage + 16, backgroundColor: c.panel }]}>
        <Moodstone seed={seed} color={color} {...silhouette} mood={mood} eyeColor={eyes} size={maxStage} />
      </View>

      {/* controls */}
      <ScrollView ref={scroller} contentContainerStyle={styles.controls} showsVerticalScrollIndicator={false}>
        <Section label="Mood" c={c}>
          {MOODS.map((m) => (
            <Pressable key={m.key} onPress={() => setMood(m.key)} style={[styles.chip, { backgroundColor: c.chip }, ring(m.key === mood)]}>
              <Text style={[styles.chipText, { color: c.text }]}>{m.label}</Text>
            </Pressable>
          ))}
        </Section>
        <Section label="Cut" c={c}>
          {CUT_KEYS.map((k) => (
            <Pressable key={k} onPress={() => chooseCut(k)} style={[styles.chip, { backgroundColor: c.chip }, ring(k === cut)]}>
              <Text style={[styles.chipText, { color: c.text }]}>{CUTS[k].label}</Text>
            </Pressable>
          ))}
        </Section>
        <Section label="Colour" c={c}>
          {PALETTE_KEYS.map((k) => (
            <Pressable key={k} onPress={() => setColor(k)} style={[styles.swatch, { backgroundColor: PALETTE[k] }, ring(PALETTE[k] === activeColor)]} />
          ))}
        </Section>
        <Section
          label="Tune"
          c={c}
          trailing={
            <Pressable onPress={() => setTune(null)} disabled={!tune} style={[styles.chip, styles.chipSmall, { backgroundColor: c.chip, opacity: tune ? 1 : 0.35 }]}>
              <Text style={[styles.chipText, { color: c.text }]}>Reset</Text>
            </Pressable>
          }
          column
        >
          {knobs.map((k) => (
            <View key={k.key} style={styles.knob}>
              <Text style={[styles.knobLabel, { color: c.muted }]}>{k.label}</Text>
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
              <Text style={[styles.knobValue, { color: c.text }]}>{k.fmt(shape[k.key])}</Text>
            </View>
          ))}
        </Section>
        <Section label="Look" c={c}>
          {(['white', 'black'] as const).map((e) => (
            <Pressable key={e} onPress={() => setEyes(e)} style={[styles.chip, { backgroundColor: c.chip }, ring(e === eyes)]}>
              <Text style={[styles.chipText, { color: c.text }]}>{e === 'white' ? 'White eyes' : 'Black eyes'}</Text>
            </Pressable>
          ))}
        </Section>
      </ScrollView>
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

const DARK = { bg: '#0b0e10', panel: '#141a1d', chip: '#1b2327', track: '#2a353a', text: '#eef2f3', muted: '#7d8a8f' };
const LIGHT = { bg: '#f3f4f5', panel: '#ffffff', chip: '#e6eaec', track: '#d3d9dc', text: '#1a2023', muted: '#6d7a7f' };

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  iconButton: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 13, fontWeight: '700' },
  pill: { height: 32, borderRadius: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: '#0b0e10', fontWeight: '700', fontSize: 13 },
  stage: { borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 6, marginBottom: 8 },
  controls: { paddingTop: 14, paddingBottom: 40, gap: 22 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  column: { gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 10, borderWidth: 2 },
  knob: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34 },
  knobLabel: { width: 84, fontSize: 13 },
  slider: { flex: 1, height: 34 },
  knobValue: { width: 44, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  chip: { height: 36, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  chipSmall: { height: 28, paddingHorizontal: 10 },
  chipText: { fontSize: 13, fontWeight: '600' },
});
