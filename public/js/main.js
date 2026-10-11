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
  renderHand, renderHandBar, renderPlayers, renderFab, renderNext, renderDice, renderMissionBox, renderHeroRoll,
} from './ui/panels.js';
import { renderMarket, suggestTrade } from './ui/market.js';
import { sfx } from './ui/sfx.js';
import { music } from './ui/music.js';
import { preloadDice3d } from './ui/dice3d.js';
import { avatarSVG } from './ui/avatars.js';
import {
  floatGain, flyCards, showDiceHero, showCardHero, lastDice, whirlHexes, celebrate, buildFxPiece, buildFxRoad, stealFx, produceFx, bumpPlayer,
} from './ui/fx.js';
import { preloadArt, ART_STYLES, artStyle, setArtStyle } from './ui/assets.js';
import {
  devModal, tokensModal, discardModal, goldModal, stealModal, logModal,
  rulesModal, gameOverModal, closeTopModal, closeAllModals, confirmDialog, hasModal, playDevCard,
} from './ui/modals.js';

const SAVE_KEY = 'catan-save-v1';
const SPEED_KEY = 'catan-speed';
const HUMAN = 0;
// [Name, Pause zwischen Bot-Aktionen (ms), Animationsfaktor, Wartezeit auf deine Antwort (ms)]
const SPEEDS = { slow: ['Langsam', 2100, 1.35, 25000], normal: ['Normal', 1300, 1, 18000], fast: ['Schnell', 420, 0.5, 9000] };
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
    this.inflightH = {};
    this.inflightO = {};
    this.landing = {};
    this.heroEnd = 0;
    this.fxOffset = 0;
    this.speed = 'normal';
    try { this.speed = localStorage.getItem(SPEED_KEY) || 'normal'; } catch { /* egal */ }
    if (!SPEEDS[this.speed]) this.speed = 'normal';
    this.view = new BoardView($('#board'), (k, id) => this.onPick(k, id));
    this.view.onRobberLand = (x, y) => { const pt = this.view.screenPoint(x, y); buildFxPiece('settlement', pt, '#2b303a', this.view.pxPerUnit()); sfx.play('robberLand'); };
    $('#btnMenu').innerHTML = ic('gear');
    this.syncMusicBtn();
    $('#zoomIn').innerHTML = ic('plus');
    $('#zoomOut').innerHTML = ic('minus');
    $('#zoomFit').innerHTML = ic('target');
    this.bindUI();
    this.showMenu();
  }

  /** Musik-Schalter im Kopf: Symbol und Zustand. */
  syncMusicBtn() {
    const b = $('#btnMusic');
    if (!b) return;
    b.innerHTML = ic(music.enabled ? 'music' : 'music-off');
    b.setAttribute('aria-pressed', String(music.enabled));
    b.classList.toggle('off', !music.enabled);
  }

  freshMarket() {
    return { open: false, tab: 'players', give: {}, get: {}, bankGive: null, bankGet: null, counterFor: null, counter: { give: {}, get: {} }, sel: null, confirm: null };
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
    preloadDice3d();
    this.lastVp = undefined;
    this.inflightH = {};
    this.inflightO = {};
    this.landing = {};
    this.hbHtml = null;
    this.fabHtml = null;
    this.nextHtml = null;
    this.fabWasOpen = false;
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
        setTimeout(() => this.buildEffect(e), 40);
        break;
      case 'reveal': this.fresh.hexes.add(e.id); this.toast('Nebel gelüftet', 'info'); sfx.play('cardplay', { vol: 0.5 }); break;
      case 'remap':
        this.fresh.remap = true;
        sfx.play('remap');
        this.toast(`${name(e.pi)} spielt Weltenwandel – alle Felder wurden neu verteilt.`, 'big');
        break;
      case 'dice': {
        this.rolling = true;
        sfx.play('dice', { vol: 0.8 });
        const total = e.dice[0] + e.dice[1];
        const dur = showDiceHero(e.dice, e.pi === HUMAN ? 'Du' : name(e.pi), this.sf);
        this.diceRevealAt = Date.now() + lastDice.settleMs + 150;
        const hitHexes = total === 7 ? [] : g.s.board.hexes.filter((h) => h.num === total && !h.fog && h.id !== g.s.robber).map((h) => ({ id: h.id, type: h.type }));
        let whirlMs = 0;
        if (hitHexes.length) {
          whirlMs = 1150 * Math.max(0.7, this.sf);
          setTimeout(() => { whirlHexes(hitHexes, this.sf); sfx.play('whirl'); }, Math.max(0, dur - 150));
        }
        this.heroEnd = Date.now() + dur + whirlMs - 150; // danach fliegen die Karten zu den Spielern
        this.fxOffset = 0;
        this.rollPauseUntil = Date.now() + dur + whirlMs;
        sfx.play('diceLand', { delay: lastDice.settleMs, total });
        setTimeout(() => { this.rolling = false; this.queueRender(); }, 650);
        break;
      }
      case 'gain':
        if (g.s.phase !== 'main') break;
        if (e.src?.length) this.playProduce(e);
        else {
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
        const ms = showCardHero(e.card, `${avatarSVG(g.s.players[e.pi].face, g.s.players[e.pi].color, 34)} <span>${e.pi === HUMAN ? 'Du spielst' : `${esc(name(e.pi))} spielt`} <b>${DEV_INFO[e.card].name}</b></span>`, 2300 * Math.max(0.6, this.sf));
        if (e.pi !== HUMAN) this.rollPauseUntil = Math.max(this.rollPauseUntil, Date.now() + ms - 300);
        break;
      }
      case 'harvest': this.flash([e.hex], 2400); sfx.play('harvest'); break;
      case 'steal': {
        // nach dem Sprung des Räubers fliegt die Karte vom Opfer zum Dieb
        const wait = Math.max(0, this.view.robberEnd - Date.now(), (this.robberMoveAt || 0) + 2300 - Date.now()) + 120;
        const known = e.from === HUMAN || e.to === HUMAN;
        this.inflightSteal = (this.inflightSteal || 0) + 1;
        setTimeout(() => {
          sfx.play('steal');
          stealFx({ from: e.from, to: e.to, res: known ? e.res : null, onArrive: () => { bumpPlayer(e.to, e.res); sfx.play('land'); this.inflightSteal -= 1; this.queueRender(); } });
        }, wait);
        this.rollPauseUntil = Math.max(this.rollPauseUntil, Date.now() + wait + 1500);
        break;
      }
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
        if (e.pi === HUMAN) celebrate('win');
        setTimeout(() => this.showGameOver(), 700);
        break;
      case 'robber': sfx.play('robber'); this.robberMoveAt = Date.now(); break;
      case 'monopoly': sfx.play('monopoly'); break;
      case 'turn': if (e.pi === HUMAN) sfx.play('turn', { delay: 250 }); break;
      case 'change': {
        const vp = g.vp(HUMAN);
        if (this.lastVp !== undefined && vp > this.lastVp) { sfx.play('vp', { delay: 200 }); setTimeout(celebrate, 250); }
        this.lastVp = vp;
        this.queueRender();
        break;
      }
      default: break;
    }
  }

  /**
   * Ertrag einer Würfelrunde: Karten fliegen vom Feld zur Hand. Bis zur Ankunft zählen sie weder im Fächer
   * noch in den Zählern der Gegner (`inflight`), damit Zahl und Karte genau beim Eintreffen erscheinen.
   */
  playProduce(e) {
    const g = this.game;
    const pid = e.pi;
    const mine = pid === HUMAN;
    const n = e.src.reduce((a, x) => a + x.n, 0);
    for (const x of e.src) {
      if (mine) this.inflightH[x.res] = (this.inflightH[x.res] || 0) + x.n;
      else this.inflightO[pid] = (this.inflightO[pid] || 0) + x.n;
    }
    const stagger = Math.max(110, Math.min(220, 2000 / Math.max(1, n))) * (0.6 + 0.4 * this.sf);
    const delay = Math.max(0, this.heroEnd - Date.now()) + 380 + (this.fxOffset || 0);
    this.fxOffset = (this.fxOffset || 0) + n * stagger + 160;
    const done = {};
    const dur = produceFx({
      pid,
      src: e.src,
      delay,
      stagger,
      onLaunch: (i) => sfx.play('deal', { pitch: 1 + Math.min(i, 8) * 0.07, vol: mine ? 1 : 0.55 }),
      onArrive: (res, last) => {
        done[res] = (done[res] || 0) + 1;
        if (mine) {
          this.inflightH[res] = Math.max(0, (this.inflightH[res] || 0) - 1);
          this.landing[res] = (this.landing[res] || 0) + 1;
          setTimeout(() => { this.landing[res] = Math.max(0, (this.landing[res] || 1) - 1); }, 700);
        } else this.inflightO[pid] = Math.max(0, (this.inflightO[pid] || 0) - 1);
        sfx.play('land', { pitch: 1 + Math.min(done[res], 6) * 0.08, vol: mine ? 1 : 0.5 });
        bumpPlayer(pid, res);
        if (last) floatGain(pid, { [res]: e.hand[res] }, 0);
        this.queueRender();
      },
    });
    if (mine && n >= 3) sfx.play('jackpot', { delay: delay + dur - 600 });
    this.rollPauseUntil = Math.max(this.rollPauseUntil, Date.now() + dur + 300);
    // Sicherheitsnetz: nichts bleibt dauerhaft „im Anflug“
    setTimeout(() => {
      if (this.game !== g) return;
      if (mine) for (const x of e.src) this.inflightH[x.res] = 0; else this.inflightO[pid] = 0;
      this.queueRender();
    }, dur + 1500);
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
    // Räuber versetzen: ein Klick genügt (keine Bestätigung nötig)
    if (kind === 'hex' && this.game.s.sub === 'robber') { this.pending = null; this.executePick(kind, id); return; }
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
      case 'fab-toggle':
        if (this.mode) { this.mode = null; this.ui.fabOpen = false; } else this.ui.fabOpen = !this.ui.fabOpen;
        this.pending = null;
        this.queueRender();
        break;
      case 'build-road': case 'build-settlement': case 'build-city': {
        const k = act.slice(6);
        this.ui.fabOpen = false;
        this.pending = null;
        this.mode = this.mode === k ? null : k;
        this.queueRender();
        break;
      }
      case 'buy-dev': {
        this.ui.fabOpen = false;
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
      case 'trade': this.mode = null; this.ui.fabOpen = false; this.openMarket(); break;
      case 'dev': this.modal = devModal(this); break;
      case 'tokens': this.modal = tokensModal(this); break;
      case 'toggle-missions': this.ui.missionsOpen = !this.ui.missionsOpen; this.queueRender(); break;
      default: break;
    }
  }

  // ------------------------------------------------------------- Handelsmarkt (Mensch)
  openMarket() {
    const m = this.market;
    m.open = true;
    m.tab = 'players';
    m.sel = null;
    m.confirm = null;
    m.give = {};
    m.get = {};
    this.queueRender();
  }

  handleMarket(act, el) {
    const g = this.game;
    const m = this.market;
    const d = el.dataset;
    const hand = g.s.players[HUMAN].hand;
    switch (act) {
      case 'mk-open': m.open = true; break;
      case 'mk-close': m.open = false; m.counterFor = null; m.sel = null; m.confirm = null; break;
      case 'mk-tab': m.tab = d.tab; m.sel = null; break;
      case 'mk-inc': case 'mk-clear': {
        const side = d.side;
        const store = { give: m.give, get: m.get, cgive: m.counter.give, cget: m.counter.get }[side];
        const opposite = { give: m.get, get: m.give, cgive: m.counter.get, cget: m.counter.give }[side];
        const isGive = side === 'give' || side === 'cgive';
        const cap = isGive ? hand[d.res] : 9;
        if (act === 'mk-clear') store[d.res] = 0;
        else if ((store[d.res] || 0) < cap) { store[d.res] = (store[d.res] || 0) + 1; opposite[d.res] = 0; }
        break;
      }
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
        const r = this.act('createOffer', HUMAN, m.give, m.get, { deferred: true });
        if (r.ok) { m.sel = null; m.confirm = null; this.runHumanOffer(r.offer.id); }
        break;
      }
      case 'mk-withdraw': this.act('withdrawOffer', HUMAN, Number(d.id)); break;
      case 'mk-accept': this.act('respondOffer', HUMAN, Number(d.id), 'accept'); break;
      case 'mk-decline': this.act('respondOffer', HUMAN, Number(d.id), 'decline'); break;
      case 'mk-counter-open': {
        m.sel = null;
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
      case 'mk-pick': {
        const mine = g.openOfferOf(HUMAN);
        const r = mine && mine.responses[Number(d.pid)];
        if (r && r.type === 'accept') { this.act('acceptResponse', HUMAN, mine.id, Number(d.pid)); m.confirm = null; } // Haken antippen = bestätigt
        else m.confirm = Number(d.pid); // Gegenangebot: erst ansehen und bestätigen
        break;
      }
      case 'mk-confirm-cancel': m.confirm = null; break;
      case 'mk-confirm': {
        const r = this.act('acceptResponse', HUMAN, Number(d.id), Number(d.pid));
        m.confirm = null;
        if (!r.ok) break;
        break;
      }
      case 'mk-retry': {
        const mine = g.openOfferOf(HUMAN);
        if (mine) this.act('withdrawOffer', HUMAN, mine.id);
        m.confirm = null; m.sel = null;
        break;
      }
      case 'mk-withdraw-close': {
        const mine = g.openOfferOf(HUMAN);
        if (mine) this.act('withdrawOffer', HUMAN, mine.id);
        m.open = false; m.confirm = null; m.sel = null;
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

  /**
   * Die Bots antworten auf dein Angebot – jeder nach eigener Bedenkzeit (je nach Charakter kürzer oder länger).
   * Zusagen werden nur vorgemerkt; du wählst danach selbst, mit wem du tauschst, und bestätigst.
   */
  async runHumanOffer(id) {
    const g = this.game;
    const bots = g.s.players.filter((p) => p.isBot);
    this.queueRender();
    const pace = { trader: 0.8, gambler: 0.9, expander: 1, builder: 1.05, knight: 1.1, strategist: 1.35 };
    await Promise.all(bots.map(async (bot) => {
      this.busy.add(bot.id);
      const think = (650 + Math.random() * 1900) * (pace[bot.trait] || 1) * (0.5 + 0.5 * this.sf);
      await sleep(think);
      this.busy.delete(bot.id);
      if (this.game !== g) return;
      const cur = g.offerById(id);
      if (!cur || g.s.turn !== HUMAN || cur.responses[bot.id]) { this.queueRender(); return; }
      const ans = botRespondOffer(g, bot.id, cur);
      if (ans.type === 'accept') { g.respondOffer(bot.id, id, 'accept', null, ans.reason); sfx.play('gain', { vol: 0.8 }); }
      else if (ans.type === 'counter') { g.respondOffer(bot.id, id, 'counter', { give: ans.give, get: ans.get }, ans.reason); sfx.play('select'); }
      else { g.respondOffer(bot.id, id, 'decline', null, ans.reason); sfx.play('tick'); }
      this.queueRender();
    }));
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

    $('#hudHand').innerHTML = renderHand(g, this.inflightH);
    $('#hudOpps').innerHTML = renderPlayers(g, this.busy, this.inflightO);
    const fan = renderHandBar(g, this.inflightH, this.landing);
    if (fan !== this.hbHtml) { this.hbHtml = fan; $('#handFan').innerHTML = fan; }
    this.fitHand();
    this.renderControls();
    $('#heroRoll').innerHTML = renderHeroRoll(g);
    $('#diceBox').innerHTML = renderDice(g, this.rolling);
    this.renderMarketLayer();
    $('#missionBox').innerHTML = renderMissionBox(g, this.ui.missionsOpen);

    if (s.phase === 'main' && s.sub === 'discard' && s.discard[HUMAN] !== undefined) this.ensure('discard', () => discardModal(this, s.discard[HUMAN]));
    if (s.phase === 'main' && s.sub === 'gold' && s.gold[HUMAN]) {
      // erst auswählen lassen, nachdem Würfel, Wirbel und Kartenflug zu sehen waren
      const rest = this.rollPauseUntil + 350 - Date.now();
      if (rest > 0) { clearTimeout(this.goldTimer); this.goldTimer = setTimeout(() => this.queueRender(), rest + 30); }
      else this.ensure('gold', () => goldModal(this, s.gold[HUMAN]));
    }
    if (s.phase === 'main' && s.sub === 'steal' && s.turn === HUMAN) this.ensure('steal', () => stealModal(this, g.stealTargets(s.robber)));

    if (this.modal && !this.modal.closed && this.modal.refresh) this.modal.refresh();
    this.measure();
    this.save();
  }

  /** Handels-Pop-up: nur neu zeichnen, wenn sich etwas geändert hat; Einblend-Animation nur beim Erscheinen. */
  /** Klassische Bau-Effekte über dem Brett (Staub, Funken, Lichtstreifen). */
  buildEffect(e) {
    const g = this.game;
    if (!g || this.game.s.phase === 'over') return;
    const bd = g.s.board;
    const color = g.s.players[e.pi].color;
    const u = this.view.pxPerUnit();
    if (e.kind === 'road') {
      const ed = bd.edges[e.id];
      const a = this.view.screenPoint(bd.vertices[ed.a].x, bd.vertices[ed.a].y);
      const b = this.view.screenPoint(bd.vertices[ed.b].x, bd.vertices[ed.b].y);
      buildFxRoad(a, b, color, u);
    } else {
      const v = bd.vertices[e.id];
      buildFxPiece(e.kind, this.view.screenPoint(v.x, v.y + 0.22), color, u);
    }
  }

  /** Bau-Menü (links unten) und Weiter-Knopf (rechts unten). Neu gezeichnet wird nur bei Änderungen; das Aufklappen wird per GSAP animiert. */
  renderControls() {
    const g = this.game;
    const open = !!this.ui.fabOpen;
    const fab = renderFab(g, this.mode, open);
    const next = renderNext(g);
    const key = `${fab}|${open}`;
    if (key !== this.fabHtml) {
      const wasOpen = this.fabWasOpen;
      this.fabHtml = key;
      $('#fab').innerHTML = fab;
      if (open && !wasOpen && window.gsap) {
        const items = [...document.querySelectorAll('#fab .fab-item')];
        window.gsap.from(items.reverse(), { y: 26, opacity: 0, scale: 0.86, duration: 0.38, stagger: 0.055, ease: 'back.out(1.7)', clearProps: 'transform,opacity' });
      }
      this.fabWasOpen = open;
    }
    if (next !== this.nextHtml) {
      this.nextHtml = next;
      $('#nextWrap').innerHTML = next;
      const b = $('#nextWrap .seal');
      if (b && window.gsap) window.gsap.from(b, { x: 40, opacity: 0, duration: 0.4, ease: 'back.out(1.6)', clearProps: 'transform,opacity' });
    }
  }

  /** Kartenfächer unten: Überlappung so wählen, dass alle Karten in die Breite passen. */
  fitHand() {
    const fan = $('#handFan');
    if (!fan || !fan.firstElementChild) return;
    const groups = [...fan.children].filter((c) => c.classList.contains('rgroup') || c.classList.contains('dgroup'));
    const cw = parseFloat(getComputedStyle(fan).getPropertyValue('--cw')) || 64;
    const gap = parseFloat(getComputedStyle(fan).getPropertyValue('--gap')) || 18;
    const avail = Math.max(240, window.innerWidth - 660);
    const extra = groups.reduce((a, g2) => a + g2.children.length - 1, 0);
    const fixed = groups.length * cw + (groups.length - 1) * gap;
    const step = extra > 0 ? Math.max(9, Math.min(cw * 0.5, (avail - fixed) / extra)) : cw * 0.5;
    fan.style.setProperty('--step', `${step.toFixed(1)}px`);
  }

  renderMarketLayer() {
    const host = $('#market');
    const { html, key, dim, closeOnBack } = renderMarket(this);
    host.classList.toggle('dim', !!dim);
    $('#game').classList.toggle('trading', !!dim);
    if (closeOnBack) host.dataset.act = 'mk-close'; else delete host.dataset.act;
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
    const h = $('.hdr');
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
      <button role="menuitem" data-pop="art">Grafik <b class="art">${ART_STYLES[artStyle()].label}</b></button>
      <button role="menuitem" data-pop="sound">Sound <b class="snd">${sfx.enabled ? 'An' : 'Aus'}</b></button>
      <button role="menuitem" data-pop="music">Musik <b class="mus">${music.enabled ? 'An' : 'Aus'}</b></button>
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
    if (what === 'art') {
      const ids = Object.keys(ART_STYLES);
      const next = ids[(ids.indexOf(artStyle()) + 1) % ids.length];
      if (await setArtStyle(next)) {
        $('#menuPop .art').textContent = ART_STYLES[artStyle()].label;
        this.hbHtml = null;
        this.queueRender();
      } else this.toast('Dieser Grafikstil konnte nicht geladen werden.', 'warn');
      return;
    }
    if (what === 'music') {
      music.setEnabled(!music.enabled);
      $('#menuPop .mus').textContent = music.enabled ? 'An' : 'Aus';
      this.syncMusicBtn();
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
    const unlock = () => { sfx.unlock(); music.start(); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('click', (e) => {
      if (this.ui.fabOpen && !e.target.closest('#fab')) { this.ui.fabOpen = false; this.queueRender(); }
      const devCard = e.target.closest('[data-dev]');
      if (devCard) { playDevCard(this, devCard.dataset.dev); return; }
      const pop = e.target.closest('[data-pop]');
      if (pop) { this.onPopover(pop.dataset.pop); return; }
      if (e.target.closest('#btnMenu')) { this.togglePopover(); return; }
      if (e.target.closest('#btnMusic')) { music.setEnabled(!music.enabled); this.syncMusicBtn(); return; }
      if (!e.target.closest('#menuPop')) this.closePopover();
      let b = e.target.closest('[data-act]');
      if (b && b.id === 'market' && e.target !== b) b = null; // Klick ins Handelsfenster schließt es nicht
      if (b) {
        if (/^(build-|fab-|mk-(step|tab|counter-open)|bank-(give|get)|toggle-)/.test(b.dataset.act)) sfx.play('tick');
        this.handleAct(b.dataset.act, b);
      } else if (!e.target.closest('.floatbox') && (this.ui.missionsOpen || this.ui.logOpen) && e.target.closest('#board')) {
        this.ui.missionsOpen = false; this.ui.logOpen = false; this.queueRender();
      }
    });
    $('#zoomIn').addEventListener('click', () => this.view.zoomBy(0.8));
    $('#zoomOut').addEventListener('click', () => this.view.zoomBy(1.25));
    $('#zoomFit').addEventListener('click', () => this.view.fit(undefined, true));
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
        this.fitHand();
      }, 200);
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'Escape') {
        if (!$('#menuPop').classList.contains('hidden')) this.closePopover();
        else if (this.ui.fabOpen) { this.ui.fabOpen = false; this.queueRender(); } else if (this.pending) { this.pending = null; this.queueRender(); } else if (!closeTopModal()) {
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
