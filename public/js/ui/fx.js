// Kleine Inszenierungen: Würfel-Moment, aufpoppende Erträge, fliegende Karten beim Handel.
import { RES } from '../engine/constants.js';
import { ic, resSq, dieHTML } from './dom.js';

const layer = () => document.getElementById('fx');

function rectOfPlayer(pid, res = null) {
  let node = null;
  if (pid === 0 && res) node = document.querySelector(`.rchip[data-res="${res}"]`);
  if (!node) node = document.querySelector(`[data-pid="${pid}"]`);
  return node ? node.getBoundingClientRect() : null;
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
    place(n, rect, pid === 0 ? 0 : (i - 1) * 34, pid === 0 ? 34 : 30);
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

/** Großer Würfel-Moment in der Bildschirmmitte. Gibt die Gesamtdauer zurück. */
export function showDiceHero(dice, who, speedFactor = 1) {
  const box = document.getElementById('diceHero');
  if (!box) return 0;
  const total = dice[0] + dice[1];
  box.className = 'dicehero show';
  box.innerHTML = `<div class="dh">
      <div class="dh-who">${who} würfelt …</div>
      <div class="dh-dice">${dieHTML(dice[0], true)}${dieHTML(dice[1], true)}</div>
      <div class="dh-total ${total === 7 ? 'seven' : ''}"><span>${total}</span>${total === 7 ? '<small>Der Räuber kommt!</small>' : ''}</div>
    </div>`;
  const reveal = 750 * speedFactor;
  const hold = 1500 * speedFactor;
  setTimeout(() => { box.querySelector('.dh-dice')?.classList.add('settled'); box.querySelectorAll('.die').forEach((d) => d.classList.remove('rolling')); box.querySelector('.dh-total')?.classList.add('in'); box.querySelector('.dh-who').textContent = `${who} würfelt ${total}`; }, reveal);
  setTimeout(() => box.classList.add('out'), reveal + hold);
  setTimeout(() => { box.className = 'dicehero'; box.innerHTML = ''; }, reveal + hold + 400);
  return reveal + hold + 200;
}
