'use client';

import { useEffect, useReducer, useRef } from 'react';
import { AVATAR_ID, type AvatarSpec, type AvatarStatus, type BundleSpec } from './types';

// Resources are served from frontend/public/digital-human/** (see that folder).
// The SDK's locateFile callbacks and the bundle paths inside index.json are all
// resolved relative to this root.
const RES_URL = '/digital-human';
const RENDERER_URL = `${RES_URL}/renderer`;
const EXPRESSION_URL = `${RES_URL}/expression`;
const AVATAR_URL = `${RES_URL}/avatar`;

// Render one frame at most every ~16ms (≈60fps).
const FRAME_INTERVAL_MS = 16;

// Amplifies the FaceUnity English viseme intensity (mouth opens wider). 1.0 is the
// SDK default; the stock visemes read as too closed, so we drive it harder.
const EN_VISEME_INTENSITY = 1.6;
const MOUTH_OPEN_GAIN = 1.45;

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// Mutable handles for the live avatar. Exposed for the lip-sync phases.
export interface AvatarRuntime {
  rendererKit: any;
  resourceMgr: any;
  expressionParser: any;
  renderer: any;
  scene: any;
  avatar: any;
  idleAnimationPath: string | null;
  /** Talking gesture animations (arms/hands) played while the agent speaks. */
  gesturePaths: string[];
}

/**
 * The FU renderer is a process-wide singleton (`RenderKit.getInstance()`), and
 * the avatar bundle is ~61MB. We therefore own ONE detached <canvas> at module
 * scope and initialize it exactly once. React components attach that canvas into
 * their DOM and detach on unmount, but never recreate or destroy it. This makes
 * the heavy init immune to React StrictMode's double-mount and to remounts.
 */
export interface AvatarSingleton {
  canvas: HTMLCanvasElement;
  status: AvatarStatus;
  error: string | null;
  runtime: AvatarRuntime | null;
  listeners: Set<() => void>;
  /** 0 = mouth closed, 1 = mouth fully open. Driven by audio energy. */
  openness: number;
  /** Vowel shape from audio spectrum: 0 = rounded (oo), 0.5 = open (ah), 1 = wide (ee). */
  shape: number;
  /** 0 = vowel, 1 = sibilant/fricative (s, ş, f) — biases toward the teeth viseme. */
  sibilance: number;
  /**
   * 'acoustic' = mouth shape derived from audio spectrum (default, language-agnostic).
   * 'phoneme'  = mouth shape comes from the FaceUnity text→viseme timeline fed from
   * the agent transcript; amplitude is still gated by real audio (`gate`).
   */
  lipMode: 'acoustic' | 'phoneme';
  /** Playback clock (seconds, from audio onset) used to sample the phoneme timeline. */
  phonemeClock: number;
  /** 0..1 amplitude gate from real audio — keeps phoneme visemes silent when no sound. */
  gate: number;
  lipSyncEnabled: boolean;
  /** Whether talking gesture animations are currently looping. */
  gesturing: boolean;
}

// Viseme blendshape templates captured once from the expression parser by feeding
// representative phonemes. Runtime lip-sync blends round→open→wide by `shape`, then
// interpolates from `closed` toward that vowel by `openness` — reusing the SDK's
// real viseme mapping instead of guessing blendshape indices.
interface LipTemplates {
  closed: Float32Array; // "sil"  — resting/closed mouth
  open: Float32Array; //   "AA"   — neutral open jaw
  wide: Float32Array; //   "IY"   — front vowel, mouth widened
  round: Float32Array; //  "UW"   — rounded/puckered lips
  teeth: Float32Array; //  "S"    — sibilant/fricative, near-closed with teeth
  scratch: Float32Array;
}
let lipTemplates: LipTemplates | null = null;

let singleton: AvatarSingleton | null = null;

function notify(s: AvatarSingleton) {
  for (const l of s.listeners) l();
}

function setStatus(s: AvatarSingleton, status: AvatarStatus, error: string | null = null) {
  s.status = status;
  s.error = error;
  notify(s);
}

async function fetchSpec(): Promise<AvatarSpec> {
  const [indexRes, avatarRes] = await Promise.all([
    fetch(`${AVATAR_URL}/${AVATAR_ID}/index.json`),
    fetch(`${AVATAR_URL}/${AVATAR_ID}/avatar.json`),
  ]);
  if (!indexRes.ok || !avatarRes.ok) {
    throw new Error('Failed to fetch avatar spec JSON');
  }
  const bundle: BundleSpec = await indexRes.json();
  const jsonData = await avatarRes.json();
  return { bundle, jsonData };
}

async function initAvatar(s: AvatarSingleton): Promise<void> {
  setStatus(s, 'loading');

  // Client-only dynamic imports: the SDK touches WebGL/WASM/window.
  const [{ default: FURenderKitSDK }, { FUResourceManager }, { default: FULite }] =
    await Promise.all([
      import('furenderkit/fu_render_kit/index'),
      import('furenderkit/fu_resource_manager/index'),
      import('furenderkit/fu_lite/index'),
    ]);

  const spec = await fetchSpec();
  const allAnimations = spec.bundle.animations ?? [];
  const idleAnimationPath = allAnimations[0] ?? null;
  // Talking gestures: prefer the "jiaotan" (conversation) clips; otherwise any
  // non-idle animation.
  const jiaotan = allAnimations.filter((p) => /jiaotan/i.test(p));
  const gesturePaths = jiaotan.length ? jiaotan : allAnimations.slice(1);

  // --- framework ---
  const rendererKit = new FURenderKitSDK({
    locateFile: (filename: string) => `${RENDERER_URL}/${filename}`,
  });
  await rendererKit.initialize();
  rendererKit.RenderKit.setLogLevel(rendererKit.ELoggerLevel.LOG_LEVEL_OFF);

  const resourceMgr = new FUResourceManager({ preferIDBFS: false });
  await rendererKit.setResourceManager(resourceMgr);

  // Expression parser — not needed for idle render, but initialized now so later
  // lip-sync phases can feed it. Failures here are non-fatal.
  let expressionParser: any = null;
  try {
    expressionParser = new FULite({
      locateFile: (filename: string) => `${EXPRESSION_URL}/${filename}`,
    });
    await expressionParser.initialize();
    await expressionParser.SetupDecoder();
  } catch (e) {
    console.warn('[avatar] expression parser init skipped:', e);
  }

  // --- preload all bundles referenced by the spec ---
  const { camera, light, bundles, animations, style } = spec.bundle;
  const allBundlePaths = uniq([camera, light, ...bundles, ...animations]);
  await Promise.all(
    allBundlePaths.map((path) => resourceMgr.prepareCustomBundle(`${RES_URL}/${path}`, path))
  );

  // --- renderer + scene ---
  const renderer = rendererKit.RenderKit.getInstance();
  try {
    renderer.init({ canvas: s.canvas, assetRoot: 'shaders' });
  } catch (err) {
    throw new Error(String(rendererKit.wasmCtx.module.getExceptionMessage(err)));
  }

  const sizeToParent = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = s.canvas.getBoundingClientRect();
    // The test page scales the canvas to make the face easier to inspect. Render
    // that canvas at the same multiplier so the enlarged avatar stays sharp.
    const visualScale = s.canvas.parentElement?.classList.contains('elevenlabs-avatar-canvas')
      ? 1.25
      : 1;
    const w = Math.max(1, Math.round(rect.width * dpr * visualScale));
    const h = Math.max(1, Math.round(rect.height * dpr * visualScale));
    renderer.resize(w, h);
  };
  const resizeObserver = new ResizeObserver(() => sizeToParent());
  resizeObserver.observe(s.canvas);

  const scene = renderer.createScene('scene');
  scene.setRenderMsaaLevel(rendererKit.EMSAAOption.MSAA_4X);
  scene.enableRenderPostProcess(rendererKit.EPostProcessType.POST_PROCESS_FXAA, true);
  scene.setRenderShadowQuality(rendererKit.EShadowQuality.SHADOW_QUALITY_LOW);
  scene.enableRenderPostProcess(rendererKit.EPostProcessType.POST_PROCESS_MIRROR, false);

  // --- avatar ---
  scene.setCamera(camera);
  scene.clearLight();
  scene.addLight(light);

  const avatar = scene.addAvatar('avatar');
  const styleRoot = `${RES_URL}/${style}`;
  await avatar.loadControllerConfigAsync(`${styleRoot}/controller-config.bundle`);
  await avatar.loadAnimGraphAsync(`${styleRoot}/anim-graph.json`);
  await avatar.loadAnimLogicAsync(`${styleRoot}/anim-logic.json`);

  s.runtime = {
    rendererKit,
    resourceMgr,
    expressionParser,
    renderer,
    scene,
    avatar,
    idleAnimationPath,
    gesturePaths,
  };

  // --- render loop ---
  // IMPORTANT: the loop must be running for loadFromJson to finish — the SDK
  // flushes the last components' GPU texture uploads on render ticks, so awaiting
  // loadFromJson *before* rendering deadlocks. Start the loop first, then load.
  let preTimestamp: number | undefined;
  const tick = () => {
    requestAnimationFrame(async (timestamp) => {
      if (preTimestamp === undefined) preTimestamp = timestamp;
      const elapsed = timestamp - preTimestamp;
      if (elapsed > FRAME_INTERVAL_MS) {
        try {
          await renderer.render(scene, elapsed / 1000);
        } catch {
          // transient render errors are ignored, matching the SDK reference
        }
        preTimestamp = timestamp;
      }
      tick();
    });
  };
  tick();
  sizeToParent();

  await new Promise<void>((resolve, reject) => {
    avatar
      .loadFromJson(spec.jsonData, (total: number, ready: number) => {
        if (total === ready) resolve();
      })
      .catch(reject);
  });

  if (idleAnimationPath) {
    avatar.setAnimation(idleAnimationPath);
  }

  setStatus(s, 'ready');
}

/** Get (and lazily create + initialize) the process-wide avatar singleton. */
export function getAvatarSingleton(): AvatarSingleton {
  if (singleton) return singleton;

  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const s: AvatarSingleton = {
    canvas,
    status: 'idle',
    error: null,
    runtime: null,
    listeners: new Set(),
    openness: 0,
    shape: 0.5,
    sibilance: 0,
    lipMode: 'acoustic',
    phonemeClock: 0,
    gate: 0,
    lipSyncEnabled: false,
    gesturing: false,
  };
  singleton = s;
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    (window as any).__avatarSingleton = s;
  }

  initAvatar(s).catch((e) => {
    console.error('[avatar] init failed:', e);
    setStatus(s, 'error', e instanceof Error ? e.message : String(e));
  });

  return s;
}

/** Subscribe to the avatar singleton's load status (re-renders on change). */
export function useAvatarStatus(): AvatarStatus {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<AvatarSingleton | null>(null);
  useEffect(() => {
    const s = getAvatarSingleton();
    ref.current = s;
    s.listeners.add(force);
    force();
    return () => {
      s.listeners.delete(force);
    };
  }, []);
  return ref.current?.status ?? 'loading';
}

// --- Lip-sync (Phase 2: amplitude-driven) -----------------------------------

function clone(a: Float32Array): Float32Array {
  return Float32Array.from(a);
}

/**
 * Capture viseme blendshapes from the expression parser once. For each phoneme we
 * reset the parser, feed the phoneme followed by silence, and sample the resulting
 * 57-coefficient expression at the phoneme's midpoint.
 */
function buildLipTemplates(ep: any): LipTemplates | null {
  try {
    ep.setLangType(1); // LipDriveLanguageType.ENGLISH
    const capture = (phoneme: string): Float32Array => {
      ep.interrupt();
      ep.feed(`0 0.4 ${phoneme}\n`);
      ep.feed('0.4 0.8 sil\n');
      const expr = clone(ep.getExpressionByTime(0.2, 0)); // BUILTIN_TIMESTAMP
      ep.interrupt();
      return expr;
    };
    const closed = capture('sil');
    const open = capture('AA');
    const wide = capture('IY');
    const round = capture('UW');
    // Sibilant/fricative viseme (teeth nearly together). Captured separately so an
    // unsupported phoneme degrades gracefully to the front-vowel shape instead of
    // disabling lip-sync entirely.
    let teeth: Float32Array;
    try {
      teeth = capture('S');
    } catch {
      teeth = clone(wide);
    }
    return { closed, open, wide, round, teeth, scratch: new Float32Array(open.length) };
  } catch (e) {
    console.warn('[avatar] could not build lip templates:', e);
    return null;
  }
}

/** Begin driving the avatar mouth from `singleton.openness` (call once ready). */
export function enableLipSync(): boolean {
  const s = singleton;
  if (!s?.runtime?.avatar || !s.runtime.expressionParser) return false;
  if (s.lipSyncEnabled) return true;

  if (!lipTemplates) lipTemplates = buildLipTemplates(s.runtime.expressionParser);
  if (!lipTemplates) return false;

  const { avatar } = s.runtime;
  const ep = s.runtime.expressionParser;
  const { closed, open, wide, round, teeth, scratch } = lipTemplates;

  avatar.enableMouthBlendShape(true);
  // Drive the English visemes harder — the stock intensity looks too closed.
  try {
    ep?.changeENIntensity?.(EN_VISEME_INTENSITY);
  } catch {
    /* best-effort — intensity tuning is non-fatal */
  }
  // The SDK invokes this each frame at the correct point in its pipeline.
  avatar.setExpUpdateFunc(() => {
    // --- Phoneme mode: sample the real text→viseme timeline, gated by audio. ---
    if (s.lipMode === 'phoneme' && ep) {
      let expr: Float32Array | null = null;
      try {
        // streamType 1 = text timestamp (FaceUnity does text→phoneme→viseme).
        expr = ep.getExpressionByTime(s.phonemeClock, 1);
      } catch {
        expr = null;
      }
      if (expr && expr.length === scratch.length) {
        const g = s.gate;
        for (let i = 0; i < scratch.length; i++) {
          // Interpolate closed→viseme by the audio gate so the mouth only moves
          // while real sound is playing (prevents drift / talking in silence).
          scratch[i] = closed[i] + (expr[i] - closed[i]) * g;
        }
        avatar.setMouthBlendShape(scratch);
        return;
      }
      // No viseme available → fall through to the acoustic blend below.
    }

    // --- Acoustic mode (default / fallback): ---
    // 1) pick the vowel shape by blending round→open→wide using `shape`
    // 2) bias that toward the teeth/sibilant viseme by `sibilance`
    // 3) interpolate from the closed mouth toward that target by `openness`
    const o = Math.min(1, s.openness * MOUTH_OPEN_GAIN);
    const sh = s.shape;
    const sib = s.sibilance;
    for (let i = 0; i < scratch.length; i++) {
      let vowel: number;
      if (sh < 0.5) {
        vowel = round[i] + (open[i] - round[i]) * (sh / 0.5);
      } else {
        vowel = open[i] + (wide[i] - open[i]) * ((sh - 0.5) / 0.5);
      }
      const target = vowel + (teeth[i] - vowel) * sib;
      scratch[i] = closed[i] + (target - closed[i]) * o;
    }
    avatar.setMouthBlendShape(scratch);
  });
  s.lipSyncEnabled = true;
  return true;
}

/** Set current mouth openness (0..1). Cheap; safe to call every audio frame. */
export function setMouthOpenness(value: number): void {
  if (!singleton) return;
  singleton.openness = value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Set current vowel shape (0 = rounded, 0.5 = open, 1 = wide). */
export function setMouthShape(value: number): void {
  if (!singleton) return;
  singleton.shape = value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Set current sibilance (0 = vowel, 1 = fricative/teeth). Cheap; per-frame safe. */
export function setMouthSibilance(value: number): void {
  if (!singleton) return;
  singleton.sibilance = value < 0 ? 0 : value > 1 ? 1 : value;
}

// --- Phoneme (text→viseme) lip-sync controls ------------------------------

/** Switch between 'acoustic' (audio spectrum) and 'phoneme' (transcript) lip-sync. */
export function setLipMode(mode: 'acoustic' | 'phoneme'): void {
  if (!singleton) return;
  singleton.lipMode = mode;
}

/**
 * Append a transcript segment to the FaceUnity viseme timeline. `start`/`end` are
 * in seconds on the same clock used by {@link setPhonemeClock}. Safe no-op if the
 * expression parser is unavailable.
 */
export function feedPhoneme(start: number, end: number, text: string): boolean {
  const ep = singleton?.runtime?.expressionParser;
  if (!ep || !text) return false;
  try {
    ep.feed(`${start.toFixed(3)} ${end.toFixed(3)} ${text}\n`);
    return true;
  } catch (e) {
    console.warn('[avatar] feedPhoneme failed:', e);
    return false;
  }
}

/** Advance the phoneme playback clock (seconds, monotonic within an utterance). */
export function setPhonemeClock(seconds: number): void {
  if (!singleton) return;
  singleton.phonemeClock = seconds;
}

/** Set the audio amplitude gate (0..1) applied to phoneme visemes. */
export function setPhonemeGate(value: number): void {
  if (!singleton) return;
  singleton.gate = value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Clear the phoneme timeline (call at utterance boundaries / on interrupt). */
export function resetPhonemes(): void {
  const s = singleton;
  if (!s) return;
  s.phonemeClock = 0;
  s.gate = 0;
  try {
    s.runtime?.expressionParser?.interrupt();
  } catch {
    /* ignore */
  }
}

/**
 * Clear ONLY the FaceUnity viseme timeline (not the clock/gate). Used to re-feed a
 * growing transcript as a single segment so the SDK's batched-flush quirk (which
 * collapses multiple queued segments to the first one's end time and then goes
 * blank) can't freeze the mouth mid-utterance.
 */
export function resetPhonemeTimeline(): void {
  try {
    singleton?.runtime?.expressionParser?.interrupt();
  } catch {
    /* ignore */
  }
}

/** Stop lip-sync and return the mouth to the animation-driven resting state. */
export function disableLipSync(): void {
  const s = singleton;
  if (!s?.runtime?.avatar) return;
  s.openness = 0;
  s.shape = 0.5;
  s.sibilance = 0;
  s.lipMode = 'acoustic';
  s.phonemeClock = 0;
  s.gate = 0;
  try {
    s.runtime.expressionParser?.interrupt();
  } catch {
    /* ignore */
  }
  try {
    s.runtime.avatar.clearExpUpdateFunc();
    s.runtime.avatar.enableMouthBlendShape(false);
  } catch {
    /* ignore */
  }
  s.lipSyncEnabled = false;
}

// --- Talking gestures (arms/hands) -----------------------------------------

function playNextGesture(s: AvatarSingleton): void {
  const rt = s.runtime;
  if (!rt?.avatar) return;
  const { avatar, gesturePaths, idleAnimationPath } = rt;
  if (!s.gesturing || !gesturePaths.length) {
    if (idleAnimationPath) avatar.setAnimation(idleAnimationPath);
    return;
  }
  const path = gesturePaths[Math.floor(Math.random() * gesturePaths.length)];
  avatar.setAnimation(path);
  // When this gesture finishes: chain another if still speaking, else go idle.
  avatar.onAnimationDone(() => {
    if (s.gesturing) playNextGesture(s);
    else if (idleAnimationPath) avatar.setAnimation(idleAnimationPath);
  });
}

/** Start looping talking-gesture animations (call when the agent starts speaking). */
export function startGesturing(): void {
  const s = singleton;
  if (!s?.runtime?.avatar || s.gesturing) return;
  if (!s.runtime.gesturePaths.length) return;
  s.gesturing = true;
  playNextGesture(s);
}

/** Stop gesturing and return to idle immediately (when the agent stops talking). */
export function stopGesturing(): void {
  const s = singleton;
  if (!s?.gesturing) return;
  s.gesturing = false;
  // Switch back to the idle (breathing) animation right away so the arms stop
  // as soon as speech ends, instead of waiting for the current gesture clip.
  const rt = s.runtime;
  if (rt?.avatar && rt.idleAnimationPath) {
    try {
      rt.avatar.setAnimation(rt.idleAnimationPath);
    } catch {
      /* ignore */
    }
  }
}

// Dev-only handle for manual probing/verification.
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  (window as unknown as Record<string, unknown>).__avatarLip = {
    enableLipSync,
    setMouthOpenness,
    setMouthShape,
    setMouthSibilance,
    setLipMode,
    feedPhoneme,
    setPhonemeClock,
    setPhonemeGate,
    resetPhonemes,
    resetPhonemeTimeline,
    disableLipSync,
    startGesturing,
    stopGesturing,
  };
}
