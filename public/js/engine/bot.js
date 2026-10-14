// Computergegner. `botAct` führt pro Aufruf genau eine Aktion aus und meldet zurück, was passiert ist.
//   { did: true }          – es wurde etwas getan, bitte erneut aufrufen
//   { end: true }          – der Bot ist fertig (Controller beendet den Zug)
//   { offer: {give, get} } – der Bot möchte einen Spielertausch anbieten
//   { wait: true }         – der Bot ist gerade nicht an der Reihe

import { RES, COSTS, PIP } from './constants.js';

const RES_W = {
  wood: 1, brick: 1, sheep: 0.85, wheat: 1.1, ore: 1.1, gold: 1.3,
};
const DIFF = {
  easy: { noise: 4, trade: 0.35, smart: false },
  normal: { noise: 1.2, trade: 0.7, smart: true },
  hard: { noise: 0.25, trade: 1, smart: true },
};

// Schwierigkeit pro Bot (Spieler-Feld `difficulty`), sonst die Grundeinstellung des Spiels
const cfg = (g, pi) => DIFF[(pi != null && g.s.players[pi]?.difficulty) || g.s.settings.difficulty] || DIFF.normal;
const traitOf = (g, pi) => g.player(pi).trait;
const rnd = (g, n = 1) => (g.rng() - 0.5) * 2 * n;

function memory(g, pi) {
  const s = g.s;
  let m = s.botMemory[pi];
  if (!m || m.turn !== s.turnNumber) {
    m = { turn: s.turnNumber, actions: 0, offers: 0, failed: 0 };
    s.botMemory[pi] = m;
  }
  return m;
}

// ------------------------------------------------------------------ Bewertungen
function ownedTypes(g, pi) {
  const t = new Set();
  for (const b of g.buildingsOf(pi)) {
    for (const hid of g.board.vertices[b.vid].hexes) {
      const h = g.board.hexes[hid];
      if (h.type !== 'desert' && !h.fog) t.add(h.type);
    }
  }
  return t;
}

function vertexValue(g, vid, pi, owned = ownedTypes(g, pi)) {
  const v = g.board.vertices[vid];
  let val = 0;
  const seen = new Set();
  for (const hid of v.hexes) {
    const h = g.board.hexes[hid];
    if (h.type === 'desert') continue;
    const pip = h.fog ? 2 : PIP[h.num];
    val += pip * RES_W[h.type] * (owned.has(h.type) ? 1 : 1.35) * (hid === g.s.robber ? 0.4 : 1);
    seen.add(h.type);
  }
  val += seen.size * 0.8;
  if (v.port) {
    if (v.port === 'any') val += 1.2;
    else val += 1 + (owned.has(v.port) || seen.has(v.port) ? 2 : 0);
  }
  return val;
}

function productionPips(g, pi) {
  let sum = 0;
  for (const b of g.buildingsOf(pi)) {
    for (const hid of g.board.vertices[b.vid].hexes) {
      const h = g.board.hexes[hid];
      if (h.fog || h.type === 'desert') continue;
      sum += PIP[h.num] * (b.type === 'city' ? 2 : 1);
    }
  }
  return sum;
}

function resourcePips(g, pi, res) {
  let sum = 0;
  for (const b of g.buildingsOf(pi)) {
    for (const hid of g.board.vertices[b.vid].hexes) {
      const h = g.board.hexes[hid];
      if (!h.fog && h.type === res) sum += PIP[h.num] * (b.type === 'city' ? 2 : 1);
    }
  }
  return sum;
}

// Nächste sinnvolle Straße Richtung eines guten Siedlungsplatzes (BFS über freie Kanten).
function roadTarget(g, pi) {
  const s = g.s;
  const dist = new Map();
  const first = new Map();
  const queue = [];
  const blocked = (v) => s.buildings[v] && s.buildings[v].owner !== pi;
  for (const v of g.board.vertices) {
    if (g.roadConnects(pi, v.id)) {
      if (!s.buildings[v.id] && !v.edges.some((e) => s.roads[e] === pi)) continue;
      dist.set(v.id, 0);
      queue.push(v.id);
    }
  }
  const owned = ownedTypes(g, pi);
  let best = null;
  while (queue.length) {
    const vid = queue.shift();
    const d = dist.get(vid);
    if (d >= 4) continue;
    for (const eid of g.board.vertices[vid].edges) {
      if (s.roads[eid] !== undefined) continue;
      const e = g.board.edges[eid];
      const n = e.a === vid ? e.b : e.a;
      if (dist.has(n) || blocked(n)) continue;
      dist.set(n, d + 1);
      first.set(n, d === 0 ? eid : first.get(vid));
      queue.push(n);
      if (g.vertexFree(n)) {
        const val = vertexValue(g, n, pi, owned) - 1.6 * d;
        if (!best || val > best.val) best = { eid: first.get(n), vid: n, dist: d + 1, val };
      }
    }
  }
  return best;
}

function topGoals(g, pi) {
  const s = g.s;
  const p = g.player(pi);
  const goals = [];
  const owned = ownedTypes(g, pi);
  if (p.pieces.city > 0) {
    for (const vid of g.legalCitySpots(pi)) {
      goals.push({ kind: 'city', id: vid, score: 10 + vertexValue(g, vid, pi, owned) / 3 + (traitOf(g, pi) === 'strategist' ? 1.5 : 0) });
    }
  }
  let haveSpot = false;
  if (p.pieces.settlement > 0) {
    for (const vid of g.legalSettlementSpots(pi)) {
      haveSpot = true;
      goals.push({ kind: 'settlement', id: vid, score: 9 + vertexValue(g, vid, pi, owned) / 3 + (traitOf(g, pi) === 'expander' ? 1.2 : 0) });
    }
  }
  if (s.devDeck.length > 0) {
    const nearArmy = p.playedKnights + p.dev.filter((c) => c.type === 'knight').length >= 2 ? 1.5 : 0;
    const tr = traitOf(g, pi);
    const devBonus = { gambler: 2.5, knight: 1.5, strategist: -0.8 }[tr] || 0;
    goals.push({ kind: 'devcard', score: 5 + nearArmy + devBonus });
  }
  if (p.pieces.road > 0) {
    const rt = roadTarget(g, pi);
    const rb = traitOf(g, pi) === 'builder' ? 1.5 : 0;
    if (rt && !haveSpot) goals.push({ kind: 'road', id: rt.eid, score: 5.5 + rb + rt.val / 5 - rt.dist * 0.4 });
    else if (rt) goals.push({ kind: 'road', id: rt.eid, score: 3 + rb + rt.val / 8 });
    const len = g.longestRoadFor(pi);
    if (len >= 4 && s.longestRoad.holder !== pi) {
      const rts = g.legalRoadSpots(pi);
      if (rts.length) goals.push({ kind: 'road', id: rts[Math.floor(g.rng() * rts.length)], score: 8 });
    }
  }
  for (const goal of goals) goal.score += rnd(g, cfg(g, pi).noise * 0.4);
  goals.sort((a, b) => b.score - a.score);
  return goals;
}

const costOf = (goal) => COSTS[goal.kind];

function missingFor(hand, cost) {
  const m = {};
  for (const [r, n] of Object.entries(cost)) if (hand[r] < n) m[r] = n - hand[r];
  return m;
}

// Plant, ob sich das Ziel per Bank-/Hafentausch erreichen lässt – liefert den ersten Tauschschritt.
function planBankTrades(g, pi, goal) {
  const hand = { ...g.player(pi).hand };
  const cost = costOf(goal);
  let steps = null;
  for (let guard = 0; guard < 12; guard++) {
    const miss = missingFor(hand, cost);
    const want = Object.keys(miss)[0];
    if (!want) return steps;
    let donor = null;
    let bestSurplus = -1;
    for (const r of RES) {
      if (r === want) continue;
      const ratio = g.portRatio(pi, r);
      const surplus = hand[r] - (cost[r] || 0);
      if (surplus >= ratio && surplus > bestSurplus) { donor = { r, ratio }; bestSurplus = surplus; }
    }
    if (!donor) return null;
    if (!steps) steps = { give: donor.r, get: want };
    hand[donor.r] -= donor.ratio;
    hand[want]++;
  }
  return null;
}

// ------------------------------------------------------------------ Entscheidungen
function setupSettlement(g, pi) {
  const owned = ownedTypes(g, pi);
  let best = null;
  for (const vid of g.legalSettlementSpots(pi)) {
    const val = vertexValue(g, vid, pi, owned) + rnd(g, cfg(g, pi).noise);
    if (!best || val > best.val) best = { vid, val };
  }
  return best.vid;
}

function setupRoad(g, pi) {
  const last = g.s.setup.lastSettlement;
  let best = null;
  const owned = ownedTypes(g, pi);
  for (const eid of g.legalRoadSpots(pi)) {
    const e = g.board.edges[eid];
    const o = e.a === last ? e.b : e.a;
    let val = -5;
    if (g.vertexFree(o)) val = vertexValue(g, o, pi, owned);
    for (const n of g.board.vertices[o].adj) {
      if (n !== last && g.vertexFree(n) && !g.vertexTouchesFog(n)) val = Math.max(val, vertexValue(g, n, pi, owned) * 0.85);
    }
    val += rnd(g, 0.5);
    if (!best || val > best.val) best = { eid, val };
  }
  return best.eid;
}

/** Goldfeld: bevorzugt, was für das wichtigste Ziel fehlt, sonst das, wovon am wenigsten da ist. */
function chooseGoldCards(g, pi) {
  const n = g.s.gold[pi];
  const hand = { ...g.player(pi).hand };
  const bank = { ...g.s.bank };
  const goals = topGoals(g, pi);
  const out = {};
  for (let i = 0; i < n; i++) {
    const miss = goals.length ? missingFor(hand, costOf(goals[0])) : {};
    const want = Object.keys(miss).find((r) => bank[r] > 0);
    const r = want || RES.filter((x) => bank[x] > 0).sort((a, b) => hand[a] - hand[b])[0];
    hand[r]++; bank[r]--;
    out[r] = (out[r] || 0) + 1;
  }
  return out;
}

function chooseDiscard(g, pi) {
  const need = g.s.discard[pi];
  const hand = { ...g.player(pi).hand };
  const goals = topGoals(g, pi);
  const cost = goals.length ? costOf(goals[0]) : {};
  const out = {};
  for (let i = 0; i < need; i++) {
    let bestR = null;
    let bestScore = -Infinity;
    for (const r of RES) {
      if (hand[r] <= 0) continue;
      const score = hand[r] - (cost[r] || 0) * 1.5 + g.rng() * 0.2;
      if (score > bestScore) { bestScore = score; bestR = r; }
    }
    hand[bestR]--;
    out[bestR] = (out[bestR] || 0) + 1;
  }
  return out;
}

function chooseRobberHex(g, pi) {
  const target = g.s.settings.targetVP;
  let best = null;
  for (const hid of g.legalRobberHexes()) {
    const h = g.board.hexes[hid];
    if (h.type === 'desert') { if (!best) best = { hid, score: -3 }; continue; }
    let score = 0;
    for (const vid of h.verts) {
      const b = g.s.buildings[vid];
      if (!b) continue;
      const w = (b.type === 'city' ? 2 : 1) * PIP[h.num];
      if (b.owner === pi) score -= w * 1.8;
      else score += w * (1 + g.vp(b.owner, true) / target) + (g.handCount(b.owner) > 0 ? 0.5 : 0);
    }
    score += rnd(g, cfg(g, pi).noise * 0.5);
    if (!best || score > best.score) best = { hid, score };
  }
  return best.hid;
}

function chooseVictim(g, pi) {
  const targets = g.stealTargets(g.s.robber);
  targets.sort((a, b) => (g.vp(b, true) + g.handCount(b) * 0.2) - (g.vp(a, true) + g.handCount(a) * 0.2));
  return targets[0];
}

function tryPlayDev(g, pi, beforeRoll) {
  const s = g.s;
  const p = g.player(pi);
  const c = cfg(g, pi);
  if (s.devPlayed || s.roadBuildingLeft > 0) return false;

  if (g.playableDev(pi, 'knight')) {
    const rh = g.board.hexes[s.robber];
    const robbed = rh.verts.some((v) => s.buildings[v] && s.buildings[v].owner === pi);
    const k = p.playedKnights + 1;
    const army = k >= 3 && k > s.largestArmy.count;
    if (robbed || army || p.trait === 'knight' || (!beforeRoll && p.dev.filter((x) => x.type === 'knight').length >= 2)) {
      return g.playDev(pi, 'knight').ok;
    }
  }
  if (g.playableDev(pi, 'remap') && c.smart && s.turnNumber > s.players.length * 2) {
    const mine = productionPips(g, pi);
    const others = s.players.filter((x) => x.id !== pi).map((x) => productionPips(g, x.id));
    const avg = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
    if (mine < avg * 0.7 || mine <= 6) return g.playDev(pi, 'remap').ok;
  }
  if (beforeRoll) return false;

  const goals = topGoals(g, pi);
  if (g.playableDev(pi, 'harvest')) {
    const need = goals.length ? missingFor(p.hand, costOf(goals[0])) : {};
    let best = null;
    for (const hid of g.harvestHexes(pi)) {
      const h = g.board.hexes[hid];
      const amount = Math.min(g.harvestAmount(pi, hid), s.bank[h.type]);
      const score = amount * (need[h.type] ? 2.5 : 1) + PIP[h.num] * 0.1;
      if (!best || score > best.score) best = { hid, score, amount };
    }
    if (best && (best.amount >= 2 || best.score >= 2.5 || p.dev.length >= 3)) return g.playDev(pi, 'harvest', { hex: best.hid }).ok;
  }
  const goal = goals[0];
  if (g.playableDev(pi, 'plenty') && goal) {
    const miss = missingFor(p.hand, costOf(goal));
    const list = [];
    for (const [r, n] of Object.entries(miss)) for (let i = 0; i < n; i++) list.push(r);
    if (list.length >= 1 && list.length <= 2) {
      while (list.length < 2) list.push(RES.slice().sort((a, b) => p.hand[a] - p.hand[b])[0]);
      return g.playDev(pi, 'plenty', { a: list[0], b: list[1] }).ok;
    }
  }
  if (g.playableDev(pi, 'monopoly') && c.smart) {
    let bestR = null;
    let bestV = 0;
    for (const r of RES) {
      let opp = 0;
      for (const o of s.players) if (o.id !== pi) opp += resourcePips(g, o.id, r) + g.player(o.id).hand[r] * 2;
      if (opp > bestV) { bestV = opp; bestR = r; }
    }
    if (bestR && bestV >= 14) return g.playDev(pi, 'monopoly', { res: bestR }).ok;
  }
  if (g.playableDev(pi, 'roadbuilding') && p.pieces.road >= 2) {
    const rt = roadTarget(g, pi);
    if (rt && rt.dist <= 2 && g.legalRoadSpots(pi).length >= 2) return g.playDev(pi, 'roadbuilding').ok;
  }
  return false;
}

// ------------------------------------------------------------------ Hauptfunktion
export function botAct(g, pi) {
  const s = g.s;
  const p = g.player(pi);

  if (s.phase === 'setup') {
    if (s.turn !== pi) return { wait: true };
    if (s.sub === 'settlement') g.placeInitialSettlement(pi, setupSettlement(g, pi));
    else g.placeInitialRoad(pi, setupRoad(g, pi));
    return { did: true };
  }
  if (s.phase !== 'main') return { wait: true };

  if (s.sub === 'discard') {
    if (s.discard[pi] === undefined) return { wait: true };
    g.discard(pi, chooseDiscard(g, pi));
    return { did: true };
  }
  if (s.sub === 'gold') {
    if (!s.gold[pi]) return { wait: true };
    g.chooseGold(pi, chooseGoldCards(g, pi));
    return { did: true };
  }
  if (s.turn !== pi) return { wait: true };

  const mem = memory(g, pi);
  mem.actions++;
  if (mem.actions > 40) { return finish(g, pi); }

  if (s.sub === 'robber') {
    g.moveRobber(pi, chooseRobberHex(g, pi));
    return { did: true };
  }
  if (s.sub === 'steal') {
    g.steal(pi, chooseVictim(g, pi));
    return { did: true };
  }
  if (s.roadBuildingLeft > 0) {
    const rt = roadTarget(g, pi);
    const spots = g.legalRoadSpots(pi);
    const eid = rt && spots.includes(rt.eid) ? rt.eid : spots[Math.floor(g.rng() * spots.length)];
    if (eid === undefined || !g.build(pi, 'road', eid).ok) g.skipRoadBuilding(pi);
    return { did: true };
  }
  if (s.sub === 'roll') {
    if (tryPlayDev(g, pi, true)) return { did: true };
    g.rollDice(pi);
    return { did: true };
  }
  if (s.sub !== 'actions') return { wait: true };

  if (tryPlayDev(g, pi, false)) return { did: true };

  const goals = topGoals(g, pi);

  // 1) Anti-Pech-Marker einlösen, wenn es dem Hauptziel hilft
  if (s.settings.antiBad && p.tokens >= g.tokenCost(pi) && goals.length) {
    const miss = missingFor(p.hand, costOf(goals[0]));
    const want = Object.keys(miss)[0];
    if (want && g.exchangeTokens(pi, want).ok) return { did: true };
  }

  // 2) Das beste bezahlbare Ziel bauen
  for (const goal of goals) {
    if (!g.canAfford(pi, costOf(goal))) continue;
    if (goal.kind === 'road' && goal.score < 3.5 && p.hand.wood + p.hand.brick < 5) continue;
    let r;
    if (goal.kind === 'devcard') r = g.buyDevCard(pi);
    else r = g.build(pi, goal.kind, goal.id);
    if (r.ok) return { did: true };
    mem.failed++;
  }

  // 3) Mit Bank/Hafen auf das beste erreichbare Ziel hinarbeiten
  for (const goal of goals.slice(0, 3)) {
    if (g.canAfford(pi, costOf(goal))) continue;
    const step = planBankTrades(g, pi, goal);
    if (step && g.bankTrade(pi, step.give, step.get).ok) return { did: true };
  }

  // 4) Spielertausch anbieten
  if (goals.length && mem.offers < (p.trait === 'trader' ? 3 : 2) && g.rng() < Math.min(1, cfg(g, pi).trade * (p.trait === 'trader' ? 1.4 : 1))) {
    const goal = goals[0];
    const cost = costOf(goal);
    const miss = missingFor(p.hand, cost);
    const wants = Object.keys(miss);
    if (wants.length >= 1 && wants.length <= 2) {
      const want = wants[0];
      let give = null;
      let bestSurplus = 0;
      for (const r of RES) {
        if (r === want) continue;
        const surplus = p.hand[r] - (cost[r] || 0);
        if (surplus > bestSurplus) { bestSurplus = surplus; give = r; }
      }
      if (give) {
        mem.offers++;
        return { offer: { give: { [give]: 1 }, get: { [want]: 1 } } };
      }
    }
  }

  return finish(g, pi);
}

function finish(g, pi) {
  const r = g.endTurn(pi);
  if (!r.ok) {
    // Notbremse: falls ein Zustand hängt, ein Straßenbau-Rest überspringen
    g.skipRoadBuilding(pi);
    g.endTurn(pi);
  }
  return { end: true };
}

// ------------------------------------------------------------------ Antworten auf Angebote
/** Wert eines Tauschs aus Sicht von Bot `bi`: er erhält `receive` und gibt `giveAway` ab. */
function tradeBalance(g, bi, receive, giveAway) {
  const p = g.player(bi);
  const goals = topGoals(g, bi);
  const cost = goals.length ? costOf(goals[0]) : {};
  const need = missingFor(p.hand, cost);
  let gain = 0;
  let loss = 0;
  for (const r of RES) {
    const gv = receive[r] || 0;
    const lv = giveAway[r] || 0;
    if (gv) gain += gv * (need[r] ? 3 : p.hand[r] === 0 ? 1.6 : 0.8);
    if (lv) {
      const after = p.hand[r] - lv;
      loss += lv * ((cost[r] || 0) > after ? 3 : after >= 2 ? 0.7 : 1.3);
    }
  }
  return { gain, loss };
}

function acceptThreshold(g, bi) {
  const smart = cfg(g, bi).smart;
  if (!smart) return 0.6;
  return traitOf(g, bi) === 'trader' ? 0.85 : 1.05;
}

/** Bewertet ein Angebot: `from` gibt `give` und möchte `get` vom Bot `bi`. */
export function botEvaluateOffer(g, bi, from, give, get) {
  const p = g.player(bi);
  for (const r of RES) {
    if ((get[r] || 0) > p.hand[r]) return { accept: false, reason: 'Hat nicht genug Karten.' };
  }
  if (cfg(g, bi).smart && g.vp(from, true) >= g.s.settings.targetVP - 2) {
    return { accept: false, reason: 'Hilft dir nicht beim Gewinnen!' };
  }
  const { gain, loss } = tradeBalance(g, bi, give, get);
  if (gain > loss * acceptThreshold(g, bi)) return { accept: true, reason: 'Einverstanden.' };
  return { accept: false, reason: 'Lohnt sich nicht.' };
}

/**
 * Antwort eines Bots auf ein öffentliches Angebot.
 * → { type: 'accept' | 'decline' | 'counter', give?, get?, reason }
 */
export function botRespondOffer(g, bi, offer) {
  const ev = botEvaluateOffer(g, bi, offer.from, offer.give, offer.get);
  if (ev.accept) return { type: 'accept', reason: ev.reason };
  const p = g.player(bi);
  const canGive = RES.every((r) => (offer.get[r] || 0) <= p.hand[r]);
  // Gegenvorschlag: eine zusätzliche Karte des Anbieters verlangen
  if (canGive && cfg(g, bi).smart && ev.reason === 'Lohnt sich nicht.' && g.rng() < (p.trait === 'trader' ? 0.9 : 0.55)) {
    const proposer = g.player(offer.from);
    const options = RES.filter((r) => !(offer.get[r] > 0) && proposer.hand[r] > (offer.give[r] || 0));
    for (const r of options.sort(() => g.rng() - 0.5)) {
      const give = { ...offer.give, [r]: (offer.give[r] || 0) + 1 };
      if (botEvaluateOffer(g, bi, offer.from, give, offer.get).accept) {
        return { type: 'counter', give, get: { ...offer.get }, reason: 'Mit einer Karte mehr bin ich dabei.' };
      }
    }
  }
  return { type: 'decline', reason: ev.reason };
}

/** Der Bot ist Anbieter und bekommt einen Gegenvorschlag: er gibt `c.give` ab, erhält `c.get`. */
export function botJudgeCounter(g, bi, c) {
  const { gain, loss } = tradeBalance(g, bi, c.get, c.give);
  return gain > loss * acceptThreshold(g, bi);
}
