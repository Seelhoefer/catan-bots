// App-Controller: verbindet Engine, Bots und Oberfläche.
import { Game } from './engine/game.js';
import { botAct, botRespondOffer, botJudgeCounter } from './engine/bot.js';
import { RES, DEV_INFO } from './engine/constants.js';
import { missionById } from './engine/missions.js';
import { BoardView } from './ui/boardView.js';
import {
  $, esc, rich, ic, handHTML,
} from './ui/dom.js';
import { installIcons } from './ui/icons.js';
import { renderMenu, rememberLast } from './ui/menu.js';
import {
  renderHand, renderOpps, renderTurn, renderDock, renderDice, renderMissionBox, renderLogBox, renderHeroRoll,
} from './ui/panels.js';
import { renderMarket, suggestTrade } from './ui/market.js';
import { sfx } from './ui/sfx.js';
import {
  floatGain, flyCards, showDiceHero, showCardHero,
} from './ui/fx.js';
import { preloadArt } from './ui/assets.js';
import {
  devModal, tokensModal, discardModal, goldModal, stealModal, logModal,
  rulesModal, gameOverModal, closeTopModal, closeAllModals, confirmDialog, hasModal,
} from './ui/modals.js';

const SAVE_KEY = 'catan-save-v1';
const SPEED_KEY = 'catan-speed';
const HUMAN = 0;
const SPEEDS = { slow: ['Langsam', 1300, 1.3, 25000], normal: ['Normal', 650, 1, 18000], fast: ['Schnell', 110, 0.4, 9000] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sum = (o) => RES.reduce((a, r) => a + (o[r] || 0), 0);

class App {
  constructor() {
    installIcons();
    preloadArt().then((ok) => { if (ok) this.queueRender(); });
    this.game = null;
    this.mode = null; // 'road' | 'settlement' | 'city' | 'harvest'
    this.pending = null; // vorgemerkter Platz (Touch)
    this.pumping = false;
    this.rolling = false;
    this.renderQueued = false;
    this.auto = {};
    this.ui = { missionsOpen: false, logOpen: false, turnKey: null };
    this.fresh = { pieces: new Set(), hexes: new Set(), remap: false };
    this.hit = new Set();
    this.busy = new Set();
    this.waitingOffer = null;
    this.waitStart = 0;
    this.offerWaitMs = 18000;
    this.diceRevealAt = 0;
    this.rollPauseUntil = 0;
    this.market = this.freshMarket();
    this.speed = 'normal';
    try { this.speed = localStorage.getItem(SPEED_KEY) || 'normal'; } catch { /* egal */ }
    if (!SPEEDS[this.speed]) this.speed = 'normal';
    this.view = new BoardView($('#board'), (k, id) => this.onPick(k, id));
    $('#btnMenu').innerHTML = ic('menu');
    $('#zoomIn').innerHTML = ic('plus');
    $('#zoomOut').innerHTML = ic('minus');
    $('#zoomFit').innerHTML = ic('target');
    this.bindUI();
    this.showMenu();
  }

  freshMarket() {
    return { open: false, tab: 'players', give: {}, get: {}, bankGive: null, bankGet: null, counterFor: null, counter: { give: {}, get: {} } };
  }

  get sf() { return SPEEDS[this.speed][2]; }

  // ------------------------------------------------------------- Start / Menü
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  showMenu() {
    closeAllModals();
    this.closePopover();
    $('#game').classList.add('hidden');
    $('#menu').classList.remove('hidden');
    renderMenu($('#menu'), {
      hasSave: this.hasSave(),
      onStart: (settings) => this.start(settings),
      onResume: () => this.resume(),
      onRules: () => rulesModal(),
    });
  }

  start(settings) {
    rememberLast({ ...settings, seed: undefined });
    this.attach(Game.create(settings));
  }

  resume() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      s.offers = s.offers || [];
      s.trades = s.trades || [];
      s.nextOfferId = s.nextOfferId || 1;
      s.gold = s.gold || {};
      for (const p of s.players) if (p.isBot && p.face && !p.face.portrait) p.face.portrait = p.name.toLowerCase(); // alte Spielstände
      this.attach(Game.fromJSON(s));
    } catch {
      this.toast('Der Spielstand konnte nicht geladen werden.', 'warn');
      try { localStorage.removeItem(SAVE_KEY); } catch { /* egal */ }
      this.showMenu();
    }
  }

  attach(game) {
    closeAllModals();
    this.closePopover();
    this.game = game;
    this.lastVp = undefined;
    this.mode = null;
    this.pending = null;
    this.auto = {};
    this.pumping = false;
    this.busy = new Set();
    this.hit = new Set();
    this.waitingOffer = null;
    this.market = this.freshMarket();
    this.ui = { missionsOpen: false, logOpen: false, turnKey: null };
    this.view.fitKey = null;
    game.on((e) => this.onEvent(e));
    $('#menu').classList.add('hidden');
    $('#game').classList.remove('hidden');
    this.render();
    this.view.fit(game.s.board);
    this.pump();
  }

  flash(ids, ms = 2400) {
    this.hit = new Set(ids);
    this.queueRender();
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => { this.hit = new Set(); this.queueRender(); }, ms);
  }

  // ------------------------------------------------------------- Events der Engine
  onEvent(e) {
    const g = this.game;
    const name = (pi) => g.s.players[pi].name;
    switch (e.type) {
      case 'build':
        this.fresh.pieces.add(`${e.kind === 'road' ? 'e' : 'v'}${e.id}`);
        sfx.play(e.kind, { vol: e.pi === HUMAN ? 1 : 0.6 });
        break;
      case 'reveal': this.fresh.hexes.add(e.id); this.toast('Nebel gelüftet', 'info'); sfx.play('cardplay', { vol: 0.5 }); break;
      case 'remap':
        this.fresh.remap = true;
        sfx.play('remap');
        this.toast(`${name(e.pi)} spielt Weltenwandel – alle Felder wurden neu verteilt.`, 'big');
        break;
      case 'dice': {
        this.rolling = true;
        sfx.play('dice');
        const total = e.dice[0] + e.dice[1];
        const dur = showDiceHero(e.dice, e.pi === HUMAN ? 'Du' : name(e.pi), this.sf);
        const reveal = 750 * this.sf;
        this.diceRevealAt = Date.now() + reveal + 150;
        this.rollPauseUntil = Date.now() + dur;
        setTimeout(() => { this.rolling = false; this.queueRender(); }, 650);
        if (total !== 7) {
          setTimeout(() => this.flash(g.s.board.hexes.filter((h) => h.num === total && !h.fog).map((h) => h.id), 2600), reveal);
        }
        break;
      }
      case 'gain':
        if (g.s.phase === 'main') {
          const wait = Math.max(0, this.diceRevealAt - Date.now());
          floatGain(e.pi, e.hand, wait);
          if (e.pi === HUMAN) sfx.play('gain', { delay: wait + 100 });
        }
        break;
      case 'token':
        if (e.pi === HUMAN) { this.toastHTML(`${ic('clover', 'inline')} +1 Anti-Pech-Marker`, 'gain'); sfx.play('token', { delay: Math.max(0, this.diceRevealAt - Date.now()) + 150 }); }
        break;
      case 'mission':
        if (e.pi !== HUMAN) sfx.play('vpOther');
        this.toastHTML(`${ic(missionById(e.id).icon, 'inline')} ${esc(name(e.pi))} erfüllt „${missionById(e.id).name}“ (+1 Siegpunkt)`, 'big');
        break;
      case 'devbuy':
        sfx.play('card', { vol: e.pi === HUMAN ? 1 : 0.5 });
        if (e.pi === HUMAN) showCardHero(e.card, `Neue Karte: <b>${DEV_INFO[e.card].name}</b>`, 2600);
        break;
      case 'devplay': {
        sfx.play('cardplay');
        const ms = showCardHero(e.card, `${e.pi === HUMAN ? 'Du spielst' : `${esc(name(e.pi))} spielt`} <b>${DEV_INFO[e.card].name}</b>`, 2300 * Math.max(0.6, this.sf));
        if (e.pi !== HUMAN) this.rollPauseUntil = Math.max(this.rollPauseUntil, Date.now() + ms - 300);
        break;
      }
      case 'harvest': this.flash([e.hex], 2400); sfx.play('harvest'); break;
      case 'steal':
        sfx.play('steal');
        if (e.from === HUMAN) this.toastHTML(`${esc(name(e.to))} hat dir 1${ic(e.res, 'inline')} gestohlen`, 'warn');
        else if (e.to === HUMAN) this.toastHTML(`Du hast 1${ic(e.res, 'inline')} gestohlen`, 'gain');
        break;
      case 'trade':
        sfx.play('trade');
        flyCards(e.from, e.to, e.give);
        flyCards(e.to, e.from, e.get, 180);
        this.toastHTML(`Handel erfolgreich: ${esc(name(e.from))} erhielt ${handHTML(e.get)}, ${esc(name(e.to))} erhielt ${handHTML(e.give)}`, 'gain');
        if (e.from === HUMAN || e.to === HUMAN) { this.market.open = false; this.market.give = {}; this.market.get = {}; }
        break;
      case 'offerClosed':
        if (this.market.counterFor === e.id) this.market.counterFor = null;
        break;
      case 'win':
        sfx.play(e.pi === HUMAN ? 'win' : 'lose', { delay: 300 });
        setTimeout(() => this.showGameOver(), 700);
        break;
      case 'robber': sfx.play('robber'); break;
      case 'monopoly': sfx.play('monopoly'); break;
      case 'turn': if (e.pi === HUMAN) sfx.play('turn', { delay: 250 }); break;
      case 'change': {
        const vp = g.vp(HUMAN);
        if (this.lastVp !== undefined && vp > this.lastVp) sfx.play('vp', { delay: 200 });
        this.lastVp = vp;
        this.queueRender();
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------- Aktionen des Menschen
  act(method, ...args) {
    const g = this.game;
    const r = g[method](...args);
    if (!r.ok) { this.toast(r.error, 'warn'); sfx.play('error'); } else this.pump();
    this.queueRender();
    return r;
  }

  startHarvest() {
    this.mode = 'harvest';
    this.queueRender();
  }

  /** Erster Klick auf einen markierten Platz wählt ihn vor (Vorschau), ein zweiter Klick darauf baut. */
  onPick(kind, id) {
    if (this.game.s.phase === 'over') return;
    if (!this.pending || this.pending.kind !== kind || this.pending.id !== id) {
      this.pending = { kind, id };
      sfx.play('select');
      this.queueRender();
      return;
    }
    this.pending = null;
    this.executePick(kind, id);
  }

  pendingLabel() {
    const s = this.game.s;
    if (s.phase === 'setup') return s.sub === 'settlement' ? 'Hier gründen' : 'Hier eine Straße';
    if (s.sub === 'robber') return 'Räuber hierhin';
    if (this.mode === 'harvest') return 'Hier ernten';
    if (s.roadBuildingLeft > 0 || this.mode === 'road') return 'Hier eine Straße';
    return { settlement: 'Hier eine Siedlung', city: 'Hier eine Stadt' }[this.mode] || 'Hier';
  }

  executePick(kind, id) {
    const g = this.game;
    const s = g.s;
    if (s.phase === 'over') return;
    if (s.phase === 'setup') {
      if (s.turn !== HUMAN) return;
      if (kind === 'vertex') this.act('placeInitialSettlement', HUMAN, id);
      else if (kind === 'edge') this.act('placeInitialRoad', HUMAN, id);
      return;
    }
    if (s.turn !== HUMAN) return;
    if (kind === 'hex' && s.sub === 'robber') { this.act('moveRobber', HUMAN, id); return; }
    if (kind === 'hex' && this.mode === 'harvest') { if (this.act('playDev', HUMAN, 'harvest', { hex: id }).ok) this.mode = null; return; }
    if (kind === 'edge' && (s.roadBuildingLeft > 0 || this.mode === 'road')) {
      const r = this.act('build', HUMAN, 'road', id);
      if (r.ok && s.roadBuildingLeft === 0) this.mode = null;
      return;
    }
    if (kind === 'vertex' && this.mode === 'settlement') { if (this.act('build', HUMAN, 'settlement', id).ok) this.mode = null; return; }
    if (kind === 'vertex' && this.mode === 'city') { if (this.act('build', HUMAN, 'city', id).ok) this.mode = null; }
  }

  handleAct(act, el) {
    const g = this.game;
    if (!g) return;
    if (el?.dataset.disabled) {
      this.toast(el.title || 'Gerade nicht möglich', 'warn');
      return;
    }
    if (act.startsWith('mk-') || act.startsWith('bank-')) { this.handleMarket(act, el); return; }
    this.closePopover();
    switch (act) {
      case 'roll': this.act('rollDice', HUMAN); break;
      case 'end-turn': this.mode = null; this.act('endTurn', HUMAN); break;
      case 'build-road': case 'build-settlement': case 'build-city': {
        const k = act.slice(6);
        this.pending = null;
        this.mode = this.mode === k ? null : k;
        this.queueRender();
        break;
      }
      case 'buy-dev': {
        this.mode = null;
        this.act('buyDevCard', HUMAN);
        break;
      }
      case 'skip-roads': this.act('skipRoadBuilding', HUMAN); break;
      case 'pick-cancel': this.pending = null; this.queueRender(); break;
      case 'pick-confirm': {
        const pk = this.pending;
        this.pending = null;
        if (pk) this.executePick(pk.kind, pk.id);
        this.queueRender();
        break;
      }
      case 'trade': this.mode = null; this.openMarket(); break;
      case 'dev': this.modal = devModal(this); break;
      case 'tokens': this.modal = tokensModal(this); break;
      case 'toggle-missions': this.ui.missionsOpen = !this.ui.missionsOpen; this.ui.logOpen = false; this.queueRender(); break;
      case 'toggle-log': this.ui.logOpen = !this.ui.logOpen; this.ui.missionsOpen = false; this.queueRender(); break;
      default: break;
    }
  }

  // ------------------------------------------------------------- Handelsmarkt (Mensch)
  openMarket() {
    const m = this.market;
    m.open = true;
    m.tab = 'players';
    if (!sum(m.give) && !sum(m.get)) {
      const sug = suggestTrade(this.game);
      m.give = sug.give;
      m.get = sug.get;
    }
    this.queueRender();
  }

  handleMarket(act, el) {
    const g = this.game;
    const m = this.market;
    const d = el.dataset;
    const hand = g.s.players[HUMAN].hand;
    switch (act) {
      case 'mk-open': m.open = true; break;
      case 'mk-close': m.open = false; m.counterFor = null; break;
      case 'mk-tab': m.tab = d.tab; break;
      case 'mk-step': {
        const delta = Number(d.d);
        const side = d.side;
        const store = { give: m.give, get: m.get, cgive: m.counter.give, cget: m.counter.get }[side];
        const opposite = { give: m.get, get: m.give, cgive: m.counter.get, cget: m.counter.give }[side];
        const isGive = side === 'give' || side === 'cgive';
        const cur = store[d.res] || 0;
        const next = Math.max(0, Math.min(isGive ? hand[d.res] : 9, cur + delta));
        store[d.res] = next;
        if (next > 0) opposite[d.res] = 0;
        break;
      }
      case 'mk-send': {
        const r = this.act('createOffer', HUMAN, m.give, m.get);
        if (r.ok) this.runHumanOffer(r.offer.id);
        break;
      }
      case 'mk-withdraw': this.act('withdrawOffer', HUMAN, Number(d.id)); break;
      case 'mk-accept': this.act('respondOffer', HUMAN, Number(d.id), 'accept'); break;
      case 'mk-decline': this.act('respondOffer', HUMAN, Number(d.id), 'decline'); break;
      case 'mk-counter-open': {
        const o = g.offerById(Number(d.id));
        if (o) { m.counterFor = o.id; m.counter = { give: { ...o.get }, get: { ...o.give } }; }
        break;
      }
      case 'mk-counter-cancel': m.counterFor = null; break;
      case 'mk-counter-send': {
        const id = Number(d.id);
        const r = this.act('respondOffer', HUMAN, id, 'counter', { give: { ...m.counter.get }, get: { ...m.counter.give } });
        if (r.ok) m.counterFor = null;
        break;
      }
      case 'mk-accept-counter': this.act('acceptCounter', HUMAN, Number(d.id), Number(d.pid)); break;
      case 'bank-give': m.bankGive = m.bankGive === d.res ? null : d.res; if (m.bankGet === m.bankGive) m.bankGet = null; break;
      case 'bank-get': m.bankGet = m.bankGet === d.res ? null : d.res; break;
      case 'bank-do': {
        const r = this.act('bankTrade', HUMAN, m.bankGive, m.bankGet);
        if (r.ok) { m.bankGive = null; m.bankGet = null; }
        break;
      }
      default: break;
    }
    this.queueRender();
  }

  /** Bots antworten nacheinander auf ein Angebot des Menschen. */
  async runHumanOffer(id) {
    const g = this.game;
    for (const bot of g.s.players.filter((p) => p.isBot)) {
      if (this.game !== g) return;
      const offer = g.offerById(id);
      if (!offer || g.s.turn !== HUMAN) return;
      this.busy.add(bot.id);
      this.queueRender();
      await sleep(450 * this.sf + 250);
      this.busy.delete(bot.id);
      if (this.game !== g) return;
      const cur = g.offerById(id);
      if (!cur) return;
      const ans = botRespondOffer(g, bot.id, cur);
      if (ans.type === 'accept') g.respondOffer(bot.id, id, 'accept');
      else if (ans.type === 'counter') g.respondOffer(bot.id, id, 'counter', { give: ans.give, get: ans.get });
      else g.respondOffer(bot.id, id, 'decline');
      this.queueRender();
    }
    const left = g.offerById(id);
    if (left && Object.values(left.responses).every((r) => r.type === 'decline')) {
      g.withdrawOffer(HUMAN, id);
      this.toast('Niemand möchte tauschen – passe dein Angebot an.', 'info');
    }
    this.queueRender();
  }

  // ------------------------------------------------------------- Bots
  delay() { return SPEEDS[this.speed][1]; }

  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    const g = this.game;
    try {
      while (this.game === g && g.s.phase !== 'over') {
        const bots = g.pendingActors().filter((pi) => g.s.players[pi].isBot);
        if (!bots.length) break;
        const pi = bots[0];
        const isRoll = g.s.phase === 'main' && g.s.sub === 'roll' && g.s.turn === pi;
        await sleep(isRoll ? this.delay() * 1.2 : this.delay());
        if (this.game !== g || g.s.phase === 'over') return;
        const r = botAct(g, pi);
        if (r.offer) await this.runBotOffer(pi, r.offer);
        // Nach einem Wurf: Würfel-Moment und Ertrags-Animation zu Ende laufen lassen
        const rest = this.rollPauseUntil - Date.now();
        if (rest > 0) await sleep(rest);
      }
    } finally {
      if (this.game === g) this.pumping = false;
    }
    this.queueRender();
  }

  /** Ein Bot macht ein öffentliches Angebot: andere Bots antworten, danach hat der Mensch Zeit zu reagieren. */
  async runBotOffer(pi, offer) {
    const g = this.game;
    const created = g.createOffer(pi, offer.give, offer.get);
    if (!created.ok) return;
    const id = created.offer.id;
    this.queueRender();
    await sleep(350 * this.sf + 200);
    for (const o of g.s.players) {
      if (this.game !== g) return;
      if (o.id === pi || !o.isBot) continue;
      const cur = g.offerById(id);
      if (!cur) return;
      this.busy.add(o.id);
      this.queueRender();
      await sleep(450 * this.sf + 250);
      this.busy.delete(o.id);
      if (this.game !== g) return;
      const live = g.offerById(id);
      if (!live) return;
      const ans = botRespondOffer(g, o.id, live);
      if (ans.type === 'accept') { g.respondOffer(o.id, id, 'accept'); this.queueRender(); return; }
      if (ans.type === 'counter') {
        g.respondOffer(o.id, id, 'counter', { give: ans.give, get: ans.get });
        if (botJudgeCounter(g, pi, ans) && g.acceptCounter(pi, id, o.id).ok) { this.queueRender(); return; }
      } else g.respondOffer(o.id, id, 'decline');
      this.queueRender();
    }

    // Der Mensch ist an der Reihe, zu antworten
    const live = g.offerById(id);
    if (live && !live.responses[HUMAN] && g.handCount(HUMAN) > 0) {
      this.waitingOffer = id;
      sfx.play('offer');
      this.waitStart = Date.now();
      this.offerWaitMs = SPEEDS[this.speed][3];
      this.queueRender();
      while (this.game === g && g.offerById(id) && !g.offerById(id).responses[HUMAN] && Date.now() - this.waitStart < this.offerWaitMs) await sleep(150);
      this.waitingOffer = null;
      if (this.game !== g) return;
      const after = g.offerById(id);
      const myResp = after && after.responses[HUMAN];
      if (myResp && myResp.type === 'counter') {
        await sleep(500);
        if (botJudgeCounter(g, pi, myResp) && g.acceptCounter(pi, id, HUMAN).ok) { this.queueRender(); return; }
        this.toast(`${g.s.players[pi].name} lehnt deinen Gegenvorschlag ab.`, 'info');
      }
    }
    const last = g.offerById(id);
    if (last) g.withdrawOffer(pi, id);
    this.queueRender();
  }

  // ------------------------------------------------------------- Rendering
  queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => { this.renderQueued = false; this.render(); });
  }

  highlights() {
    const g = this.game;
    const s = g.s;
    const ui = { fresh: this.fresh, hitHexes: this.hit, ghost: { color: s.players[HUMAN].color, kind: 'settlement' } };
    if (s.phase === 'setup' && s.turn === HUMAN) {
      if (s.sub === 'settlement') ui.vertices = new Set(g.legalSettlementSpots(HUMAN));
      else {
        ui.edges = new Set(g.legalRoadSpots(HUMAN));
        ui.selected = new Set([s.setup.lastSettlement]);
      }
    } else if (s.phase === 'main' && s.turn === HUMAN) {
      if (s.sub === 'robber') ui.hexes = new Set(g.legalRobberHexes());
      else if (s.roadBuildingLeft > 0) ui.edges = new Set(g.legalRoadSpots(HUMAN));
      else if (this.mode === 'harvest') { ui.hexes = new Set(g.harvestHexes(HUMAN)); ui.ghost.hexKind = 'harvest'; } else if (s.sub === 'actions') {
        if (this.mode === 'road') ui.edges = new Set(g.legalRoadSpots(HUMAN));
        else if (this.mode === 'settlement') ui.vertices = new Set(g.legalSettlementSpots(HUMAN));
        else if (this.mode === 'city') { ui.vertices = new Set(g.legalCitySpots(HUMAN)); ui.ghost.kind = 'city'; }
      }
    }
    const pend = this.pending;
    const valid = pend && ({ vertex: ui.vertices, edge: ui.edges, hex: ui.hexes }[pend.kind]?.has(pend.id));
    if (valid) ui.pending = pend; else this.pending = null;
    return ui;
  }

  render() {
    const g = this.game;
    if (!g) return;
    const s = g.s;
    const modeOk = s.phase === 'main' && s.turn === HUMAN && (s.sub === 'actions' || (this.mode === 'harvest' && s.sub === 'roll'));
    if (this.mode && !modeOk) this.mode = null;

    const root = $('#game');
    root.dataset.phase = s.phase;
    root.dataset.mine = s.turn === HUMAN ? '1' : '0';

    this.view.render(g, this.highlights());
    this.fresh = { pieces: new Set(), hexes: new Set(), remap: false };

    $('#hudHand').innerHTML = renderHand(g);
    $('#hudOpps').innerHTML = renderOpps(g, this.busy);
    const turn = renderTurn(g, this.mode);
    const hudTurn = $('#hudTurn');
    hudTurn.innerHTML = turn.html;
    if (this.ui.turnKey !== turn.key) {
      this.ui.turnKey = turn.key;
      hudTurn.firstElementChild.classList.add('enter');
    }
    $('#dock').innerHTML = renderDock(g, this.mode, this.pending ? { ...this.pending, label: this.pendingLabel() } : null);
    $('#heroRoll').innerHTML = renderHeroRoll(g);
    $('#diceBox').innerHTML = renderDice(g, this.rolling);
    this.renderMarketLayer();
    $('#missionBox').innerHTML = renderMissionBox(g, this.ui.missionsOpen);
    $('#logBox').innerHTML = renderLogBox(g, this.ui.logOpen);
    const ll = $('#logBox .loglist');
    if (ll) ll.scrollTop = ll.scrollHeight;

    if (s.phase === 'main' && s.sub === 'discard' && s.discard[HUMAN] !== undefined) this.ensure('discard', () => discardModal(this, s.discard[HUMAN]));
    if (s.phase === 'main' && s.sub === 'gold' && s.gold[HUMAN]) this.ensure('gold', () => goldModal(this, s.gold[HUMAN]));
    if (s.phase === 'main' && s.sub === 'steal' && s.turn === HUMAN) this.ensure('steal', () => stealModal(this, g.stealTargets(s.robber)));

    if (this.modal && !this.modal.closed && this.modal.refresh) this.modal.refresh();
    this.measure();
    this.save();
  }

  /** Handels-Pop-up: nur neu zeichnen, wenn sich etwas geändert hat; Einblend-Animation nur beim Erscheinen. */
  renderMarketLayer() {
    const host = $('#market');
    const { html, key } = renderMarket(this);
    if (html !== this.mkHtml) {
      const scroll = host.querySelector('.tp')?.scrollTop || 0;
      host.innerHTML = html;
      const card = host.querySelector('.tp');
      if (card) {
        if (key !== this.mkKey) card.classList.add('enter');
        else card.scrollTop = scroll;
        const bar = card.querySelector('.tp-timer i');
        if (bar) bar.style.animationDelay = `-${Math.max(0, Date.now() - this.waitStart)}ms`;
      }
      this.mkHtml = html;
    }
    this.mkKey = key;
  }

  /** Höhe der Kopfzeile für Toasts & Co. */
  measure() {
    const h = $('.topbar');
    if (h) document.documentElement.style.setProperty('--hdr', `${h.offsetHeight}px`);
  }

  ensure(kind, factory) {
    if (!this.auto[kind] || this.auto[kind].closed) this.auto[kind] = factory();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        if (!this.game) return;
        if (this.game.s.phase === 'over') localStorage.removeItem(SAVE_KEY);
        else localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.s));
      } catch { /* Speicher voll / gesperrt */ }
    }, 250);
  }

  showGameOver() {
    if (!this.game || this.game.s.phase !== 'over') return;
    gameOverModal(this, {
      onNew: () => this.start({ ...this.game.s.settings, seed: undefined }),
      onMenu: () => this.showMenu(),
    });
  }

  // ------------------------------------------------------------- Toasts
  toast(msg, kind = '') { this.toastHTML(rich(msg), kind); }

  toastHTML(html, kind = '') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = html;
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'big' ? 3600 : 2600);
  }

  // ------------------------------------------------------------- Menü-Popover
  closePopover() {
    const pop = $('#menuPop');
    if (pop) pop.classList.add('hidden');
  }

  togglePopover() {
    const pop = $('#menuPop');
    if (!pop.classList.contains('hidden')) { this.closePopover(); return; }
    pop.innerHTML = `
      <button role="menuitem" data-pop="speed">Bot-Tempo <b>${SPEEDS[this.speed][0]}</b></button>
      <button role="menuitem" data-pop="sound">Sound <b class="snd">${sfx.enabled ? 'An' : 'Aus'}</b></button>
      <button role="menuitem" data-pop="log">Gesamter Verlauf</button>
      <button role="menuitem" data-pop="rules">Regeln</button>
      <button role="menuitem" data-pop="menu">Hauptmenü</button>`;
    pop.classList.remove('hidden');
  }

  async onPopover(what) {
    if (what === 'speed') {
      const keys = Object.keys(SPEEDS);
      this.speed = keys[(keys.indexOf(this.speed) + 1) % keys.length];
      try { localStorage.setItem(SPEED_KEY, this.speed); } catch { /* egal */ }
      $('#menuPop').innerHTML = $('#menuPop').innerHTML.replace(/<b>.*?<\/b>/, `<b>${SPEEDS[this.speed][0]}</b>`);
      return;
    }
    if (what === 'sound') {
      sfx.setEnabled(!sfx.enabled);
      $('#menuPop .snd').textContent = sfx.enabled ? 'An' : 'Aus';
      return;
    }
    this.closePopover();
    if (what === 'log') logModal(this);
    else if (what === 'rules') rulesModal();
    else if (what === 'menu') {
      const yes = await confirmDialog('Zum Hauptmenü?', 'Dein Spiel wird automatisch gespeichert und kann später fortgesetzt werden.', 'Zum Menü');
      if (yes) { clearTimeout(this.saveTimer); this.saveNow(); setTimeout(() => this.showMenu(), 300); }
    }
  }

  saveNow() {
    try {
      if (this.game && this.game.s.phase !== 'over') localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.s));
    } catch { /* egal */ }
  }

  // ------------------------------------------------------------- UI-Bindung
  bindUI() {
    // Browser erlauben Ton erst nach einer Nutzergeste
    document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
    document.addEventListener('keydown', () => sfx.unlock(), { once: true });
    document.addEventListener('click', (e) => {
      const pop = e.target.closest('[data-pop]');
      if (pop) { this.onPopover(pop.dataset.pop); return; }
      if (e.target.closest('#btnMenu')) { this.togglePopover(); return; }
      if (!e.target.closest('#menuPop')) this.closePopover();
      const b = e.target.closest('[data-act]');
      if (b) {
        if (/^(build-|mk-(step|tab|counter-open)|bank-(give|get)|toggle-)/.test(b.dataset.act)) sfx.play('tick');
        this.handleAct(b.dataset.act, b);
      } else if (!e.target.closest('.floatbox') && (this.ui.missionsOpen || this.ui.logOpen) && e.target.closest('#board')) {
        this.ui.missionsOpen = false; this.ui.logOpen = false; this.queueRender();
      }
    });
    $('#zoomIn').addEventListener('click', () => this.view.zoomBy(0.8));
    $('#zoomOut').addEventListener('click', () => this.view.zoomBy(1.25));
    $('#zoomFit').addEventListener('click', () => this.view.fit());
    let lastW = window.innerWidth;
    let lastLandscape = window.innerWidth > window.innerHeight;
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const landscape = window.innerWidth > window.innerHeight;
        if (this.game && (landscape !== lastLandscape || Math.abs(window.innerWidth - lastW) > 60)) this.view.fit();
        lastW = window.innerWidth;
        lastLandscape = landscape;
        this.measure();
      }, 200);
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'Escape') {
        if (!$('#menuPop').classList.contains('hidden')) this.closePopover();
        else if (this.pending) { this.pending = null; this.queueRender(); } else if (!closeTopModal()) {
          if (this.mode) { this.mode = null; this.queueRender(); } else if (this.market.open) { this.market.open = false; this.queueRender(); }
        }
      } else if ((e.key === 'r' || e.key === 'R') && this.game && !hasModal()) {
        const s = this.game.s;
        if (s.phase === 'main' && s.turn === HUMAN && s.sub === 'roll') this.act('rollDice', HUMAN);
      }
    });
  }
}

window.catan = new App();
