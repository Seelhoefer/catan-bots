// Regel-Engine: kompletter Spielzustand (JSON-serialisierbar) + alle Aktionen.

import {
  RES, RES_INFO, COSTS, SIZES, DEV_INFO, PLAYER_COLORS, BOT_ROSTER, HUMAN_FACES, DEFAULT_SETTINGS,
} from './constants.js';
import { makeRng, shuffle } from './rng.js';
import { generateBoard, remapBoard } from './board.js';
import { MISSION_POOL, missionById } from './missions.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (error) => ({ ok: false, error });
const emptyHand = () => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
const sumHand = (h) => RES.reduce((a, r) => a + (h[r] || 0), 0);

export class Game {
  constructor(state, rng) {
    this.s = state;
    this.rng = rng || makeRng();
    this.listeners = [];
  }

  // ---------------------------------------------------------------- Erzeugung
  static create(userSettings = {}, rng) {
    const settings = { ...DEFAULT_SETTINGS, ...userSettings };
    const size = SIZES[settings.size];
    const r = rng || makeRng(settings.seed);
    settings.bots = Math.max(1, Math.min(settings.bots, size.maxPlayers - 1));
    settings.targetVP = Math.max(4, Math.min(30, settings.targetVP));

    const board = generateBoard(settings.size, settings.variant, r, { gold: settings.goldField });
    const extra = size.sizeBonus + Math.ceil(Math.max(0, settings.targetVP - 10) / 2);
    const pieces = { road: 15 + extra * 3, settlement: 5 + extra, city: 4 + extra };

    const n = settings.bots + 1;
    const roster = [];
    const mine = BOT_ROSTER.find((x) => x.id === settings.avatarPortrait) || null; // gewähltes Bot-Gesicht des Menschen
    for (const id of settings.botIds || []) { const b = BOT_ROSTER.find((x) => x.id === id); if (b && b !== mine && !roster.includes(b)) roster.push(b); }
    for (const b of BOT_ROSTER) { if (roster.length >= settings.bots) break; if (b !== mine && !roster.includes(b)) roster.push(b); }
    const players = [];
    for (let i = 0; i < n; i++) {
      const bot = i === 0 ? null : roster[i - 1];
      players.push({
        id: i,
        name: i === 0 ? (settings.playerName || 'Du') : bot.name,
        trait: bot ? bot.trait : null,
        tagline: bot ? bot.tagline : '',
        face: bot ? bot.face : (mine ? mine.face : HUMAN_FACES[(settings.avatar || 0) % HUMAN_FACES.length]),
        isBot: i !== 0,
        difficulty: bot ? ((settings.botDifficulty || {})[bot.id] || settings.difficulty) : null,
        color: PLAYER_COLORS[i].hex,
        hand: emptyHand(),
        dev: [],
        playedKnights: 0,
        tokens: 0,
        bankTrades: 0,
        devBought: 0,
        pieces: { ...pieces },
        missions: [],
      });
    }

    const f = size.factor;
    const deck = [];
    const add = (t, c) => { for (let i = 0; i < c; i++) deck.push(t); };
    add('knight', 14 * f); add('victory', 5 * f); add('roadbuilding', 2 * f);
    add('plenty', 2 * f); add('monopoly', 2 * f);
    if (settings.remapCard) add('remap', 2 * f);
    if (settings.harvestCard) add('harvest', 2 * f);

    const bank = {};
    for (const res of RES) bank[res] = 19 * f;

    let robber = board.hexes.find((h) => h.type === 'desert' && !h.fog);
    robber = robber ? robber.id : board.hexes[0].id;

    const missions = settings.missions
      ? shuffle(MISSION_POOL, r).slice(0, 3).map((m) => ({ id: m.id, claimedBy: null }))
      : [];

    const start = Math.floor(r() * n);
    const order = [];
    for (let i = 0; i < n; i++) order.push((start + i) % n);
    const setupOrder = [...order, ...order.slice().reverse()];

    const state = {
      version: 1,
      settings,
      board,
      players,
      buildings: {},
      roads: {},
      robber,
      bank,
      devDeck: shuffle(deck, r),
      phase: 'setup',
      sub: 'settlement', // setup: settlement|road · main: roll|discard|robber|steal|actions
      turn: setupOrder[0],
      turnNumber: 0,
      setup: { order: setupOrder, step: 0, lastSettlement: null },
      dice: null,
      discard: {},
      devPlayed: false,
      roadBuildingLeft: 0,
      returnSub: 'actions',
      longestRoad: { holder: null, len: 0 },
      largestArmy: { holder: null, count: 0 },
      missions,
      gold: {},
      offers: [],
      trades: [],
      nextOfferId: 1,
      winner: null,
      log: [],
      botMemory: {},
      lastRoll: null,
    };
    const g = new Game(state, r);
    g.log(`Neue Partie: ${n} Spieler, ${board.hexes.length} Felder, ${settings.targetVP} Siegpunkte${settings.variant === 'fog' ? ', Nebel-Variante' : ''}.`);
    g.log(`${players[state.turn].name} beginnt mit der Gründung.`);
    return g;
  }

  static fromJSON(state) {
    return new Game(state, makeRng());
  }

  toJSON() { return this.s; }

  // ---------------------------------------------------------------- Events / Log
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }

  emit(evt) { for (const l of this.listeners) l(evt); }

  log(msg, pi = null) {
    this.s.log.push({ turn: this.s.turnNumber, msg, pi });
    if (this.s.log.length > 400) this.s.log.shift();
    this.emit({ type: 'log', msg, pi });
  }

  // ---------------------------------------------------------------- Abfragen
  get board() { return this.s.board; }

  get cur() { return this.s.players[this.s.turn]; }

  player(pi) { return this.s.players[pi]; }

  handCount(pi) { return sumHand(this.s.players[pi].hand); }

  canAfford(pi, cost) {
    const h = this.s.players[pi].hand;
    return Object.entries(cost).every(([r, n]) => h[r] >= n);
  }

  buildingsOf(pi) {
    const out = [];
    for (const [vid, b] of Object.entries(this.s.buildings)) {
      if (b.owner === pi) out.push({ vid: Number(vid), type: b.type });
    }
    return out;
  }

  roadsOf(pi) {
    const out = [];
    for (const [eid, o] of Object.entries(this.s.roads)) if (o === pi) out.push(Number(eid));
    return out;
  }

  vp(pi, publicOnly = false) {
    const p = this.s.players[pi];
    let v = 0;
    for (const b of this.buildingsOf(pi)) v += b.type === 'city' ? 2 : 1;
    if (this.s.longestRoad.holder === pi) v += 2;
    if (this.s.largestArmy.holder === pi) v += 2;
    v += p.missions.length;
    if (!publicOnly) v += p.dev.filter((c) => c.type === 'victory').length;
    return v;
  }

  tokenCost(pi) { return Math.max(1, this.vp(pi)); }

  portRatio(pi, res) {
    let best = 4;
    for (const b of this.buildingsOf(pi)) {
      const port = this.board.vertices[b.vid].port;
      if (port === 'any') best = Math.min(best, 3);
      else if (port === res) best = Math.min(best, 2);
    }
    return best;
  }

  /** Wer muss gerade handeln? (Liste von Spielerindizes) */
  pendingActors() {
    const s = this.s;
    if (s.phase === 'over') return [];
    if (s.phase === 'setup') return [s.turn];
    if (s.sub === 'discard') return Object.keys(s.discard).map(Number);
    if (s.sub === 'gold') return Object.keys(s.gold).map(Number);
    return [s.turn];
  }

  // ---------------------------------------------------------------- Legale Positionen
  vertexFree(vid) {
    const v = this.board.vertices[vid];
    if (this.s.buildings[vid]) return false;
    return v.adj.every((n) => !this.s.buildings[n]);
  }

  vertexTouchesFog(vid) {
    return this.board.vertices[vid].hexes.some((h) => this.board.hexes[h].fog);
  }

  legalSettlementSpots(pi) {
    const s = this.s;
    const out = [];
    for (const v of this.board.vertices) {
      if (!this.vertexFree(v.id)) continue;
      if (s.phase === 'setup') {
        if (this.vertexTouchesFog(v.id)) continue;
        out.push(v.id);
      } else if (v.edges.some((e) => s.roads[e] === pi)) {
        out.push(v.id);
      }
    }
    return out;
  }

  legalCitySpots(pi) {
    return this.buildingsOf(pi).filter((b) => b.type === 'settlement').map((b) => b.vid);
  }

  roadConnects(pi, vid) {
    const b = this.s.buildings[vid];
    if (b) return b.owner === pi;
    return this.board.vertices[vid].edges.some((e) => this.s.roads[e] === pi);
  }

  legalRoadSpots(pi) {
    const s = this.s;
    const out = [];
    if (s.phase === 'setup') {
      const v = s.setup.lastSettlement;
      if (v == null) return out;
      for (const e of this.board.vertices[v].edges) if (s.roads[e] === undefined) out.push(e);
      return out;
    }
    for (const e of this.board.edges) {
      if (s.roads[e.id] !== undefined) continue;
      if (this.roadConnects(pi, e.a) || this.roadConnects(pi, e.b)) out.push(e.id);
    }
    return out;
  }

  legalRobberHexes() {
    return this.board.hexes.filter((h) => !h.fog && h.id !== this.s.robber).map((h) => h.id);
  }

  stealTargets(hexId) {
    const out = new Set();
    for (const vid of this.board.hexes[hexId].verts) {
      const b = this.s.buildings[vid];
      if (b && b.owner !== this.s.turn && this.handCount(b.owner) > 0) out.add(b.owner);
    }
    return [...out];
  }

  // ---------------------------------------------------------------- Setup-Phase
  placeInitialSettlement(pi, vid) {
    const s = this.s;
    if (s.phase !== 'setup' || s.sub !== 'settlement' || s.turn !== pi) return fail('Du bist nicht dran.');
    if (!this.legalSettlementSpots(pi).includes(vid)) return fail('Hier darf keine Siedlung stehen.');
    const p = this.player(pi);
    s.buildings[vid] = { owner: pi, type: 'settlement' };
    p.pieces.settlement--;
    s.setup.lastSettlement = vid;
    s.sub = 'road';
    // Zweite Runde: Startrohstoffe
    if (s.setup.step >= s.players.length) {
      const got = emptyHand();
      for (const hid of this.board.vertices[vid].hexes) {
        const h = this.board.hexes[hid];
        if (RES.includes(h.type) && s.bank[h.type] > 0) { got[h.type]++; s.bank[h.type]--; p.hand[h.type]++; }
      }
      this.log(`${p.name} gründet eine zweite Siedlung und erhält ${this.fmtHand(got)}.`, pi);
      this.emit({ type: 'gain', pi, hand: got });
    } else {
      this.log(`${p.name} gründet eine Siedlung.`, pi);
    }
    this.emit({ type: 'build', kind: 'settlement', id: vid, pi });
    return ok();
  }

  placeInitialRoad(pi, eid) {
    const s = this.s;
    if (s.phase !== 'setup' || s.sub !== 'road' || s.turn !== pi) return fail('Du bist nicht dran.');
    if (!this.legalRoadSpots(pi).includes(eid)) return fail('Hier darf keine Straße stehen.');
    const p = this.player(pi);
    s.roads[eid] = pi;
    p.pieces.road--;
    this.emit({ type: 'build', kind: 'road', id: eid, pi });
    const e = this.board.edges[eid];
    this.revealAround(pi, [e.a, e.b]);
    s.setup.step++;
    s.setup.lastSettlement = null;
    if (s.setup.step >= s.setup.order.length) {
      s.phase = 'main';
      s.turn = s.setup.order[0];
      s.turnNumber = 1;
      s.sub = 'roll';
      this.log('Die Gründungsphase ist beendet – das Spiel beginnt!');
      this.log(`${this.cur.name} ist am Zug.`, s.turn);
    } else {
      s.turn = s.setup.order[s.setup.step];
      s.sub = 'settlement';
    }
    this.afterAction();
    return ok();
  }

  // ---------------------------------------------------------------- Würfeln & Erträge
  rollDice(pi, forced = null) {
    const s = this.s;
    if (s.phase !== 'main' || s.sub !== 'roll' || s.turn !== pi) return fail('Jetzt kann nicht gewürfelt werden.');
    if (s.roadBuildingLeft > 0) return fail('Baue zuerst deine Straßen.');
    const d1 = forced ? forced[0] : 1 + Math.floor(this.rng() * 6);
    const d2 = forced ? forced[1] : 1 + Math.floor(this.rng() * 6);
    const total = d1 + d2;
    s.dice = [d1, d2];
    s.lastRoll = total;
    this.log(`${this.cur.name} würfelt ${d1} + ${d2} = ${total}.`, pi);
    this.emit({ type: 'dice', dice: [d1, d2], pi });
    if (total === 7) {
      s.discard = {};
      for (const p of s.players) {
        const n = this.handCount(p.id);
        if (n > 7) s.discard[p.id] = Math.floor(n / 2);
      }
      s.returnSub = 'actions';
      if (Object.keys(s.discard).length) {
        s.sub = 'discard';
        this.log('Eine 7! Spieler mit mehr als 7 Karten müssen die Hälfte abgeben.');
      } else {
        s.sub = 'robber';
        this.log('Eine 7! Der Räuber wird versetzt.');
      }
    } else {
      this.produce(total);
      s.sub = Object.keys(s.gold).length ? 'gold' : 'actions';
    }
    this.afterAction();
    return ok({ total });
  }

  produce(total) {
    const s = this.s;
    const gains = s.players.map(() => emptyHand());
    const goldPick = {};
    const src = s.players.map(() => []); // Herkunft der Erträge (Feld, Rohstoff, Menge) für die Animation
    for (const h of this.board.hexes) {
      if (h.num !== total || h.fog || h.id === s.robber) continue;
      for (const vid of h.verts) {
        const b = s.buildings[vid];
        if (!b) continue;
        if (h.type === 'gold') goldPick[b.owner] = (goldPick[b.owner] || 0) + (b.type === 'city' ? 2 : 1);
        else {
          const n = b.type === 'city' ? 2 : 1;
          gains[b.owner][h.type] += n;
          src[b.owner].push({ hex: h.id, res: h.type, n });
        }
      }
    }
    const received = s.players.map(() => 0);
    for (const res of RES) {
      const takers = s.players.filter((p) => gains[p.id][res] > 0);
      const totalWanted = takers.reduce((a, p) => a + gains[p.id][res], 0);
      if (totalWanted === 0) continue;
      if (totalWanted > s.bank[res]) {
        if (takers.length === 1) {
          gains[takers[0].id][res] = s.bank[res];
        } else {
          for (const p of takers) gains[p.id][res] = 0;
          this.log(`Die Bank hat nicht genug ${RES_INFO[res].name} – niemand erhält welches.`);
        }
      }
      for (const p of takers) {
        const n = gains[p.id][res];
        p.hand[res] += n;
        s.bank[res] -= n;
        received[p.id] += n;
      }
    }
    s.gold = {};
    const bankTotal = RES.reduce((a, r) => a + s.bank[r], 0);
    for (const [pid, n] of Object.entries(goldPick)) {
      const amount = Math.min(n, bankTotal);
      if (amount <= 0) continue;
      s.gold[pid] = amount;
      received[pid] += amount; // zählt als Ertrag (kein Anti-Pech-Marker)
      this.log(`✨ ${s.players[pid].name} darf ${amount} Rohstoff${amount > 1 ? 'e' : ''} frei wählen (Wahlfeld).`, Number(pid));
    }
    for (const p of s.players) {
      if (received[p.id] > 0 && RES.some((r) => gains[p.id][r] > 0)) {
        this.log(`${p.name} erhält ${this.fmtHand(gains[p.id])}.`, p.id);
        // Herkunft an die tatsächlich erhaltenen Mengen anpassen (Bank kann zu wenig haben)
        const left = { ...gains[p.id] };
        const from = [];
        for (const e of src[p.id]) {
          const n = Math.min(e.n, left[e.res]);
          if (n > 0) { from.push({ hex: e.hex, res: e.res, n }); left[e.res] -= n; }
        }
        this.emit({ type: 'gain', pi: p.id, hand: gains[p.id], src: from, roll: true });
      } else if (received[p.id] > 0) {
        // nur Wahlfeld-Ertrag: kein Marker
      } else if (s.settings.antiBad) {
        p.tokens++;
        this.emit({ type: 'token', pi: p.id });
      }
    }
    if (s.settings.antiBad) {
      const lucky = s.players.filter((p) => received[p.id] === 0).map((p) => p.name);
      if (lucky.length) this.log(`🍀 Anti-Pech-Marker für: ${lucky.join(', ')}.`);
    }
  }

  fmtHand(h) {
    const parts = RES.filter((r) => h[r] > 0).map((r) => `${h[r]}× ${RES_INFO[r].icon}`);
    return parts.length ? parts.join(' ') : 'nichts';
  }

  /** Wahlfeld: der Spieler wählt seine Rohstoffe frei aus (Summe = Anspruch). */
  chooseGold(pi, cards) {
    const s = this.s;
    if (s.sub !== 'gold' || !s.gold[pi]) return fail('Du musst keinen Rohstoff wählen.');
    const n = RES.reduce((a, r) => a + (cards[r] || 0), 0);
    if (n !== s.gold[pi]) return fail(`Wähle genau ${s.gold[pi]} Rohstoff${s.gold[pi] > 1 ? 'e' : ''}.`);
    for (const r of RES) {
      if ((cards[r] || 0) < 0 || (cards[r] || 0) > s.bank[r]) return fail(`Die Bank hat nicht genug ${RES_INFO[r].name}.`);
    }
    const p = this.player(pi);
    const got = emptyHand();
    for (const r of RES) { const k = cards[r] || 0; p.hand[r] += k; s.bank[r] -= k; got[r] = k; }
    delete s.gold[pi];
    this.log(`✨ ${p.name} wählt ${this.fmtHand(got)} vom Wahlfeld.`, pi);
    this.emit({ type: 'gain', pi, hand: got });
    if (Object.keys(s.gold).length === 0) s.sub = 'actions';
    this.afterAction();
    return ok();
  }

  // ---------------------------------------------------------------- 7: Abwerfen, Räuber
  discard(pi, cards) {
    const s = this.s;
    if (s.sub !== 'discard' || s.discard[pi] === undefined) return fail('Du musst nichts abwerfen.');
    const n = RES.reduce((a, r) => a + (cards[r] || 0), 0);
    if (n !== s.discard[pi]) return fail(`Du musst genau ${s.discard[pi]} Karten abwerfen.`);
    const p = this.player(pi);
    for (const r of RES) {
      if ((cards[r] || 0) < 0 || (cards[r] || 0) > p.hand[r]) return fail('Ungültige Auswahl.');
    }
    for (const r of RES) { p.hand[r] -= cards[r] || 0; s.bank[r] += cards[r] || 0; }
    delete s.discard[pi];
    this.log(`${p.name} wirft ${n} Karten ab.`, pi);
    this.emit({ type: 'discard', pi, n, cards: { ...cards } });
    if (Object.keys(s.discard).length === 0) {
      s.sub = 'robber';
      this.log(`${this.cur.name} versetzt den Räuber.`, s.turn);
    }
    this.afterAction();
    return ok();
  }

  moveRobber(pi, hexId) {
    const s = this.s;
    if (s.sub !== 'robber' || s.turn !== pi) return fail('Der Räuber kann jetzt nicht versetzt werden.');
    if (!this.legalRobberHexes().includes(hexId)) return fail('Dorthin kann der Räuber nicht.');
    s.robber = hexId;
    this.emit({ type: 'robber', id: hexId });
    const h = this.board.hexes[hexId];
    this.log(`${this.cur.name} setzt den Räuber auf ${h.type === 'gold' ? 'das Wahlfeld' : (RES_INFO[h.type]?.terrain || 'die Wüste')}${h.num ? ` (${h.num})` : ''}.`, pi);
    const targets = this.stealTargets(hexId);
    if (targets.length === 0) {
      s.sub = s.returnSub;
    } else if (targets.length === 1) {
      this.steal(pi, targets[0]);
      return ok();
    } else {
      s.sub = 'steal';
    }
    this.afterAction();
    return ok();
  }

  steal(pi, victim) {
    const s = this.s;
    if (s.turn !== pi || (s.sub !== 'steal' && s.sub !== 'robber')) return fail('Jetzt kann nicht gestohlen werden.');
    if (!this.stealTargets(s.robber).includes(victim)) return fail('Von diesem Spieler kannst du nicht stehlen.');
    const v = this.player(victim);
    const pool = [];
    for (const r of RES) for (let i = 0; i < v.hand[r]; i++) pool.push(r);
    const res = pool[Math.floor(this.rng() * pool.length)];
    v.hand[res]--;
    this.cur.hand[res]++;
    this.log(`${this.cur.name} stiehlt eine Karte von ${v.name}.`, pi);
    this.emit({ type: 'steal', from: victim, to: pi, res });
    s.sub = s.returnSub;
    this.afterAction();
    return ok({ res });
  }

  // ---------------------------------------------------------------- Bauen
  pay(pi, cost) {
    const p = this.player(pi);
    for (const [r, n] of Object.entries(cost)) { p.hand[r] -= n; this.s.bank[r] += n; }
  }

  build(pi, kind, id) {
    const s = this.s;
    if (s.phase !== 'main' || s.turn !== pi) return fail('Du bist nicht dran.');
    const p = this.player(pi);
    if (kind === 'road') {
      const free = s.roadBuildingLeft > 0;
      if (!free && s.sub !== 'actions') return fail('Würfle zuerst.');
      if (p.pieces.road <= 0) return fail('Du hast keine Straßen mehr.');
      if (!free && !this.canAfford(pi, COSTS.road)) return fail('Dir fehlen Rohstoffe (Holz + Lehm).');
      if (!this.legalRoadSpots(pi).includes(id)) return fail('Hier kann keine Straße gebaut werden.');
      if (!free) this.pay(pi, COSTS.road);
      s.roads[id] = pi;
      p.pieces.road--;
      this.log(`${p.name} baut eine Straße${free ? ' (kostenlos)' : ''}.`, pi);
      this.emit({ type: 'build', kind, id, pi });
      const e = this.board.edges[id];
      this.revealAround(pi, [e.a, e.b]);
      if (free) {
        s.roadBuildingLeft--;
        if (s.roadBuildingLeft > 0 && (p.pieces.road <= 0 || this.legalRoadSpots(pi).length === 0)) s.roadBuildingLeft = 0;
      }
    } else if (kind === 'settlement') {
      if (s.sub !== 'actions') return fail('Würfle zuerst.');
      if (p.pieces.settlement <= 0) return fail('Du hast keine Siedlungen mehr.');
      if (!this.canAfford(pi, COSTS.settlement)) return fail('Dir fehlen Rohstoffe.');
      if (!this.legalSettlementSpots(pi).includes(id)) return fail('Hier kann keine Siedlung gebaut werden.');
      this.pay(pi, COSTS.settlement);
      s.buildings[id] = { owner: pi, type: 'settlement' };
      p.pieces.settlement--;
      this.log(`${p.name} baut eine Siedlung.`, pi);
      this.emit({ type: 'build', kind, id, pi });
    } else if (kind === 'city') {
      if (s.sub !== 'actions') return fail('Würfle zuerst.');
      if (p.pieces.city <= 0) return fail('Du hast keine Städte mehr.');
      if (!this.canAfford(pi, COSTS.city)) return fail('Dir fehlen Rohstoffe (2 Getreide + 3 Erz).');
      if (!this.legalCitySpots(pi).includes(id)) return fail('Nur eigene Siedlungen können Städte werden.');
      this.pay(pi, COSTS.city);
      s.buildings[id] = { owner: pi, type: 'city' };
      p.pieces.city--;
      p.pieces.settlement++;
      this.log(`${p.name} baut eine Stadt.`, pi);
      this.emit({ type: 'build', kind, id, pi });
    } else return fail('Unbekannte Bauaktion.');
    this.afterAction();
    return ok();
  }

  skipRoadBuilding(pi) {
    if (this.s.turn !== pi || this.s.roadBuildingLeft <= 0) return fail('Nichts zu überspringen.');
    this.s.roadBuildingLeft = 0;
    this.afterAction();
    return ok();
  }

  /** Deckt Nebelfelder rund um die Ecken auf; der Entdecker erhält 1 Rohstoff. */
  revealAround(pi, verts) {
    const p = this.player(pi);
    let any = false;
    for (const vid of verts) {
      for (const hid of this.board.vertices[vid].hexes) {
        const h = this.board.hexes[hid];
        if (!h.fog) continue;
        h.fog = false;
        any = true;
        let txt = h.type === 'gold' ? `Wahlfeld (${h.num})` : 'Wüste';
        if (RES.includes(h.type)) {
          txt = `${RES_INFO[h.type].terrain} (${h.num})`;
          if (this.s.bank[h.type] > 0) { this.s.bank[h.type]--; p.hand[h.type]++; txt += ` – ${p.name} erhält 1× ${RES_INFO[h.type].icon}`; }
        }
        this.log(`🌫️ Nebel gelüftet: ${txt}.`, pi);
        this.emit({ type: 'reveal', id: hid, pi });
      }
    }
    return any;
  }

  // ---------------------------------------------------------------- Entwicklungskarten
  buyDevCard(pi) {
    const s = this.s;
    if (s.phase !== 'main' || s.turn !== pi || s.sub !== 'actions') return fail('Jetzt nicht möglich.');
    if (s.devDeck.length === 0) return fail('Der Stapel ist leer.');
    if (!this.canAfford(pi, COSTS.devcard)) return fail('Dir fehlen Rohstoffe (Wolle, Getreide, Erz).');
    this.pay(pi, COSTS.devcard);
    const type = s.devDeck.pop();
    const p = this.player(pi);
    p.dev.push({ type, turn: s.turnNumber });
    p.devBought++;
    this.log(`${p.name} kauft eine Entwicklungskarte.`, pi);
    this.emit({ type: 'devbuy', pi, card: type });
    this.afterAction();
    return ok({ card: type });
  }

  /** Felder, von denen `pi` mit "Ernte" etwas bekommen kann: eigene Gebäude, aufgedeckt, kein Räuber, Bank hat den Rohstoff. */
  harvestHexes(pi) {
    const out = [];
    for (const h of this.board.hexes) {
      if (h.fog || !RES.includes(h.type) || h.id === this.s.robber || this.s.bank[h.type] < 1) continue;
      if (this.harvestAmount(pi, h.id) > 0) out.push(h.id);
    }
    return out;
  }

  harvestAmount(pi, hexId) {
    let n = 0;
    for (const vid of this.board.hexes[hexId].verts) {
      const b = this.s.buildings[vid];
      if (b && b.owner === pi) n += b.type === 'city' ? 2 : 1;
    }
    return n;
  }

  playableDev(pi, type) {
    const s = this.s;
    if (s.phase !== 'main' || s.turn !== pi) return false;
    if (s.sub !== 'roll' && s.sub !== 'actions') return false;
    if (s.devPlayed || s.roadBuildingLeft > 0) return false;
    if (type === 'victory') return false;
    if (type === 'harvest' && this.harvestHexes(pi).length === 0) return false;
    return this.player(pi).dev.some((c) => c.type === type && c.turn < s.turnNumber);
  }

  playDev(pi, type, params = {}) {
    const s = this.s;
    if (!this.playableDev(pi, type)) return fail('Diese Karte kann jetzt nicht gespielt werden.');
    const p = this.player(pi);
    const idx = p.dev.findIndex((c) => c.type === type && c.turn < s.turnNumber);
    const info = DEV_INFO[type];

    if (type === 'plenty') {
      const { a, b } = params;
      if (!RES.includes(a) || !RES.includes(b)) return fail('Wähle zwei Rohstoffe.');
      const need = { [a]: 1 }; need[b] = (need[b] || 0) + 1;
      for (const [r, n] of Object.entries(need)) if (s.bank[r] < n) return fail(`Die Bank hat nicht genug ${RES_INFO[r].name}.`);
      p.dev.splice(idx, 1);
      for (const [r, n] of Object.entries(need)) { p.hand[r] += n; s.bank[r] -= n; }
      this.log(`${p.name} spielt ${info.name} und nimmt ${RES_INFO[a].icon} ${RES_INFO[b].icon}.`, pi);
    } else if (type === 'monopoly') {
      const { res } = params;
      if (!RES.includes(res)) return fail('Wähle einen Rohstoff.');
      p.dev.splice(idx, 1);
      let total = 0;
      for (const o of s.players) {
        if (o.id === pi) continue;
        total += o.hand[res];
        p.hand[res] += o.hand[res];
        o.hand[res] = 0;
      }
      this.log(`${p.name} spielt ${info.name} auf ${RES_INFO[res].icon} und kassiert ${total} Karten.`, pi);
      this.emit({ type: 'monopoly', pi, res, total });
    } else if (type === 'roadbuilding') {
      if (p.pieces.road <= 0 || this.legalRoadSpots(pi).length === 0) return fail('Du kannst keine Straße mehr bauen.');
      p.dev.splice(idx, 1);
      s.roadBuildingLeft = Math.min(2, p.pieces.road);
      this.log(`${p.name} spielt ${info.name}.`, pi);
    } else if (type === 'knight') {
      p.dev.splice(idx, 1);
      p.playedKnights++;
      s.returnSub = s.sub;
      s.sub = 'robber';
      this.log(`${p.name} spielt einen Ritter.`, pi);
    } else if (type === 'harvest') {
      const hexId = params.hex;
      if (!this.harvestHexes(pi).includes(hexId)) return fail('Wähle ein Feld, an dem du eine Siedlung oder Stadt hast.');
      const h = this.board.hexes[hexId];
      const n = Math.min(this.harvestAmount(pi, hexId), s.bank[h.type]);
      p.dev.splice(idx, 1);
      p.hand[h.type] += n;
      s.bank[h.type] -= n;
      this.log(`${p.name} spielt Ernte auf ${RES_INFO[h.type].terrain} (${h.num}) und erhält ${n}× ${RES_INFO[h.type].icon}.`, pi);
      this.emit({ type: 'gain', pi, hand: { ...emptyHand(), [h.type]: n } });
      this.emit({ type: 'harvest', pi, hex: hexId });
    } else if (type === 'remap') {
      p.dev.splice(idx, 1);
      remapBoard(this.board, this.rng);
      this.log(`🌍 ${p.name} spielt Weltenwandel – alle Felder werden neu verteilt!`, pi);
      this.emit({ type: 'remap', pi });
    } else return fail('Unbekannte Karte.');

    s.devPlayed = true;
    this.emit({ type: 'devplay', pi, card: type });
    this.afterAction();
    return ok();
  }

  // ---------------------------------------------------------------- Handel
  bankTrade(pi, give, get) {
    const s = this.s;
    if (s.phase !== 'main' || s.turn !== pi || s.sub !== 'actions') return fail('Jetzt nicht möglich.');
    if (!RES.includes(give) || !RES.includes(get) || give === get) return fail('Ungültiger Tausch.');
    const ratio = this.portRatio(pi, give);
    const p = this.player(pi);
    if (p.hand[give] < ratio) return fail(`Du brauchst ${ratio}× ${RES_INFO[give].name}.`);
    if (s.bank[get] < 1) return fail(`Die Bank hat kein ${RES_INFO[get].name} mehr.`);
    p.hand[give] -= ratio; s.bank[give] += ratio;
    p.hand[get]++; s.bank[get]--;
    p.bankTrades++;
    this.log(`${p.name} tauscht ${ratio}× ${RES_INFO[give].icon} gegen 1× ${RES_INFO[get].icon} (${ratio}:1).`, pi);
    this.afterAction();
    return ok({ ratio });
  }

  /** Spielertausch: `pi` (am Zug) gibt `give`, erhält `get` von `other`. */
  tradeWith(pi, other, give, get) {
    const s = this.s;
    if (s.phase !== 'main' || s.turn !== pi || s.sub !== 'actions') return fail('Jetzt nicht möglich.');
    if (other === pi || !s.players[other]) return fail('Ungültiger Partner.');
    const ng = RES.reduce((a, r) => a + (give[r] || 0), 0);
    const nt = RES.reduce((a, r) => a + (get[r] || 0), 0);
    if (ng === 0 || nt === 0) return fail('Beide Seiten müssen etwas geben.');
    for (const r of RES) if ((give[r] || 0) > 0 && (get[r] || 0) > 0) return fail('Man kann nicht denselben Rohstoff tauschen.');
    const a = this.player(pi);
    const b = this.player(other);
    for (const r of RES) {
      if ((give[r] || 0) > a.hand[r]) return fail('Dir fehlen Karten.');
      if ((get[r] || 0) > b.hand[r]) return fail(`${b.name} hat nicht genug Karten.`);
    }
    for (const r of RES) {
      a.hand[r] += (get[r] || 0) - (give[r] || 0);
      b.hand[r] += (give[r] || 0) - (get[r] || 0);
    }
    this.log(`${a.name} tauscht ${this.fmtHand(give)} gegen ${this.fmtHand(get)} mit ${b.name}.`, pi);
    this.emit({ type: 'trade', from: pi, to: other, give: { ...give }, get: { ...get } });
    this.afterAction();
    return ok();
  }

  // ---------------------------------------------------------------- Handelsmarkt (öffentliche Angebote)
  openOfferOf(pi) { return this.s.offers.find((o) => o.from === pi) || null; }

  offerById(id) { return this.s.offers.find((o) => o.id === id) || null; }

  /** Kann `pi` das Angebot überhaupt annehmen (hat die geforderten Karten)? */
  canAcceptOffer(pi, offer) {
    if (pi === offer.from) return false;
    const h = this.player(pi).hand;
    return RES.every((r) => (offer.get[r] || 0) <= h[r]);
  }

  closeOffer(offer, status, partner = null) {
    const s = this.s;
    s.offers = s.offers.filter((o) => o !== offer);
    s.trades.push({ id: offer.id, from: offer.from, to: partner, give: offer.give, get: offer.get, status, turn: s.turnNumber });
    if (s.trades.length > 24) s.trades.shift();
    this.emit({ type: 'offerClosed', id: offer.id, status });
  }

  validTradeShape(give, get) {
    const ng = RES.reduce((a, r) => a + (give[r] || 0), 0);
    const nt = RES.reduce((a, r) => a + (get[r] || 0), 0);
    if (ng === 0 || nt === 0) return 'Beide Seiten müssen etwas geben.';
    for (const r of RES) if ((give[r] || 0) > 0 && (get[r] || 0) > 0) return 'Man kann nicht denselben Rohstoff tauschen.';
    return null;
  }

  /** `opts.deferred`: Zusagen werden nur vorgemerkt; der Anbieter wählt danach selbst, mit wem er tauscht (acceptResponse). */
  createOffer(pi, give, get, opts = {}) {
    const s = this.s;
    if (s.phase !== 'main' || s.turn !== pi || s.sub !== 'actions') return fail('Jetzt nicht möglich.');
    const bad = this.validTradeShape(give, get);
    if (bad) return fail(bad);
    const hand = this.player(pi).hand;
    for (const r of RES) if ((give[r] || 0) > hand[r]) return fail('Dir fehlen Karten für dieses Angebot.');
    const prev = this.openOfferOf(pi);
    if (prev) this.closeOffer(prev, 'withdrawn');
    const clean = (o) => Object.fromEntries(RES.filter((r) => o[r] > 0).map((r) => [r, o[r]]));
    const offer = { id: s.nextOfferId++, from: pi, give: clean(give), get: clean(get), responses: {}, turn: s.turnNumber, deferred: !!opts.deferred };
    s.offers.push(offer);
    this.log(`${this.player(pi).name} bietet ${this.fmtHand(offer.give)} gegen ${this.fmtHand(offer.get)}.`, pi);
    this.emit({ type: 'offer', id: offer.id, from: pi });
    this.afterAction();
    return ok({ offer });
  }

  /** answer: 'accept' | 'decline' | 'counter' (counter = {give, get} aus Sicht des Anbieters) */
  respondOffer(pi, offerId, answer, counter = null, reason = '') {
    const s = this.s;
    const offer = this.offerById(offerId);
    if (!offer) return fail('Das Angebot ist nicht mehr offen.');
    if (pi === offer.from) return fail('Das ist dein eigenes Angebot.');
    if (answer === 'decline') {
      offer.responses[pi] = { type: 'decline', reason };
      this.emit({ type: 'offerResponse', id: offerId, pi, answer });
      this.afterAction();
      return ok();
    }
    if (answer === 'accept') {
      if (!this.canAcceptOffer(pi, offer)) return fail('Dir fehlen die geforderten Karten.');
      if (offer.deferred) {
        offer.responses[pi] = { type: 'accept', reason };
        this.emit({ type: 'offerResponse', id: offerId, pi, answer });
        this.afterAction();
        return ok();
      }
      const r = this.tradeWith(offer.from, pi, offer.give, offer.get);
      if (!r.ok) return r;
      this.closeOffer(offer, 'accepted', pi);
      this.afterAction();
      return ok();
    }
    if (answer === 'counter') {
      if (!counter) return fail('Gegenvorschlag fehlt.');
      const bad = this.validTradeShape(counter.give, counter.get);
      if (bad) return fail(bad);
      const h = this.player(pi).hand;
      for (const r of RES) if ((counter.get[r] || 0) > h[r]) return fail('Dir fehlen Karten für diesen Gegenvorschlag.');
      offer.responses[pi] = { type: 'counter', give: { ...counter.give }, get: { ...counter.get }, reason };
      this.log(`${this.player(pi).name} macht ${this.player(offer.from).name} einen Gegenvorschlag.`, pi);
      this.emit({ type: 'offerResponse', id: offerId, pi, answer });
      this.afterAction();
      return ok();
    }
    return fail('Unbekannte Antwort.');
  }

  /** Der Anbieter nimmt den Gegenvorschlag von `responder` an. */
  acceptCounter(pi, offerId, responder) {
    const offer = this.offerById(offerId);
    if (!offer || offer.from !== pi) return fail('Das Angebot ist nicht mehr offen.');
    const c = offer.responses[responder];
    if (!c || c.type !== 'counter') return fail('Kein Gegenvorschlag vorhanden.');
    const r = this.tradeWith(pi, responder, c.give, c.get);
    if (!r.ok) return r;
    this.closeOffer(offer, 'accepted', responder);
    this.afterAction();
    return ok();
  }

  /** Der Anbieter bestätigt den Handel mit `responder` (Zusage oder Gegenvorschlag) – erst jetzt wechseln die Karten. */
  acceptResponse(pi, offerId, responder) {
    const offer = this.offerById(offerId);
    if (!offer || offer.from !== pi) return fail('Das Angebot ist nicht mehr offen.');
    const c = offer.responses[responder];
    if (!c || (c.type !== 'accept' && c.type !== 'counter')) return fail('Keine Zusage vorhanden.');
    const r = c.type === 'counter' ? this.tradeWith(pi, responder, c.give, c.get) : this.tradeWith(pi, responder, offer.give, offer.get);
    if (!r.ok) return r;
    this.closeOffer(offer, 'accepted', responder);
    this.afterAction();
    return ok();
  }

  withdrawOffer(pi, offerId) {
    const offer = this.offerById(offerId);
    if (!offer || offer.from !== pi) return fail('Das Angebot ist nicht mehr offen.');
    this.closeOffer(offer, 'withdrawn');
    this.afterAction();
    return ok();
  }

  // ---------------------------------------------------------------- Anti-Pech-Marker
  exchangeTokens(pi, res) {
    const s = this.s;
    if (!s.settings.antiBad) return fail('Anti-Pech-Marker sind deaktiviert.');
    if (s.phase !== 'main' || s.turn !== pi || (s.sub !== 'actions' && s.sub !== 'roll')) return fail('Jetzt nicht möglich.');
    if (!RES.includes(res)) return fail('Wähle einen Rohstoff.');
    const p = this.player(pi);
    const cost = this.tokenCost(pi);
    if (p.tokens < cost) return fail(`Du brauchst ${cost} Marker.`);
    if (s.bank[res] < 1) return fail(`Die Bank hat kein ${RES_INFO[res].name} mehr.`);
    p.tokens -= cost;
    p.hand[res]++; s.bank[res]--;
    this.log(`🍀 ${p.name} tauscht ${cost} Anti-Pech-Marker gegen 1× ${RES_INFO[res].icon}.`, pi);
    this.emit({ type: 'gain', pi, hand: { ...emptyHand(), [res]: 1 } });
    this.afterAction();
    return ok({ cost });
  }

  // ---------------------------------------------------------------- Zug beenden
  endTurn(pi) {
    const s = this.s;
    if (s.phase !== 'main' || s.turn !== pi || s.sub !== 'actions') return fail('Du kannst den Zug jetzt nicht beenden.');
    if (s.roadBuildingLeft > 0) return fail('Baue zuerst deine Straßen.');
    for (const o of [...s.offers]) this.closeOffer(o, 'expired');
    s.turn = (s.turn + 1) % s.players.length;
    s.turnNumber++;
    s.sub = 'roll';
    s.dice = null;
    s.devPlayed = false;
    s.roadBuildingLeft = 0;
    this.log(`${this.cur.name} ist am Zug.`, s.turn);
    this.emit({ type: 'turn', pi: s.turn });
    this.afterAction();
    return ok();
  }

  // ---------------------------------------------------------------- Auswertung
  afterAction() {
    this.updateLongestRoad();
    this.updateLargestArmy();
    this.checkMissions();
    this.checkWin();
    this.emit({ type: 'change' });
  }

  longestRoadFor(pi) {
    const s = this.s;
    const adj = {};
    for (const [eid, o] of Object.entries(s.roads)) {
      if (o !== pi) continue;
      const e = this.board.edges[eid];
      (adj[e.a] ||= []).push(e);
      (adj[e.b] ||= []).push(e);
    }
    let best = 0;
    const used = new Set();
    const blocked = (v) => { const b = s.buildings[v]; return b && b.owner !== pi; };
    const dfs = (v, len) => {
      if (len > best) best = len;
      for (const e of adj[v] || []) {
        if (used.has(e.id)) continue;
        const nv = e.a === v ? e.b : e.a;
        used.add(e.id);
        if (blocked(nv)) { if (len + 1 > best) best = len + 1; } else dfs(nv, len + 1);
        used.delete(e.id);
      }
    };
    for (const v of Object.keys(adj)) dfs(Number(v), 0);
    return best;
  }

  updateLongestRoad() {
    const s = this.s;
    const lens = s.players.map((p) => this.longestRoadFor(p.id));
    s.roadLengths = lens;
    const max = Math.max(...lens);
    const prev = s.longestRoad.holder;
    let holder = null;
    if (max >= 5) {
      if (prev !== null && lens[prev] === max) holder = prev;
      else {
        const top = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0);
        holder = top.length === 1 ? top[0] : null;
      }
    }
    if (holder !== prev) {
      if (holder !== null) this.log(`🛣️ ${s.players[holder].name} hat jetzt die Längste Handelsstraße (${max}).`, holder);
      else if (prev !== null) this.log('🛣️ Die Längste Handelsstraße geht verloren.');
    }
    s.longestRoad = { holder, len: holder === null ? Math.max(0, max) : max };
  }

  updateLargestArmy() {
    const s = this.s;
    let { holder, count } = s.largestArmy;
    for (const p of s.players) {
      if (p.playedKnights >= 3 && p.playedKnights > count) {
        if (holder !== p.id) this.log(`⚔️ ${p.name} hat jetzt die Größte Rittermacht (${p.playedKnights}).`, p.id);
        holder = p.id; count = p.playedKnights;
      }
    }
    s.largestArmy = { holder, count };
  }

  missionProgress(pi, missionId) {
    const m = missionById(missionId);
    return { cur: Math.min(m.max, m.progress(this, pi)), max: m.max };
  }

  checkMissions() {
    const s = this.s;
    if (s.phase === 'setup') return;
    const order = [];
    for (let i = 0; i < s.players.length; i++) order.push((s.turn + i) % s.players.length);
    for (const ms of s.missions) {
      if (ms.claimedBy !== null) continue;
      const def = missionById(ms.id);
      for (const pi of order) {
        if (def.progress(this, pi) >= def.max) {
          ms.claimedBy = pi;
          s.players[pi].missions.push(ms.id);
          this.log(`🎖️ Mission „${def.name}“ erfüllt: ${s.players[pi].name} erhält +1 Siegpunkt!`, pi);
          this.emit({ type: 'mission', id: ms.id, pi });
          break;
        }
      }
    }
  }

  checkWin() {
    const s = this.s;
    if (s.phase === 'over') return;
    if (s.phase === 'setup') return;
    const pi = s.turn;
    if (this.vp(pi) >= s.settings.targetVP) {
      s.phase = 'over';
      s.winner = pi;
      this.log(`🏆 ${s.players[pi].name} gewinnt mit ${this.vp(pi)} Siegpunkten!`, pi);
      this.emit({ type: 'win', pi });
    }
  }

  // ---------------------------------------------------------------- Statistik
  vpBreakdown(pi) {
    const p = this.s.players[pi];
    const b = this.buildingsOf(pi);
    return {
      settlements: b.filter((x) => x.type === 'settlement').length,
      cities: b.filter((x) => x.type === 'city').length,
      longestRoad: this.s.longestRoad.holder === pi ? 2 : 0,
      largestArmy: this.s.largestArmy.holder === pi ? 2 : 0,
      victoryCards: p.dev.filter((c) => c.type === 'victory').length,
      missions: p.missions.length,
      total: this.vp(pi),
    };
  }
}
