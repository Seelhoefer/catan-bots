// Computergegner. `botAct` führt pro Aufruf genau eine Aktion aus und meldet zurück, was passiert ist.
//   { did: true }          – es wurde etwas getan, bitte erneut aufrufen
//   { end: true }          – der Bot ist fertig (Controller beendet den Zug)
//   { offer: {give, get} } – der Bot möchte einen Spielertausch anbieten
//   { wait: true }         – der Bot ist gerade nicht an der Reihe

import { RES, COSTS, PIP, STRATEGY_LABEL } from './constants.js';

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
    // Ein Hafen lohnt, wenn man viel von dem Rohstoff erzeugt (2:1) bzw. insgesamt viel produziert (3:1)
    if (v.port === 'all') val += 1.6 + Math.min(3, productionPips(g, pi) / 8); // Welthafen: 2:1 für alles
    else if (v.port === 'any') val += 0.9 + Math.min(1.6, productionPips(g, pi) / 14);
    else {
      const here = v.hexes.reduce((a, hid) => { const h = g.board.hexes[hid]; return a + (h.type === v.port && !h.fog ? PIP[h.num] : 0); }, 0);
      val += 0.5 + Math.min(4.2, (resourcePips(g, pi, v.port) + here) * 0.5);
    }
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

// ------------------------------------------------------------------ Strategien
// Jeder Bot verfolgt einen Plan, der sich mit dem Spielverlauf ändern kann (Platz zum Bauen, Häfen, Erträge, Rittermacht).
//   expand  – Siedlungen & Straßen, Längste Handelsstraße
//   cities  – Städte ausbauen (Erz/Getreide), dazu Entwicklungskarten
//   harbor  – Häfen nutzen: überschüssige Rohstoffe 2:1/3:1 in das Fehlende tauschen
//   army    – Entwicklungskarten/Ritter für die Größte Rittermacht
/** Ports des Spielers: Liste von { type, pips } (pips = eigene Erträge des Rohstoffs bzw. insgesamt bei 3:1). */
function myPorts(g, pi) {
  const seen = new Set();
  const out = [];
  for (const b of g.buildingsOf(pi)) {
    const port = g.board.vertices[b.vid].port;
    if (!port || seen.has(port)) continue;
    seen.add(port);
    out.push({ type: port, pips: port === 'any' || port === 'all' ? productionPips(g, pi) : resourcePips(g, pi, port) });
  }
  return out;
}

function strategyScores(g, pi) {
  const s = g.s;
  const p = g.player(pi);
  const tr = traitOf(g, pi);
  const owned = ownedTypes(g, pi);
  const builds = g.buildingsOf(pi);
  const settlements = builds.filter((b) => b.type === 'settlement').length;
  const spots = p.pieces.settlement > 0 ? g.legalSettlementSpots(pi) : [];
  const bestSpot = spots.reduce((m, v) => Math.max(m, vertexValue(g, v, pi, owned)), 0);
  const rt = p.pieces.road > 0 ? roadTarget(g, pi) : null;
  const cityOk = p.pieces.city > 0 && g.legalCitySpots(pi).length > 0;
  const pips = (r) => resourcePips(g, pi, r);
  const knights = p.playedKnights + p.dev.filter((c) => c.type === 'knight').length;

  const expand = 1.5 + (spots.length ? 2 + Math.min(2, bestSpot / 7) : rt ? 1.2 + Math.min(1.5, rt.val / 8) : -2)
    - settlements * 0.3 + (tr === 'expander' ? 1.6 : tr === 'builder' ? 1.1 : 0) + (g.longestRoadFor(pi) >= 4 ? 0.8 : 0);
  const cities = 1.5 + (cityOk ? 1.8 : -3) + Math.min(3, (pips('ore') + pips('wheat')) / 5)
    + (settlements >= 3 ? 1.2 : 0) + (tr === 'strategist' ? 1.6 : 0) + (!spots.length && !rt ? 1.5 : 0);
  const ports = myPorts(g, pi);
  const portVal = ports.reduce((a, x) => a + (x.type === 'all' ? 1.6 + Math.min(2.4, x.pips / 8) : x.type === 'any' ? 0.7 + Math.min(1.2, x.pips / 14) : 0.8 + Math.min(2.6, x.pips * 0.35)), 0);
  const harbor = 0.8 + portVal * 1.1 + (tr === 'trader' ? 1.8 : 0) + (ports.length ? 0.5 : -1.5);
  const army = (s.devDeck.length ? 1.2 : -6) + knights * 0.9 + (s.largestArmy.holder === pi ? 1 : s.largestArmy.count >= 3 && knights < s.largestArmy.count ? -1.2 : 0)
    + Math.min(2, (pips('ore') + pips('wheat') + pips('sheep')) / 9) + (tr === 'knight' ? 2 : tr === 'gambler' ? 1.6 : 0);
  return { expand, cities, harbor, army };
}

/** Einmal pro eigenem Zug neu bewerten; gewechselt wird nur bei deutlichem Vorsprung (kein Hin und Her). */
function updateStrategy(g, pi) {
  const p = g.player(pi);
  if (p.strategy && p.strategy.turn === g.s.turnNumber) return p.strategy.id;
  const sc = strategyScores(g, pi);
  const bestId = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0];
  const cur = p.strategy?.id;
  if (!cur) p.strategy = { id: bestId, since: g.s.turnNumber, turn: g.s.turnNumber };
  else if (bestId !== cur && sc[bestId] > sc[cur] + 1.3) {
    g.log(`🧭 ${p.name} setzt jetzt auf ${STRATEGY_LABEL[bestId]}.`, pi);
    p.strategy = { id: bestId, since: g.s.turnNumber, turn: g.s.turnNumber };
  } else p.strategy.turn = g.s.turnNumber;
  return p.strategy.id;
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
  if (p.pieces.settlement > 0 && g.canAfford(pi, COSTS.colony) || (p.pieces.settlement > 0 && (s.islands || []).length)) {
    // Kolonie auf einer neuen Insel: frischer Boden, Hafen und Felder ohne Konkurrenz
    for (const vid of g.legalColonySpots(pi)) goals.push({ kind: 'colony', id: vid, score: 11 + vertexValue(g, vid, pi, owned) / 3 + (g.board.vertices[vid].port ? 1.2 : 0) });
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
  const plan = p.strategy?.id;
  if (plan) {
    const bump = {
      expand: { settlement: 2.2, road: 1.4, devcard: -0.5 },
      cities: { city: 2.5, settlement: -0.4, devcard: 0.6, road: -0.8 },
      harbor: { settlement: 0.6, city: 0.6 },
      army: { devcard: 3, city: 0.5, road: -0.5 },
    }[plan];
    for (const goal of goals) goal.score += bump[goal.kind] || 0;
    if (plan === 'harbor') { // Siedlungsplätze mit passendem Hafen werden bevorzugt
      for (const goal of goals) if (goal.kind === 'settlement' && g.board.vertices[goal.id].port) goal.score += 1.6;
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
  if (g.playableDev(pi, 'exile')) { // der Räuber blockiert eines meiner Felder → in die Wüste schicken
    const rh = g.board.hexes[s.robber];
    if (rh.verts.some((v) => s.buildings[v] && s.buildings[v].owner === pi)) return g.playDev(pi, 'exile').ok;
  }
  if (g.playableDev(pi, 'blessing') && productionPips(g, pi) >= 6 && s.turnNumber > s.players.length * 2) return g.playDev(pi, 'blessing').ok;
  if (beforeRoll) return false;

  if (g.playableDev(pi, 'birthday') && s.players.reduce((a, o) => a + (o.id === pi ? 0 : g.handCount(o.id)), 0) >= 6) return g.playDev(pi, 'birthday').ok;
  if (g.playableDev(pi, 'fair') && RES.some((r) => p.hand[r] >= 4 && g.portRatio(pi, r) > 2)) return g.playDev(pi, 'fair').ok;

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
  if (g.playableDev(pi, 'levy')) {
    // Zollhaus: die Zahl, die mir am meisten Karten bringt (viele Rohstoffarten auf dem Brett, häufig gewürfelt)
    const pips = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
    let best = null;
    for (const n of Object.keys(pips).map(Number)) {
      const kinds = new Set(g.board.hexes.filter((h) => h.num === n && !h.fog && h.id !== s.robber && RES.includes(h.type)).map((h) => h.type));
      const v = kinds.size * pips[n];
      if (!best || v > best.v) best = { n, v };
    }
    if (best && best.v >= 4) return g.playDev(pi, 'levy', { num: best.n }).ok;
  }
  if (g.playableDev(pi, 'decree')) {
    // Erlass: den Rohstoff wählen, der den Gegnern am meisten bringt und mir am wenigsten schadet
    const lead = s.players.filter((o) => o.id !== pi).sort((a, b) => g.vp(b.id, true) - g.vp(a.id, true))[0];
    let best = null;
    for (const r of RES) {
      let opp = 0;
      for (const o of s.players) if (o.id !== pi) opp += resourcePips(g, o.id, r);
      const mine = resourcePips(g, pi, r);
      const toll = opp * 1.0 - mine * 0.2;
      const penalty = opp * 0.7 + (lead ? resourcePips(g, lead.id, r) * 0.6 : 0);
      for (const [kind, v] of [['toll', toll], ['penalty', penalty]]) if (!best || v > best.v) best = { res: r, kind, v };
    }
    if (best && best.v >= 6) return g.playDev(pi, 'decree', { res: best.res, kind: best.kind }).ok;
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
    updateStrategy(g, pi);
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

  // 3b) Hafen nutzen: Überschuss ab der Hafenquote (2:1 / 3:1) in das tauschen, was für die nächsten Ziele fehlt
  {
    const reserve = {};
    goals.slice(0, 2).forEach((goal, i) => { for (const [r, n] of Object.entries(costOf(goal))) reserve[r] = Math.max(reserve[r] || 0, Math.ceil(n * (i === 0 ? 1 : 0.6))); });
    const wantList = [];
    for (const goal of goals.slice(0, 3)) for (const r of Object.keys(missingFor(p.hand, costOf(goal)))) if (!wantList.includes(r) && s.bank[r] > 0) wantList.push(r);
    const donors = RES.map((r) => ({ r, ratio: g.portRatio(pi, r), spare: p.hand[r] - (reserve[r] || 0) }))
      .filter((x) => x.ratio < 4 && x.spare >= x.ratio && !wantList.includes(x.r))
      .sort((a, b) => (b.spare / b.ratio) - (a.spare / a.ratio));
    if (donors.length && wantList.length && g.bankTrade(pi, donors[0].r, wantList[0]).ok) return { did: true };
  }

  // 4) Spielertausch anbieten: für das nächstliegende Ziel fehlt eine/zwei Karte(n) – anbieten, was übrig ist.
  //    Klappt das nicht, wird das zweite Angebot großzügiger (2 für 1).
  if (goals.length && mem.offers < (p.trait === 'trader' ? 3 : 2) && g.rng() < Math.min(1, cfg(g, pi).trade * (p.trait === 'trader' ? 1.4 : 1))) {
    const top = goals.slice(0, 3);
    const reserve = {};
    top.slice(0, 2).forEach((goal, i) => { for (const [r, n] of Object.entries(costOf(goal))) reserve[r] = Math.max(reserve[r] || 0, Math.ceil(n * (i === 0 ? 1 : 0.6))); });
    for (const goal of top) {
      const miss = missingFor(p.hand, costOf(goal));
      const wants = Object.keys(miss);
      if (wants.length < 1 || wants.length > 2) continue;
      const want = wants.sort((x, y) => resourcePips(g, pi, x) - resourcePips(g, pi, y))[0]; // was ich am wenigsten selbst erzeuge
      const spare = RES.filter((r) => r !== want && !(miss[r] > 0)).map((r) => ({ r, n: p.hand[r] - (reserve[r] || 0) })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
      if (!spare.length) continue;
      const give = { [spare[0].r]: 1 };
      if (mem.offers >= 1) { // großzügiger: zwei Karten für eine
        if (spare[0].n >= 2) give[spare[0].r] = 2;
        else if (spare[1]) give[spare[1].r] = 1;
        else continue;
      }
      mem.offers++;
      return { offer: { give, get: { [want]: 1 } } };
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
// Bewertung über den Abstand zu den wichtigsten Zielen: ein Tausch ist gut, wenn er die Hand näher an
// Stadt / Siedlung / Straße / Entwicklungskarte bringt – auch für das zweit- und drittwichtigste Ziel.
const GOAL_W = [1, 0.55, 0.3];

function planGoals(g, pi) {
  const seen = new Set();
  const list = [];
  for (const goal of topGoals(g, pi)) { // pro Art nur das beste Ziel (mehrere Bauplätze derselben Art zählen nicht doppelt)
    if (seen.has(goal.kind)) continue;
    seen.add(goal.kind);
    list.push({ kind: goal.kind, cost: costOf(goal), w: GOAL_W[list.length] });
    if (list.length === 3) break;
  }
  return list;
}

/** Wie gut passt `hand` zu den Zielen? Höher = näher dran (fehlende Karten zählen negativ, Bank/Hafen mildert). */
function handScore(g, pi, hand, goals) {
  let sc = 0;
  for (const { cost, w } of goals) {
    let miss = 0;
    let conv = 0;
    for (const r of RES) {
      miss += Math.max(0, (cost[r] || 0) - hand[r]);
      const spare = hand[r] - (cost[r] || 0);
      if (spare > 0) conv += Math.floor(spare / g.portRatio(pi, r));
    }
    const viaBank = Math.min(miss, conv);
    sc += w * (-(miss - viaBank) - 0.45 * viaBank + (miss === 0 ? 2 : 0));
  }
  const total = RES.reduce((a, r) => a + hand[r], 0);
  if (total > 7) sc -= 0.2 * (total - 7); // Räuber-Risiko: zu viele Karten sind unpraktisch
  return sc;
}

/** Gewinn (positiv) oder Verlust des Bots `bi`, wenn er `receive` bekommt und `giveAway` abgibt. */
function tradeDelta(g, bi, receive, giveAway, goals = planGoals(g, bi)) {
  const before = { ...g.player(bi).hand };
  const after = { ...before };
  for (const r of RES) after[r] += (receive[r] || 0) - (giveAway[r] || 0);
  if (!goals.length) return RES.reduce((a, r) => a + (receive[r] || 0) - (giveAway[r] || 0), 0) * 0.2;
  return handScore(g, bi, after, goals) - handScore(g, bi, before, goals);
}

function acceptMargin(g, bi) {
  if (!cfg(g, bi).smart) return -0.35; // Anfänger tauschen auch mal schlecht
  const tr = traitOf(g, bi);
  return tr === 'trader' ? 0.3 : tr === 'strategist' ? 0.6 : 0.45;
}

/** Würde der Anbieter durch den Tausch ein Siegpunkt-Gebäude bezahlbar, obwohl er schon nah am Sieg ist? */
function helpsLeaderWin(g, from, give, get) {
  const target = g.s.settings.targetVP;
  const vp = g.vp(from, true);
  if (vp < target - 2) return false;
  const hand = { ...g.player(from).hand };
  const after = { ...hand };
  for (const r of RES) after[r] += (get[r] || 0) - (give[r] || 0);
  const vpKinds = ['city', 'settlement'].filter((k) => g.player(from).pieces[k] > 0);
  const affords = (h, k) => RES.every((r) => h[r] >= (COSTS[k][r] || 0));
  if (vpKinds.some((k) => affords(after, k) && !affords(hand, k))) return true;
  return vp >= target - 1 && vpKinds.length > 0 && tradeDelta(g, from, get, give) > 1;
}

/** Bewertet ein Angebot: `from` gibt `give` und möchte `get` vom Bot `bi`. */
export function botEvaluateOffer(g, bi, from, give, get) {
  const p = g.player(bi);
  for (const r of RES) {
    if ((get[r] || 0) > p.hand[r]) return { accept: false, reason: 'Hat nicht genug Karten.' };
  }
  if (cfg(g, bi).smart && helpsLeaderWin(g, from, give, get)) {
    return { accept: false, reason: 'Hilft dir nicht beim Gewinnen!' };
  }
  const delta = tradeDelta(g, bi, give, get);
  if (delta >= acceptMargin(g, bi)) return { accept: true, reason: 'Einverstanden.', delta };
  return { accept: false, reason: 'Lohnt sich nicht.', delta };
}

/** Mögliche Gegenvorschläge zu `offer` (aus Sicht des Anbieters: er gibt `give`, bekommt `get`), die dem Anbieter möglichst wenig abverlangen. */
function counterCandidates(g, bi, offer) {
  const p = g.player(bi);
  const proposer = g.player(offer.from);
  const goals = planGoals(g, bi);
  const reserve = {};
  for (const { cost, w } of goals) if (w >= 0.55) for (const r of RES) reserve[r] = Math.max(reserve[r] || 0, cost[r] || 0);
  const out = [];
  const sum = (o) => RES.reduce((a, r) => a + (o[r] || 0), 0);
  // a) der Bot gibt etwas weniger ab
  if (sum(offer.get) > 1) {
    for (const r of RES) if (offer.get[r] > 0) out.push({ give: { ...offer.give }, get: { ...offer.get, [r]: offer.get[r] - 1 } });
  }
  // b) der Bot gibt statt des gewünschten Rohstoffs einen anderen ab, den er übrig hat
  for (const r of RES) {
    if (!(offer.get[r] > 0)) continue;
    for (const r2 of RES) {
      if (r2 === r || offer.give[r2] > 0 || p.hand[r2] - (offer.get[r2] || 0) <= (reserve[r2] || 0)) continue;
      const get = { ...offer.get, [r]: offer.get[r] - 1, [r2]: (offer.get[r2] || 0) + 1 };
      if (get[r] === 0) delete get[r];
      out.push({ give: { ...offer.give }, get });
    }
  }
  // c) der Anbieter legt eine Karte drauf
  for (const r of RES) {
    if (!(offer.get[r] > 0) && proposer.hand[r] > (offer.give[r] || 0)) out.push({ give: { ...offer.give, [r]: (offer.give[r] || 0) + 1 }, get: { ...offer.get } });
  }
  return out.filter((c) => !g.validTradeShape(c.give, c.get));
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
  // Gegenvorschlag: lieber verhandeln als pauschal ablehnen
  if (canGive && cfg(g, bi).smart && ev.reason === 'Lohnt sich nicht.' && g.rng() < (p.trait === 'trader' ? 0.95 : 0.75)) {
    for (const c of counterCandidates(g, bi, offer)) {
      if (botEvaluateOffer(g, bi, offer.from, c.give, c.get).accept) {
        return { type: 'counter', give: c.give, get: c.get, reason: 'Mit kleiner Änderung bin ich dabei.' };
      }
    }
  }
  return { type: 'decline', reason: ev.reason };
}

/** Der Bot ist Anbieter und bekommt einen Gegenvorschlag: er gibt `c.give` ab, erhält `c.get`. */
export function botJudgeCounter(g, bi, c, responder = null) {
  if (responder !== null && cfg(g, bi).smart && helpsLeaderWin(g, responder, c.get, c.give)) return false;
  return tradeDelta(g, bi, c.get, c.give) >= acceptMargin(g, bi);
}
