import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import {
  AgentAvatar,
  CUTS,
  CUT_KEYS,
  MOODS,
  PALETTE,
  PALETTE_KEYS,
  computeFrame,
  identityFromName,
  loopLength,
  randomSeed,
  renderAnimatedAvatarSvg,
  renderAvatarSvg,
  type AgentAvatarHandle,
  type Cut,
  type Mood,
  type PaletteKey,
} from 'react-native-agent-avatar';

const NAMES = ['Nova', 'Atlas', 'Iris', 'Echo', 'Juno', 'Orbit', 'Vega', 'Lumen', 'Milo', 'Wren', 'Ember', 'Cove', 'Zephyr', 'Onyx', 'Pixel', 'Bolt'];
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const MOOD_SET = new Set<string>(MOODS.map((m) => m.key));
const CUT_SET = new Set<string>(CUT_KEYS);
const BG = { transparent: undefined, dark: '#0e1113', light: '#f4f5f5' } as const;
type BgKey = keyof typeof BG;

/** Query params from `exp://host:port/--/?tab=wall&mood=done` so the app can be driven from a script. */
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

export default function App() {
  const params = useDeepLinkParams();
  const [tab, setTab] = useState<'studio' | 'wall'>('studio');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    if (params.tab === 'wall' || params.tab === 'studio') setTab(params.tab);
    if (params.theme === 'light' || params.theme === 'dark') setTheme(params.theme);
  }, [params]);
  const dark = theme === 'dark';
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, !dark && styles.rootLight]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={styles.topBar}>
          <View style={[styles.tabs, !dark && styles.tabsLight]}>
            {(['studio', 'wall'] as const).map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && (dark ? styles.tabActive : styles.tabActiveLight)]}>
                <Text style={[styles.tabText, tab === t && (dark ? styles.tabTextActive : styles.tabTextActiveLight)]}>{t === 'studio' ? 'Studio' : 'Wall'}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setTheme(dark ? 'light' : 'dark')} style={[styles.iconButton, !dark && styles.iconButtonLight]}>
            <Text style={styles.iconText}>{dark ? '☾' : '☀'}</Text>
          </Pressable>
        </View>
        {tab === 'studio' ? <Studio params={params} dark={dark} /> : <Wall params={params} dark={dark} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Studio({ params, dark }: { params: Record<string, string>; dark: boolean }) {
  const [name, setName] = useState('Nova');
  const [color, setColor] = useState<PaletteKey | undefined>(undefined);
  const [cut, setCut] = useState<Cut | undefined>(undefined);
  const [mood, setMood] = useState<Mood>('idle');
  const [eyes, setEyes] = useState<'white' | 'black'>('white');
  const [paused, setPaused] = useState(false);
  const [bg, setBg] = useState<BgKey>('transparent');
  const [morph, setMorph] = useState(460);
  const [still, setStill] = useState<number | undefined>(undefined);
  const [preview, setPreview] = useState<SkImage | null>(null);
  const [message, setMessage] = useState('');
  const avatar = useRef<AgentAvatarHandle>(null);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (params.name) setName(params.name);
    if (params.color && params.color in PALETTE) setColor(params.color as PaletteKey);
    if (params.cut && CUT_SET.has(params.cut)) setCut(params.cut as Cut);
    if (params.mood && MOOD_SET.has(params.mood)) setMood(params.mood as Mood);
    if (params.eyes === 'white' || params.eyes === 'black') setEyes(params.eyes);
    if (params.paused) setPaused(params.paused === '1');
    if (params.bg && params.bg in BG) setBg(params.bg as BgKey);
    if (params.morph) setMorph(Number(params.morph) || 0);
    if (params.still !== undefined) setStill(params.still === '' ? undefined : Number(params.still));
    if (params.export === 'png') setTimeout(() => exportPng(), 50);
    if (params.export === 'svg') setTimeout(() => exportSvg(false), 50);
    if (params.export === 'asvg') setTimeout(() => exportSvg(true), 50);
    if (params.restart) avatar.current?.restart();
    if (params.scroll === 'end') setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 120);
    if (params.scroll === 'top') setTimeout(() => scroller.current?.scrollTo({ y: 0, animated: false }), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const id = identityFromName(name);
  const activeColor = color ? PALETTE[color] : id.color;
  const activeCut = cut ?? id.cut;
  const moodInfo = MOODS.find((m) => m.key === mood)!;

  const randomise = () => {
    setName(pick(NAMES.filter((n) => n !== name)));
    setColor(pick(PALETTE_KEYS));
    setCut(pick(CUT_KEYS));
    setMood(pick(MOODS).key);
    setEyes(Math.random() < 0.25 ? 'black' : 'white');
  };

  const exportPng = () => {
    const img = avatar.current?.snapshot({ size: 1024, background: BG[bg] });
    if (!img) return setMessage('Snapshot failed');
    setPreview(img);
    const bytes = img.encodeToBytes();
    setMessage(`PNG 1024px · ${Math.round(bytes.length / 1024)} KB`);
  };
  const sharePng = async () => {
    if (!preview) return;
    await Share.share({ url: `data:image/png;base64,${preview.encodeToBase64()}` });
  };
  const exportSvg = async (animated: boolean) => {
    const spec = avatar.current?.getSpec();
    if (!spec) return;
    const svg = animated
      ? renderAnimatedAvatarSvg(spec, { background: BG[bg] })
      : renderAvatarSvg(spec, computeFrame(spec, 0.35 * loopLength(spec.mood)), { background: BG[bg] });
    setMessage(`${animated ? 'Animated SVG' : 'SVG'} · ${Math.round(svg.length / 1024)} KB · ${animated ? `${loopLength(spec.mood)}s loop` : 'still'}`);
    try {
      await Share.share({ message: svg, title: `${name.toLowerCase()}-${mood}.svg` });
    } catch {
      /* share sheet dismissed */
    }
  };

  const text = dark ? styles.text : styles.textLight;
  const chip = dark ? styles.chip : styles.chipLight;
  const stageBg = bg === 'transparent' ? undefined : BG[bg];

  return (
    <ScrollView ref={scroller} contentContainerStyle={styles.studio} keyboardShouldPersistTaps="handled">
      <View style={[styles.stage, stageBg ? { backgroundColor: stageBg } : null]}>
        <AgentAvatar ref={avatar} name={name} color={color} cut={cut} mood={mood} eyeColor={eyes} size={220} paused={paused} morphDuration={morph} animated={still === undefined} phase={still ?? 0} />
      </View>
      <View style={styles.playRow}>
        <Text style={[styles.chipText, text]}>
          {name.trim() || 'Agent'} · {moodInfo.label}
          <Text style={styles.hint}> {paused ? 'paused' : 'looping'}</Text>
        </Text>
        <Pressable onPress={() => setPaused((p) => !p)} style={[styles.smallButton, !dark && styles.smallButtonLight]}>
          <Text style={[styles.buttonText, text]}>{paused ? 'Play' : 'Pause'}</Text>
        </Pressable>
        <Pressable onPress={() => avatar.current?.restart()} style={[styles.smallButton, !dark && styles.smallButtonLight]}>
          <Text style={[styles.buttonText, text]}>Restart</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Agent name"
          placeholderTextColor="#5c676b"
          style={[styles.input, !dark && styles.inputLight]}
        />
        <Pressable onPress={randomise} style={styles.button}>
          <Text style={styles.buttonTextDark}>Randomise</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Colour</Text>
      <View style={styles.wrap}>
        {PALETTE_KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => setColor(k)}
            style={[styles.swatch, { backgroundColor: PALETTE[k] }, PALETTE[k] === activeColor && (dark ? styles.swatchActive : styles.swatchActiveLight)]}
          />
        ))}
      </View>

      <Text style={styles.label}>Cut</Text>
      <View style={styles.wrap}>
        {CUT_KEYS.map((k) => (
          <Pressable key={k} onPress={() => setCut(k)} style={[chip, k === activeCut && styles.chipActive]}>
            <AgentAvatar name={name} color={color} cut={k} mood="idle" eyeColor={eyes} size={28} animated={false} phase={0.05} />
            <Text style={[styles.chipText, text]}>{CUTS[k].label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Eyes</Text>
      <View style={styles.wrap}>
        {(['white', 'black'] as const).map((e) => (
          <Pressable key={e} onPress={() => setEyes(e)} style={[chip, e === eyes && styles.chipActive]}>
            <Text style={[styles.chipText, text]}>{e}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Mood</Text>
      <View style={styles.wrap}>
        {MOODS.map((m) => (
          <Pressable key={m.key} onPress={() => setMood(m.key)} style={[chip, styles.moodChip, m.key === mood && styles.chipActive]}>
            <AgentAvatar name={name} color={color} cut={cut} mood={m.key} eyeColor={eyes} size={36} phase={0.2} />
            <View>
              <Text style={[styles.chipText, text]}>{m.label}</Text>
              <Text style={styles.hint}>{m.hint}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Export</Text>
      <View style={styles.wrap}>
        {(Object.keys(BG) as BgKey[]).map((k) => (
          <Pressable key={k} onPress={() => setBg(k)} style={[chip, k === bg && styles.chipActive]}>
            <Text style={[styles.chipText, text]}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.wrap, { marginTop: 8 }]}>
        <Pressable onPress={exportPng} style={styles.button}>
          <Text style={styles.buttonTextDark}>PNG 1024px</Text>
        </Pressable>
        <Pressable onPress={() => exportSvg(false)} style={styles.button}>
          <Text style={styles.buttonTextDark}>SVG still</Text>
        </Pressable>
        <Pressable onPress={() => exportSvg(true)} style={styles.button}>
          <Text style={styles.buttonTextDark}>SVG animated</Text>
        </Pressable>
      </View>
      {message ? <Text style={[styles.hint, { marginTop: 8 }]}>{message}</Text> : null}
      {preview ? (
        <View style={styles.previewRow}>
          <Canvas style={{ width: 128, height: 128 }}>
            <SkiaImage image={preview} x={0} y={0} width={128} height={128} fit="contain" />
          </Canvas>
          <Pressable onPress={sharePng} style={styles.button}>
            <Text style={styles.buttonTextDark}>Share PNG</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

interface Tile {
  key: string;
  cut: Cut;
  mood: Mood;
  color: string;
  eyes: 'white' | 'black';
  seed: readonly [number, number, number];
  phase: number;
}
const tileKey = (t: Tile) => `${t.cut}|${t.mood}|${t.color}`;

/** Keep look-alike tiles (same cut, mood and colour) off adjacent cells. */
function spaceOut(tiles: Tile[], cols: number): Tile[] {
  for (let i = 0; i < tiles.length; i++) {
    const left = i % cols !== 0 ? tileKey(tiles[i - 1]) : null;
    const top = i >= cols ? tileKey(tiles[i - cols]) : null;
    const k = tileKey(tiles[i]);
    if (k !== left && k !== top) continue;
    for (let j = i + 1; j < tiles.length; j++) {
      const kj = tileKey(tiles[j]);
      if (kj !== left && kj !== top) {
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        break;
      }
    }
  }
  return tiles;
}

function Wall({ params, dark }: { params: Record<string, string>; dark: boolean }) {
  const { width } = useWindowDimensions();
  const [shuffleKey, setShuffleKey] = useState(0);
  useEffect(() => {
    if (params.shuffle) setShuffleKey((k) => k + 1);
  }, [params]);
  const cols = 5;
  const gap = 10;
  const tile = Math.floor((width - 32 - gap * (cols - 1)) / cols);
  const tiles = useMemo(() => {
    const out: Tile[] = [];
    for (const cut of CUT_KEYS) {
      for (const m of MOODS) {
        out.push({
          key: `${cut}-${m.key}-${shuffleKey}`,
          cut,
          mood: m.key,
          color: PALETTE[pick(PALETTE_KEYS)],
          eyes: Math.random() < 0.22 ? 'black' : 'white',
          seed: randomSeed(),
          phase: Math.random(),
        });
      }
    }
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return spaceOut(out, cols);
  }, [shuffleKey]);
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.row}>
        <Text style={styles.hint}>{tiles.length} agents · every cut × every mood</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setShuffleKey((k) => k + 1)} style={styles.button}>
          <Text style={styles.buttonTextDark}>Shuffle</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.wall, { gap }]}>
        {tiles.map((t) => (
          <AgentAvatar key={t.key} seed={t.seed} color={t.color} cut={t.cut} mood={t.mood} eyeColor={t.eyes} phase={t.phase} size={tile} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0e1113' },
  rootLight: { backgroundColor: '#f4f5f5' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingTop: 8 },
  tabs: { flexDirection: 'row', backgroundColor: '#161c1f', borderRadius: 999, padding: 3 },
  tabsLight: { backgroundColor: '#e3e7e9' },
  tab: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999 },
  tabActive: { backgroundColor: '#2a3438' },
  tabActiveLight: { backgroundColor: '#ffffff' },
  tabText: { color: '#8a969b', fontWeight: '600' },
  tabTextActive: { color: '#f2f5f6' },
  tabTextActiveLight: { color: '#1e2426' },
  iconButton: { position: 'absolute', right: 16, top: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: '#161c1f', alignItems: 'center', justifyContent: 'center' },
  iconButtonLight: { backgroundColor: '#e3e7e9' },
  iconText: { color: '#8a969b', fontSize: 16 },
  studio: { padding: 16, paddingBottom: 64 },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, borderRadius: 24 },
  playRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  input: { flex: 1, backgroundColor: '#161c1f', color: '#f2f5f6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  inputLight: { backgroundColor: '#ffffff', color: '#1e2426' },
  button: { backgroundColor: '#5FC7B0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  smallButton: { backgroundColor: '#161c1f', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smallButtonLight: { backgroundColor: '#e3e7e9' },
  buttonText: { fontWeight: '600' },
  buttonTextDark: { color: '#0e1113', fontWeight: '700' },
  label: { color: '#8a969b', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatch: { width: 34, height: 34, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: '#f2f5f6' },
  swatchActiveLight: { borderColor: '#1e2426' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#161c1f', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'transparent' },
  chipLight: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'transparent' },
  moodChip: { width: '48%', borderRadius: 12, paddingVertical: 8, gap: 10 },
  chipActive: { borderColor: '#5FC7B0' },
  chipText: { fontWeight: '600', textTransform: 'capitalize' },
  text: { color: '#f2f5f6' },
  textLight: { color: '#1e2426' },
  hint: { color: '#8a969b', fontSize: 11 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  wall: { flexDirection: 'row', flexWrap: 'wrap', padding: 16 },
});
