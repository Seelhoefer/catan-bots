// Inszenierungen mit GSAP (vendor/gsap.min.js): Würfel-Moment, fliegende Karten, aufpoppende Erträge, Konfetti.
import { RES, RES_INFO } from '../engine/constants.js';
import { ic, resSq } from './dom.js';
import { cardHTML } from './cards.js';
import { sfx } from './sfx.js';
import { dice3dReady, rollDice3D } from './dice3d.js';

const layer = () => document.getElementById('fx');

const shown = (el) => !!el && el.getClientRects().length > 0;

/** Wo liegt die Hand eines Spielers auf dem Bildschirm? Ich: Kartenfächer (Desktop) oder Chip (Handy); Gegner: Portrait. */
function rectOfPlayer(pid, res = null) {
  let node = null;
  if (pid === 0 && res) {
    node = document.querySelector(`.rgroup[data-res="${res}"]`);
    if (!shown(node)) node = document.querySelector(`.rchip[data-res="${res}"]`);
  }
  if (!shown(node) && pid !== 0) node = document.querySelector(`.opp[data-pid="${pid}"] .opp-av`);
  if (!shown(node)) node = document.querySelector(`[data-pid="${pid}"]`);
  return shown(node) ? node.getBoundingClientRect() : null;
}

function place(node, rect, dx = 0, dy = 0) {
  node.style.left = `${rect.left + rect.width / 2 + dx}px`;
  node.style.top = `${rect.top + rect.height / 2 + dy}px`;
}

const gs = () => window.gsap;
if (gs() && window.MotionPathPlugin) gs().registerPlugin(window.MotionPathPlugin);

/** "+2 [Icon]" steigt über einem Spieler auf. */
export function floatGain(pid, hand, delay = 0) {
  RES.filter((r) => hand[r] > 0).forEach((r, i) => {
    const rect = rectOfPlayer(pid, r);
    if (!rect) return;
    const n = document.createElement('div');
    n.className = 'floater';
    n.innerHTML = `+${hand[r]}${ic(r, 'inline')}`;
    const footer = pid === 0 && rect.top > window.innerHeight * 0.6;
    place(n, rect, pid === 0 ? 0 : (i - 1) * 34, footer ? -rect.height / 2 - 150 : pid === 0 ? 34 : 30);
    layer().append(n);
    const g = gs();
    if (!g) { setTimeout(() => n.remove(), delay + 1800); return; }
    g.set(n, { xPercent: -50, yPercent: -50, opacity: 0, scale: 0.6 });
    g.timeline({ delay: (delay + i * 120) / 1000, onComplete: () => n.remove() })
      .to(n, { opacity: 1, scale: 1.12, duration: 0.28, ease: 'back.out(2.2)' })
      .to(n, { scale: 1, duration: 0.2, ease: 'power2.out' })
      .to(n, { y: -70, duration: 1.2, ease: 'power1.out' }, '<')
      .to(n, { opacity: 0, duration: 0.4, ease: 'power1.in' }, '-=0.45');
  });
}

/** Karten fliegen von einem Spieler zum anderen (Handel). */
export function flyCards(from, to, hand, delay = 0) {
  let k = 0;
  for (const r of RES) {
    for (let i = 0; i < (hand[r] || 0); i++) {
      const a = rectOfPlayer(from, r);
      const b = rectOfPlayer(to, r) || rectOfPlayer(to);
      if (!a || !b) continue;
      const p0 = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
      const p1 = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      const n = document.createElement('div');
      n.className = 'flycard';
      n.innerHTML = resSq(r);
      layer().append(n);
      arcFly(n, p0, p1, { delay: delay / 1000 + k * 0.14, duration: 0.95, lift: 60, size: { w: 28, h: 28 }, onDone: () => n.remove() });
      k++;
    }
  }
}

/** Ein Element im Bogen von p0 nach p1 fliegen lassen (GSAP MotionPath, weiche Beschleunigung, kleiner Schwung). */
function arcFly(node, p0, p1, { delay = 0, duration = 0.9, lift = 80, onDone, size = { w: 0, h: 0 }, opacity = 1, spin = 0 }) {
  const g = gs();
  if (!g) { node.remove(); onDone?.(); return null; }
  const ctrl = { x: (p0.x + p1.x) / 2 + (Math.random() - 0.5) * 30, y: Math.min(p0.y, p1.y) - lift };
  g.set(node, { x: p0.x, y: p0.y, xPercent: -50, yPercent: -50, scale: 0.2, opacity: 0, rotation: 0 });
  const tl = g.timeline({ delay, onComplete: () => { node.remove(); onDone?.(); } });
  tl.to(node, { opacity, scale: 1.1, duration: duration * 0.22, ease: 'sine.out' })
    .to(node, { motionPath: { path: [p0, ctrl, p1], curviness: 1.25 }, duration: duration * 0.82, ease: 'sine.inOut' }, duration * 0.1)
    .to(node, { scale: 0.62, rotation: spin, duration: duration * 0.82, ease: 'sine.inOut' }, duration * 0.1)
    .to(node, { opacity: 0, scale: 0.5, duration: duration * 0.14, ease: 'sine.in' }, duration * 0.86);
  return tl;
}

// ------------------------------------------------------------------ Ertrag: Karten fliegen vom Feld zur Hand
const hexRect = (id) => {
  const el = document.querySelector(`.hex[data-hid="${id}"]`);
  return shown(el) ? el.getBoundingClientRect() : null;
};

/** Ring, der sich vom Feld ausbreitet. */
function ripple(rect, color, delay) {
  const g = gs();
  const n = document.createElement('div');
  n.className = 'ripple';
  n.style.setProperty('--c', color);
  layer().append(n);
  if (!g) { n.remove(); return; }
  g.set(n, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, xPercent: -50, yPercent: -50, scale: 0.3, opacity: 0.9 });
  g.to(n, { scale: 1.6, opacity: 0, duration: 0.85, delay: delay / 1000, ease: 'power2.out', onComplete: () => n.remove() });
}

/**
 * Inszenierung des Ertrags: Ring auf dem Feld, dann fliegen die Karten im Bogen zur Hand des Empfängers.
 * @param {{pid:number, src:{hex:number,res:string,n:number}[], delay?:number, stagger?:number,
 *   onLaunch?:(i:number,res:string)=>void, onArrive:(res:string, last:boolean)=>void}} o  Gibt die Gesamtdauer (ms) zurück.
 */
export function produceFx(o) {
  const { pid, src, delay = 0, stagger = 170 } = o;
  const seenHex = new Set();
  const perRes = {};
  const total = {};
  for (const e of src) total[e.res] = (total[e.res] || 0) + e.n;
  let k = 0;
  const FLY = 1550;
  for (const e of src) {
    const from = hexRect(e.hex);
    for (let j = 0; j < e.n; j++) {
      const idx = k++;
      const at = delay + idx * stagger;
      const slot = perRes[e.res] || 0;
      perRes[e.res] = slot + 1;
      if (from && !seenHex.has(e.hex)) { seenHex.add(e.hex); ripple(from, RES_INFO[e.res].color, Math.max(0, at - 200)); }
      setTimeout(() => {
        const to = destRect(pid, e.res, slot);
        if (!from || !to || !gs()) { o.onArrive(e.res, slot === total[e.res] - 1); return; }
        o.onLaunch?.(idx, e.res);
        const p0 = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
        const p1 = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
        const lift = 70 + Math.random() * 50;
        const spin = (Math.random() - 0.5) * 24;
        const mk = (ghost) => {
          const card = document.createElement('div');
          card.className = `flycard fc r-${e.res}${ghost ? ' ghost' : ''}`;
          card.innerHTML = `<span class="rc-art">${ic(e.res)}</span>`;
          layer().append(card);
          return card;
        };
        // Bewegungsspur: zwei blasse Kopien kurz hinterher
        [[0.09, 0.5], [0.18, 0.28]].forEach(([lag, op]) => arcFly(mk(true), p0, p1, { delay: lag, duration: FLY / 1000, lift, opacity: op, spin }));
        arcFly(mk(false), p0, p1, { duration: FLY / 1000, lift, spin, onDone: () => o.onArrive(e.res, slot === total[e.res] - 1, p1) });
      }, at);
    }
  }
  return delay + Math.max(0, k - 1) * stagger + FLY + 150;
}

/** Zielposition der k-ten ankommenden Karte (eine unsichtbar reservierte Karte im Fächer, sonst die Gruppe/der Chip/das Portrait). */
function destRect(pid, res, slot) {
  if (pid === 0) {
    const cards = document.querySelectorAll(`.rgroup[data-res="${res}"] .rcard.incoming`);
    const c = cards[Math.min(slot, cards.length - 1)];
    if (shown(c)) return c.getBoundingClientRect();
  }
  return rectOfPlayer(pid, res);
}

/** Zähler/Hand kurz anschwellen lassen (Ankunft) – federnd. */
export function bumpPlayer(pid, res = null) {
  const grp = res ? document.querySelector(`.rgroup[data-res="${res}"]`) : null;
  const node = pid === 0
    ? (shown(grp) ? grp : document.querySelector(`.rchip[data-res="${res}"]`))
    : document.querySelector(`.opp[data-pid="${pid}"]`);
  const g = gs();
  if (!node || !g) return;
  g.fromTo(node, { scale: 1.16 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.45)', clearProps: 'transform', overwrite: true });
}

// ------------------------------------------------------------------ Würfel-Moment (echte 3D-Würfel, GSAP)
export const DICE_REVEAL = 1000; // ms bis die Würfel liegen (× Tempo-Faktor)

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// Welche Augenzahl liegt auf welcher Würfelseite (gegenüber = 7)
const FACES = [[1, 'rotateY(0deg)'], [6, 'rotateY(180deg)'], [3, 'rotateY(90deg)'], [4, 'rotateY(-90deg)'], [2, 'rotateX(90deg)'], [5, 'rotateX(-90deg)']];
// Drehung (X, Y) des Würfels, bei der die jeweilige Zahl vorne liegt
const ORIENT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };

/** Würfel: tilt (feste Schrägsicht) > spin (GSAP, endet bei 0) > orient (zeigt die gewürfelte Zahl) > Würfel. */
function cubeHTML(value) {
  const [ox, oy] = ORIENT[value];
  const face = ([n, rot]) => `<div class="dface" style="transform:${rot} translateZ(var(--half))">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
  return `<div class="d3"><div class="d3-shadow"></div><div class="d3-fly"><div class="d3-tilt"><div class="d3-spin"><div class="d3-orient" style="transform:rotateX(${ox}deg) rotateY(${oy}deg)"><div class="cube">${FACES.map(face).join('')}</div></div></div></div></div></div>`;
}

/** Wurf von außen, Aufprall, natürliches Nachhüpfen (bounce.out), Drehung läuft aus. Gibt die Timeline zurück. */
function throwDie(node, side, T, delay) {
  const g = gs();
  const fly = node.querySelector('.d3-fly');
  const spin = node.querySelector('.d3-spin');
  const shadow = node.querySelector('.d3-shadow');
  const sign = () => (Math.random() > 0.5 ? 1 : -1);
  const drop = 380;
  const tl = g.timeline({ delay });
  tl.fromTo(fly, { x: -side * (320 + Math.random() * 80), scale: 1.6 }, { x: 0, scale: 1, duration: T * 0.5, ease: 'power2.out' }, 0);
  tl.fromTo(fly, { y: -drop }, {
    y: 0, duration: T, ease: 'bounce.out',
    onUpdate() {
      const h = Math.max(0, -g.getProperty(fly, 'y'));
      g.set(shadow, { scaleX: 1 / (1 + h / 240), opacity: 0.55 / (1 + h / 130) + 0.04 });
    },
  }, 0);
  tl.fromTo(spin, {
    rotationX: sign() * (540 + Math.random() * 360), rotationY: sign() * (540 + Math.random() * 360), rotationZ: sign() * (120 + Math.random() * 200),
  }, { rotationX: 0, rotationY: 0, rotationZ: 0, duration: T * 0.96, ease: 'power3.out' }, 0);
  return tl;
}

/** Ergebnis des letzten Wurfs für den Aufrufer: wann liegen die Würfel, wann ist alles vorbei (ms). */
export const lastDice = { settleMs: 0, totalMs: 0 };

/**
 * Würfel-Moment: Glas legt sich über das Spiel → Würfel werden geworfen, rollen, hüpfen nach → werden zusammengezogen → Glas verschwindet.
 * Keine Zahlen, keine Texte. Gibt die Gesamtdauer (ms) zurück.
 */
export function showDiceHero(dice, who, speedFactor = 1) {
  const box = document.getElementById('diceHero');
  if (!box) return 0;
  const g = gs();
  const sf = speedFactor;
  box.className = 'dicehero show';
  box.innerHTML = '';
  if (!g) { setTimeout(() => { box.className = 'dicehero'; }, 1500 * sf); lastDice.settleMs = 700 * sf; return 1500 * sf; }
  g.killTweensOf(box);
  g.fromTo(box, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' });
  const clear = () => { box.className = 'dicehero'; box.innerHTML = ''; g.set(box, { clearProps: 'opacity' }); };

  if (dice3dReady()) {
    const hitSound = (k, i) => sfx.play('diceHit', { pitch: 1 + i * 0.12 + k * 0.1, vol: [1, 0.55, 0.3][k], pan: i === 0 ? -0.35 : 0.35, slice: k + i });
    const r = rollDice3D(box, { dice, sf, onHit: hitSound });
    // Zusammenziehen: kurzer Lichtring, dann Glas ausblenden
    g.delayedCall(r.gatherAtMs / 1000 + (r.gatherMs / 1000) * 0.55, () => {
      sfx.play('gather');
      const ring = document.createElement('i');
      ring.className = 'dh-flash';
      box.append(ring);
      g.fromTo(ring, { scale: 0.2, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: () => ring.remove() });
    });
    const fadeAt = r.totalMs / 1000 - 0.1;
    g.to(box, { opacity: 0, duration: 0.35, delay: fadeAt, ease: 'power1.in' });
    r.done.then(() => g.delayedCall(0.3, clear));
    lastDice.settleMs = 300 + r.settleMs;
    lastDice.totalMs = (fadeAt + 0.35) * 1000;
    return lastDice.totalMs;
  }

  // Ersatz ohne WebGL: CSS-Würfel
  const T = DICE_REVEAL * sf / 1000;
  const hold = 0.55 * sf;
  box.innerHTML = `<div class="dh"><div class="dh-dice">${cubeHTML(dice[0])}${cubeHTML(dice[1])}</div></div>`;
  const nodes = [...box.querySelectorAll('.d3')];
  const lag = 0.09 * sf;
  nodes.forEach((n, i) => {
    throwDie(n, i === 0 ? 1 : -1, T, i * lag);
    [[0.364, 1], [0.727, 0.55], [0.909, 0.3]].forEach(([f, v], k) => g.delayedCall(T * f + i * lag, () => sfx.play('diceHit', { pitch: 1 + i * 0.12 + k * 0.1, vol: v, pan: i === 0 ? -0.35 : 0.35, slice: k + i })));
  });
  g.to(box.querySelector('.dh-dice'), { scale: 0.2, opacity: 0, duration: 0.4, delay: T + hold, ease: 'power3.in' });
  g.to(box, { opacity: 0, duration: 0.35, delay: T + hold + 0.3, ease: 'power1.in', onComplete: clear });
  lastDice.settleMs = (T + 0.2) * 1000;
  lastDice.totalMs = (T + hold + 0.65) * 1000;
  return lastDice.totalMs;
}

// ------------------------------------------------------------------ Wirbelsturm über den Feldern mit der gewürfelten Zahl
const SWIRL_COLORS = {
  wood: ['#3f9a63', '#8fd49a', '#2c6c4a'], brick: ['#d27649', '#f0a67c', '#aa502d'], sheep: ['#ffffff', '#f2eee0', '#cfe6b6'],
  wheat: ['#f3cf63', '#ffe9a0', '#d9a93a'], ore: ['#b8c0d0', '#8d97ab', '#e3e8f0'], gold: ['#c8a2ff', '#ffe9a0', '#8f63e0'],
};

/** Ein Wirbel aus Partikeln dreht sich über jedem Treffer-Feld hoch und zieht sich zusammen. Gibt die Dauer (ms) zurück. */
export function whirlHexes(hexes, sf = 1) {
  const g = gs();
  if (!g || !hexes.length) return 0;
  const dur = 1.15 * Math.max(0.7, sf);
  hexes.forEach((hx, hi) => {
    const rect = hexRect(hx.id);
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const R = rect.width * 0.72;
    const cols = SWIRL_COLORS[hx.type] || SWIRL_COLORS.wheat;
    const wrap = document.createElement('div');
    wrap.className = 'whirl';
    wrap.style.cssText = `left:${cx}px;top:${cy}px;width:${R * 2}px;height:${R * 2}px;`;
    wrap.innerHTML = '<i class="wh-disc"></i>';
    layer().append(wrap);
    const disc = wrap.firstChild;
    g.fromTo(disc, { scale: 0.3, opacity: 0, rotation: 0 }, { scale: 1.3, opacity: 0.85, rotation: 520, duration: dur * 0.55, ease: 'power2.out' });
    g.to(disc, { scale: 0.2, opacity: 0, rotation: 900, duration: dur * 0.45, ease: 'power3.in', delay: dur * 0.55 });
    const n = 30;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.className = 'wh-p';
      p.style.background = cols[i % cols.length];
      p.style.width = p.style.height = `${8 + (i % 3) * 3}px`;
      p.style.borderRadius = i % 2 ? '50%' : '2px';
      wrap.append(p);
      parts.push({ el: p, a0: (i / n) * Math.PI * 2, k: 0.55 + (i % 5) * 0.12, h: (i % 7) / 7 });
    }
    const st = { t: 0 };
    g.to(st, {
      t: 1, duration: dur, delay: hi * 0.06, ease: 'power1.inOut',
      onUpdate() {
        const t = st.t;
        const spiral = Math.sin(Math.PI * Math.min(1, t * 1.05)); // schwillt an, zieht sich wieder zusammen
        for (const q of parts) {
          const ang = q.a0 + t * Math.PI * (4.2 + q.k * 2.2);
          const rad = R * (0.18 + 0.82 * q.k * spiral);
          const x = Math.cos(ang) * rad;
          const y = Math.sin(ang) * rad * 0.52 - spiral * R * (0.1 + q.h * 0.45);
          q.el.style.transform = `translate(${x}px, ${y}px) scale(${0.4 + spiral * 0.9})`;
          q.el.style.opacity = String(Math.min(1, spiral * 1.6));
        }
      },
      onComplete: () => wrap.remove(),
    });
  });
  return dur * 1000;
}

/** Karte groß einblenden (gekauft oder ausgespielt). Gibt die Dauer in ms zurück. */
export function showCardHero(type, caption, ms = 2300, imgSrc = null) {
  const old = document.getElementById('cardHero');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'cardHero';
  box.className = 'cardhero';
  box.innerHTML = `<div class="ch-card">${imgSrc ? `<img class="devcard" src="${imgSrc}" alt="" draggable="false">` : cardHTML(type)}</div><div class="ch-cap">${caption}</div>`;
  document.body.append(box);
  const g = gs();
  if (!g) {
    setTimeout(() => box.classList.add('out'), ms - 350);
    setTimeout(() => box.remove(), ms);
    return ms;
  }
  const card = box.querySelector('.ch-card');
  card.style.animation = 'none';
  g.set(box, { perspective: 900 });
  g.timeline({ onComplete: () => box.remove() })
    .from(card, { y: 120, scale: 0.5, rotationY: -100, opacity: 0, duration: 0.7, ease: 'back.out(1.5)' })
    .from(box.querySelector('.ch-cap'), { opacity: 0, y: 16, duration: 0.35, ease: 'power2.out' }, '-=0.3')
    .to(card, { y: -6, duration: 1.2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, '<')
    .to(box, { opacity: 0, duration: 0.35, ease: 'power1.in' }, ms / 1000 - 0.35);
  return ms;
}

/** Konfetti (canvas-confetti): `kind` = 'vp' (kleiner Schauer aus dem Siegpunkt-Chip) oder 'win'. */
export function celebrate(kind = 'vp') {
  const c = window.confetti;
  if (!c) return;
  const colors = ['#e9b949', '#f4efe3', '#ffffff', '#f3c969', '#8fd3ff'];
  if (kind === 'final') {
    // Siegerbildschirm: erst große Salven, dann Regen von beiden Seiten
    const z = { zIndex: 9999 };
    const burst = (x, y = 0.6) => c({ ...z, particleCount: 120, spread: 80, startVelocity: 55, origin: { x, y }, colors, ticks: 260, scalar: 1.15 });
    burst(0.2); setTimeout(() => burst(0.8), 200); setTimeout(() => burst(0.5, 0.45), 450);
    const end = Date.now() + 4200;
    const rain = () => {
      c({ ...z, particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, ticks: 300, startVelocity: 55 });
      c({ ...z, particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, ticks: 300, startVelocity: 55 });
      if (Date.now() < end) requestAnimationFrame(rain);
    };
    setTimeout(rain, 700);
    return;
  }
  if (kind === 'win') {
    const burst = (x) => c({ particleCount: 90, spread: 75, startVelocity: 48, origin: { x, y: 0.75 }, colors, ticks: 220, scalar: 1.1 });
    burst(0.2); setTimeout(() => burst(0.8), 180); setTimeout(() => burst(0.5), 380);
    return;
  }
  const chip = document.querySelector('.rchip.vp');
  const r = chip && shown(chip) ? chip.getBoundingClientRect() : null;
  c({ particleCount: 46, spread: 70, startVelocity: 30, gravity: 0.9, ticks: 110, scalar: 0.85, colors, origin: r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.2 } });
}

// ------------------------------------------------------------------ Bau-Effekte (Staub, Funken, Ring, Lichtstreifen)
const mkEl = (cls, css = '', html = '') => {
  const d = document.createElement('div');
  d.className = cls;
  if (css) d.style.cssText = css;
  if (html) d.innerHTML = html;
  layer().append(d);
  return d;
};

/** Siedlung/Stadt: Aufprall mit Staubwolke, Farbring und goldenen Funken. `u` = Bildschirmpixel pro Brett-Einheit. */
export function buildFxPiece(kind, p, color, u) {
  const g = gs();
  if (!g) return;
  const city = kind === 'city';
  const sc = city ? 1.25 : 1;
  const flash = mkEl('bf-flash', `left:${p.x}px;top:${p.y - u * 0.15}px;`);
  g.fromTo(flash, { xPercent: -50, yPercent: -50, scale: 0.3, opacity: 0.85 }, { scale: 1.6 * sc, opacity: 0, duration: 0.55, ease: 'power2.out', onComplete: () => flash.remove() });
  const ring = mkEl('bf-ring', `left:${p.x}px;top:${p.y}px;border-color:${color};`);
  g.fromTo(ring, { xPercent: -50, yPercent: -50, scaleX: 0.3, scaleY: 0.12, opacity: 0.95 }, { scaleX: 2.3 * sc, scaleY: 0.85 * sc, opacity: 0, duration: 0.7, ease: 'power2.out', delay: 0.12, onComplete: () => ring.remove() });
  const dust = city ? 12 : 8;
  for (let i = 0; i < dust; i++) {
    const side = i % 2 ? 1 : -1;
    const d = mkEl('bf-dust', `left:${p.x}px;top:${p.y}px;width:${10 + Math.random() * 10}px;height:${10 + Math.random() * 10}px;`);
    g.fromTo(d, { xPercent: -50, yPercent: -50, x: side * u * 0.15, y: 0, scale: 0.3, opacity: 0 }, {
      x: side * u * (0.35 + Math.random() * 0.55) * sc, y: -u * (0.05 + Math.random() * 0.22), scale: 1.2 + Math.random() * 0.8, opacity: 0.55,
      duration: 0.25, delay: 0.1 + Math.random() * 0.05, ease: 'power2.out',
    });
    g.to(d, { opacity: 0, y: `-=${u * 0.15}`, scale: '+=0.4', duration: 0.55, delay: 0.35, ease: 'power1.in', onComplete: () => d.remove() });
  }
  const sparks = city ? 12 : 8;
  for (let i = 0; i < sparks; i++) {
    const a = (i / sparks) * Math.PI * 2 + Math.random() * 0.4;
    const dist = u * (0.55 + Math.random() * 0.6) * sc;
    const sp = mkEl('bf-spark', `left:${p.x}px;top:${p.y - u * 0.3}px;color:${i % 3 === 0 ? '#fff' : '#ffd96a'};font-size:${10 + Math.random() * 9}px;`, '✦');
    g.fromTo(sp, { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.2, opacity: 0, rotation: 0 }, {
      x: Math.cos(a) * dist, y: Math.sin(a) * dist * 0.8 - u * 0.15, scale: 1, opacity: 1, rotation: 90 + Math.random() * 90,
      duration: 0.3, delay: 0.1, ease: 'power2.out',
    });
    g.to(sp, { opacity: 0, scale: 0.2, y: `+=${u * 0.35}`, duration: 0.5, delay: 0.38, ease: 'power1.in', onComplete: () => sp.remove() });
  }
}

/** Straße: ein Lichtstreifen läuft von A nach B, hinterlässt Funken. */
export function buildFxRoad(a, b, color, u) {
  const g = gs();
  if (!g) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const bar = mkEl('bf-bar', `left:${a.x}px;top:${a.y}px;width:${len}px;height:${Math.max(8, u * 0.17)}px;background:linear-gradient(90deg, ${color}00, ${color} 55%, #fff);transform-origin:0 50%;`);
  g.set(bar, { rotation: ang, yPercent: -50 });
  g.fromTo(bar, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.34, ease: 'power2.out' });
  g.to(bar, { opacity: 0, duration: 0.4, delay: 0.3, ease: 'power1.in', onComplete: () => bar.remove() });
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const sp = mkEl('bf-spark', `left:${x}px;top:${y}px;color:${i % 2 ? '#fff' : '#ffd96a'};font-size:${9 + (i % 3) * 3}px;`, '✦');
    g.fromTo(sp, { xPercent: -50, yPercent: -50, scale: 0, opacity: 0, rotation: 0, y: 0 }, { scale: 1, opacity: 1, rotation: 120, y: -u * 0.12, duration: 0.2, delay: t * 0.3, ease: 'back.out(2)' });
    g.to(sp, { opacity: 0, scale: 0, y: `-=${u * 0.2}`, duration: 0.4, delay: t * 0.3 + 0.2, ease: 'power1.in', onComplete: () => sp.remove() });
  }
  [a, b].forEach((p2, k) => {
    const ring = mkEl('bf-ring small', `left:${p2.x}px;top:${p2.y}px;border-color:${color};`);
    g.fromTo(ring, { xPercent: -50, yPercent: -50, scale: 0.2, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: 0.5, delay: k ? 0.3 : 0, ease: 'power2.out', onComplete: () => ring.remove() });
  });
}

/** Diebstahl: Das Opfer „zuckt“, die Karte (Rückseite, wenn Bots untereinander) löst sich im Bogen und landet beim Dieb. */
export function stealFx({ from, to, res, onArrive }) {
  const g = gs();
  const a = rectOfPlayer(from, res);
  const b = rectOfPlayer(to, res);
  if (!g || !a || !b) { onArrive?.(); return; }
  const p0 = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  const p1 = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  // Opfer: kurzes Wackeln + roter Ring
  const victim = document.querySelector(`.pcard[data-pid="${from}"]`);
  if (victim) g.fromTo(victim, { x: -5 }, { x: 0, duration: 0.55, ease: 'elastic.out(1, 0.25)', clearProps: 'transform' });
  const ring = mkEl('bf-ring small', `left:${p0.x}px;top:${p0.y}px;border-color:#ff6b6b;`);
  g.fromTo(ring, { xPercent: -50, yPercent: -50, scale: 0.3, opacity: 0.95 }, { scale: 2.2, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => ring.remove() });
  const lift = 90 + Math.random() * 40;
  const mk = (ghost) => {
    const c = document.createElement('div');
    c.className = `flycard fc ${res ? `r-${res}` : 'back'}${ghost ? ' ghost' : ''}`;
    c.innerHTML = res ? `<span class="rc-art">${ic(res)}</span>` : '<span class="cb-mark"></span>';
    layer().append(c);
    return c;
  };
  [[0.1, 0.5], [0.2, 0.28]].forEach(([lag, op]) => arcFly(mk(true), p0, p1, { delay: lag + 0.15, duration: 1.3, lift, opacity: op, spin: 14 }));
  arcFly(mk(false), p0, p1, { delay: 0.15, duration: 1.3, lift, spin: 14, onDone: () => {
    const flash = mkEl('bf-flash', `left:${p1.x}px;top:${p1.y}px;`);
    g.fromTo(flash, { xPercent: -50, yPercent: -50, scale: 0.3, opacity: 0.8 }, { scale: 1.2, opacity: 0, duration: 0.45, ease: 'power2.out', onComplete: () => flash.remove() });
    onArrive?.();
  } });
}

/**
 * Abwerfen bei einer 7: Kartenrücken (bei dir die echten Karten) fliegen vom Spieler zur Brettmitte und lösen sich dort auf;
 * der Spieler wackelt kurz mit rotem Ring. Gibt die Dauer in ms zurück.
 */
export function discardFx({ pid, n, cards = null }) {
  const g = gs();
  const board = document.querySelector('#board');
  if (!g || !board) return 0;
  const br = board.getBoundingClientRect();
  const dest = { x: br.left + br.width / 2, y: br.top + br.height * 0.55 };
  const list = [];
  if (cards && pid === 0) for (const r of Object.keys(cards)) for (let i = 0; i < cards[r]; i++) list.push(r);
  while (list.length < n) list.push(null);
  const shownN = Math.min(list.length, 8);
  const who = document.querySelector(`.pcard[data-pid="${pid}"]`);
  const a0 = rectOfPlayer(pid);
  if (who) g.fromTo(who, { x: -5 }, { x: 0, duration: 0.55, ease: 'elastic.out(1, 0.25)', clearProps: 'transform' });
  if (a0) {
    const ring = mkEl('bf-ring small', `left:${a0.left + a0.width / 2}px;top:${a0.top + a0.height / 2}px;border-color:#ff6b6b;`);
    g.fromTo(ring, { xPercent: -50, yPercent: -50, scale: 0.3, opacity: 0.95 }, { scale: 2.2, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => ring.remove() });
  }
  let total = 0;
  for (let i = 0; i < shownN; i++) {
    const res = list[i];
    const a = rectOfPlayer(pid, res) || a0;
    if (!a) continue;
    const p0 = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    const p1 = { x: dest.x + (i - shownN / 2) * 16 + (Math.random() - 0.5) * 24, y: dest.y + (Math.random() - 0.5) * 30 };
    const c = document.createElement('div');
    c.className = `flycard fc ${res ? `r-${res}` : 'back'}`;
    c.innerHTML = res ? `<span class="rc-art">${ic(res)}</span>` : '<span class="cb-mark"></span>';
    layer().append(c);
    const delay = 0.12 * i;
    arcFly(c, p0, p1, { delay, duration: 1.0, lift: 70 + Math.random() * 40, spin: (Math.random() - 0.5) * 60 });
    total = Math.max(total, (delay + 1.0) * 1000);
  }
  return total;
}

/** Punktgewinn: Zahl poppt, goldener Ring läuft aus, "+n" schwebt hoch. */
export function vpPop(pid, delta) {
  const g = gs();
  const node = document.querySelector(`.pcard[data-pid="${pid}"] .pc-vp`);
  if (!g || !node || !shown(node)) return;
  const r = node.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  g.fromTo(node, { scale: 1.7 }, { scale: 1, duration: 0.85, ease: 'elastic.out(1, 0.45)', clearProps: 'transform' });
  const ring = mkEl('bf-ring small', `left:${cx}px;top:${cy}px;border-color:#f1c95a;`);
  g.fromTo(ring, { xPercent: -50, yPercent: -50, scale: 0.4, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.8, ease: 'power3.out', onComplete: () => ring.remove() });
  const tag = mkEl('floater', `left:${cx}px;top:${cy}px;font-size:15px;`, `+${delta}`);
  g.fromTo(tag, { xPercent: -50, yPercent: -20, y: 0, opacity: 0, scale: 0.7 }, {
    opacity: 1, scale: 1, y: -26, duration: 0.45, ease: 'back.out(2)',
    onComplete: () => g.to(tag, { opacity: 0, y: -46, duration: 0.5, ease: 'power2.in', delay: 0.5, onComplete: () => tag.remove() }),
  });
}

/** Spielerwechsel: die aktive Karte federt kurz auf, der Glanz läuft einmal durch. */
export function turnPulse(pid) {
  const g = gs();
  const node = document.querySelector(`.pcard[data-pid="${pid}"]`);
  if (!g || !node || !shown(node)) return;
  g.fromTo(node, { scale: 1.07, y: -2 }, { scale: 1, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)', clearProps: 'transform' });
}

/** Roter Abzug über der Spielerkarte, z. B. wenn eine Auszeichnung verloren geht. */
export function vpLose(pid, n = 2) {
  const g = gs();
  const node = document.querySelector(`.pcard[data-pid="${pid}"] .pc-vp`);
  if (!g || !node || !shown(node)) return;
  const r = node.getBoundingClientRect();
  g.fromTo(node, { scale: 0.7 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.5)', clearProps: 'transform' });
  const tag = mkEl('floater', `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;font-size:15px;color:#ff8f93;border-color:rgba(255,120,125,.5);`, `−${n}`);
  g.fromTo(tag, { xPercent: -50, yPercent: -20, y: 0, opacity: 0, scale: 0.7 }, {
    opacity: 1, scale: 1, y: 22, duration: 0.4, ease: 'back.out(2)',
    onComplete: () => g.to(tag, { opacity: 0, y: 40, duration: 0.5, ease: 'power2.in', delay: 0.4, onComplete: () => tag.remove() }),
  });
}

/**
 * Zeremonie für Längste Handelsstraße / Größte Rittermacht: Bildschirm dunkelt ab, die Karte erscheint groß in der Mitte
 * (bei einem Wechsel wächst sie aus der Spielerkarte des bisherigen Halters) und wandert dann zur Spielerkarte des neuen Halters.
 * `onLeave` kommt, wenn die Karte die Mitte verlässt, `onLand` bei der Ankunft. Ein Klick beschleunigt.
 */
export function awardCeremony({ html, kind, toPid = null, fromPid = null, onLeave, onLand }) {
  return new Promise((resolve) => {
    const g = gs();
    const stage = document.createElement('div');
    stage.className = 'aw-stage';
    stage.innerHTML = `<div class="aw-dim"></div><div class="aw-card">${html}</div>`;
    document.body.append(stage);
    const dim = stage.querySelector('.aw-dim');
    const card = stage.querySelector('.aw-card');
    const center = (el) => { const r = el?.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
    const pcard = (pid) => center(document.querySelector(`.pcard[data-pid="${pid}"] .pc-av`)) || center(document.querySelector(`.pcard[data-pid="${pid}"]`));
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.46;
    let landed = false;
    const land = () => { if (!landed) { landed = true; onLand?.(); } };
    const end = () => { land(); stage.remove(); resolve(); };
    if (!g) { setTimeout(end, 600); return; }

    const from = fromPid !== null && fromPid !== undefined ? pcard(fromPid) : null;
    g.set(card, { xPercent: -50, yPercent: -50, opacity: 0 });
    const tl = g.timeline({ onComplete: end });
    tl.fromTo(dim, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power2.out' }, 0);
    if (from) tl.fromTo(card, { x: from.x - cx, y: from.y - cy, scale: 0.12, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.9, ease: 'power3.out' }, 0.15);
    else tl.fromTo(card, { x: 0, y: 50, scale: 0.7, opacity: 0, rotationY: -25 }, { y: 0, scale: 1, opacity: 1, rotationY: 0, duration: 0.8, ease: 'back.out(1.6)' }, 0.2);
    tl.call(() => sfx.play('award'), null, 0.25);
    tl.to(card, { y: -8, duration: 0.95, yoyo: true, repeat: 1, ease: 'sine.inOut' }, '>');
    tl.call(() => onLeave?.());
    const target = () => (toPid !== null && toPid !== undefined ? pcard(toPid) : null) || { x: cx, y: 40 };
    tl.to(card, { x: () => target().x - cx, y: () => target().y - cy, scale: 0.14, duration: 0.85, ease: 'power3.inOut', invalidateOnRefresh: true });
    tl.to(dim, { opacity: 0, duration: 0.5, ease: 'power1.in' }, '<0.15');
    tl.to(card, { opacity: 0, duration: 0.18 }, '>-0.2');
    tl.call(land, null, '>-0.12');
    stage.addEventListener('click', () => tl.timeScale(3.2));
  });
}
