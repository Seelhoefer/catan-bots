// Kleine Inszenierungen: Würfel-Moment, aufpoppende Erträge, fliegende Karten beim Handel.
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
    n.style.animationDelay = `${delay + i * 120}ms`;
    layer().append(n);
    setTimeout(() => n.remove(), delay + i * 120 + 1900);
  });
}

/** Karten fliegen von einem Spieler zum anderen. */
export function flyCards(from, to, hand, delay = 0) {
  let k = 0;
  for (const r of RES) {
    for (let i = 0; i < (hand[r] || 0); i++) {
      const a = rectOfPlayer(from, r);
      const b = rectOfPlayer(to, r) || rectOfPlayer(to);
      if (!a || !b) continue;
      const n = document.createElement('div');
      n.className = 'flycard';
      n.innerHTML = resSq(r);
      layer().append(n);
      const x0 = a.left + a.width / 2;
      const y0 = a.top + a.height / 2;
      const x1 = b.left + b.width / 2;
      const y1 = b.top + b.height / 2;
      const anim = n.animate([
        { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
        { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.18 },
        { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 40}px) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(.7)`, opacity: 0 },
      ], { duration: 1000, delay: delay + k * 140, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
      anim.onfinish = () => n.remove();
      k++;
    }
  }
}

// ------------------------------------------------------------------ Würfel-Moment (echte 3D-Würfel)
export const DICE_REVEAL = 900; // ms bis die Würfel liegen (× Tempo-Faktor)

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// Welche Augenzahl liegt auf welcher Würfelseite (gegenüber = 7)
const FACES = [[1, 'rotateY(0deg)'], [6, 'rotateY(180deg)'], [3, 'rotateY(90deg)'], [4, 'rotateY(-90deg)'], [2, 'rotateX(90deg)'], [5, 'rotateX(-90deg)']];
// Drehung (X, Y) des Würfels, bei der die jeweilige Zahl vorne liegt
const ORIENT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const TILT = [-26, -30]; // leichte Schrägsicht, damit man die Würfelform sieht

function cubeHTML() {
  const face = ([n, rot]) => `<div class="dface" style="transform:${rot} translateZ(var(--half))">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
  return `<div class="d3"><div class="d3-shadow"></div><div class="d3-fly"><div class="cube">${FACES.map(face).join('')}</div></div></div>`;
}

const rotStr = (ax, ay, az, ox, oy) => `rotateX(${TILT[0]}deg) rotateY(${TILT[1]}deg) rotateX(${ox + ax}deg) rotateY(${oy + ay}deg) rotateZ(${az}deg)`;

/** Wurf, Aufprall, zweimal Nachhüpfen; Würfel kommen von links/rechts oben. */
function throwDie(node, value, side, T, delay) {
  const fly = node.querySelector('.d3-fly');
  const cube = node.querySelector('.cube');
  const shadow = node.querySelector('.d3-shadow');
  const [ox, oy] = ORIENT[value];
  const spin = (n) => 360 * n;
  const sx = -side * (300 + Math.random() * 60);
  const rnd = () => (Math.random() > 0.5 ? 1 : -1);
  const start = { ax: spin(rnd() * (2 + Math.floor(Math.random() * 2))), ay: spin(rnd() * (2 + Math.floor(Math.random() * 2))), az: rnd() * (90 + Math.random() * 180) };
  const rot = [
    { transform: rotStr(start.ax, start.ay, start.az, ox, oy), offset: 0 },
    { transform: rotStr(start.ax * 0.35, start.ay * 0.35, start.az * 0.35, ox, oy), offset: 0.46, easing: 'ease-out' },
    { transform: rotStr(start.ax * 0.1, start.ay * 0.12, start.az * 0.1, ox, oy), offset: 0.74, easing: 'ease-out' },
    { transform: rotStr(0, 0, 0, ox, oy), offset: 1 },
  ];
  const opts = { duration: T, delay, fill: 'both' };
  cube.animate(rot, { ...opts, easing: 'cubic-bezier(.25,.6,.35,1)' });
  // Flugbahn: Wurf von außen, Aufprall, zwei Hüpfer
  fly.animate([
    { transform: `translate(${sx}px, -330px) scale(1.55)`, offset: 0, easing: 'cubic-bezier(.4,0,.9,.6)' },
    { transform: 'translate(0, 0) scale(1.02, .94)', offset: 0.46, easing: 'cubic-bezier(.2,.7,.4,1)' },
    { transform: 'translate(0, -62px) scale(.99, 1.03)', offset: 0.6, easing: 'cubic-bezier(.5,0,.8,.4)' },
    { transform: 'translate(0, 0) scale(1.01, .97)', offset: 0.74, easing: 'cubic-bezier(.2,.7,.4,1)' },
    { transform: 'translate(0, -16px)', offset: 0.84, easing: 'cubic-bezier(.5,0,.8,.4)' },
    { transform: 'translate(0, 0)', offset: 1 },
  ], opts);
  // Schatten: klein und blass in der Luft, kräftig beim Aufprall
  shadow.animate([
    { transform: 'translateX(0) scale(.5)', opacity: 0.1, offset: 0 },
    { transform: 'scale(1.05)', opacity: 0.55, offset: 0.46 },
    { transform: 'scale(.78)', opacity: 0.3, offset: 0.6 },
    { transform: 'scale(1)', opacity: 0.5, offset: 0.74 },
    { transform: 'scale(.92)', opacity: 0.4, offset: 0.84 },
    { transform: 'scale(1)', opacity: 0.5, offset: 1 },
  ], opts);
}

/** Großer Würfel-Moment in der Bildschirmmitte. Gibt die Gesamtdauer zurück. */
export function showDiceHero(dice, who, speedFactor = 1, avatar = '') {
  const box = document.getElementById('diceHero');
  if (!box) return 0;
  const total = dice[0] + dice[1];
  box.className = 'dicehero show';
  box.innerHTML = `<div class="dh">
      <div class="dh-who">${avatar}<span>${who} würfelt …</span></div>
      <div class="dh-dice">${cubeHTML()}${cubeHTML()}</div>
      <div class="dh-total ${total === 7 ? 'seven' : total === 6 || total === 8 ? 'hot' : ''}"><span>${total}</span>${total === 7 ? '<small>Der Räuber kommt!</small>' : ''}</div>
    </div>`;
  const reveal = DICE_REVEAL * speedFactor;
  const hold = 950 * speedFactor;
  const nodes = [...box.querySelectorAll('.d3')];
  nodes.forEach((n, i) => throwDie(n, dice[i], i === 0 ? 1 : -1, reveal, i * 90 * speedFactor));
  // Aufprall: Klang + Staubring zum Zeitpunkt des ersten Bodenkontakts
  nodes.forEach((n, i) => {
    const hit = (0.46 * reveal) + i * 90 * speedFactor;
    setTimeout(() => { sfx.play('diceHit', { pitch: 1 + i * 0.12 }); const r = document.createElement('i'); r.className = 'd3-ring'; n.append(r); setTimeout(() => r.remove(), 700); }, hit);
    setTimeout(() => sfx.play('diceHit', { pitch: 1.25 + i * 0.1, vol: 0.5 }), 0.74 * reveal + i * 90 * speedFactor);
  });
  setTimeout(() => {
    box.querySelector('.dh-total')?.classList.add('in');
    box.querySelector('.dh-who span').textContent = `${who} würfelt ${total}`;
    box.querySelector('.dh-dice')?.classList.add('settled');
  }, reveal + 120);
  setTimeout(() => box.classList.add('out'), reveal + hold);
  setTimeout(() => { box.className = 'dicehero'; box.innerHTML = ''; }, reveal + hold + 400);
  return reveal + hold + 200;
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
  setTimeout(() => box.classList.add('out'), ms - 350);
  setTimeout(() => box.remove(), ms);
  return ms;
}

// ------------------------------------------------------------------ Ertrag: Karten fliegen vom Feld zur Hand
const hexRect = (id) => {
  const el = document.querySelector(`.hex[data-hid="${id}"]`);
  return shown(el) ? el.getBoundingClientRect() : null;
};

/** Ring, der sich vom Feld ausbreitet. */
function ripple(rect, color, delay) {
  const n = document.createElement('div');
  n.className = 'ripple';
  n.style.setProperty('--c', color);
  n.style.left = `${rect.left + rect.width / 2}px`;
  n.style.top = `${rect.top + rect.height / 2}px`;
  layer().append(n);
  const a = n.animate([
    { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0.9 },
    { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 },
  ], { duration: 800, delay, easing: 'ease-out', fill: 'both' });
  a.onfinish = () => n.remove();
}

/** Quadratischer Bézier-Bogen als Keyframes (mit Ease-in-out entlang der Strecke). */
function arcFrames(p0, p1, lift, size) {
  const ctrl = { x: (p0.x + p1.x) / 2, y: Math.min(p0.y, p1.y) - lift };
  const frames = [];
  const steps = 14;
  const rot = (Math.random() - 0.5) * 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = t * t * (3 - 2 * t);
    const x = (1 - e) ** 2 * p0.x + 2 * (1 - e) * e * ctrl.x + e ** 2 * p1.x;
    const y = (1 - e) ** 2 * p0.y + 2 * (1 - e) * e * ctrl.y + e ** 2 * p1.y;
    const sc = t < 0.2 ? 0.2 + (t / 0.2) * 0.95 : 1.15 - Math.min(1, (t - 0.2) / 0.8) * 0.55;
    const op = t < 0.08 ? t / 0.08 : t > 0.94 ? (1 - t) / 0.06 : 1;
    frames.push({ transform: `translate(${x - size.w / 2}px, ${y - size.h / 2}px) rotate(${rot * Math.sin(t * Math.PI)}deg) scale(${sc})`, opacity: op, offset: t });
  }
  return frames;
}

/**
 * Inszenierung des Ertrags: Ring auf dem Feld, dann fliegen die Karten im Bogen zur Hand des Empfängers.
 * @param {{pid:number, src:{hex:number,res:string,n:number}[], delay?:number, stagger?:number, slot?:(res:string)=>number,
 *   onLaunch?:(i:number,res:string)=>void, onArrive:(res:string, last:boolean)=>void}} o  Gibt die Gesamtdauer (ms) zurück.
 */
export function produceFx(o) {
  const { pid, src, delay = 0, stagger = 120 } = o;
  const seenHex = new Set();
  const perRes = {};
  const total = {};
  for (const e of src) total[e.res] = (total[e.res] || 0) + e.n;
  let k = 0;
  const FLY = 900;
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
        if (!from || !to) { o.onArrive(e.res, slot === total[e.res] - 1); return; }
        o.onLaunch?.(idx, e.res);
        const card = document.createElement('div');
        card.className = `flycard fc r-${e.res}`;
        card.innerHTML = `<span class="rc-art">${ic(e.res)}</span>`;
        layer().append(card);
        const size = { w: 46, h: 66 };
        const p0 = { x: from.left + from.width / 2, y: from.top + from.height / 2 };
        const p1 = { x: to.left + to.width / 2, y: to.top + to.height / 2 };
        const lift = 70 + Math.random() * 50;
        const frames = arcFrames(p0, p1, lift, size);
        // Bewegungsspur: zwei blasse Kopien hinterher
        [60, 120].forEach((lag, ti) => {
          const ghost = card.cloneNode(true);
          ghost.classList.add('ghost');
          ghost.style.opacity = 0;
          layer().append(ghost);
          const ga = ghost.animate(frames.map((f) => ({ ...f, opacity: f.opacity * (ti === 0 ? 0.5 : 0.28) })), { duration: FLY, delay: lag, easing: 'linear', fill: 'both' });
          ga.onfinish = () => ghost.remove();
        });
        const anim = card.animate(frames, { duration: FLY, easing: 'linear', fill: 'both' });
        anim.onfinish = () => { card.remove(); o.onArrive(e.res, slot === total[e.res] - 1, p1); };
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

/** Zähler kurz anschwellen lassen (Ankunft). */
export function bumpPlayer(pid, res = null) {
  const node = pid === 0
    ? (document.querySelector(`.rgroup[data-res="${res}"]`) && shown(document.querySelector(`.rgroup[data-res="${res}"]`)) ? document.querySelector(`.rgroup[data-res="${res}"]`) : document.querySelector(`.rchip[data-res="${res}"]`))
    : document.querySelector(`.opp[data-pid="${pid}"]`);
  if (!node) return;
  node.classList.remove('bump');
  void node.offsetWidth;
  node.classList.add('bump');
  setTimeout(() => node.classList.remove('bump'), 600);
}
