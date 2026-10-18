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
let paused = false;
let volume = 0.7;
const MASTER_SOFT = 0.62; // Gesamtpegel: dezenter als früher
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
  master.gain.value = volume * MASTER_SOFT;
  const soft = ctx.createBiquadFilter(); // nimmt die Schärfe aus den synthetischen Klängen
  soft.type = 'lowpass';
  soft.frequency.value = 5200;
  soft.Q.value = 0.4;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  master.connect(soft).connect(comp).connect(ctx.destination);
  // 1 s weißes Rauschen als Rohmaterial für Klopfen, Würfeln, Wischen …
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  loadFiles();
  loadSamples();
  return ctx;
}

/** Mitgelieferte Aufnahmen (echte Würfel). Fehlen sie, bleibt der synthetische Klang. */
const samples = {};
async function loadSamples() {
  const list = { dice: 'dice-roll.mp3', fanfare: 'award-fanfare.mp3', kick: 'build-kick.mp3' };
  await Promise.all(Object.entries(list).map(async ([key, file]) => {
    try {
      const res = await fetch(`assets/sfx/${file}`);
      if (res.ok) samples[key] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch { /* kein Sample – synthetischer Klang */ }
  }));
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


// Positionen der einzelnen „Klacks“ in dice-roll.mp3 (Sekunden)
const DICE_CLACKS = [0.062, 0.178, 0.269, 0.332, 0.39, 0.441];
const rr = (a, b) => a + Math.random() * (b - a);
let roomBuf = null;

/** Kurzer, dunkler Raumhall (Holztisch im Zimmer): gerauschter Impuls, der schnell abklingt. */
function roomImpulse() {
  if (roomBuf && roomBuf.sampleRate === ctx.sampleRate) return roomBuf;
  const len = Math.floor(ctx.sampleRate * 0.45);
  roomBuf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = roomBuf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i += 1) {
      lp += (Math.random() * 2 - 1 - lp) * 0.3; // Tiefpass: dumpf statt zischend
      d[i] = lp * (1 - i / len) ** 3.4;
    }
  }
  return roomBuf;
}

/**
 * Spielt (einen Ausschnitt der) Würfelaufnahme veredelt ab: Wärme im Bass, leichte Präsenz, sanft abgesenkte Höhen,
 * Stereoposition und ein Hauch Raumhall. Gibt false zurück, wenn die Aufnahme nicht geladen ist.
 */
function sampleOut(buf, t, { offset = 0, dur = null, rate = 1, gain = 0.3, pan = 0, wet = 0.18, eq = true, out = master }) {
  if (!buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  if (dur) { g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  if (eq === true) { // Würfel: Wärme im Bass, Präsenz, sanfte Höhen
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 220; low.gain.value = 3.5;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 2800; mid.Q.value = 0.8; mid.gain.value = 1.5;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 7500; high.gain.value = -3;
    src.connect(low); low.connect(mid); mid.connect(high); high.connect(g);
  } else if (eq === 'soft') { // Fanfare: runder, weniger schneidend
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.5;
    const sh = ctx.createBiquadFilter(); sh.type = 'peaking'; sh.frequency.value = 2400; sh.Q.value = 0.9; sh.gain.value = -3;
    src.connect(lp); lp.connect(sh); sh.connect(g);
  } else src.connect(g);
  const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (panner) { panner.pan.value = pan; g.connect(panner); panner.connect(out); } else g.connect(out);
  if (wet > 0) {
    const send = ctx.createGain(); send.gain.value = wet;
    const verb = ctx.createConvolver(); verb.buffer = roomImpulse();
    g.connect(send); send.connect(verb); verb.connect(out);
  }
  src.start(t, offset, dur ? dur + 0.03 : undefined);
  return true;
}
const diceSample = (t, o) => sampleOut(samples.dice, t, o);
/** Wumms beim Bauen: tiefer Kick, je nach Gewicht des Bauteils höher oder tiefer. */
const kick = (t, { rate = 1, gain = 0.5 } = {}) => sampleOut(samples.kick, t, { rate, gain, wet: 0.08, eq: false });

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

  road: (t) => { kick(t, { rate: 1.3, gain: 0.3 }); knock(t, { pitch: 200, gain: 0.7 }); knock(t + 0.07, { pitch: 170, gain: 0.3 }); },
  settlement: (t) => { kick(t, { rate: 1, gain: 0.38 }); knock(t, { pitch: 230, gain: 0.7 }); knock(t + 0.09, { pitch: 190 }); bell(t + 0.12, N(79), { gain: 0.08, dur: 0.4 }); },
  city: (t) => {
    if (!kick(t, { rate: 0.82, gain: 0.45 })) tone(t, { f: 95, to: 50, dur: 0.28, gain: 0.55 });
    noise(t, { dur: 0.06, f: 900, q: 0.7, gain: 0.4 });
    knock(t + 0.1, { pitch: 170 });
    knock(t + 0.19, { pitch: 150 });
    [67, 71, 74].forEach((n, i) => bell(t + 0.28 + i * 0.07, N(n), { gain: 0.09, dur: 0.6 }));
  },

  dice: (t, o) => { // Wurf: leises Luftrauschen beim Werfen + echtes Klackern, das mit dem ersten Aufprall beginnt
    const lead = 0.45 * (o.sf || 1);
    noise(t, { dur: 0.32, f: 500, sweep: 1900, q: 0.8, gain: 0.045, attack: 0.14 });
    const ok = diceSample(t + Math.max(0, lead - DICE_CLACKS[0]), { gain: 0.36, rate: rr(0.97, 1.04), pan: rr(-0.25, 0.25), wet: 0.2 });
    if (ok) return;
    let at = t + lead;
    for (let i = 0; i < 11; i += 1) { click(at, { f: 2600 + Math.random() * 2200, gain: 0.2 * (1 - i / 16) }); at += 0.028 + i * 0.006 + Math.random() * 0.02; }
  },
  robberLand: (t) => { tone(t, { f: 130, to: 60, dur: 0.25, gain: 0.5 }); noise(t, { dur: 0.08, f: 500, type: 'lowpass', gain: 0.35 }); },
  deal: (t, o) => { // Karte löst sich vom Feld
    const k = o.pitch || 1;
    noise(t, { dur: 0.08, f: 900 * k, sweep: 3000 * k, q: 0.9, gain: 0.16 });
  },
  land: (t, o) => { // Karte kommt an: weiches Plopp mit kleinem Funkeln
    const k = o.pitch || 1;
    tone(t, { f: 420 * k, to: 300 * k, dur: 0.07, gain: 0.22 });
  },
  jackpot: (t) => { tone(t, { f: N(84), dur: 0.16, gain: 0.07, type: 'triangle' }); tone(t + 0.07, { f: N(91), dur: 0.2, gain: 0.05, type: 'triangle' }); }, // kurz und trocken, kein Nachhall
  diceLand: (t, o) => { // Würfel bleiben liegen: letztes leises Auskullern der Aufnahme; Ton richtet sich nach der Augensumme
    if (!diceSample(t, { offset: DICE_CLACKS[5], dur: 0.26, gain: 0.2, rate: rr(0.95, 1), wet: 0.25 })) knock(t, { pitch: 240, gain: 0.5 });
    else knock(t, { pitch: 240, gain: 0.22 });
    const total = o.total || 7;
    if (total === 7) { tone(t + 0.05, { f: 98, to: 55, dur: 0.6, gain: 0.45 }); tone(t + 0.05, { f: 104, to: 58, dur: 0.6, gain: 0.25, type: 'triangle' }); return; }
    const hot = total === 6 || total === 8;
    const base = 60 + (total - 2) * 1.1;
    bell(t + 0.08, N(base + 12), { gain: hot ? 0.13 : 0.09, dur: hot ? 0.4 : 0.28 });
    if (hot) bell(t + 0.15, N(base + 19), { gain: 0.07, dur: 0.3 });
  },
  award: (t) => { // Auszeichnung: echte Fanfare, bewusst zurückgenommen und weich gefiltert; ohne Aufnahme ein kurzer Akkord
    if (sampleOut(samples.fanfare, t, { gain: 0.27, eq: 'soft', wet: 0.32 })) { tone(t + 0.05, { f: 98, to: 82, dur: 0.7, gain: 0.12 }); return; }
    [67, 72, 76, 79].forEach((n, i) => bell(t + i * 0.1, N(n), { gain: 0.12, dur: 0.9 }));
  },
  gather: (t) => { noise(t, { dur: 0.35, f: 600, sweep: 5200, q: 1, gain: 0.25 }); tone(t, { f: 300, to: 900, dur: 0.3, gain: 0.12, type: 'triangle' }); tone(t + 0.28, { f: 1760, dur: 0.25, gain: 0.08 }); },
  whirl: (t) => { noise(t, { dur: 1, f: 300, sweep: 2600, q: 1.4, gain: 0.2, attack: 0.5 }); [72, 76, 79, 84].forEach((n, i) => tone(t + 0.4 + i * 0.07, { f: 440 * 2 ** ((n - 69) / 12), dur: 0.4, gain: 0.06 })); },
  diceHit: (t, o) => { // Würfel schlägt auf: echter Klack aus der Aufnahme (je Aufprall ein anderer) + dumpfer Tischton
    const k = o.pitch || 1;
    const slice = [DICE_CLACKS[1], DICE_CLACKS[2], DICE_CLACKS[4], DICE_CLACKS[3]][(o.slice ?? 0) % 4];
    const real = diceSample(t, { offset: slice, dur: 0.09, rate: 0.94 + (k - 1) * 0.5 + rr(-0.03, 0.03), gain: 0.65, pan: o.pan || 0, wet: 0.16 });
    if (!real) { click(t, { f: 3300 * k, gain: 0.55 }); noise(t, { dur: 0.04, f: 900, type: 'lowpass', gain: 0.18 }); }
    tone(t, { f: 190 * k, to: 110, dur: 0.07, gain: real ? 0.12 : 0.3 });
  },
  gain: (t) => { tone(t, { f: 660, to: 880, dur: 0.07, gain: 0.07, type: 'triangle' }); },
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
  gather: 1.6, whirl: 1.6, tick: 1.8, select: 2.2, error: 2.2, gain: 2.4, token: 1.8, card: 3, cardplay: 1.8, harvest: 1.6,
  steal: 2.4, deal: 2.6, land: 2.2, turn: 2.2, remap: 1.6, monopoly: 1.5, vpOther: 2, trade: 1.2, lose: 1.5, offer: 1.4, robber: 0.9,
};

// Dezenter: häufige Klänge sehr leise, Ereignisse mittel, nur Sieg/Höhepunkte etwas präsenter
const SOFT = {
  tick: 0.55, select: 0.6, error: 0.6, deal: 0.4, land: 0.4, gain: 0.65, token: 0.7, dice: 1, diceHit: 1, diceLand: 1, whirl: 0.6, gather: 0.6,
  turn: 0.6, offer: 0.7, trade: 0.7, card: 0.7, cardplay: 0.7, steal: 0.55, robber: 0.7, robberLand: 0.6, harvest: 0.7, remap: 0.75, monopoly: 0.75,
  road: 0.7, settlement: 0.75, city: 0.75, vp: 0.8, award: 1, vpOther: 0.6, lose: 0.7, win: 0.85, jackpot: 0.6,
};

// ------------------------------------------------------------------ API
export const sfx = {
  /** `opts.delay` in ms, `opts.vol` 0–1 (relative Lautstärke). */
  play(name, opts = {}) {
    if (!enabled || paused) return;
    const c = ensure();
    if (!c || !SOUNDS[name]) return;
    const now = performance.now();
    if (now - (last[name] || 0) < (name === 'deal' || name === 'land' || name === 'tick' ? 110 : 45)) return; // keine Doppelklänge
    last[name] = now;
    if (c.state === 'suspended') c.resume();
    const t = c.currentTime + 0.01 + (opts.delay || 0) / 1000;
    // alle Bausteine hängen am `master`; für relative Lautstärke kurz auf einen Zwischenregler umleiten
    const prev = master;
    const vol = (opts.vol ?? 1) * (BOOST[name] ?? 1) * (SOFT[name] ?? 0.7);
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
    if (c && c.state === 'suspended' && !paused) c.resume();
  },

  /** Pause: der gemeinsame AudioContext (Effekte und Musik) wird angehalten und danach fortgesetzt. */
  setPaused(on) {
    paused = !!on;
    if (!ctx) return;
    if (paused) ctx.suspend(); else ctx.resume();
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
    if (master) master.gain.value = volume * MASTER_SOFT;
    persist();
  },

  names: Object.keys(SOUNDS),
};
