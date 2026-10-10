// Inszenierungen mit GSAP (vendor/gsap.min.js): Würfel-Moment, fliegende Karten, aufpoppende Erträge, Konfetti.
import { RES, RES_INFO } from '../engine/constants.js';
import { ic, resSq } from './dom.js';
import { cardHTML } from './cards.js';
import { sfx } from './sfx.js';

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
  tl.to(node, { opacity, scale: 1.15, duration: duration * 0.2, ease: 'back.out(2.4)' })
    .to(node, { motionPath: { path: [p0, ctrl, p1], curviness: 1.4 }, duration: duration * 0.8, ease: 'power2.inOut' }, duration * 0.12)
    .to(node, { scale: 0.62, rotation: spin, duration: duration * 0.8, ease: 'sine.inOut' }, duration * 0.12)
    .to(node, { opacity: 0, scale: 0.4, duration: duration * 0.12, ease: 'power1.in' }, '-=0.1');
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
  const { pid, src, delay = 0, stagger = 120 } = o;
  const seenHex = new Set();
  const perRes = {};
  const total = {};
  for (const e of src) total[e.res] = (total[e.res] || 0) + e.n;
  let k = 0;
  const FLY = 1000;
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
        [[0.07, 0.5], [0.14, 0.28]].forEach(([lag, op]) => arcFly(mk(true), p0, p1, { delay: lag, duration: FLY / 1000, lift, opacity: op, spin }));
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

/** Großer Würfel-Moment in der Bildschirmmitte. Gibt die Gesamtdauer (ms) zurück. */
export function showDiceHero(dice, who, speedFactor = 1, avatar = '') {
  const box = document.getElementById('diceHero');
  if (!box) return 0;
  const g = gs();
  const total = dice[0] + dice[1];
  const T = (DICE_REVEAL * speedFactor) / 1000;
  const hold = 0.95 * speedFactor;
  box.className = 'dicehero show';
  box.innerHTML = `<div class="dh">
      <div class="dh-who">${avatar}<span>${who} würfelt …</span></div>
      <div class="dh-dice">${cubeHTML(dice[0])}${cubeHTML(dice[1])}</div>
      <div class="dh-total ${total === 7 ? 'seven' : total === 6 || total === 8 ? 'hot' : ''}"><span>${total}</span>${total === 7 ? '<small>Der Räuber kommt!</small>' : ''}</div>
    </div>`;
  const totalEl = box.querySelector('.dh-total');
  const nodes = [...box.querySelectorAll('.d3')];
  const lag = 0.09 * speedFactor;
  const done = () => { box.className = 'dicehero'; box.innerHTML = ''; };
  if (!g) {
    totalEl.classList.add('in');
    setTimeout(done, (T + hold) * 1000);
    return (T + hold) * 1000 + 200;
  }
  g.killTweensOf(box);
  g.set(box, { opacity: 1 });
  g.from(box.querySelector('.dh'), { opacity: 0, y: 14, duration: 0.2, ease: 'power2.out' });
  g.set(totalEl, { opacity: 0, scale: 0.3 });
  nodes.forEach((n, i) => {
    throwDie(n, i === 0 ? 1 : -1, T, i * lag);
    // Bodenkontakte von bounce.out: bei 36 %, 73 % und 91 % der Dauer
    [[0.364, 1], [0.727, 0.55], [0.909, 0.3]].forEach(([f, v], k) => {
      g.delayedCall(T * f + i * lag, () => {
        sfx.play('diceHit', { pitch: 1 + i * 0.12 + k * 0.1, vol: v });
        if (k === 0) {
          const ring = document.createElement('i');
          ring.className = 'd3-ring';
          n.append(ring);
          g.fromTo(ring, { scale: 0.25, opacity: 0.9 }, { scale: 1.4, opacity: 0, duration: 0.65, ease: 'power2.out', onComplete: () => ring.remove() });
        }
      });
    });
  });
  // Zahl springt ein, die Summe zählt kurz hoch
  g.delayedCall(T + 0.12 * speedFactor, () => {
    box.querySelector('.dh-who span').textContent = `${who} würfelt ${total}`;
    const span = totalEl.querySelector('span');
    const counter = { v: Math.max(2, total - 4) };
    g.to(totalEl, { opacity: 1, scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)' });
    g.to(counter, { v: total, duration: 0.3, ease: 'none', onUpdate: () => { span.textContent = String(Math.round(counter.v)); } });
    if (total === 7) g.fromTo(totalEl, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.15)', delay: 0.05 });
  });
  g.to(box, { opacity: 0, duration: 0.4, delay: T + hold, ease: 'power1.in', onComplete: done });
  return (T + hold) * 1000 + 200;
}

/** Karte groß einblenden (gekauft oder ausgespielt). Gibt die Dauer in ms zurück. */
export function showCardHero(type, caption, ms = 2300) {
  const old = document.getElementById('cardHero');
  if (old) old.remove();
  const box = document.createElement('div');
  box.id = 'cardHero';
  box.className = 'cardhero';
  box.innerHTML = `<div class="ch-card">${cardHTML(type)}</div><div class="ch-cap">${caption}</div>`;
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
  if (kind === 'win') {
    const burst = (x) => c({ particleCount: 90, spread: 75, startVelocity: 48, origin: { x, y: 0.75 }, colors, ticks: 220, scalar: 1.1 });
    burst(0.2); setTimeout(() => burst(0.8), 180); setTimeout(() => burst(0.5), 380);
    return;
  }
  const chip = document.querySelector('.rchip.vp');
  const r = chip && shown(chip) ? chip.getBoundingClientRect() : null;
  c({ particleCount: 46, spread: 70, startVelocity: 30, gravity: 0.9, ticks: 110, scalar: 0.85, colors, origin: r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.2 } });
}
