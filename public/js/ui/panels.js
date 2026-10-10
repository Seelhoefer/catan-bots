// HUD (Kopfzeile), Aktionsleiste, Missionen, Verlauf – als HTML-Strings.
import { RES, RES_INFO, COSTS, DEV_INFO } from '../engine/constants.js';
import { cardHTML } from './cards.js';
import { missionById } from '../engine/missions.js';
import {
  esc, rich, ic, resSq, costHTML, dieHTML,
} from './dom.js';
import { avatarSVG } from './avatars.js';
import { art, piece, COLOR_ID } from './assets.js';
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
  const vp = `<div class="rchip vp" title="Deine Siegpunkte (Ziel: ${s.settings.targetVP})">${ic('trophy')}<b>${g.vp(HUMAN)}</b><small>/${s.settings.targetVP}</small></div>`;
  const me = `<div class="me" data-pid="${HUMAN}" style="--pc:${p.color}" title="${esc(p.name)}">${avatarSVG(p.face, p.color, 38)}<b>${esc(p.name)}</b></div>`;
  return `${me}${vp}<span class="hud-sep"></span>${chips}${tokens}`;
}

/**
 * Meine Rohstoffkarten als Fächer im Fuß des Bildschirms (nur Desktop/Tablet; am Handy zeigen die Chips oben die Hand).
 * `inflight`: Karten, die noch zur Hand fliegen (belegen schon ihren Platz, bleiben aber unsichtbar).
 * `landing`: je Rohstoff, wie viele der sichtbaren letzten Karten gerade ankommen (Aufpoppen).
 */
export function renderHandBar(g, inflight = {}, landing = {}) {
  const p = g.s.players[HUMAN];
  const resHtml = renderResGroups(g, p, inflight, landing);
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

function renderResGroups(g, p, inflight, landing) {
  return RES.filter((r) => p.hand[r] > 0).map((r) => {
    const n = p.hand[r];
    const hidden = Math.min(inflight[r] || 0, n);
    const visible = n - hidden;
    const cards = Array.from({ length: n }, (_, i) => {
      const cls = i >= visible ? ' incoming' : (landing[r] && i >= visible - landing[r] ? ' land' : '');
      return `<div class="rcard r-${r}${cls}" style="--i:${i}"><span class="rc-mark">${ic(r)}</span><span class="rc-art">${ic(r)}</span><span class="rc-name">${RES_INFO[r].name}</span></div>`;
    }).join('');
    return `<div class="rgroup" data-res="${r}" title="${RES_INFO[r].name}: ${visible}">${cards}</div>`;
  }).join('');
}

// ------------------------------------------------------------------ Kopfzeile: rechts (Gegner)
export function renderOpps(g, busy = new Set(), inflight = {}) {
  const s = g.s;
  return s.players.filter((p) => p.id !== HUMAN).map((p) => {
    const active = s.phase !== 'over' && s.turn === p.id;
    let status = '';
    if (busy.has(p.id)) status = 'überlegt …';
    else if (active && s.phase === 'main') status = g.openOfferOf(p.id) ? 'handelt' : { roll: 'würfelt', actions: 'am Zug', robber: 'Räuber', steal: 'stiehlt', discard: 'Räuber' }[s.sub] || 'am Zug';
    else if (active) status = 'am Zug';
    const badges = (s.longestRoad.holder === p.id ? `<span class="badge" title="Längste Handelsstraße">${ic('road')}</span>` : '')
      + (s.largestArmy.holder === p.id ? `<span class="badge" title="Größte Rittermacht">${ic('sword')}</span>` : '');
    return `
      <div class="opp ${active ? 'active' : ''}" data-pid="${p.id}" style="--pc:${p.color}" title="${esc(p.name)}${p.tagline ? ` – ${esc(p.tagline)}` : ''}">
        <span class="opp-av">${avatarSVG(p.face, p.color, 52)}</span>
        <div class="opp-body">
          <div class="opp-name">${esc(p.name)}${badges}</div>
          <div class="opp-stats">
            <span title="Rohstoffkarten auf der Hand">${ic('cards', 'inline')}${Math.max(0, g.handCount(p.id) - (inflight[p.id] || 0))}</span>
            <span title="Entwicklungskarten auf der Hand">${ic('card', 'inline')}${p.dev.length}</span>
          </div>
          <div class="opp-status">${status}</div>
        </div>
        <div class="opp-vp" title="Öffentliche Siegpunkte">${g.vp(p.id, true)}</div>
      </div>`;
  }).join('');
}

// ------------------------------------------------------------------ Kopfzeile: Mitte (wer ist dran / was jetzt)
export function turnInfo(g, mode) {
  const s = g.s;
  const cur = s.players[s.turn];
  const me = s.turn === HUMAN;
  const out = { color: cur.color, pid: cur.id, who: '', what: '', next: '' };
  if (s.phase === 'over') {
    const w = s.players[s.winner];
    return { ...out, color: w.color, pid: w.id, who: 'Spiel beendet', what: `${w.name} gewinnt` };
  }
  if (s.phase === 'setup') {
    const first = s.setup.step < s.players.length;
    const nth = first ? '1.' : '2.';
    out.who = me ? 'Du bist dran' : `${cur.name} ist am Zug`;
    if (!me) { out.what = `Gründung · ${nth} Siedlung`; return out; }
    if (s.sub === 'settlement') {
      out.what = `Wähle einen Platz für deine ${nth} Siedlung`;
      out.next = first ? 'Danach setzt du eine Straße daran.' : 'Danach eine Straße – und du erhältst Startrohstoffe.';
    } else {
      out.what = 'Setze eine Straße an deine neue Siedlung';
      const nx = s.setup.order[s.setup.step + 1];
      if (nx === undefined) out.next = 'Danach beginnt das Spiel.';
      else if (nx === HUMAN) out.next = 'Danach bist du direkt noch einmal dran.';
      else out.next = `Danach ist ${s.players[nx].name} dran.`;
    }
    return out;
  }
  if (s.sub === 'discard') {
    const need = s.discard[HUMAN];
    out.who = 'Eine 7!';
    out.what = need !== undefined ? `Wirf ${need} Karten ab` : 'Spieler mit über 7 Karten werfen die Hälfte ab';
    return out;
  }
  if (s.sub === 'gold') {
    const n = s.gold[HUMAN];
    out.who = 'Wahlfeld!';
    out.what = n ? `Wähle ${n} Rohstoff${n > 1 ? 'e' : ''} deiner Wahl` : 'Spieler wählen ihre Rohstoffe';
    return out;
  }
  if (!me) {
    out.who = `${cur.name} ist am Zug`;
    out.what = { roll: 'würfelt', actions: 'baut und handelt', robber: 'versetzt den Räuber', steal: 'stiehlt eine Karte' }[s.sub] || '';
    return out;
  }
  out.who = 'Du bist dran';
  if (mode === 'harvest') { out.what = 'Wähle ein Feld, von dem du ernten möchtest'; out.next = 'Siedlung = 1 Karte, Stadt = 2 Karten · Esc bricht ab.'; return out; }
  if (s.sub === 'roll') { out.what = 'Würfle, um Rohstoffe zu erhalten'; out.next = 'Danach kannst du bauen und handeln.'; return out; }
  if (s.sub === 'robber') { out.what = 'Versetze den Räuber auf ein Feld'; out.next = 'Danach stiehlst du eine Karte von einem Nachbarn.'; return out; }
  if (s.sub === 'steal') { out.what = 'Von wem möchtest du stehlen?'; return out; }
  if (s.roadBuildingLeft > 0) { out.what = `Setze noch ${s.roadBuildingLeft} kostenlose Straße${s.roadBuildingLeft > 1 ? 'n' : ''}`; return out; }
  if (mode) {
    out.what = { road: 'Wähle einen Platz für deine Straße', settlement: 'Wähle einen Platz für deine Siedlung', city: 'Wähle die Siedlung, die zur Stadt wird', harvest: 'Wähle ein Feld, von dem du ernten möchtest' }[mode];
    out.next = coarse() ? 'Tippe einen Platz an, tippe erneut zum Bauen.' : 'Klicke einen Platz an, klicke erneut zum Bauen · Esc bricht ab.';
    return out;
  }
  return out;
}

export function renderTurn(g, mode) {
  const t = turnInfo(g, mode);
  return {
    key: `${g.s.phase}-${g.s.turn}`,
    html: `<div class="turn" style="--pc:${t.color}">
      <div class="turn-who">${avatarSVG(g.s.players[t.pid ?? g.s.turn].face, t.color, 32)}${esc(t.who)}</div>
      ${t.what ? `<div class="turn-what">${esc(t.what)}</div>` : ''}
      ${t.next ? `<div class="turn-next">${esc(t.next)}</div>` : ''}
    </div>`,
  };
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

function tool(g, kind, label, icon, mode) {
  const reason = buildStatus(g, kind);
  return `<button class="tool ${mode === kind ? 'on' : ''}" data-act="${kind === 'devcard' ? 'buy-dev' : `build-${kind}`}" ${reason ? 'data-disabled="1"' : ''} title="${esc(reason || label)}">
    <span class="tool-ico">${pieceIcon(g, kind) || ic(icon)}</span><span class="tool-name">${label}</span><span class="tool-cost">${costHTML(COSTS[kind])}</span></button>`;
}

const anyPlayable = (g) => ['knight', 'roadbuilding', 'plenty', 'monopoly', 'remap', 'harvest'].some((t) => g.playableDev(HUMAN, t));

export function renderDock(g, mode, pending = null) {
  const s = g.s;
  const p = s.players[HUMAN];
  // Vorwählen und Bauen laufen allein über das Brett: erster Klick = Vorschau, zweiter Klick auf denselben Platz = bauen (keine Bestätigungsleiste)
  if (s.phase !== 'main' || s.turn !== HUMAN) return '';

  if (s.roadBuildingLeft > 0) {
    return `<span class="dock-note">${ic('road', 'inline')} Straßenbau</span><button class="btn quiet" data-act="skip-roads">Überspringen</button>`;
  }
  if (s.sub === 'roll') {
    return anyPlayable(g) ? `<button class="btn quiet" data-act="dev">${ic('card', 'inline')} Karte vor dem Würfeln spielen</button>` : '';
  }
  if (s.sub !== 'actions') return '';

  const canBank = RES.some((r) => p.hand[r] >= g.portRatio(HUMAN, r));
  return `
    <div class="tools">
      ${tool(g, 'road', 'Straße', 'road', mode)}
      ${tool(g, 'settlement', 'Siedlung', 'house', mode)}
      ${tool(g, 'city', 'Stadt', 'city', mode)}
      ${tool(g, 'devcard', 'Karte kaufen', 'card', mode)}
    </div>
    <span class="dock-sep"></span>
    <button class="tool ${canBank ? '' : 'plain'}" data-act="trade" title="Handeln"><span class="tool-ico">${ic('trade')}</span><span class="tool-name">Handeln</span></button>
    ${p.dev.length ? `<button class="tool" data-act="dev" title="Entwicklungskarten"><span class="tool-ico">${art.ok ? '<span class="cardback stack"></span>' : ic('cards')}${anyPlayable(g) ? '<i class="dot"></i>' : ''}</span><span class="tool-name">Karten · ${p.dev.length}</span></button>` : ''}
    <span class="dock-sep"></span>
    <button class="btn solid" data-act="end-turn">Zug beenden</button>`;
}

// ------------------------------------------------------------------ Hero: großer Würfeln-Button in der Mitte
export function renderHeroRoll(g) {
  const s = g.s;
  if (s.phase !== 'main' || s.turn !== HUMAN || s.sub !== 'roll' || s.roadBuildingLeft > 0) return '';
  return `<button class="hero-roll" data-act="roll"><span class="hr-dice">${ic('dice')}</span><span class="hr-text">Würfeln</span><small>oder Taste R</small></button>`;
}

// ------------------------------------------------------------------ Missionen (einklappbar)
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
