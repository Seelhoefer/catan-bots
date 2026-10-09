// App-Controller: verbindet Engine, Bots und Oberfläche.
import { Game } from './engine/game.js';
import { botAct, botEvaluateOffer } from './engine/bot.js';
import { RES, RES_INFO, DEV_INFO } from './engine/constants.js';
import { BoardView } from './ui/boardView.js';
import { $, esc } from './ui/dom.js';
import { renderMenu } from './ui/menu.js';
import {
  renderPlayers, renderMissions, renderLog, renderDice, renderHand, renderActions,
} from './ui/panels.js';
import {
  openModal, tradeModal, devModal, tokensModal, discardModal, stealModal, offerModal, logModal,
  rulesModal, gameOverModal, closeTopModal, closeAllModals, confirmDialog, hasModal,
} from './ui/modals.js';

const SAVE_KEY = 'catan-save-v1';
const SPEED_KEY = 'catan-speed';
const HUMAN = 0;
const SPEEDS = { slow: ['🐢', 'Langsam', 1300], normal: ['🚶', 'Normal', 650], fast: ['⚡', 'Schnell', 110] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class App {
  constructor() {
    this.game = null;
    this.mode = null; // 'road' | 'settlement' | 'city'
    this.pumping = false;
    this.rolling = false;
    this.renderQueued = false;
    this.auto = {};
    this.fresh = { pieces: new Set(), hexes: new Set(), remap: false };
    this.speed = 'normal';
    try { this.speed = localStorage.getItem(SPEED_KEY) || 'normal'; } catch { /* egal */ }
    if (!SPEEDS[this.speed]) this.speed = 'normal';
    this.view = new BoardView($('#board'), (k, id) => this.onPick(k, id));
    this.bindUI();
    this.showMenu();
  }

  // ------------------------------------------------------------- Start / Menü
  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  showMenu() {
    closeAllModals();
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
    this.attach(Game.create(settings));
  }

  resume() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      this.attach(Game.fromJSON(s));
    } catch {
      this.toast('Der Spielstand konnte nicht geladen werden.', 'warn');
      try { localStorage.removeItem(SAVE_KEY); } catch { /* egal */ }
      this.showMenu();
    }
  }

  attach(game) {
    closeAllModals();
    this.game = game;
    this.mode = null;
    this.auto = {};
    this.pumping = false;
    this.view.fitKey = null;
    game.on((e) => this.onEvent(e));
    $('#menu').classList.add('hidden');
    $('#game').classList.remove('hidden');
    $('#log').scrollTop = 0;
    this.render();
    this.view.fit(game.s.board);
    this.pump();
  }

  // ------------------------------------------------------------- Events der Engine
  onEvent(e) {
    const g = this.game;
    switch (e.type) {
      case 'build': this.fresh.pieces.add(`${e.kind === 'road' ? 'e' : 'v'}${e.id}`); break;
      case 'reveal': this.fresh.hexes.add(e.id); this.toast('🌫️ Nebel gelüftet!'); break;
      case 'remap':
        this.fresh.remap = true;
        this.toast(`🌍 ${g.s.players[e.pi].name}: Weltenwandel! Alle Felder wurden neu verteilt.`, 'big');
        break;
      case 'dice':
        this.rolling = true;
        setTimeout(() => { this.rolling = false; this.queueRender(); }, 650);
        break;
      case 'gain':
        if (e.pi === HUMAN && g.s.phase === 'main') this.toast(`Du erhältst ${g.fmtHand(e.hand)}`, 'gain');
        break;
      case 'token':
        if (e.pi === HUMAN) this.toast('🍀 +1 Anti-Pech-Marker', 'gain');
        break;
      case 'mission': {
        const def = this.missionName(e.id);
        this.toast(`🎖️ ${g.s.players[e.pi].name} erfüllt „${def}“ (+1 SP)`, 'big');
        break;
      }
      case 'devplay':
        if (e.pi !== HUMAN) this.toast(`${g.s.players[e.pi].name} spielt ${DEV_INFO[e.card].icon} ${DEV_INFO[e.card].name}`);
        break;
      case 'steal':
        if (e.from === HUMAN) this.toast(`${g.s.players[e.to].name} hat dir 1× ${RES_INFO[e.res].icon} gestohlen`, 'warn');
        else if (e.to === HUMAN) this.toast(`Du hast 1× ${RES_INFO[e.res].icon} gestohlen`, 'gain');
        break;
      case 'turn':
        if (e.pi === HUMAN) this.toast('🎲 Du bist dran!', 'big');
        break;
      case 'win': setTimeout(() => this.showGameOver(), 700); break;
      case 'change': this.queueRender(); break;
      default: break;
    }
  }

  missionName(id) {
    return { harbor: 'Hafenmeister', explorer: 'Entdecker', citybuilder: 'Städtebauer', roads: 'Wegbereiter', expansion: 'Expansion', knights: 'Ritterschlag', trader: 'Handelsmann', lucky: 'Glückspilz', cards: 'Kartenhai' }[id] || id;
  }

  // ------------------------------------------------------------- Aktionen des Menschen
  act(method, ...args) {
    const g = this.game;
    const r = g[method](...args);
    if (!r.ok) this.toast(r.error, 'warn');
    else this.pump();
    this.queueRender();
    return r;
  }

  onPick(kind, id) {
    const g = this.game;
    const s = g.s;
    if (s.phase === 'over') return;
    if (s.phase === 'setup') {
      if (kind === 'vertex') this.act('placeInitialSettlement', HUMAN, id);
      else if (kind === 'edge') this.act('placeInitialRoad', HUMAN, id);
      return;
    }
    if (s.turn !== HUMAN) return;
    if (kind === 'hex' && s.sub === 'robber') { this.act('moveRobber', HUMAN, id); return; }
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
    switch (act) {
      case 'roll': this.act('rollDice', HUMAN); break;
      case 'end-turn': {
        this.mode = null;
        this.act('endTurn', HUMAN);
        break;
      }
      case 'build-road': case 'build-settlement': case 'build-city': {
        const k = act.slice(6);
        this.mode = this.mode === k ? null : k;
        if (this.mode) this.toast(this.mode === 'city' ? 'Wähle eine Siedlung zum Ausbauen' : 'Wähle einen leuchtenden Platz auf dem Feld');
        this.queueRender();
        break;
      }
      case 'buy-dev': {
        this.mode = null;
        const r = this.act('buyDevCard', HUMAN);
        if (r.ok) {
          const info = DEV_INFO[r.card];
          this.toast(`Neue Karte: ${info.icon} ${info.name}`, 'big');
        }
        break;
      }
      case 'skip-roads': this.act('skipRoadBuilding', HUMAN); break;
      case 'trade': this.mode = null; this.queueRender(); this.modal = tradeModal(this); break;
      case 'dev': this.modal = devModal(this); break;
      case 'tokens': this.modal = tokensModal(this); break;
      default: break;
    }
  }

  // ------------------------------------------------------------- Bots
  delay() {
    return SPEEDS[this.speed][2];
  }

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
        if (r.offer) await this.handleBotOffer(pi, r.offer);
      }
    } finally {
      if (this.game === g) this.pumping = false;
    }
    this.queueRender();
  }

  async handleBotOffer(pi, offer) {
    const g = this.game;
    const bot = g.s.players[pi];
    for (const o of g.s.players) {
      if (o.id === pi || !o.isBot) continue;
      const ev = botEvaluateOffer(g, o.id, pi, offer.give, offer.get);
      if (ev.accept && g.tradeWith(pi, o.id, offer.give, offer.get).ok) {
        this.toast(`🤝 ${bot.name} handelt mit ${o.name}`);
        return;
      }
    }
    const me = g.s.players[HUMAN];
    if (RES.some((r) => (offer.get[r] || 0) > me.hand[r])) return;
    this.queueRender();
    const yes = await offerModal(this, bot, offer.give, offer.get);
    if (this.game !== g) return;
    if (yes) {
      const r = g.tradeWith(pi, HUMAN, offer.give, offer.get);
      if (!r.ok) this.toast(r.error, 'warn');
    }
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
    const ui = { fresh: this.fresh };
    if (s.phase === 'setup' && s.turn === HUMAN) {
      if (s.sub === 'settlement') ui.vertices = new Set(g.legalSettlementSpots(HUMAN));
      else ui.edges = new Set(g.legalRoadSpots(HUMAN));
    } else if (s.phase === 'main' && s.turn === HUMAN) {
      if (s.sub === 'robber') ui.hexes = new Set(g.legalRobberHexes());
      else if (s.roadBuildingLeft > 0) ui.edges = new Set(g.legalRoadSpots(HUMAN));
      else if (s.sub === 'actions') {
        if (this.mode === 'road') ui.edges = new Set(g.legalRoadSpots(HUMAN));
        else if (this.mode === 'settlement') ui.vertices = new Set(g.legalSettlementSpots(HUMAN));
        else if (this.mode === 'city') ui.vertices = new Set(g.legalCitySpots(HUMAN));
      }
    }
    return ui;
  }

  hint() {
    const g = this.game;
    const s = g.s;
    const cur = s.players[s.turn];
    if (s.phase === 'over') return '🏆 Das Spiel ist beendet.';
    if (s.phase === 'setup') {
      const nth = s.setup.step < s.players.length ? '1.' : '2.';
      if (s.turn !== HUMAN) return `${cur.name} gründet … (${nth} Siedlung)`;
      return s.sub === 'settlement' ? `Gründung: Wähle einen Platz für deine ${nth} Siedlung.` : 'Gründung: Setze eine Straße an deine neue Siedlung.';
    }
    if (s.sub === 'discard') {
      return s.discard[HUMAN] !== undefined ? `Eine 7! Du musst ${s.discard[HUMAN]} Karten abwerfen.` : 'Eine 7! Spieler werfen Karten ab …';
    }
    if (s.turn !== HUMAN) {
      if (s.sub === 'robber') return `${cur.name} versetzt den Räuber …`;
      return `${cur.name} ist am Zug …`;
    }
    if (s.sub === 'roll') return 'Du bist dran – würfle!';
    if (s.sub === 'robber') return '🥷 Versetze den Räuber: Klicke auf ein leuchtendes Feld.';
    if (s.sub === 'steal') return 'Von wem möchtest du stehlen?';
    if (s.roadBuildingLeft > 0) return `🛣️ Platziere noch ${s.roadBuildingLeft} kostenlose Straße(n).`;
    if (this.mode === 'road') return 'Wähle eine leuchtende Linie für deine Straße. (Esc = Abbrechen)';
    if (this.mode === 'settlement') return 'Wähle einen leuchtenden Punkt für deine Siedlung. (Esc = Abbrechen)';
    if (this.mode === 'city') return 'Wähle eine deiner Siedlungen, um sie zur Stadt auszubauen. (Esc = Abbrechen)';
    return 'Baue, handle oder beende deinen Zug.';
  }

  render() {
    const g = this.game;
    if (!g) return;
    const s = g.s;
    // Bau-Modus nur gültig, wenn er Sinn ergibt
    if (this.mode && !(s.phase === 'main' && s.turn === HUMAN && s.sub === 'actions')) this.mode = null;

    this.view.render(g, this.highlights());
    this.fresh = { pieces: new Set(), hexes: new Set(), remap: false };

    const cur = s.players[s.turn];
    $('#turnInfo').innerHTML = s.phase === 'over'
      ? '🏆 Spiel beendet'
      : `<span class="pdot" style="background:${cur.color}"></span><b>${esc(cur.name)}</b> ${s.phase === 'setup' ? '· Gründung' : `· Zug ${s.turnNumber}`}<span class="target">Ziel: ${s.settings.targetVP} SP</span>`;
    $('#players').innerHTML = renderPlayers(g);
    $('#missions').innerHTML = renderMissions(g);
    const logEl = $('#log');
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 40;
    logEl.innerHTML = renderLog(g);
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
    $('#diceBox').innerHTML = renderDice(g, this.rolling);
    $('#hand').innerHTML = renderHand(g);
    $('#actions').innerHTML = renderActions(g, this.mode);
    const hint = $('#hint');
    hint.textContent = this.hint();
    hint.classList.toggle('mine', s.turn === HUMAN && s.phase !== 'over');
    $('#btnSpeed').textContent = `${SPEEDS[this.speed][0]} ${SPEEDS[this.speed][1]}`;

    // Dialoge, die der Mensch zwingend beantworten muss
    if (s.phase === 'main' && s.sub === 'discard' && s.discard[HUMAN] !== undefined) this.ensure('discard', () => discardModal(this, s.discard[HUMAN]));
    if (s.phase === 'main' && s.sub === 'steal' && s.turn === HUMAN) this.ensure('steal', () => stealModal(this, g.stealTargets(s.robber)));

    // Offene Dialoge aktualisieren
    if (this.modal && !this.modal.closed && this.modal.refresh) this.modal.refresh();

    this.save();
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
  toast(msg, kind = '') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    box.append(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'big' ? 3600 : 2600);
  }

  // ------------------------------------------------------------- UI-Bindung
  bindUI() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.handleAct(b.dataset.act, b);
    });
    $('#btnMenu').addEventListener('click', async () => {
      const yes = await confirmDialog('Zum Hauptmenü?', 'Dein Spiel wird automatisch gespeichert und kann später fortgesetzt werden.', 'Zum Menü');
      if (yes) { this.save(); setTimeout(() => this.showMenu(), 300); }
    });
    $('#btnRules').addEventListener('click', () => rulesModal());
    $('#btnLog').addEventListener('click', () => logModal(this));
    $('#btnMissions').addEventListener('click', () => {
      const m = openModal({ title: '🎖️ Öffentliche Missionen' });
      m.body.innerHTML = renderMissions(this.game).replace(/<h3[^>]*>.*?<\/h3>/, '') || '<p class="empty">Missionen sind in dieser Partie deaktiviert.</p>';
    });
    $('#btnSpeed').addEventListener('click', () => {
      const keys = Object.keys(SPEEDS);
      this.speed = keys[(keys.indexOf(this.speed) + 1) % keys.length];
      try { localStorage.setItem(SPEED_KEY, this.speed); } catch { /* egal */ }
      this.queueRender();
    });
    $('#zoomIn').addEventListener('click', () => this.view.zoomBy(0.8));
    $('#zoomOut').addEventListener('click', () => this.view.zoomBy(1.25));
    $('#zoomFit').addEventListener('click', () => this.view.fit());
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea')) return;
      if (e.key === 'Escape') {
        if (!closeTopModal() && this.mode) { this.mode = null; this.queueRender(); }
      } else if ((e.key === 'r' || e.key === 'R') && this.game && !hasModal()) {
        const s = this.game.s;
        if (s.phase === 'main' && s.turn === HUMAN && s.sub === 'roll') this.act('rollDice', HUMAN);
      }
    });
  }
}

window.catan = new App();
