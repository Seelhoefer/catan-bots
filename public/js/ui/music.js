// Hintergrundmusik: ruhige, generative Aufbau-Stimmung (warme Streicherflächen, Harfen-Arpeggien, sanfte Flöte, Hall).
// Wird live per Web Audio erzeugt – keine Dateien, keine Lizenzen. Jede Sitzung klingt etwas anders.
// Optional: eigene (frei lizenzierte) Stücke in assets/music/ ablegen und in assets/music/manifest.json eintragen:
//   { "tracks": ["stueck1.mp3", "stueck2.ogg"] }  → diese werden dann statt der generativen Musik abgespielt.
import { sfx } from './sfx.js';

const KEY = 'catan-music';
let enabled = true;
let level = 0.5;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) { enabled = saved.on !== false; if (typeof saved.vol === 'number') level = saved.vol; }
} catch { /* egal */ }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: enabled, vol: level })); } catch { /* egal */ } };

let ctx = null;
let bus = null; // Musik-Lautstärke
let wet = null;
let timer = null;
let running = false;
let nextBar = 0;
let barNo = 0;
let song = null;
let audioEl = null; // optionale Dateien
let tracks = null;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

// Akkordfolgen als Stufen der Dur-Tonleiter (0 = I)
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 5, 4], [0, 2, 3, 4], [5, 3, 0, 4], [0, 4, 5, 3], [3, 0, 4, 5]];
const ROOTS = [60, 62, 65, 67]; // C, D, F, G

/** Stufe der Tonleiter (auch über die Oktave hinaus) → MIDI-Note. */
const degree = (root, d) => root + MAJOR[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const triad = (root, d) => [degree(root, d), degree(root, d + 2), degree(root, d + 4)];

function impulse(c, seconds = 3.4) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  return buf;
}

function setup() {
  ctx = sfx.context();
  if (!ctx) return false;
  if (bus) return true;
  bus = ctx.createGain();
  bus.gain.value = 0;
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx);
  wet = ctx.createGain();
  wet.gain.value = 0.5;
  const tone = ctx.createBiquadFilter(); // Musik leicht abdunkeln, damit sie hinter den Effekten bleibt
  tone.type = 'lowpass';
  tone.frequency.value = 5200;
  bus.connect(tone);
  tone.connect(dry).connect(ctx.destination);
  tone.connect(conv).connect(wet).connect(ctx.destination);
  return true;
}

// ------------------------------------------------------------------ Instrumente
function env(g, t0, { a = 0.01, d = 1, peak = 0.1, sustain = 0 }) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  if (sustain > 0) g.gain.setValueAtTime(Math.max(0.0002, peak * 0.85), t0 + a + sustain);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + sustain + d);
}

/** Streicherfläche: zwei leicht verstimmte Sägezähne, weich gefiltert. */
function pad(t0, midi, dur, gain = 0.03) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, t0);
  lp.frequency.linearRampToValueAtTime(1500, t0 + dur * 0.55);
  lp.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 1.4);
  lp.connect(g).connect(bus);
  [-7, 6].forEach((cents) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    o.detune.value = cents;
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 1.6);
  });
}

/** Gezupfte Saite (Harfe/Laute). */
function pluck(t0, midi, gain = 0.07, dur = 1.6) {
  const f = mtof(midi);
  const g = ctx.createGain();
  env(g, t0, { a: 0.004, d: dur, peak: gain });
  g.connect(bus);
  [[1, 1], [2, 0.3], [3.01, 0.12], [4.02, 0.05]].forEach(([m, k]) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * m;
    const og = ctx.createGain();
    og.gain.value = k;
    // höhere Teiltöne klingen schneller ab
    og.gain.setValueAtTime(k, t0);
    og.gain.exponentialRampToValueAtTime(0.0005, t0 + dur / (m * 0.9));
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  });
}

/** Tiefer, runder Basston. */
function bass(t0, midi, dur = 2.4, gain = 0.1) {
  const g = ctx.createGain();
  env(g, t0, { a: 0.03, d: dur, peak: gain });
  g.connect(bus);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = mtof(midi);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + dur + 0.1);
}

/** Flöte: Sinus mit zartem Vibrato und etwas Hauch. */
function flute(t0, midi, dur, gain = 0.055) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = mtof(midi);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5 + Math.random();
  const lfoG = ctx.createGain();
  lfoG.gain.setValueAtTime(0, t0);
  lfoG.gain.linearRampToValueAtTime(mtof(midi) * 0.006, t0 + dur * 0.6);
  lfo.connect(lfoG).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.12);
  g.gain.setValueAtTime(gain * 0.9, t0 + Math.max(0.15, dur - 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.5);
  o.connect(g).connect(bus);
  // Hauch
  const n = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  n.buffer = nb;
  n.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = mtof(midi) * 2;
  bp.Q.value = 4;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(gain * 0.12, t0 + 0.08);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.3);
  n.connect(bp).connect(ng).connect(bus);
  [o, lfo, n].forEach((x) => { x.start(t0); x.stop(t0 + dur + 0.7); });
}

// ------------------------------------------------------------------ Komposition
function newSong() {
  const root = pick(ROOTS);
  return { root, prog: pick(PROGRESSIONS), bpm: 58 + Math.floor(Math.random() * 12), arp: pick([[0, 1, 2, 1, 2, 1, 0, 1], [0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 3, 2, 1, 2, 1]]), flutePhrase: Math.random() < 0.75 };
}

function scheduleBar(t0, n) {
  if (!song || n % 16 === 0) song = newSong(); // alle vier Durchläufe etwas Neues
  const beat = 60 / song.bpm;
  const bar = beat * 4;
  const chordDeg = song.prog[n % 4];
  const root = song.root;
  const tones = triad(root, chordDeg);
  const low = tones.map((m) => m - 12);
  // Fläche
  [...low, tones[0] + 12].forEach((m, i) => pad(t0 + i * 0.05, m, bar, 0.026));
  // Bass
  bass(t0, low[0] - 12, bar * 0.9);
  if (chance(0.6)) bass(t0 + beat * 2, low[2] - 12, bar * 0.45, 0.06);
  // Harfe: gebrochener Akkord in Achteln, einzelne Töne ausgelassen
  const span = [tones[0], tones[1], tones[2], tones[0] + 12];
  song.arp.forEach((idx, i) => {
    if (!chance(i === 0 ? 1 : 0.78)) return;
    pluck(t0 + i * beat * 0.5 + (Math.random() - 0.5) * 0.012, span[idx] + 12, i === 0 ? 0.085 : 0.06);
  });
  // Flöte: alle zwei Takte eine kleine Phrase aus der Pentatonik
  if (song.flutePhrase && n % 2 === 1 && chance(0.8)) {
    const scale = PENTA.map((s) => root + 24 + s);
    let at = t0 + beat * (chance(0.5) ? 0 : 1);
    let idx = Math.floor(Math.random() * scale.length);
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count && at < t0 + bar - 0.3; i += 1) {
      const dur = beat * pick([1, 1.5, 2]);
      flute(at, scale[idx] + (chance(0.15) ? 12 : 0), dur);
      at += dur + beat * pick([0, 0.5]);
      idx = Math.max(0, Math.min(scale.length - 1, idx + pick([-2, -1, 1, 1, 2])));
    }
  }
}

function tick() {
  if (!ctx || !running) return;
  const horizon = ctx.currentTime + 2.2;
  while (nextBar < horizon) {
    scheduleBar(nextBar, barNo);
    nextBar += (60 / song.bpm) * 4;
    barNo += 1;
  }
}

async function loadTracks() {
  if (tracks !== null) return tracks;
  tracks = [];
  try {
    const r = await fetch('assets/music/manifest.json', { cache: 'no-cache' });
    if (r.ok) tracks = (await r.json()).tracks || [];
  } catch { /* kein Manifest */ }
  return tracks;
}

function playNextFile() {
  if (!audioEl || !tracks.length) return;
  audioEl.src = `assets/music/${pick(tracks)}`;
  audioEl.play().catch(() => {});
}

// ------------------------------------------------------------------ API
export const music = {
  get enabled() { return enabled; },

  /** Startet die Musik (nur nach einer Nutzergeste wirksam). */
  async start() {
    if (!enabled || running) return;
    if (!setup()) return;
    running = true;
    if (ctx.state === 'suspended') ctx.resume();
    const files = await loadTracks();
    if (files.length) {
      audioEl = audioEl || new Audio();
      audioEl.volume = level * 0.6;
      audioEl.onended = playNextFile;
      playNextFile();
      return;
    }
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(level * 0.9, ctx.currentTime + 5); // sanft einblenden
    song = null;
    barNo = 0;
    nextBar = ctx.currentTime + 0.3;
    tick();
    timer = setInterval(tick, 400);
  },

  stop() {
    running = false;
    clearInterval(timer);
    timer = null;
    if (audioEl) audioEl.pause();
    if (bus && ctx) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime);
      bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
    }
  },

  setEnabled(on) {
    enabled = !!on;
    persist();
    if (enabled) this.start(); else this.stop();
  },

  get volume() { return level; },

  setVolume(v) {
    level = Math.max(0, Math.min(1, v));
    persist();
    if (bus && running) bus.gain.setTargetAtTime(level * 0.9, ctx.currentTime, 0.2);
    if (audioEl) audioEl.volume = level * 0.6;
  },

  /** Für den Pegeltest: eine Taktfolge in einen (Offline-)Kontext rendern. */
  _renderBars: (c, bars) => {
    ctx = c;
    bus = c.createGain();
    bus.gain.value = 0.45;
    bus.connect(c.destination);
    song = null;
    for (let i = 0; i < bars; i += 1) scheduleBar(0.1 + i * (60 / 64) * 4, i);
  },
};

// Sichtbarkeit: im Hintergrund-Tab pausieren
document.addEventListener('visibilitychange', () => {
  if (!ctx || !running) return;
  if (document.hidden) ctx.suspend(); else ctx.resume();
});
