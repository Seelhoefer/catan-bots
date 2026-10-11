// Klänge: komplett synthetisiert mit der Web Audio API – keine Dateien, keine Lizenzen, funktioniert offline.
// Wer lieber echte Aufnahmen nutzt, legt sie in assets/sfx/ ab und nennt sie in assets/sfx/manifest.json
// (z. B. {"road": "road.ogg"}); vorhandene Dateien ersetzen dann den jeweiligen synthetischen Klang.

const KEY = 'catan-sound';

let ctx = null;
let master = null;
let noiseBuf = null;
const files = {}; // name -> AudioBuffer (optionale Aufnahmen)
const last = {};
let enabled = true;
let volume = 0.7;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) { enabled = saved.on !== false; if (typeof saved.vol === 'number') volume = saved.vol; }
} catch { /* egal */ }

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ on: enabled, vol: volume })); } catch { /* egal */ }
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  // 1 s weißes Rauschen als Rohmaterial für Klopfen, Würfeln, Wischen …
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  loadFiles();
  return ctx;
}

async function loadFiles() {
  try {
    const res = await fetch('assets/sfx/manifest.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const map = await res.json();
    await Promise.all(Object.entries(map).map(async ([name, file]) => {
      try {
        const r = await fetch(`assets/sfx/${file}`);
        files[name] = await ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* diese Datei fehlt – synthetischer Klang bleibt */ }
    }));
  } catch { /* kein Manifest */ }
}

// ------------------------------------------------------------------ Bausteine
/** Ton mit Hüllkurve; `to` = Zielfrequenz für Gleiten. */
function tone(t0, { f = 440, to = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.004, out = master }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Gefiltertes Rauschen; `sweep` = Zielfrequenz des Filters. */
function noise(t0, {
  dur = 0.1, f = 1500, sweep = null, q = 1, type = 'bandpass', gain = 0.3, attack = 0.002, out = master,
}) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t0);
  if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl).connect(g).connect(out);
  s.start(t0, Math.random() * 0.8);
  s.stop(t0 + dur + 0.05);
}

/** Harter Klick: sehr kurzer Impuls mit hellem, schnell abklingendem Resonanzton (Würfel auf Holz/Brett). */
function click(t0, { f = 3000, gain = 0.3 } = {}) {
  noise(t0, { dur: 0.012, f, q: 1.2, gain, attack: 0.0008 });
  tone(t0, { f: f * 0.55, to: f * 0.3, dur: 0.035, gain: gain * 0.55, type: 'triangle', attack: 0.0008 });
}

/** Holz-Klopfen: kurzer, tiefer Körper + heller Anschlag. */
function knock(t0, { pitch = 190, gain = 0.5 } = {}) {
  tone(t0, { f: pitch * 1.5, to: pitch * 0.6, dur: 0.09, gain });
  tone(t0, { f: pitch * 3.1, to: pitch * 1.4, dur: 0.05, gain: gain * 0.35, type: 'triangle' });
  noise(t0, { dur: 0.03, f: 1800, q: 0.8, gain: gain * 0.7 });
}

/** Glöckchen mit Obertönen. */
function bell(t0, f, { gain = 0.22, dur = 0.7 } = {}) {
  tone(t0, { f, dur, gain });
  tone(t0, { f: f * 2.76, dur: dur * 0.55, gain: gain * 0.35 });
  tone(t0, { f: f * 5.4, dur: dur * 0.25, gain: gain * 0.12 });
}

/** Münz-Klirren. */
function coin(t0, f = 2093, gain = 0.2) {
  tone(t0, { f, dur: 0.16, gain, type: 'triangle' });
  tone(t0, { f: f * 1.5, dur: 0.22, gain: gain * 0.6 });
  noise(t0, { dur: 0.02, f: 6000, q: 2, gain: gain * 0.5 });
}

const N = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI-Note → Hz

// ------------------------------------------------------------------ Klänge
const SOUNDS = {
  tick: (t) => { tone(t, { f: 900, to: 700, dur: 0.03, gain: 0.07, type: 'triangle' }); },
  select: (t) => { tone(t, { f: 520, to: 700, dur: 0.07, gain: 0.12, type: 'triangle' }); },
  error: (t) => { tone(t, { f: 180, to: 120, dur: 0.14, gain: 0.18, type: 'triangle' }); },

  road: (t) => { knock(t, { pitch: 200 }); knock(t + 0.07, { pitch: 170, gain: 0.35 }); },
  settlement: (t) => { knock(t, { pitch: 230 }); knock(t + 0.09, { pitch: 190 }); bell(t + 0.12, N(79), { gain: 0.08, dur: 0.4 }); },
  city: (t) => {
    tone(t, { f: 95, to: 50, dur: 0.28, gain: 0.55 });
    noise(t, { dur: 0.06, f: 900, q: 0.7, gain: 0.4 });
    knock(t + 0.1, { pitch: 170 });
    knock(t + 0.19, { pitch: 150 });
    [67, 71, 74].forEach((n, i) => bell(t + 0.28 + i * 0.07, N(n), { gain: 0.09, dur: 0.6 }));
  },

  dice: (t) => { // Würfel im Becher: kurzes trockenes Klackern
    let at = t;
    for (let i = 0; i < 11; i += 1) {
      click(at, { f: 2600 + Math.random() * 2200, gain: 0.2 * (1 - i / 16) });
      at += 0.028 + i * 0.006 + Math.random() * 0.02;
    }
  },
  diceLand: (t) => { click(t, { f: 3200, gain: 0.16 }); }, // letztes leises Klicken beim Liegenbleiben
  robberLand: (t) => { tone(t, { f: 130, to: 60, dur: 0.25, gain: 0.5 }); noise(t, { dur: 0.08, f: 500, type: 'lowpass', gain: 0.35 }); },
  deal: (t, o) => { // Karte löst sich vom Feld
    const k = o.pitch || 1;
    noise(t, { dur: 0.1, f: 900 * k, sweep: 3600 * k, q: 0.9, gain: 0.22 });
    tone(t + 0.02, { f: 700 * k, to: 1100 * k, dur: 0.06, gain: 0.04, type: 'triangle' });
  },
  land: (t, o) => { // Karte kommt an: weiches Plopp mit kleinem Funkeln
    const k = o.pitch || 1;
    tone(t, { f: 420 * k, to: 300 * k, dur: 0.09, gain: 0.3 });
    tone(t, { f: 1260 * k, dur: 0.14, gain: 0.07, type: 'triangle' });
  },
  jackpot: (t) => { [79, 84, 88, 91, 96].forEach((n, i) => bell(t + i * 0.06, N(n), { gain: 0.1, dur: 0.7 })); coin(t + 0.25, 2637, 0.1); },
  diceLand: (t, o) => { // Würfel bleiben liegen; Ton richtet sich nach der Augensumme
    knock(t, { pitch: 240, gain: 0.5 });
    const total = o.total || 7;
    if (total === 7) { tone(t + 0.05, { f: 98, to: 55, dur: 0.6, gain: 0.45 }); tone(t + 0.05, { f: 104, to: 58, dur: 0.6, gain: 0.25, type: 'triangle' }); return; }
    const hot = total === 6 || total === 8;
    const base = 60 + (total - 2) * 1.1;
    bell(t + 0.08, N(base + 12), { gain: hot ? 0.2 : 0.12, dur: hot ? 0.9 : 0.5 });
    if (hot) bell(t + 0.16, N(base + 19), { gain: 0.14, dur: 0.9 });
  },
  gather: (t) => { noise(t, { dur: 0.35, f: 600, sweep: 5200, q: 1, gain: 0.25 }); tone(t, { f: 300, to: 900, dur: 0.3, gain: 0.12, type: 'triangle' }); tone(t + 0.28, { f: 1760, dur: 0.25, gain: 0.08 }); },
  whirl: (t) => { noise(t, { dur: 1, f: 300, sweep: 2600, q: 1.4, gain: 0.2, attack: 0.5 }); [72, 76, 79, 84].forEach((n, i) => tone(t + 0.4 + i * 0.07, { f: 440 * 2 ** ((n - 69) / 12), dur: 0.4, gain: 0.06 })); },
  diceHit: (t, o) => { // Würfel schlägt auf: heller „Klack“ (Hartplastik) + kurzer Tischton
    const k = o.pitch || 1;
    click(t, { f: 3300 * k, gain: 0.55 });
    tone(t, { f: 190 * k, to: 110, dur: 0.07, gain: 0.3 });
    noise(t, { dur: 0.04, f: 900, type: 'lowpass', gain: 0.18 });
  },
  gain: (t) => { tone(t, { f: 660, to: 990, dur: 0.09, gain: 0.1, type: 'triangle' }); tone(t + 0.07, { f: 1320, dur: 0.1, gain: 0.06, type: 'triangle' }); },
  token: (t) => { [84, 88, 91, 96].forEach((n, i) => tone(t + i * 0.05, { f: N(n), dur: 0.25, gain: 0.07 })); },

  trade: (t) => { coin(t, 2093); coin(t + 0.09, 2637); coin(t + 0.2, 3136, 0.14); },
  offer: (t) => { bell(t, N(76), { gain: 0.14, dur: 0.5 }); bell(t + 0.14, N(81), { gain: 0.14, dur: 0.6 }); },
  card: (t) => { noise(t, { dur: 0.14, f: 700, sweep: 3200, q: 0.9, gain: 0.3 }); tone(t + 0.1, { f: 1200, dur: 0.05, gain: 0.05, type: 'triangle' }); },
  cardplay: (t) => { noise(t, { dur: 0.16, f: 900, sweep: 4200, q: 0.9, gain: 0.3 }); [76, 83, 88].forEach((n, i) => bell(t + 0.12 + i * 0.07, N(n), { gain: 0.07, dur: 0.5 })); },
  harvest: (t) => { noise(t, { dur: 0.25, f: 2500, sweep: 1200, q: 0.6, gain: 0.2 }); [72, 76, 79].forEach((n, i) => bell(t + 0.1 + i * 0.08, N(n), { gain: 0.09, dur: 0.5 })); },
  monopoly: (t) => { for (let i = 0; i < 6; i += 1) coin(t + i * 0.06, 1800 + i * 260, 0.1); },
  remap: (t) => {
    noise(t, { dur: 0.9, f: 300, sweep: 5000, q: 1.2, gain: 0.35, attack: 0.3 });
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(t + 0.05 + i * 0.1, { f: N(n), dur: 0.5, gain: 0.07, type: 'triangle' }));
  },
  robber: (t) => { tone(t, { f: 110, to: 45, dur: 0.5, gain: 0.55 }); tone(t + 0.02, { f: 82, to: 41, dur: 0.6, gain: 0.35, type: 'triangle' }); noise(t, { dur: 0.12, f: 400, type: 'lowpass', gain: 0.35 }); },
  steal: (t) => { noise(t, { dur: 0.2, f: 3500, sweep: 600, q: 0.8, gain: 0.3 }); },

  turn: (t) => { bell(t, N(79), { gain: 0.14, dur: 0.55 }); },
  vp: (t) => { [72, 76, 79, 84].forEach((n, i) => bell(t + i * 0.09, N(n), { gain: 0.15, dur: 0.8 })); },
  vpOther: (t) => { bell(t, N(76), { gain: 0.07, dur: 0.4 }); },
  win: (t) => {
    [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => bell(t + i * 0.13, N(n), { gain: 0.18, dur: 1.1 }));
    [48, 55].forEach((n) => tone(t, { f: N(n), dur: 1.4, gain: 0.12, type: 'triangle' }));
  },
  lose: (t) => { [67, 64, 60, 55].forEach((n, i) => tone(t + i * 0.2, { f: N(n), dur: 0.6, gain: 0.14, type: 'triangle' })); },
};

// Feinabgleich der Lautstärke je Klang (Messung: Spitzenpegel der synthetisierten Klänge)
const BOOST = {
  gather: 1.6, whirl: 1.6, diceHit: 1.2, tick: 1.8, select: 2.2, error: 2.2, gain: 2.4, token: 1.8, card: 3, cardplay: 1.8, harvest: 1.6,
  steal: 2.4, deal: 2.6, land: 2.2, dice: 2.4, turn: 2.2, remap: 1.6, monopoly: 1.5, vpOther: 2, trade: 1.2, lose: 1.5, offer: 1.4, robber: 0.9,
};

// ------------------------------------------------------------------ API
export const sfx = {
  /** `opts.delay` in ms, `opts.vol` 0–1 (relative Lautstärke). */
  play(name, opts = {}) {
    if (!enabled) return;
    const c = ensure();
    if (!c || !SOUNDS[name]) return;
    const now = performance.now();
    if (now - (last[name] || 0) < 45) return; // keine Doppelklänge
    last[name] = now;
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime + 0.01 + (opts.delay || 0) / 1000;
    // alle Bausteine hängen am `master`; für relative Lautstärke kurz auf einen Zwischenregler umleiten
    const prev = master;
    const vol = (opts.vol ?? 1) * (BOOST[name] ?? 1);
    if (vol !== 1) {
      const out = c.createGain();
      out.gain.value = vol;
      out.connect(prev);
      master = out;
    }
    try {
      if (files[name]) {
        const s = c.createBufferSource();
        s.buffer = files[name];
        s.connect(master);
        s.start(t);
      } else SOUNDS[name](t, opts);
    } finally {
      master = prev;
    }
  },

  /** Muss in einer Nutzergeste aufgerufen werden (Browser-Autoplay-Regeln). */
  unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  },

  /** Gemeinsamer AudioContext (auch für die Musik). */
  context() { return ensure(); },

  get enabled() { return enabled; },

  setEnabled(on) {
    enabled = !!on;
    persist();
    if (enabled) this.play('select');
  },

  get volume() { return volume; },

  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
    persist();
  },

  names: Object.keys(SOUNDS),
};
