// HUD (Kopfzeile), Aktionsleiste, Missionen, Verlauf – als HTML-Strings.
import { RES, RES_INFO, COSTS, DEV_INFO, STRATEGY_LABEL } from '../engine/constants.js';
import { cardHTML } from './cards.js';
import { missionById } from '../engine/missions.js';
import {
  esc, rich, ic, resSq, costHTML, dieHTML,
} from './dom.js';
import { avatarSVG } from './avatars.js';
import { art, piece, COLOR_ID, IMG } from './assets.js';
import { roadIconSVG } from './road.js';

const HUMAN = 0;
export const coarse = () => typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

// ------------------------------------------------------------------ Kopfzeile: links (meine Hand)
export function renderHand(g, inflight = {}) {
  const s = g.s;
  const p = s.players[HUMAN];
  const chips = RES.map((r) => {
    const n = Math.max(0, p.hand[r] - (inflight[r] || 0)); // Karten im Anflug zählen erst bei der Ankunft
    return `<div class="rchip ${n ? '' : 'zero'}" data-res="${r}" title="${RES_INFO[r].name}: ${n}">${resSq(r)}${n ? `<b>${n}</b>` : ''}</div>`;
  }).join('');
  let tokens = '';
  if (s.settings.antiBad && p.tokens > 0) {
    const cost = g.tokenCost(HUMAN);
    const ready = p.tokens >= cost;
    tokens = `<button class="rchip tok ${ready ? 'ready' : ''}" data-act="tokens" title="Anti-Pech-Marker: ${p.tokens} von ${cost} für 1 Rohstoff">
      <span class="rsq tokensq">${ic('clover')}</span><b>${p.tokens}</b><small>/${cost}</small></button>`;
  }
  return `${chips}${tokens}`;
}

/**
 * Meine Rohstoffkarten als Fächer im Fuß des Bildschirms (nur Desktop/Tablet; am Handy zeigen die Chips oben die Hand).
 * `inflight`: Karten, die noch zur Hand fliegen (belegen schon ihren Platz, bleiben aber unsichtbar).
 * `landing`: je Rohstoff, wie viele der sichtbaren letzten Karten gerade ankommen (Aufpoppen).
 */
export function renderHandBar(g, inflight = {}, landing = {}, sel = null) {
  const p = g.s.players[HUMAN];
  const resHtml = renderResGroups(g, p, inflight, landing, sel);
  const devHtml = ['knight', 'roadbuilding', 'plenty', 'monopoly', 'harvest', 'remap', 'victory'].map((t) => {
    const cards = p.dev.filter((c) => c.type === t);
    if (!cards.length) return '';
    const ready = t !== 'victory' && g.playableDev(HUMAN, t);
    const fresh = cards.filter((c) => c.turn >= g.s.turnNumber).length;
    const inner = cards.map((c, i) => `<div class="dcard${c.turn >= g.s.turnNumber && t !== 'victory' ? ' fresh' : ''}" style="--i:${i}">${cardHTML(t)}</div>`).join('');
    const tip = t === 'victory' ? 'Siegpunkt – zählt automatisch' : ready ? `${DEV_INFO[t].name} ausspielen` : `${DEV_INFO[t].name}: ${g.s.turn !== HUMAN ? 'nicht dein Zug' : fresh === cards.length ? 'ab der nächsten Runde' : g.s.devPlayed ? 'nur 1 Karte pro Zug' : 'jetzt nicht möglich'}`;
    return `<div class="dgroup ${ready ? 'ready' : ''}" data-dev="${t}" title="${esc(tip)}">${inner}</div>`;
  }).join('');
  return resHtml + (devHtml ? `<div class="hand-sep"></div>${devHtml}` : '');
}

function renderResGroups(g, p, inflight, landing, sel) {
  return RES.filter((r) => p.hand[r] > 0).map((r) => {
    const n = p.hand[r];
    const hidden = Math.min(inflight[r] || 0, n);
    const visible = n - hidden;
    const cards = Array.from({ length: n }, (_, i) => {
      const cls = (i >= visible ? ' incoming' : (landing[r] && i >= visible - landing[r] ? ' land' : '')) + (sel && i >= n - (sel[r] || 0) ? ' sel' : '');
      return `<div class="rcard r-${r}${cls}" style="--i:${i}"><span class="rc-mark">${ic(r)}</span><span class="rc-art">${ic(r)}</span><span class="rc-name">${RES_INFO[r].name}</span></div>`;
    }).join('');
    return `<div class="rgroup ${sel ? 'pickable' : ''}" data-res="${r}" title="${RES_INFO[r].name}: ${visible}">${cards}</div>`;
  }).join('');
}

/** Angezeigte Siegpunkte: Auszeichnungs-Punkte zählen erst, wenn die Karte beim Spieler angekommen ist (`shown` = angezeigte Halter). */
export function displayVp(g, pid, shown, publicOnly = false) {
  let v = g.vp(pid, publicOnly);
  if (shown) {
    for (const [kind, live] of [['road', g.s.longestRoad.holder], ['army', g.s.largestArmy.holder]]) {
      if (live === pid && shown[kind] !== pid) v -= 2;
      if (shown[kind] === pid && live !== pid) v += 2;
    }
  }
  return v;
}

// ------------------------------------------------------------------ Kopfzeile: alle Spieler als Karten (Reihenfolge = Zugfolge)
export function renderPlayers(g, busy = new Set(), inflight = {}, shown = null) {
  const s = g.s;
  return s.players.map((p) => {
    const active = s.phase !== 'over' && s.turn === p.id;
    const mine = p.id === HUMAN;
    const cards = Math.max(0, g.handCount(p.id) - (mine ? 0 : (inflight[p.id] || 0)));
    const held = (kind) => (shown ? shown[kind] : (kind === 'road' ? s.longestRoad.holder : s.largestArmy.holder)) === p.id;
    const medal = (kind, title) => `<span class="aw-med ${kind}" data-act="award-info" data-kind="${kind}" title="${title}: +2 Siegpunkte" role="img" aria-label="${title}, +2 Siegpunkte">${EMBLEM[kind]}</span>`;
    const badges = (held('road') ? medal('road', 'Längste Handelsstraße') : '') + (held('army') ? medal('army', 'Größte Rittermacht') : '');
    const think = busy.has(p.id) ? '<span class="pc-think" title="überlegt …"><i></i><i></i><i></i></span>' : '';
    return `
      <div class="pcard ${active ? 'active' : ''} ${mine ? 'mine' : ''}" data-pid="${p.id}" style="--pc:${p.color}" title="${esc(p.name)}${p.tagline ? ` – ${esc(p.tagline)}` : ''}${p.strategy && STRATEGY_LABEL[p.strategy.id] ? ` · Plan: ${STRATEGY_LABEL[p.strategy.id]}` : ''}${active ? ' (am Zug)' : ''}">
        <span class="pc-av">${avatarSVG(p.face, p.color, 48)}</span>
        <div class="pc-body">
          <div class="pc-name">${esc(p.name)}${think}</div>
          <div class="pc-stats">
            <span title="Rohstoffkarten auf der Hand">${ic('cards', 'inline')}${cards}</span>
            <span title="Entwicklungskarten auf der Hand">${ic('card', 'inline')}${p.dev.length}</span>
          </div>
        </div>
        ${badges ? `<div class="pc-medals">${badges}</div>` : ''}
        <div class="pc-vp" title="${mine ? 'Deine Siegpunkte' : 'Öffentliche Siegpunkte'} (Ziel: ${s.settings.targetVP})">${ic('trophy', 'inline')}<b>${displayVp(g, p.id, shown, !mine)}</b></div>
      </div>`;
  }).join('');
}

// ------------------------------------------------------------------ Würfel
export function renderDice(g, rolling = false) {
  const d = g.s.dice;
  if (!d || g.s.phase !== 'main') return '';
  return `<div class="dice">${dieHTML(d[0], rolling)}${dieHTML(d[1], rolling)}<div class="dice-sum">${d[0] + d[1]}</div></div>`;
}

// ------------------------------------------------------------------ Aktionsleiste (phasenabhängig)
function buildStatus(g, kind) {
  const s = g.s;
  const p = s.players[HUMAN];
  if (kind === 'road') {
    if (p.pieces.road <= 0) return 'Keine Straßen mehr übrig';
    if (!g.canAfford(HUMAN, COSTS.road)) return 'Dir fehlen Holz + Lehm';
    if (!g.legalRoadSpots(HUMAN).length) return 'Kein freier Platz';
  } else if (kind === 'settlement') {
    if (p.pieces.settlement <= 0) return 'Keine Siedlungen mehr übrig';
    if (!g.canAfford(HUMAN, COSTS.settlement)) return 'Dir fehlen Rohstoffe';
    if (!g.legalSettlementSpots(HUMAN).length) return 'Kein Platz (Straße nötig, Abstandsregel)';
  } else if (kind === 'city') {
    if (p.pieces.city <= 0) return 'Keine Städte mehr übrig';
    if (!g.canAfford(HUMAN, COSTS.city)) return 'Dir fehlen 2 Getreide + 3 Erz';
    if (!g.legalCitySpots(HUMAN).length) return 'Du hast keine Siedlung zum Ausbauen';
  } else if (kind === 'devcard') {
    if (!s.devDeck.length) return 'Stapel leer';
    if (!g.canAfford(HUMAN, COSTS.devcard)) return 'Dir fehlen Wolle, Getreide, Erz';
  }
  return null;
}

/** Illustrierte Figur in deiner Farbe (oder Kartenrücken) statt flachem Icon; null = Icon verwenden. */
function pieceIcon(g, kind) {
  if (!art.ok) return null;
  const cid = COLOR_ID[g.s.players[HUMAN].color] || 'blue';
  if (kind === 'road') return roadIconSVG(cid);
  if (kind === 'settlement' || kind === 'city') return `<img class="tool-piece" src="${piece(cid, kind)}" alt="" draggable="false">`;
  if (kind === 'devcard') return '<span class="cardback"></span>';
  return null;
}

const anyPlayable = (g) => ['knight', 'roadbuilding', 'plenty', 'monopoly', 'remap', 'harvest'].some((t) => g.playableDev(HUMAN, t));

const BUILD_ITEMS = [ // von oben nach unten (die Straße liegt am nächsten am Knopf)
  ['devcard', 'Entwicklungskarte', 'card'],
  ['city', 'Stadt', 'city'],
  ['settlement', 'Siedlung', 'house'],
  ['road', 'Straße', 'road'],
];

function costChips(g, kind) {
  const hand = g.s.players[HUMAN].hand;
  return RES.filter((r) => COSTS[kind][r]).map((r) => `<span class="cost-chip ${hand[r] < COSTS[kind][r] ? 'lack' : ''}">${COSTS[kind][r] > 1 ? `<i>${COSTS[kind][r]}</i>` : ''}${ic(r, 'inline')}</span>`).join('');
}

/** Kann ich das jetzt bauen? Rohstoffe + Spielfiguren + freier Platz (buildStatus liefert den Grund, falls nicht). */
function buildReady(g, kind) {
  return !buildStatus(g, kind);
}

/**
 * Bau-Menü unten links: runder Hauptknopf, darüber (aufgeklappt) die Bauoptionen übereinander – farbig, wenn sie bezahlbar sind –
 * daneben der Handelsknopf (und am Handy der Karten-Knopf).
 */
export function renderFab(g, mode, open) {
  const s = g.s;
  const p = s.players[HUMAN];
  if (s.phase !== 'main') return '';
  const mineTurn = s.turn === HUMAN;
  if (!mineTurn) return ''; // bei fremden Zügen keine Bau-/Handelsknöpfe
  const canAct = mineTurn && s.sub === 'actions' && !(s.roadBuildingLeft > 0);
  const anyReady = canAct && BUILD_ITEMS.some(([k]) => buildReady(g, k));
  const canBank = canAct && RES.some((r) => p.hand[r] >= g.portRatio(HUMAN, r));
  const items = BUILD_ITEMS.map(([kind, label, icon]) => {
    const reason = canAct ? buildStatus(g, kind) : 'Nicht dein Zug';
    return `<button class="fab-item ${!reason ? 'ready' : 'dis'} ${mode === kind ? 'on' : ''}" data-act="${kind === 'devcard' ? 'buy-dev' : `build-${kind}`}" ${reason ? 'data-disabled="1"' : ''} title="${esc(reason || label)}" aria-label="${esc(label)}">
      <span class="fi-ico">${pieceIcon(g, kind) || ic(icon)}</span>
      <span class="fi-cost">${costChips(g, kind)}</span></button>`;
  }).join('');
  const dev = p.dev.length;
  return `
    <div class="fab-stack ${open && canAct ? 'open' : ''}">${items}</div>
    <div class="fab-row">
      <button class="fab-btn main ${anyReady ? 'ready' : ''} ${mode || (open && canAct) ? 'on' : ''}" data-act="fab-toggle" ${canAct ? '' : 'data-disabled="1"'} title="${canAct ? 'Bauen' : 'Bauen: nur in deinem Zug'}" aria-label="Bauen" aria-expanded="${!!(open && canAct)}">${mode ? (pieceIcon(g, mode === 'devcard' ? 'devcard' : mode) || '') : (art.ok ? `<img class="fb-img" src="${IMG.hammer}" alt="" draggable="false">` : ic('hammer'))}</button>
      <button class="fab-btn ${canBank ? 'ready' : ''}" data-act="trade" ${canAct ? '' : 'data-disabled="1"'} title="${canAct ? 'Handeln' : 'Handeln: nur in deinem Zug'}" aria-label="Handeln">${art.ok ? `<img class="fb-img" src="${IMG.scale}" alt="" draggable="false">` : ic('trade')}</button>
      ${dev ? `<button class="fab-btn dev-cell ${anyPlayable(g) ? 'ready' : ''}" data-act="dev" title="Entwicklungskarten" aria-label="Entwicklungskarten">${ic('cards')}<i class="fab-badge">${dev}</i></button>` : ''}
    </div>`;
}

/** „Zug beenden“: goldenes Siegel mit Pfeil (ohne Text). Leuchtet leise, wenn du nichts Bezahlbares mehr hast. */
export function renderNext(g) {
  const s = g.s;
  if (s.phase !== 'main' || s.turn !== HUMAN) return '';
  if (s.roadBuildingLeft > 0) {
    return `<button class="seal skip" data-act="skip-roads" title="Straßenbau überspringen" aria-label="Straßenbau überspringen">${ic('close')}</button>`;
  }
  if (s.sub !== 'actions') return '';
  const idle = !['road', 'settlement', 'city', 'devcard'].some((k) => !buildStatus(g, k));
  return `<button class="seal ${idle ? 'idle' : ''}" data-act="end-turn" title="Zug beenden" aria-label="Zug beenden"><span class="seal-ring"></span><span class="seal-core">${ic('arrow')}</span></button>`;
}

// ------------------------------------------------------------------ Hero: großer Würfeln-Button in der Mitte
export function renderHeroRoll(g) {
  const s = g.s;
  if (s.phase !== 'main' || s.turn !== HUMAN || s.sub !== 'roll' || s.roadBuildingLeft > 0) return '';
  return `<button class="hero-dice" data-act="roll" title="Würfeln (Taste R)" aria-label="Würfeln">${dieHTML(5)}${dieHTML(2)}</button>`;
}

// ------------------------------------------------------------------ Missionen (einklappbar)
/** Wappen der Auszeichnungen (einfarbig, Farbe über currentColor). */
export const EMBLEM = {
  road: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M3 40h42" stroke="currentColor" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/><path d="M19.500 8h9L41 42H7z" fill="currentColor"/><path d="M21.600 10.500h4.800L36 40H12z" fill="#14233a"/><path d="M24 14v4.500M24 22v6M24 32.500v7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M8 17l5-4.500 5 4.500v6H8z" fill="currentColor" transform="translate(-2 2) scale(.9)"/><path d="M36 14.500l4.200-3.600 4.200 3.600V20H36z" fill="currentColor" fill-opacity=".8" transform="translate(-1 2) scale(.9)"/></svg>`,
  army: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="currentColor" stroke-linecap="round" fill="none"><path d="M6 5l36 36M42 5 6 41" stroke-width="3.4"/><path d="M6.500 31.500l10 10M41.500 31.500l-10 10" stroke-width="3.6"/></g><path d="M24 8 38 12.500v12.500c0 8.500-6 14-14 18-8-4-14-9.500-14-18V12.500z" fill="currentColor" stroke="#14233a" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 22l8 5.500 8-5.500M16 29l8 5.500 8-5.500" fill="none" stroke="#14233a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

/** Große Auszeichnungs-Karte für die Zeremonie (Wappen, Titel, Halter, +2). `holder` = Spieler-Objekt oder null (frei). */
export function awardHeroHTML(kind, holder, { prev = null, value = 0 } = {}) {
  const road = kind === 'road';
  const title = road ? 'Längste Handelsstraße' : 'Größte Rittermacht';
  const unit = road ? 'Straßen' : 'Ritter';
  const who = holder
    ? `<span class="ah-av">${avatarSVG(holder.face, holder.color, 64)}</span><b>${esc(holder.name)}</b>`
    : '<span class="ah-av none"></span><b class="dim">wieder frei</b>';
  const sub = holder
    ? (prev ? `nimmt sie ${esc(prev.name)} ab · ${value} ${unit}` : `${value} ${unit}`)
    : 'niemand erfüllt die Bedingung';
  return `<div class="ah ${kind} ${holder ? 'held' : 'free'}">
    <div class="ah-emb">${EMBLEM[kind]}</div>
    <small class="ah-title">${title}</small>
    <div class="ah-who">${who}</div>
    <div class="ah-sub">${sub}</div>
    ${holder ? '<div class="ah-pts">+2 Siegpunkte</div>' : ''}
  </div>`;
}

export function renderMissionBox(g, open) {
  const s = g.s;
  if (!s.missions.length || s.phase === 'setup') return '';
  const icons = s.missions.map((ms) => `<span class="mini-ico ${ms.claimedBy !== null ? 'done' : ''}">${ic(missionById(ms.id).icon)}</span>`).join('');
  const rows = s.missions.map((ms) => {
    const def = missionById(ms.id);
    const prog = g.missionProgress(HUMAN, ms.id);
    const owner = ms.claimedBy !== null ? s.players[ms.claimedBy] : null;
    return `
      <div class="mission ${owner ? 'done' : ''}">
        <span class="msq">${ic(def.icon)}</span>
        <div class="m-body">
          <div class="m-title">${def.name}<span class="m-reward">+1</span></div>
          <div class="m-desc">${def.desc}</div>
          ${owner
    ? `<div class="m-claimed">${avatarSVG(owner.face, owner.color, 18)}${esc(owner.name)} war schneller</div>`
    : `<div class="m-bar"><div style="width:${Math.round((prog.cur / prog.max) * 100)}%"></div></div><div class="m-prog">${prog.cur} / ${prog.max}</div>`}
        </div>
      </div>`;
  }).join('');
  return `<div class="${open ? 'open' : ''}">
    <button class="ftoggle" data-act="toggle-missions" aria-expanded="${!!open}">${icons}<span>Missionen</span>${ic('chev', 'chev')}</button>
    <div class="fpanel">${rows}</div></div>`;
}

// ------------------------------------------------------------------ Verlauf (einklappbar, minimal)
export function renderLogHTML(g, limit = 14) {
  return g.s.log.slice(-limit).map((l) => {
    const p = l.pi !== null && l.pi !== undefined ? g.s.players[l.pi] : null;
    return `<div class="logline">${p ? avatarSVG(p.face, p.color, 18) : '<i></i>'}<span>${rich(l.msg)}</span></div>`;
  }).join('');
}

export function renderLogBox(g, open) {
  const s = g.s;
  if (s.phase === 'setup') return '';
  const last = s.log.length ? s.log[s.log.length - 1].msg : '';
  return `<div class="${open ? 'open' : ''}">
    <button class="ftoggle" data-act="toggle-log" aria-expanded="${!!open}">${ic('chev', 'chev')}<span class="loglast">${rich(last)}</span></button>
    <div class="fpanel loglist">${renderLogHTML(g)}</div></div>`;
}
