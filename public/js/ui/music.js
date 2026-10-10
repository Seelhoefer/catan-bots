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

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

// Filmisch: Akkordfolgen als Stufen der Moll-Tonleiter (0 = i, 5 = VI, 2 = III, 6 = VII …)
const PROGRESSIONS = [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 5, 4], [0, 5, 3, 6], [5, 6, 0, 0], [0, 2, 5, 6]];
const ROOTS = [57, 59, 62, 55]; // A, H, D, G

/** Stufe der Tonleiter (auch über die Oktave hinaus) → MIDI-Note. */
const degree = (root, d) => root + MINOR[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const triad = (root, d) => [degree(root, d), degree(root, d + 2), degree(root, d + 4)];

// Heldenmotive: [Tonleiterstufe ab Grundton, Dauer in Schlägen]
const MOTIFS = [
  [[0, 2], [2, 1], [4, 1], [7, 4]],
  [[4, 1.5], [5, 0.5], [4, 1], [2, 1], [0, 4]],
  [[2, 1], [4, 1], [6, 2], [5, 1], [4, 1], [2, 2]],
  [[7, 1.5], [6, 0.5], [4, 1], [5, 1], [4, 4]],
];

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
  conv.buffer = impulse(ctx, 4.6);
  wet = ctx.createGain();
  wet.gain.value = 0.62;
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

// ------------------------------------------------------------------ Orchester
/** Tiefer Orgelpunkt. */
function drone(t0, midi, dur, gain = 0.07) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 1.2);
  lp.connect(g).connect(bus);
  [['sawtooth', -5], ['sawtooth', 5], ['sine', 0]].forEach(([type, cents]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(midi);
    o.detune.value = cents;
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 1.4);
  });
}

/** Kurze, treibende Streicher-Achtel (Ostinato). */
function stac(t0, midi, gain = 0.04, dur = 0.2) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2600, t0);
  lp.frequency.exponentialRampToValueAtTime(700, t0 + dur);
  const g = ctx.createGain();
  env(g, t0, { a: 0.008, d: dur, peak: gain });
  lp.connect(g).connect(bus);
  [-8, 8].forEach((cents) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    o.detune.value = cents;
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  });
}

/** Horn/Blech: langsamer Einsatz, Filter öffnet sich (Swell). */
function horn(t0, midi, dur, gain = 0.06) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(420, t0);
  lp.frequency.exponentialRampToValueAtTime(2100, t0 + Math.min(dur * 0.6, 0.9));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.28);
  g.gain.setValueAtTime(gain * 0.9, t0 + Math.max(0.3, dur - 0.15));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.6);
  lp.connect(g).connect(bus);
  [-6, 0, 6].forEach((cents) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    o.detune.value = cents;
    o.connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 0.8);
  });
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = mtof(midi - 12);
  const sg = ctx.createGain();
  sg.gain.value = 0.5;
  sub.connect(sg).connect(g);
  sub.start(t0);
  sub.stop(t0 + dur + 0.8);
}

/** Pauke: tiefer Körper + Fellanschlag. */
function timp(t0, gain = 0.5, midi = 38) {
  const g = ctx.createGain();
  env(g, t0, { a: 0.004, d: 0.75, peak: gain });
  g.connect(bus);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(mtof(midi + 7), t0);
  o.frequency.exponentialRampToValueAtTime(mtof(midi), t0 + 0.22);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + 0.9);
  const n = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  n.buffer = nb;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  const ng = ctx.createGain();
  env(ng, t0, { a: 0.002, d: 0.14, peak: gain * 0.7 });
  n.connect(lp).connect(ng).connect(bus);
  n.start(t0);
}

/** Chor („Ooh“): Sägezähne durch zwei Formantfilter. */
function choir(t0, midi, dur, gain = 0.03) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 1.2);
  g.connect(bus);
  [[650, 1], [1100, 0.6]].forEach(([f, k]) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 5;
    const og = ctx.createGain();
    og.gain.value = k;
    bp.connect(og).connect(g);
    [-9, 0, 9].forEach((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(midi);
      o.detune.value = cents;
      o.connect(bp);
      o.start(t0);
      o.stop(t0 + dur + 1.4);
    });
  });
}

/** Becken-Anschwellen (Crescendo-Rauschen). */
function swell(t0, dur, gain = 0.12) {
  const n = ctx.createBufferSource();
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  n.buffer = nb;
  n.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(2500, t0);
  hp.frequency.exponentialRampToValueAtTime(7000, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 1.6);
  n.connect(hp).connect(g).connect(bus);
  n.start(t0);
  n.stop(t0 + dur + 1.8);
}

// ------------------------------------------------------------------ Komposition: 16 Takte, vier Steigerungen
function newSong() {
  return {
    root: pick(ROOTS), prog: pick(PROGRESSIONS), bpm: 84 + Math.floor(Math.random() * 12),
    motifA: pick(MOTIFS), motifB: pick(MOTIFS), ost: pick([[0, 1, 2, 1, 0, 1, 2, 1], [0, 2, 1, 2, 0, 2, 1, 2], [2, 1, 0, 1, 2, 1, 0, 1]]),
  };
}

function scheduleBar(t0, n) {
  if (!song || n % 32 === 0) song = newSong(); // nach 32 Takten neue Tonart/Akkordfolge
  const beat = 60 / song.bpm;
  const bar = beat * 4;
  const phase = n % 16;
  const lvl = phase < 4 ? 1 : phase < 8 ? 2 : phase < 12 ? 3 : 4; // Intro → Aufbau → Hauptthema → Finale
  const root = song.root;
  const deg = song.prog[n % 4];
  const tones = triad(root, deg);
  const low = tones.map((m) => m - 12);

  // Fundament: Orgelpunkt auf dem Akkordgrundton, tiefer Bass
  drone(t0, low[0] - 12, bar, 0.05 + lvl * 0.012);
  bass(t0, low[0] - 12, bar * 0.9, 0.1);
  if (lvl >= 2) bass(t0 + beat * 2, low[0] - 12, bar * 0.45, 0.07);

  // Streicherfläche (Akkord + Oktave), wird mit der Steigerung breiter
  const padTones = lvl >= 3 ? [...low, ...tones, tones[0] + 12] : [...low, tones[0] + 12];
  padTones.forEach((m, i) => pad(t0 + i * 0.04, m, bar, 0.018 + lvl * 0.005));

  // Harfe im Intro, später leise darunter
  if (lvl <= 2) {
    const span = [tones[0], tones[1], tones[2], tones[0] + 12];
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => { if (chance(i === 0 ? 1 : 0.55)) pluck(t0 + i * beat * 0.5, span[[0, 1, 2, 3, 2, 1, 2, 3][i]] + 12, i === 0 ? 0.075 : 0.05); });
  }

  // Streicher-Ostinato: Achtel ab Stufe 2, Sechzehntel im Finale
  if (lvl >= 2) {
    const span = [tones[0], tones[1], tones[2]];
    const steps = lvl === 4 ? 16 : 8;
    const stepDur = bar / steps;
    for (let i = 0; i < steps; i += 1) {
      const idx = song.ost[i % 8];
      const accent = i % (steps / 4) === 0;
      stac(t0 + i * stepDur, span[idx] + 12, accent ? 0.05 : 0.032, stepDur * 0.9);
    }
  }

  // Pauken: Schlag auf Eins (Stufe 2), Eins & Drei (3), jede Zählzeit + Wirbel (4)
  if (lvl === 2 && n % 2 === 0) timp(t0, 0.5, low[0] - 12);
  if (lvl === 3) { timp(t0, 0.6, low[0] - 12); timp(t0 + beat * 2, 0.42, low[0] - 12); }
  if (lvl === 4) {
    for (let b = 0; b < 4; b += 1) timp(t0 + b * beat, b === 0 ? 0.7 : 0.45, low[0] - 12);
    if (phase === 15) for (let k = 0; k < 6; k += 1) timp(t0 + beat * 3 + k * (beat / 6), 0.25 + k * 0.05, low[0] - 12); // Wirbel zum Neuanfang
  }

  // Hörner: Heldenmotiv (Stufe 3 und 4), im Finale mit Chor und Oktave
  if (lvl >= 3 && phase % 4 === 0) {
    const motif = phase < 12 ? song.motifA : song.motifB;
    let at = t0 + (phase % 8 === 0 ? 0 : beat * 0.5);
    for (const [step, beats] of motif) {
      const m = degree(root + 12, step);
      horn(at, m, beats * beat, lvl === 4 ? 0.075 : 0.06);
      if (lvl === 4) horn(at, m + 12, beats * beat, 0.032);
      at += beats * beat;
    }
  }
  if (lvl >= 3 && phase % 2 === 0) choir(t0, tones[0] + 12, bar * 2, lvl === 4 ? 0.04 : 0.028);

  // Beckenschlag/Crescendo vor dem Finale und beim Neuanfang
  if (phase === 11) swell(t0 + beat * 2, beat * 2);
  if (phase === 0 && n > 0) { swell(t0 - beat * 0.5, beat * 0.5, 0.2); timp(t0, 0.85, low[0] - 12); }
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
    bus.gain.linearRampToValueAtTime(level * 0.6, ctx.currentTime + 5); // sanft einblenden
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
    if (bus && running) bus.gain.setTargetAtTime(level * 0.6, ctx.currentTime, 0.2);
    if (audioEl) audioEl.volume = level * 0.6;
  },

  /** Für den Pegeltest: eine Taktfolge in einen (Offline-)Kontext rendern. */
  _renderBars: (c, bars) => {
    ctx = c;
    bus = c.createGain();
    bus.gain.value = 0.45;
    bus.connect(c.destination);
    song = null;
    for (let i = 0; i < bars; i += 1) scheduleBar(0.1 + i * (60 / 90) * 4, i);
  },
};

// Sichtbarkeit: im Hintergrund-Tab pausieren
document.addEventListener('visibilitychange', () => {
  if (!ctx || !running) return;
  if (document.hidden) ctx.suspend(); else ctx.resume();
});
