import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/js/engine/game.js';
import { generateBoard, hexNeighbors } from '../public/js/engine/board.js';
import { botAct, botRespondOffer } from '../public/js/engine/bot.js';
import { makeRng } from '../public/js/engine/rng.js';
import { RES, COSTS } from '../public/js/engine/constants.js';

function newGame(settings = {}, seed = 5) {
  return Game.create({ bots: 3, ...settings, seed }, makeRng(seed));
}

/** Lässt Bots die Gründungsphase spielen und gibt das Spiel am Zug von Spieler `turn` zurück. */
function afterSetup(settings, seed) {
  const g = newGame(settings, seed);
  while (g.s.phase === 'setup') botAct(g, g.s.turn);
  g.s.turn = 0;
  g.s.sub = 'roll';
  g.s.turnNumber = 10;
  return g;
}

function clearBoard(g) {
  g.s.buildings = {};
  g.s.roads = {};
  for (const p of g.s.players) { p.hand = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }; p.missions = []; p.dev = []; }
  g.s.longestRoad = { holder: null, len: 0 };
  g.s.largestArmy = { holder: null, count: 0 };
  g.s.missions.forEach((m) => { m.claimedBy = null; });
}

test('Spielfeld-Geometrie: Felder, Ecken, Kanten, Häfen', () => {
  const expected = { small: [19, 54, 72], large: [37, 96, 132], huge: [61, 150, 210] };
  for (const [size, [h, v, e]] of Object.entries(expected)) {
    const b = generateBoard(size, 'classic', makeRng(3));
    assert.equal(b.hexes.length, h);
    assert.equal(b.vertices.length, v);
    assert.equal(b.edges.length, e);
    const portVerts = b.ports.flatMap((p) => p.verts);
    assert.equal(new Set(portVerts).size, portVerts.length, 'Häfen teilen keine Ecken');
    assert.ok(b.ports.length >= 8);
    for (const vert of b.vertices) assert.ok(vert.adj.length >= 2 && vert.adj.length <= 3);
  }
});

test('Standardfeld hat klassische Verteilung (4/4/4/3/3 + Wüste, 18 Zahlen)', () => {
  const b = generateBoard('small', 'classic', makeRng(9));
  const count = {};
  for (const h of b.hexes) count[h.type] = (count[h.type] || 0) + 1;
  assert.deepEqual(count, { wood: 4, wheat: 4, sheep: 4, brick: 3, ore: 3, desert: 1 }, JSON.stringify(count));
  const nums = b.hexes.filter((h) => h.num).map((h) => h.num).sort((a, c) => a - c);
  assert.deepEqual(nums, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
});

test('6 und 8 liegen nie nebeneinander', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const size of ['small', 'large', 'huge']) {
      const b = generateBoard(size, 'classic', makeRng(seed));
      for (const h of b.hexes) {
        if (h.num !== 6 && h.num !== 8) continue;
        for (const n of hexNeighbors(b, h.id)) {
          const nn = b.hexes[n].num;
          assert.ok(nn !== 6 && nn !== 8, `Seed ${seed}/${size}: rote Zahlen benachbart`);
        }
      }
    }
  }
});

test('Nebel-Variante: ca. 30 % verdeckt, nie die Wüste', () => {
  const b = generateBoard('small', 'fog', makeRng(4));
  const fog = b.hexes.filter((h) => h.fog);
  assert.equal(fog.length, Math.round(19 * 0.3));
  assert.ok(fog.every((h) => h.type !== 'desert'));
});

test('Gründung: Startrohstoffe nur für die zweite Siedlung, Nebel-Ecken verboten', () => {
  const g = newGame({ variant: 'fog' });
  const first = g.s.turn;
  const spots = g.legalSettlementSpots(first);
  assert.ok(spots.length > 0);
  assert.ok(spots.every((v) => !g.vertexTouchesFog(v)));
  g.placeInitialSettlement(first, spots[0]);
  assert.equal(g.handCount(first), 0);
  assert.equal(g.placeInitialSettlement(first, spots[1]).ok, false, 'Straße muss zuerst folgen');
  g.placeInitialRoad(first, g.legalRoadSpots(first)[0]);
  while (g.s.phase === 'setup') botAct(g, g.s.turn);
  assert.equal(g.s.phase, 'main');
  for (const p of g.s.players) assert.equal(g.buildingsOf(p.id).length, 2);
});

test('Anti-Pech-Marker: leer ausgehende Spieler bekommen einen, bei 7 keinen', () => {
  const g = afterSetup({}, 7);
  clearBoard(g);
  const hex = g.board.hexes.find((h) => h.num === 8);
  const vid = hex.verts[0];
  g.s.buildings[vid] = { owner: 0, type: 'settlement' };
  g.s.robber = g.board.hexes.find((h) => h.type === 'desert').id;
  g.s.players.forEach((p) => { p.tokens = 0; });
  g.rollDice(0, [4, 4]);
  assert.equal(g.player(0).tokens, 0);
  assert.equal(g.handCount(0) > 0, true);
  for (const i of [1, 2, 3]) assert.equal(g.player(i).tokens, 1);

  g.s.sub = 'roll';
  g.rollDice(0, [3, 4]);
  for (const i of [1, 2, 3]) assert.equal(g.player(i).tokens, 1, 'bei einer 7 gibt es keine Marker');
});

test('Anti-Pech-Marker: Tausch kostet so viele Marker wie Siegpunkte', () => {
  const g = afterSetup({}, 8);
  clearBoard(g);
  const verts = g.board.vertices.filter((v) => v.adj.every((n) => true)).map((v) => v.id);
  // drei weit entfernte Siedlungen = 3 SP
  const picked = [];
  for (const v of verts) {
    if (picked.every((p) => !g.board.vertices[p].adj.includes(v) && p !== v)) picked.push(v);
    if (picked.length === 3) break;
  }
  for (const v of picked) g.s.buildings[v] = { owner: 0, type: 'settlement' };
  g.s.sub = 'actions';
  assert.equal(g.vp(0), 3);
  assert.equal(g.tokenCost(0), 3);
  g.player(0).tokens = 2;
  assert.equal(g.exchangeTokens(0, 'ore').ok, false);
  g.player(0).tokens = 3;
  const bankOre = g.s.bank.ore;
  assert.equal(g.exchangeTokens(0, 'ore').ok, true);
  assert.equal(g.player(0).tokens, 0);
  assert.equal(g.player(0).hand.ore, 1);
  assert.equal(g.s.bank.ore, bankOre - 1);
});

test('Weltenwandel: Felder neu gemischt, Siedlungen und Straßen bleiben', () => {
  const g = afterSetup({}, 11);
  g.player(0).dev.push({ type: 'remap', turn: 1 });
  const buildings = JSON.stringify(g.s.buildings);
  const roads = JSON.stringify(g.s.roads);
  const typesBefore = g.board.hexes.map((h) => h.type);
  const numsBefore = g.board.hexes.map((h) => h.num);
  let changed = false;
  for (let i = 0; i < 5 && !changed; i++) {
    g.player(0).dev.push({ type: 'remap', turn: 1 });
    g.s.devPlayed = false;
    assert.equal(g.playDev(0, 'remap').ok, true);
    changed = g.board.hexes.some((h, idx) => h.type !== typesBefore[idx] || h.num !== numsBefore[idx]);
  }
  assert.ok(changed, 'Felder müssen sich ändern');
  assert.equal(JSON.stringify(g.s.buildings), buildings);
  assert.equal(JSON.stringify(g.s.roads), roads);
  assert.deepEqual([...g.board.hexes.map((h) => h.type)].sort(), [...typesBefore].sort());
  assert.deepEqual(g.board.hexes.map((h) => h.num).filter(Boolean).sort(), numsBefore.filter(Boolean).sort());
  for (const h of g.board.hexes) assert.equal(h.type === 'desert', h.num === null);
});

test('Weltenwandel ist erst in der nächsten Runde spielbar und nur 1 Karte pro Zug', () => {
  const g = afterSetup({}, 12);
  g.s.sub = 'actions';
  const p = g.player(0);
  p.dev = [{ type: 'remap', turn: g.s.turnNumber }, { type: 'plenty', turn: 1 }, { type: 'monopoly', turn: 1 }];
  assert.equal(g.playDev(0, 'remap').ok, false);
  assert.equal(g.playDev(0, 'plenty', { a: 'ore', b: 'ore' }).ok, true);
  assert.equal(p.hand.ore >= 2, true);
  assert.equal(g.playDev(0, 'monopoly', { res: 'ore' }).ok, false, 'nur eine Karte pro Zug');
});

test('Nebel wird durch eine angrenzende Straße gelüftet (+1 Rohstoff)', () => {
  const g = afterSetup({ variant: 'fog' }, 13);
  clearBoard(g);
  const fogHex = g.board.hexes.find((h) => h.fog && h.type !== 'desert');
  const v = fogHex.verts.find((vid) => g.board.vertices[vid].hexes.some((hid) => !g.board.hexes[hid].fog)) ?? fogHex.verts[0];
  const edge = g.board.vertices[v].edges[0];
  g.s.sub = 'actions';
  g.player(0).hand = { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 };
  g.s.roads[g.board.vertices[v].edges[1]] = 0; // Anschluss
  g.s.roads[g.board.vertices[v].edges[1]] = 0;
  const r = g.build(0, 'road', edge);
  assert.equal(r.ok, true, r.error);
  assert.equal(fogHex.fog, false);
  assert.equal(g.player(0).hand[fogHex.type], 1);
});

test('Längste Handelsstraße ab 5 Straßen, Gegner-Siedlung unterbricht', () => {
  const g = afterSetup({}, 14);
  clearBoard(g);
  // Pfad aus 6 Kanten suchen (Backtracking)
  const b = g.board;
  const findPath = (v, visited, path) => {
    if (path.length === 6) return path;
    for (const e of b.vertices[v].edges) {
      const ed = b.edges[e];
      const o = ed.a === v ? ed.b : ed.a;
      if (visited.has(o)) continue;
      visited.add(o);
      const r = findPath(o, visited, [...path, { e, from: v, to: o }]);
      if (r) return r;
      visited.delete(o);
    }
    return null;
  };
  const path = findPath(b.vertices[0].id, new Set([0]), []);
  for (const seg of path.slice(0, 5)) g.s.roads[seg.e] = 0;
  g.afterAction();
  assert.equal(g.s.longestRoad.holder, 0);
  assert.equal(g.vp(0), 2);
  // Gegner setzt Siedlung auf mittlere Ecke -> Straße zerfällt
  g.s.buildings[path[2].to] = { owner: 1, type: 'settlement' };
  g.afterAction();
  assert.equal(g.s.longestRoad.holder, null);
});

test('Missionen: nur der erste Spieler erhält den Punkt', () => {
  const g = afterSetup({}, 15);
  clearBoard(g);
  g.s.missions = [{ id: 'citybuilder', claimedBy: null }];
  for (const p of g.s.players) p.missions = [];
  const spots = [];
  for (const v of g.board.vertices) if (spots.every((p) => !g.board.vertices[p].adj.includes(v.id) && p !== v.id)) spots.push(v.id);
  for (let i = 0; i < 3; i++) g.s.buildings[spots[i]] = { owner: 2, type: 'city' };
  g.afterAction();
  assert.equal(g.s.missions[0].claimedBy, 2);
  assert.equal(g.player(2).missions.length, 1);
  for (let i = 3; i < 6; i++) g.s.buildings[spots[i]] = { owner: 1, type: 'city' };
  g.afterAction();
  assert.equal(g.s.missions[0].claimedBy, 2, 'bleibt beim ersten');
  assert.equal(g.player(1).missions.length, 0);
  assert.equal(g.vp(2), 3 * 2 + 1);
});

test('Hafen-Verhältnisse und Banktausch', () => {
  const g = afterSetup({}, 16);
  clearBoard(g);
  g.s.sub = 'actions';
  assert.equal(g.portRatio(0, 'wood'), 4);
  const any = g.board.vertices.find((v) => v.port === 'any');
  g.s.buildings[any.id] = { owner: 0, type: 'settlement' };
  assert.equal(g.portRatio(0, 'wood'), 3);
  const sp = g.board.vertices.find((v) => v.port && v.port !== 'any' && !g.board.vertices[any.id].adj.includes(v.id) && v.id !== any.id);
  g.s.buildings[sp.id] = { owner: 0, type: 'settlement' };
  assert.equal(g.portRatio(0, sp.port), 2);
  g.player(0).hand[sp.port] = 2;
  const other = RES.find((r) => r !== sp.port);
  assert.equal(g.bankTrade(0, sp.port, other).ok, true);
  assert.equal(g.player(0).hand[other], 1);
  assert.equal(g.bankTrade(0, sp.port, other).ok, false);
});

test('Bauen kostet Rohstoffe, Stadt braucht eigene Siedlung', () => {
  const g = afterSetup({}, 17);
  g.s.sub = 'actions';
  const mine = g.buildingsOf(0)[0];
  g.player(0).hand = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 };
  assert.equal(g.build(0, 'city', mine.vid).ok, true);
  assert.equal(g.s.buildings[mine.vid].type, 'city');
  assert.equal(g.handCount(0), 0);
  assert.equal(g.build(0, 'city', mine.vid).ok, false);
  assert.deepEqual(COSTS.city, { wheat: 2, ore: 3 });
});

test('Eine 7: Spieler mit mehr als 7 Karten werfen die Hälfte ab, dann Räuber', () => {
  const g = afterSetup({}, 18);
  g.player(0).hand = { wood: 3, brick: 3, sheep: 3, wheat: 0, ore: 0 };
  g.player(1).hand = { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 };
  g.rollDice(0, [3, 4]);
  assert.equal(g.s.sub, 'discard');
  assert.equal(g.s.discard[0], 4);
  assert.equal(g.discard(0, { wood: 1 }).ok, false);
  assert.equal(g.discard(0, { wood: 3, brick: 1 }).ok, true);
  assert.equal(g.s.sub, 'robber');
  const target = g.legalRobberHexes()[0];
  assert.equal(g.moveRobber(0, g.s.robber).ok, false);
  assert.equal(g.moveRobber(0, target).ok, true);
  assert.ok(['actions', 'steal'].includes(g.s.sub));
});

test('Spielstand ist JSON-serialisierbar und wieder ladbar', () => {
  const g = afterSetup({ variant: 'fog' }, 19);
  const copy = Game.fromJSON(JSON.parse(JSON.stringify(g.s)));
  assert.equal(copy.vp(0), g.vp(0));
  assert.equal(copy.board.hexes.length, g.board.hexes.length);
  g.s.sub = 'roll';
  assert.equal(copy.rollDice(0).ok, true);
});

test('Ernte-Karte: Ertrag eines eigenen Feldes (Stadt doppelt), Auswahl nur eigener Felder', () => {
  const g = afterSetup({}, 21);
  clearBoard(g);
  g.s.sub = 'actions';
  g.s.robber = g.board.hexes.find((h) => h.type === 'desert').id;
  const hex = g.board.hexes.find((h) => h.type !== 'desert');
  g.s.buildings[hex.verts[0]] = { owner: 0, type: 'city' };
  const p = g.player(0);
  p.dev = [{ type: 'harvest', turn: 1 }];
  assert.deepEqual(g.harvestHexes(0), g.harvestHexes(0).filter((id) => g.harvestAmount(0, id) > 0));
  assert.ok(g.harvestHexes(0).includes(hex.id));
  const foreign = g.board.hexes.find((h) => h.type !== 'desert' && !g.harvestHexes(0).includes(h.id));
  assert.equal(g.playDev(0, 'harvest', { hex: foreign.id }).ok, false, 'fremdes Feld nicht wählbar');
  const r = g.playDev(0, 'harvest', { hex: hex.id });
  assert.equal(r.ok, true, r.error);
  assert.equal(p.hand[hex.type], g.harvestAmount(0, hex.id));
  assert.ok(p.hand[hex.type] >= 2);
});

test('Angebote: erstellen, Gegenvorschlag, annehmen, auslaufen', () => {
  const g = afterSetup({}, 22);
  clearBoard(g);
  g.s.sub = 'actions';
  g.player(0).hand.wood = 2;
  g.player(1).hand.brick = 1;
  g.player(2).hand.sheep = 3;
  assert.equal(g.createOffer(0, { sheep: 1 }, { brick: 1 }).ok, false, 'Angebot ohne passende Karten');
  const { offer } = g.createOffer(0, { wood: 1 }, { brick: 1 });
  assert.equal(g.canAcceptOffer(1, offer), true);
  assert.equal(g.canAcceptOffer(2, offer), false, 'Spieler ohne Lehm kann nicht annehmen');
  assert.equal(g.respondOffer(2, offer.id, 'accept').ok, false);
  g.respondOffer(2, offer.id, 'decline');
  assert.equal(g.respondOffer(1, offer.id, 'counter', { give: { wood: 2 }, get: { brick: 1 } }).ok, true);
  assert.equal(g.acceptCounter(0, offer.id, 1).ok, true);
  assert.equal(g.player(0).hand.wood, 0);
  assert.equal(g.player(0).hand.brick, 1);
  assert.equal(g.player(1).hand.wood, 2);
  assert.equal(g.s.offers.length, 0);
  assert.equal(g.s.trades.at(-1).status, 'accepted');

  g.player(0).hand.ore = 1;
  const o2 = g.createOffer(0, { ore: 1 }, { sheep: 1 }).offer;
  assert.equal(g.s.offers.length, 1);
  g.endTurn(0);
  assert.equal(g.s.offers.length, 0);
  assert.equal(g.s.trades.at(-1).status, 'expired');
  assert.equal(g.respondOffer(2, o2.id, 'accept').ok, false);
});

test('Bots haben Charaktere (Name, Eigenschaft, Gesicht)', () => {
  const g = newGame({ bots: 5, size: 'large' });
  const bots = g.s.players.filter((p) => p.isBot);
  assert.equal(new Set(bots.map((b) => b.name)).size, 5);
  for (const b of bots) { assert.ok(b.trait && b.tagline && b.face.skin); }
  const g2 = newGame({ bots: 2, botIds: ['mira', 'amir'] });
  assert.deepEqual(g2.s.players.slice(1).map((p) => p.name), ['Mira', 'Amir']);
});

test('Goldfeld: bei passender Zahl wählt der Besitzer frei (Stadt = 2), kein Anti-Pech-Marker', () => {
  const g = afterSetup({ goldField: true }, 31);
  clearBoard(g);
  assert.ok(g.board.hexes.some((h) => h.type === 'gold'), 'Karte enthält ein Goldfeld');
  const gold = g.board.hexes.find((h) => h.type === 'gold');
  gold.fog = false;
  gold.num = 8;
  g.s.robber = g.board.hexes.find((h) => h.type === 'desert').id;
  g.s.buildings[gold.verts[0]] = { owner: 1, type: 'city' };
  g.s.players.forEach((p) => { p.tokens = 0; });
  g.s.sub = 'roll';
  g.s.turn = 0;
  g.rollDice(0, [4, 4]);
  assert.equal(g.s.sub, 'gold');
  assert.deepEqual(g.pendingActors(), [1]);
  assert.equal(g.player(1).tokens, 0, 'Goldfeld-Ertrag zählt als Ertrag');
  assert.equal(g.chooseGold(1, { ore: 1 }).ok, false, 'es müssen genau 2 Rohstoffe sein');
  assert.equal(g.chooseGold(1, { ore: 1, wheat: 1 }).ok, true);
  assert.equal(g.player(1).hand.ore, 1);
  assert.equal(g.player(1).hand.wheat, 1);
  assert.equal(g.s.sub, 'actions');
});

test('Goldfeld bleibt beim Weltenwandel erhalten und ist auf dem Standardfeld optional', () => {
  const g = afterSetup({ goldField: true }, 32);
  const countBefore = g.board.hexes.filter((h) => h.type === 'gold').length;
  g.player(0).dev.push({ type: 'remap', turn: 1 });
  g.s.sub = 'actions';
  assert.equal(g.playDev(0, 'remap').ok, true);
  assert.equal(g.board.hexes.filter((h) => h.type === 'gold').length, countBefore);
  const off = newGame({ goldField: false }, 33);
  assert.ok(off.board.hexes.every((h) => h.type !== 'gold'));
});

test('Angebote (deferred): Zusagen werden nur vorgemerkt, getauscht wird erst nach Bestätigung des Anbieters', () => {
  const g = afterSetup({}, 22);
  clearBoard(g);
  g.s.sub = 'actions';
  g.player(0).hand.wood = 1;
  g.player(1).hand.brick = 1;
  g.player(2).hand.brick = 1;
  const { offer } = g.createOffer(0, { wood: 1 }, { brick: 1 }, { deferred: true });
  assert.equal(g.respondOffer(1, offer.id, 'accept', null, 'Einverstanden.').ok, true);
  assert.equal(g.respondOffer(2, offer.id, 'decline', null, 'Lohnt sich nicht.').ok, true);
  assert.equal(g.player(0).hand.wood, 1, 'noch nichts getauscht');
  assert.equal(g.offerById(offer.id).responses[1].type, 'accept');
  assert.equal(g.offerById(offer.id).responses[2].reason, 'Lohnt sich nicht.');
  assert.equal(g.acceptResponse(0, offer.id, 2).ok, false, 'Ablehnung kann nicht bestätigt werden');
  assert.equal(g.acceptResponse(0, offer.id, 1).ok, true);
  assert.equal(g.player(0).hand.wood, 0);
  assert.equal(g.player(0).hand.brick, 1);
  assert.equal(g.player(1).hand.wood, 1);
  assert.equal(g.s.offers.length, 0);
});

test('Schwierigkeit lässt sich pro Gegner einstellen', () => {
  const g = newGame({ difficulty: 'normal', botIds: ['fritz', 'greta', 'otto'], botDifficulty: { greta: 'hard', otto: 'easy' } });
  const byName = Object.fromEntries(g.s.players.filter((p) => p.isBot).map((p) => [p.name, p.difficulty]));
  assert.deepEqual(byName, { Fritz: 'normal', Greta: 'hard', Otto: 'easy' });
  assert.equal(g.player(0).difficulty, null);
});

test('Bei einer 7 werfen alle Gegner mit mehr als 7 Karten die Hälfte (abgerundet) ab', () => {
  const g = afterSetup({}, 7);
  g.player(0).hand = { wood: 1, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.player(1).hand = { wood: 4, brick: 3, sheep: 2, wheat: 1, ore: 1 }; // 11 → 5
  g.player(2).hand = { wood: 2, brick: 2, sheep: 2, wheat: 1, ore: 0 }; // 7 → nichts
  g.player(3).hand = { wood: 2, brick: 2, sheep: 2, wheat: 1, ore: 1 }; // 8 → 4
  const events = [];
  g.on((e) => events.push(e));
  assert.equal(g.rollDice(0, [3, 4]).ok, true);
  assert.deepEqual(g.s.discard, { 1: 5, 3: 4 });
  for (const pi of [1, 3]) botAct(g, pi);
  assert.equal(g.handCount(1), 6);
  assert.equal(g.handCount(2), 7);
  assert.equal(g.handCount(3), 4);
  assert.equal(g.s.sub, 'robber');
  assert.deepEqual(events.filter((e) => e.type === 'discard').map((e) => [e.pi, e.n]), [[1, 5], [3, 4]]);
});

test('Bots tauschen 1:1, wenn ihnen genau die fehlende Karte hilft', () => {
  const g = afterSetup({ difficulty: 'normal' }, 5);
  g.s.turn = 0; g.s.sub = 'actions';
  g.player(1).hand = { wood: 3, brick: 0, sheep: 0, wheat: 2, ore: 2 }; // Stadt braucht noch 1 Erz; Holz ist übrig
  g.player(0).hand = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 1 };
  const ans = botRespondOffer(g, 1, { from: 0, give: { ore: 1 }, get: { wood: 1 }, responses: {} });
  assert.equal(ans.type, 'accept');
});

test('Bots geben keine Karte her, die sie für ihr Ziel brauchen', () => {
  const g = afterSetup({ difficulty: 'hard' }, 5);
  g.s.turn = 0; g.s.sub = 'actions';
  g.player(1).hand = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 }; // Stadt bezahlbar
  g.player(0).hand = { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  const ans = botRespondOffer(g, 1, { from: 0, give: { wood: 1 }, get: { ore: 1 }, responses: {} });
  assert.notEqual(ans.type, 'accept');
});

test('Bots helfen dem Spieler kurz vor dem Sieg nicht beim Bauen, tauschen sonst aber mit ihm', () => {
  const g = afterSetup({ difficulty: 'hard', targetVP: 10 }, 5);
  g.s.turn = 0; g.s.sub = 'actions';
  g.player(1).hand = { wood: 0, brick: 3, sheep: 0, wheat: 0, ore: 0 };
  g.player(0).hand = { wood: 2, brick: 0, sheep: 1, wheat: 1, ore: 0 }; // fehlt nur Lehm für eine Siedlung
  const offer = { from: 0, give: { wood: 1 }, get: { brick: 1 }, responses: {} };
  g.s.longestRoad = { holder: 0, len: 5 }; g.s.largestArmy = { holder: 0, count: 3 }; // 4 Zusatzpunkte + 2 Siedlungen = 6 SP
  const calm = botRespondOffer(g, 1, offer).type;
  g.s.players[0].missions = [1, 2]; // 8 SP: jetzt zählt jeder Schritt zum Sieg
  const nearWin = botRespondOffer(g, 1, offer);
  assert.equal(nearWin.type, 'decline');
  assert.equal(nearWin.reason, 'Hilft dir nicht beim Gewinnen!');
  assert.ok(['accept', 'counter', 'decline'].includes(calm));
});

test('Bots verhandeln: aus einem schlechten Angebot machen sie einen Gegenvorschlag', () => {
  const g = afterSetup({ difficulty: 'hard' }, 5);
  g.s.turn = 0; g.s.sub = 'actions';
  g.player(1).hand = { wood: 4, brick: 0, sheep: 0, wheat: 2, ore: 2 }; // braucht 1 Erz für die Stadt, Holz ist übrig
  g.player(0).hand = { wood: 0, brick: 0, sheep: 0, wheat: 1, ore: 1 };
  // Angebot: Spieler gibt 1 Erz, will aber 3 Holz (zu viel verlangt)
  const ans = botRespondOffer(g, 1, { from: 0, give: { ore: 1 }, get: { wood: 3 }, responses: {} });
  assert.ok(ans.type === 'accept' || ans.type === 'counter');
});

test('Bots haben einen Plan, der sich ändern kann', () => {
  const g = afterSetup({}, 9);
  g.s.turn = 1; g.s.sub = 'roll';
  botAct(g, 1);
  const first = g.player(1).strategy;
  assert.ok(first && ['expand', 'cities', 'harbor', 'army'].includes(first.id));
  // Kein Platz mehr zum Siedeln, aber Städte möglich → Plan wechselt zu Städten
  g.player(1).pieces.settlement = 0;
  g.player(1).pieces.road = 0;
  g.s.turnNumber += 1;
  g.s.sub = 'roll'; g.s.turn = 1;
  botAct(g, 1);
  assert.notEqual(g.player(1).strategy.id, 'expand');
});

test('Bots nutzen einen 2:1-Hafen, um Überschuss in Fehlendes zu tauschen', () => {
  const g = afterSetup({}, 5);
  const b = g.board;
  const portVertex = b.vertices.find((v) => v.port && v.port !== 'any' && !g.s.buildings[v.id] && v.adj.every((n) => !g.s.buildings[n]));
  assert.ok(portVertex);
  g.s.buildings[portVertex.id] = { owner: 1, type: 'settlement' };
  const res = portVertex.port;
  const other = RES.find((r) => r !== res);
  assert.equal(g.portRatio(1, res), 2);
  g.s.turn = 1; g.s.sub = 'actions';
  g.player(1).hand = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  g.player(1).hand[res] = 5;
  const before = g.player(1).hand[res];
  let traded = false;
  for (let i = 0; i < 12 && !traded; i++) {
    botAct(g, 1);
    traded = g.player(1).bankTrades > 0;
  }
  assert.equal(traded, true);
  assert.ok(g.player(1).hand[res] < before, `${res} wurde über den Hafen getauscht`);
  assert.ok(other);
});

test('Größte Rittermacht: Wechsel löst ein Award-Event aus und zählt +2 Siegpunkte', () => {
  const g = afterSetup({}, 5);
  const events = [];
  g.on((e) => { if (e.type === 'award') events.push(e); });
  const before = g.vp(1);
  g.player(1).playedKnights = 3;
  g.updateLargestArmy();
  assert.equal(g.s.largestArmy.holder, 1);
  assert.equal(g.vp(1), before + 2);
  g.player(0).playedKnights = 4;
  g.updateLargestArmy();
  assert.deepEqual(events.map((e) => [e.kind, e.holder, e.prev]), [['army', 1, null], ['army', 0, 1]]);
  assert.equal(g.s.largestArmy.holder, 0);
});

test('Siegpunktziel bis 50: Spielstücke und Siegpunktkarten wachsen mit', () => {
  const g50 = newGame({ size: 'huge', targetVP: 50 });
  const g10 = newGame({ size: 'huge', targetVP: 10 });
  assert.equal(g50.s.settings.targetVP, 50);
  assert.ok(g50.player(0).pieces.road > g10.player(0).pieces.road);
  assert.ok(g50.player(0).pieces.city > g10.player(0).pieces.city);
  const victory = (g) => g.s.devDeck.filter((t) => t === 'victory').length;
  assert.ok(victory(g50) > victory(g10));
  assert.equal(newGame({ targetVP: 99 }).s.settings.targetVP, 50, 'mehr als 50 wird gekappt');
});

test('Patt: ohne Bauplätze und ohne Punktänderung gewinnt nach 30 Runden der Führende', () => {
  const g = afterSetup({ targetVP: 50 }, 5);
  // Alle Bauplätze und Spielstücke weg, Bank leer, keine Karten – nichts kann sich mehr ändern
  for (const p of g.s.players) { p.pieces.settlement = 0; p.pieces.city = 0; }
  g.s.devDeck = [];
  g.s.sub = 'actions'; g.s.turn = 0;
  const events = [];
  g.on((e) => { if (e.type === 'win') events.push(e); });
  let guard = 0;
  while (g.s.phase !== 'over' && guard++ < g.s.players.length * 40) {
    g.s.sub = 'actions';
    assert.equal(g.endTurn(g.s.turn).ok, true);
  }
  assert.equal(g.s.phase, 'over');
  assert.equal(g.s.stalemate, true);
  assert.equal(events.length, 1);
  assert.ok(g.s.winner !== null);
  assert.ok(g.vp(g.s.winner) < 50);
});

test('Wahlfeld: bei knapper Bank hängt das Spiel nicht fest', () => {
  const g = afterSetup({}, 5);
  g.s.sub = 'gold';
  g.s.gold = { 1: 3 };
  for (const r of RES) g.s.bank[r] = 0;
  g.s.bank.wood = 1; // nur noch 1 Karte da, verlangt sind 3
  assert.equal(g.chooseGold(1, { wood: 1 }).ok, true);
  assert.equal(g.s.sub, 'actions');
  assert.equal(g.s.gold[1], undefined);
});
