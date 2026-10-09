// Seitenleisten, Handkarten und Aktionsleiste (als HTML-Strings).
import { RES, RES_INFO, COSTS, DEV_INFO } from '../engine/constants.js';
import { missionById } from '../engine/missions.js';
import { esc, costHTML, dieHTML } from './dom.js';

const HUMAN = 0;

export function renderPlayers(g) {
  const s = g.s;
  return s.players.map((p) => {
    const active = s.phase !== 'over' && s.turn === p.id;
    const vp = g.vp(p.id, p.id !== HUMAN);
    const len = s.roadLengths ? s.roadLengths[p.id] : 0;
    const hasLR = s.longestRoad.holder === p.id;
    const hasLA = s.largestArmy.holder === p.id;
    return `
      <div class="pcard ${active ? 'active' : ''}" style="--pc:${p.color}">
        <div class="avatar">${p.isBot ? '🤖' : '🧑'}</div>
        <div class="pinfo">
          <div class="pname">${esc(p.name)}${p.id === HUMAN ? ' <em>(Du)</em>' : ''}</div>
          <div class="pstats">
            <span title="Rohstoffkarten auf der Hand">🂠 ${g.handCount(p.id)}</span>
            <span title="Entwicklungskarten auf der Hand">🎴 ${p.dev.length}</span>
            <span title="Gespielte Ritter${hasLA ? ' – Größte Rittermacht' : ''}" class="${hasLA ? 'gold' : ''}">⚔️ ${p.playedKnights}</span>
            <span title="Längste Straße${hasLR ? ' – Längste Handelsstraße' : ''}" class="${hasLR ? 'gold' : ''}">🛣️ ${len}</span>
            ${s.settings.antiBad ? `<span title="Anti-Pech-Marker" class="tok">🍀 ${p.tokens}</span>` : ''}
          </div>
        </div>
        <div class="vp" title="Siegpunkte"><b>${vp}</b><small>/${s.settings.targetVP}</small></div>
      </div>`;
  }).join('');
}

export function renderMissions(g) {
  const s = g.s;
  if (!s.missions.length) return '';
  const cards = s.missions.map((ms) => {
    const def = missionById(ms.id);
    const prog = g.missionProgress(HUMAN, ms.id);
    const claimed = ms.claimedBy !== null;
    const owner = claimed ? s.players[ms.claimedBy] : null;
    const pct = Math.round((prog.cur / prog.max) * 100);
    return `
      <div class="mission ${claimed ? 'done' : ''}" title="${esc(def.desc)}">
        <div class="m-icon">${def.icon}</div>
        <div class="m-body">
          <div class="m-title">${def.name}<span class="m-reward">+1 SP</span></div>
          <div class="m-desc">${def.desc}</div>
          ${claimed
    ? `<div class="m-claimed" style="--pc:${owner.color}"><span class="pdot" style="background:${owner.color}"></span>${esc(owner.name)} war schneller</div>`
    : `<div class="m-bar"><div style="width:${pct}%"></div></div><div class="m-prog">Dein Fortschritt: ${prog.cur}/${prog.max}</div>`}
        </div>
      </div>`;
  }).join('');
  return `<h3 class="panel-title">🎖️ Öffentliche Missionen</h3>${cards}`;
}

export function renderLog(g, limit = 60) {
  return g.s.log.slice(-limit).map((l) => {
    const color = l.pi !== null && l.pi !== undefined ? g.s.players[l.pi].color : 'transparent';
    return `<div class="logline" style="--pc:${color}">${esc(l.msg)}</div>`;
  }).join('');
}

export function renderDice(g, rolling = false) {
  const d = g.s.dice;
  if (!d) return '<div class="dice-empty">🎲</div>';
  return `<div class="dice">${dieHTML(d[0], rolling)}${dieHTML(d[1], rolling)}<div class="dice-sum">${d[0] + d[1]}</div></div>`;
}

export function renderHand(g) {
  const p = g.s.players[HUMAN];
  const cards = RES.map((r) => `
    <div class="res-card r-${r} ${p.hand[r] ? '' : 'zero'}" title="${RES_INFO[r].name}">
      <span class="ri">${RES_INFO[r].icon}</span>
      <b>${p.hand[r]}</b>
      <small>${RES_INFO[r].name}</small>
    </div>`).join('');
  return cards;
}

/** Liefert { reason: string|null } für einen Bau-Button. */
function buildStatus(g, kind, mode) {
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

function buildBtn(g, kind, label, icon, mode) {
  const reason = buildStatus(g, kind, mode);
  const cost = COSTS[kind];
  const p = g.s.players[HUMAN];
  const left = { road: p.pieces.road, settlement: p.pieces.settlement, city: p.pieces.city }[kind];
  return `
    <button class="act build ${mode === kind ? 'on' : ''}" data-act="${kind === 'devcard' ? 'buy-dev' : `build-${kind}`}" ${reason ? 'data-disabled="1"' : ''} title="${esc(reason || label)}">
      <span class="a-icon">${icon}</span>
      <span class="a-label">${label}</span>
      <span class="a-cost">${costHTML(cost)}</span>
      ${left !== undefined ? `<span class="a-left">${left}</span>` : ''}
    </button>`;
}

export function renderActions(g, mode) {
  const s = g.s;
  const p = s.players[HUMAN];
  if (s.phase === 'over') return '';
  if (s.phase === 'setup') return '<div class="dock-note">Gründungsphase – platziere deine Startsiedlungen und -straßen.</div>';

  const myTurn = s.turn === HUMAN;
  const cur = s.players[s.turn];
  if (!myTurn) {
    return `<div class="dock-note"><span class="spinner"></span> ${esc(cur.name)} ist am Zug …</div>
      <div class="act-group">${devBtn(g)}${tokenBtn(g, false)}</div>`;
  }
  if (s.sub === 'roll') {
    return `<button class="roll-btn" data-act="roll">🎲 Würfeln</button><div class="act-group">${devBtn(g)}${tokenBtn(g, true)}</div>`;
  }
  if (s.sub !== 'actions' || s.roadBuildingLeft > 0) {
    if (s.roadBuildingLeft > 0) {
      return `<div class="dock-note">🛣️ Straßenbau: noch <b>${s.roadBuildingLeft}</b> Straße(n) kostenlos platzieren.</div><button class="act ghost" data-act="skip-roads">Überspringen</button>`;
    }
    return '<div class="dock-note">Folge den Hinweisen auf dem Spielfeld …</div>';
  }
  const canTradeBank = RES.some((r) => p.hand[r] >= g.portRatio(HUMAN, r));
  return `
    <div class="act-group builds">
      ${buildBtn(g, 'road', 'Straße', '🛣️', mode)}
      ${buildBtn(g, 'settlement', 'Siedlung', '🏠', mode)}
      ${buildBtn(g, 'city', 'Stadt', '🏰', mode)}
      ${buildBtn(g, 'devcard', 'Karte', '🃏', mode)}
    </div>
    <div class="act-group">
      <button class="act" data-act="trade" ${canTradeBank || g.s.players.length > 1 ? '' : 'data-disabled="1"'}><span class="a-icon">🤝</span><span class="a-label">Handeln</span></button>
      ${devBtn(g)}
      ${tokenBtn(g, true)}
    </div>
    <button class="end-btn" data-act="end-turn">Zug beenden ⏭</button>`;
}

function devBtn(g) {
  const p = g.s.players[HUMAN];
  const n = p.dev.length;
  const playable = ['knight', 'roadbuilding', 'plenty', 'monopoly', 'remap'].some((t) => g.playableDev(HUMAN, t));
  return `<button class="act ${playable ? 'pulse' : ''}" data-act="dev" ${n ? '' : 'data-disabled="1"'} title="Entwicklungskarten">
    <span class="a-icon">🎴</span><span class="a-label">Karten</span>${n ? `<span class="a-badge">${n}</span>` : ''}</button>`;
}

function tokenBtn(g, mine) {
  const s = g.s;
  if (!s.settings.antiBad) return '';
  const p = s.players[HUMAN];
  const cost = g.tokenCost(HUMAN);
  const ready = p.tokens >= cost;
  return `<button class="act token ${ready && mine ? 'pulse' : ''}" data-act="tokens" title="Anti-Pech-Marker">
    <span class="a-icon">🍀</span><span class="a-label">${p.tokens}/${cost}</span></button>`;
}

export function devCardInfo(type) {
  return DEV_INFO[type];
}
