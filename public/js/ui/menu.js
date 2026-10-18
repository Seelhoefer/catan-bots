// Startseite (Hero) und Einstellungs-Assistent in drei Schritten: Karte → Spieler → Regeln.
import { SIZES, DEFAULT_SETTINGS, BOT_ROSTER, HUMAN_FACES, PLAYER_COLORS, PIP, MAX_TARGET_VP, realisticVP } from '../engine/constants.js';
import { generateBoard, hexCorner } from '../engine/board.js';
import { makeRng } from '../engine/rng.js';
import { el, ic, esc } from './dom.js';
import { avatarSVG } from './avatars.js';
import { music } from './music.js';
import {
  piece, resImg, IMG,
} from './assets.js';
import { roadDefs, roadOnEdge } from './road.js';

const KEY = 'catan-settings-v1';
const LAST_KEY = 'catan-last-v1';

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* egal */ }
}

export function rememberLast(s) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(s)); } catch { /* egal */ }
}

function loadLast() {
  try { return JSON.parse(localStorage.getItem(LAST_KEY)); } catch { return null; }
}

const TERRAIN_FILL = { wood: '#2f7d55', brick: '#c4673f', sheep: '#93c27f', wheat: '#e2b84a', ore: '#8794b0', desert: '#e3d19c' };

/** Dekoratives Titelbild: eine echte Karte mit einigen Siedlungen und Straßen. */
function heroArt() {
  const board = generateBoard('small', 'classic', makeRng(11));
  const tile = (t) => `assets/web/tiles/${t}.webp`;
  const hexes = board.hexes.map((h) => {
    const red = h.num === 6 || h.num === 8;
    const num = h.num ? `<g transform="translate(${h.x},${h.y})"><circle r=".37" cy=".04" fill="rgba(0,0,0,.28)"/><circle r=".36" fill="#f6efdc" stroke="#b69a58" stroke-width=".035"/><text y=".13" text-anchor="middle" font-size=".4" font-weight="800" font-family="Georgia,serif" fill="${red ? '#c62828' : '#3a2f1c'}">${h.num}</text></g>` : '';
    return `<image href="${tile(h.type)}" x="${(h.x - 0.866).toFixed(3)}" y="${(h.y - 1).toFixed(3)}" width="1.732" height="2" preserveAspectRatio="none"/>${num}`;
  }).join('');
  const picks = [[14, 0, 'settlement'], [40, 1, 'city'], [30, 2, 'settlement'], [50, 3, 'settlement'], [22, 4, 'settlement']];
  const pieces = picks.map(([vid, pi, kind]) => {
    const v = board.vertices[vid];
    const w = board.vertices[v.adj[0]];
    const col = PLAYER_COLORS[pi];
    const sz = kind === 'city' ? 1.05 : 0.86;
    return `${roadOnEdge(v, w, col.id, '', 'rh')}
      <image href="${piece(col.id, kind)}" x="${(v.x - sz / 2).toFixed(3)}" y="${(v.y - sz * 0.9).toFixed(3)}" width="${sz}" height="${sz}"/>`;
  }).join('');
  const b = board.bounds;
  const pad = 0.8;
  return `<svg viewBox="${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + pad * 2} ${b.maxY - b.minY + pad * 2}" class="hero-art-svg"><defs>${roadDefs('rh')}</defs>${hexes}${pieces}</svg>`;
}

function miniBoard(radius, fog) {
  const board = generateBoard(radius === 2 ? 'small' : radius === 3 ? 'large' : 'huge', fog ? 'fog' : 'classic', makeRng(5));
  const cells = board.hexes.map((h) => {
    const pts = h.verts.map((vid) => { const v = board.vertices[vid]; return `${(h.x + (v.x - h.x) * 0.9).toFixed(2)},${(h.y + (v.y - h.y) * 0.9).toFixed(2)}`; }).join(' ');
    return `<polygon points="${pts}" fill="${h.fog ? '#9aa8c8' : TERRAIN_FILL[h.type]}" stroke="rgba(0,0,0,.28)" stroke-width=".05"/>`;
  }).join('');
  const b = board.bounds;
  return `<svg viewBox="${b.minX - 0.3} ${b.minY - 0.3} ${b.maxX - b.minX + 0.6} ${b.maxY - b.minY + 0.6}" class="mini">${cells}</svg>`;
}


export function renderMenu(root, {
  hasSave, onStart, onResume, onRules, onJoin,
}) {
  const settings = loadSettings();
  let view = 'home'; // home | wizard
  let step = 0;

  const friends = () => (settings.tvMode ? 0 : Math.max(0, settings.friendsPc || 0)) + Math.max(0, settings.friendsPhone || 0) + (settings.tvMode ? 1 : 0); // weitere Menschen neben dir (im Brett-Modus: du am Handy)
  const maxBots = () => SIZES[settings.size].maxPlayers - 1 - friends() + (settings.tvMode ? 1 : 0);
  const minBots = () => (friends() + (settings.tvMode ? 0 : 0) > 0 ? 0 : 1);
  const LEVELS = [['easy', 'Leicht'], ['normal', 'Normal'], ['hard', 'Schwer']];
  const diffOf = (id) => (settings.botDifficulty && settings.botDifficulty[id]) || settings.difficulty;
  const ensureCast = () => {
    if (!BOT_ROSTER.some((b) => b.id === settings.avatarPortrait)) settings.avatarPortrait = BOT_ROSTER[BOT_ROSTER.length - 1].id; // dein Gesicht: immer eines der Portraits
    const others = BOT_ROSTER.filter((b) => b.id !== settings.avatarPortrait); // das eigene Gesicht spielt nicht als Gegner mit
    const want = Math.max(minBots(), Math.min(settings.botIds ? settings.botIds.length : (settings.bots ?? 3), maxBots()));
    const ids = (settings.botIds || []).filter((id) => others.some((b) => b.id === id));
    for (const o of others) { if (ids.length >= want) break; if (!ids.includes(o.id)) ids.push(o.id); }
    settings.botIds = BOT_ROSTER.map((b) => b.id).filter((id) => ids.includes(id)).slice(0, maxBots());
    settings.bots = settings.botIds.length;
  };
  const clampFriends = () => {
    const room = SIZES[settings.size].maxPlayers - 1; // Plätze neben dir
    settings.friendsPc = Math.max(0, Math.min(3, settings.friendsPc || 0));
    settings.friendsPhone = Math.max(0, Math.min(5, settings.friendsPhone || 0));
    while (settings.friendsPc + settings.friendsPhone > room) { if (settings.friendsPhone > 0) settings.friendsPhone -= 1; else settings.friendsPc -= 1; }
    if (settings.friendsPhone === 0) settings.tvMode = false;
  };

  const startGame = () => {
    clampFriends();
    ensureCast();
    saveSettings(settings);
    rememberLast(settings);
    onStart({ ...settings });
  };

  // ---------------------------------------------------------------- Startseite (minimal: Logo, ein Knopf)
  const drawHome = () => {
    const last = loadLast();
    const lastText = last ? `${last.bots + 1} Spieler · ${SIZES[last.size]?.label || 'Klein'} · ${last.targetVP} SP` : null;
    const quick = () => { Object.assign(settings, last); startGame(); };
    root.replaceChildren(el('div', { class: 'mh' },
      el('button', { type: 'button', class: 'hbtn mh-music', id: 'tsMusic', 'aria-label': 'Musik an/aus', title: 'Musik an/aus', html: ic(music.enabled ? 'music' : 'music-off'),
        onclick: () => { music.setEnabled(!music.enabled); document.getElementById('tsMusic').innerHTML = ic(music.enabled ? 'music' : 'music-off'); } }),
      el('div', { class: 'mh-island', html: heroArt() }),
      el('div', { class: 'mh-brand' }, el('small', {}, 'Die Siedler von'), el('h1', {}, 'CATAN'), el('span', {}, 'gegen Bots')),
      el('nav', { class: 'mh-menu' },
        hasSave ? el('button', { type: 'button', class: 'mh-btn primary', onclick: onResume }, 'Fortsetzen') : null,
        el('button', { type: 'button', class: `mh-btn ${hasSave ? '' : 'primary'}`, onclick: () => { view = 'wizard'; draw(); } }, 'Neues Spiel'),
        lastText ? el('button', { type: 'button', class: 'mh-link', onclick: quick }, `Wie zuletzt · ${lastText}`) : null),
      el('div', { class: 'mh-sub' },
        el('button', { type: 'button', class: 'mh-link small', onclick: onJoin }, 'Mit Code beitreten'),
        el('button', { type: 'button', class: 'mh-link small', onclick: onRules }, 'Regeln'))));
    const g = window.gsap;
    if (g) {
      g.from('.mh-brand h1', { y: -26, opacity: 0, duration: 0.8, ease: 'power3.out' });
      g.from('.mh-brand small, .mh-brand span', { opacity: 0, duration: 0.7, delay: 0.25, stagger: 0.1 });
      g.from('.mh-btn, .mh-link', { y: 16, opacity: 0, duration: 0.5, delay: 0.35, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' });
      g.from('.mh-island', { y: 24, opacity: 0, duration: 1, ease: 'power3.out' });
      g.to('.mh-island svg', { y: -8, duration: 3.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
  };

  // ---------------------------------------------------------------- Assistent
  const openInfo = new Set(); // aufgeklappte Regelerklärungen (bleiben beim Neuzeichnen offen)
  /** Info-Knopf (ⓘ) und die dazugehörige aufklappbare Regelerklärung. */
  const infoPair = (key, title, info) => {
    if (!info) return { btn: null, explain: null };
    const explain = el('p', { class: 'mw-explain', id: `ex-${key}`, hidden: !openInfo.has(key) || undefined }, info);
    const btn = el('button', {
      type: 'button', class: `mw-info ${openInfo.has(key) ? 'on' : ''}`, 'aria-label': `Regel erklären: ${title}`, 'aria-expanded': String(openInfo.has(key)), 'aria-controls': `ex-${key}`,
      onclick: () => { if (openInfo.has(key)) openInfo.delete(key); else openInfo.add(key); explain.hidden = !openInfo.has(key); btn.classList.toggle('on', openInfo.has(key)); btn.setAttribute('aria-expanded', String(openInfo.has(key))); },
      html: ic('info'),
    });
    return { btn, explain };
  };
  /** Schalter mit Info-Knopf: ⓘ klappt die Regel darunter auf. */
  const sw = (key, title, hint, info) => {
    const { btn, explain } = infoPair(key, title, info);
    return el('div', { class: 'mw-swrow' },
      el('label', { class: 'mw-sw' },
        el('input', { type: 'checkbox', checked: settings[key] || undefined, onchange: (e) => { settings[key] = e.target.checked; saveSettings(settings); } }),
        el('span', { class: 'knob' }),
        el('span', { class: 'mw-sw-t' }, el('b', {}, title), hint ? el('small', {}, hint) : null)),
      btn, explain);
  };
  const RULE_INFO = {
    fog: 'Ein Teil der Insel ist unter Nebel verborgen. Sobald eine deiner Straßen an ein verdecktes Feld grenzt, wird es aufgedeckt – und du erhältst 1 Rohstoff davon. Gründen darfst du nur an Ecken ohne Nebel.',
    worldHarbor: 'Auf dem Brett gibt es genau einen goldenen Welthafen („2:1 ALLE“). Wer dort eine Siedlung oder Stadt hat, tauscht jeden Rohstoff 2:1 mit der Bank. Er ersetzt einen der normalen 3:1-Häfen, es gibt also nur diesen einen.',
    decreeCard: 'Neue Entwicklungskarte „Erlass“: Du legst für eine Runde einen Zoll oder eine Strafe auf einen Rohstoff fest. Zoll: Gegner, die ihn erwürfeln, zahlen dir 1 Karte davon. Strafe: Sie erhalten 1 Karte weniger. Gilt, bis du wieder am Zug bist.',
    eventCards: 'Fünf zusätzliche Karten im Entwicklungsstapel, wie die Ereigniskarten bei Monopoly: Schutzbrief (einmal vom Dieb verschont – er darf dich nicht bestehlen oder du musst bei einer 7 nichts abwerfen), Rückenwind (nächster Wurf: jedes getroffene Feld bringt 1 Karte extra), Marktprivileg (bis Zugende tauschst du mit der Bank 2:1), Dieb vertreiben (der Räuber geht in die Wüste) und Geburtstag (jeder Gegner schenkt dir 1 Karte).',
    antiBad: 'Erhältst du bei einem Wurf (außer einer 7) gar nichts, bekommst du 1 Anti-Pech-Marker. Hast du so viele Marker, wie du Siegpunkte hast, tauschst du sie gegen 1 Rohstoff deiner Wahl. So gleicht sich Pech aus.',
    missions: 'Missionskarten liegen für alle sichtbar aus (3, auf größeren Inseln 4 oder 5). Wer eine Bedingung als Erster erfüllt – etwa Weltentdecker (Gebäude an allen 5 Rohstoffen), Metropole (mehrere Städte) oder Goldregen (viele Karten mit einem Wurf) –, erhält +1 Siegpunkt. Jede Mission gibt es nur einmal.',
    remapCard: 'Entwicklungskarte „Weltenwandel“: Alle Landfelder werden zufällig neu gemischt (Rohstoffe und Zahlen). Siedlungen und Straßen bleiben stehen – für alle Spieler ändert sich, was sie ernten.',
    harvestCard: 'Entwicklungskarte „Ernte“: Du wählst eines deiner Felder mit Siedlung oder Stadt und erhältst sofort dessen Ertrag (Stadt = doppelt), ganz ohne zu würfeln.',
    goldField: 'Ein Wahlfeld (violett) auf dem Brett: Wird seine Zahl gewürfelt, darfst du dir für jede angrenzende Siedlung (Stadt = 2) einen beliebigen Rohstoff aussuchen.',
  };
  let moreOpen = false;

  // Voreinstellungen: ein Tipp statt acht Schalter (Hick'sches Gesetz); die Auswahl bleibt danach frei änderbar
  const OFF = { variant: 'classic', missions: false, remapCard: false, harvestCard: false, goldField: false, eventCards: false, worldHarbor: false, decreeCard: false, antiBad: false };
  const PRESETS = [
    { id: 'classic', label: 'Klassisch', sub: 'Die reinen Regeln', set: { ...OFF } },
    { id: 'explorer', label: 'Entdecker', sub: 'Nebel, Missionen, Wahlfeld', set: { ...OFF, variant: 'fog', missions: true, goldField: true, remapCard: true, harvestCard: true, antiBad: true } },
    { id: 'all', label: 'Alles an', sub: 'Alle Erweiterungen', set: { variant: 'classic', missions: true, remapCard: true, harvestCard: true, goldField: true, eventCards: true, worldHarbor: true, decreeCard: true, antiBad: true } },
  ];
  const presetOn = (pr) => Object.entries(pr.set).every(([k, v]) => settings[k] === v);
  const EXT_LABELS = [['variant', 'Nebel', (v) => v === 'fog'], ['worldHarbor', 'Welthafen'], ['decreeCard', 'Erlass'], ['eventCards', 'Ereigniskarten'], ['missions', 'Missionen'], ['antiBad', 'Anti-Pech'], ['remapCard', 'Weltenwandel'], ['harvestCard', 'Ernte'], ['goldField', 'Wahlfeld']];
  const summaryText = () => {
    const n = settings.bots + 1 + friends();
    const on = EXT_LABELS.filter(([k, , f]) => (f ? f(settings[k]) : settings[k])).length;
    return `${n} Spieler · ${SIZES[settings.size].label} · ${settings.targetVP} SP · ${on} Regeln aktiv`;
  };

  const drawWizard = () => {
    ensureCast();
    const sel = new Set(settings.botIds);
    const max = maxBots();
    const me = BOT_ROSTER.find((b) => b.id === settings.avatarPortrait) || BOT_ROSTER[0];
    const sec = (label, ...kids) => el('section', { class: 'mw-sec' }, el('h3', {}, label), ...kids);

    const you = el('section', { class: 'mw-sec mw-you-sec' }, el('h3', {}, 'Du'), el('div', { class: 'mw-you' },
      el('button', { type: 'button', class: 'mw-face', 'aria-label': 'Anderes Gesicht wählen', title: 'Tippen für ein anderes Gesicht', onclick: () => cycleFace(1), html: avatarSVG(me.face, PLAYER_COLORS[0].hex, 56) }),
      el('input', { type: 'text', class: 'mw-name', value: settings.playerName === 'Du' ? '' : settings.playerName, placeholder: 'Dein Name', maxlength: 14, 'aria-label': 'Dein Name', oninput: (e) => { settings.playerName = e.target.value.trim() || 'Du'; saveSettings(settings); } })));

    const island = sec('Insel',
      el('div', { class: 'mw-islands' }, Object.values(SIZES).map((sz) => el('button', {
        type: 'button', class: `mw-isl ${settings.size === sz.id ? 'on' : ''}`, title: `${sz.hexes} Felder`, 'aria-pressed': String(settings.size === sz.id),
        onclick: () => { settings.size = sz.id; ensureCast(); draw(); },
        html: `${miniBoard(sz.radius, settings.variant === 'fog')}<b>${sz.label}</b>`,
      }))),
      (() => {
        const { btn, explain } = infoPair('fog', 'Nebel', RULE_INFO.fog);
        return el('div', { class: 'mw-swrow tight' },
          el('label', { class: 'mw-sw' },
            el('input', { type: 'checkbox', checked: settings.variant === 'fog' || undefined, onchange: (e) => { settings.variant = e.target.checked ? 'fog' : 'classic'; draw(); } }),
            el('span', { class: 'knob' }),
            el('span', { class: 'mw-sw-t' }, el('b', {}, 'Nebel'), el('small', {}, 'Ein Teil der Insel ist verdeckt'))),
          btn, explain);
      })());

    clampFriends();
    const room = SIZES[settings.size].maxPlayers - 1;
    const step = (label, hint, key, max) => el('div', { class: 'mw-step' },
      el('span', { class: 'mw-step-t' }, el('b', {}, label), el('small', {}, hint)),
      el('div', { class: 'mw-stepper', role: 'group', 'aria-label': label },
        el('button', { type: 'button', 'aria-label': 'Weniger', disabled: !settings[key] || undefined, onclick: () => { settings[key] = Math.max(0, (settings[key] || 0) - 1); ensureCast(); draw(); }, html: ic('minus') }),
        el('b', {}, String(settings[key] || 0)),
        el('button', { type: 'button', 'aria-label': 'Mehr', disabled: (settings[key] || 0) >= max || settings.friendsPc + settings.friendsPhone >= room || undefined, onclick: () => { settings[key] = (settings[key] || 0) + 1; clampFriends(); ensureCast(); draw(); }, html: ic('plus') })));
    const names = settings.friendsPc > 0 && !settings.tvMode
      ? el('div', { class: 'mw-fnames' }, Array.from({ length: settings.friendsPc }, (_, i) => el('input', {
        type: 'text', class: 'mw-name', maxlength: 14, placeholder: `Name Spieler ${i + 2}`, value: (settings.friendNames || [])[i] || '', 'aria-label': `Name Spieler ${i + 2}`,
        oninput: (e) => { const arr = [...(settings.friendNames || [])]; arr[i] = e.target.value; settings.friendNames = arr; saveSettings(settings); },
      })))
      : null;
    const mates = sec('Mit Freunden',
      step('Am selben Gerät', 'abwechselnd, Karten werden verdeckt', 'friendsPc', 3),
      names,
      step('Am Handy', 'Handkarten und Aktionen am eigenen Gerät', 'friendsPhone', 5),
      settings.friendsPhone > 0 ? el('label', { class: 'mw-sw tight' },
        el('input', { type: 'checkbox', checked: settings.tvMode || undefined, onchange: (e) => { settings.tvMode = e.target.checked; clampFriends(); ensureCast(); draw(); } }),
        el('span', { class: 'knob' }),
        el('span', { class: 'mw-sw-t' }, el('b', {}, 'Dieses Gerät zeigt nur das Brett'), el('small', {}, 'Auch du spielst am Handy'))) : null);

    const bots = sec(`Gegner · ${settings.bots}`,
      el('div', { class: 'mw-bots' }, BOT_ROSTER.map((b, i) => {
        const isYou = settings.avatarPortrait === b.id;
        const on = sel.has(b.id) && !isYou;
        const full = !on && sel.size >= max;
        const lvl = diffOf(b.id);
        return el('div', { class: `mw-bot ${on ? 'on' : ''} ${isYou ? 'you' : ''}`, style: `--pc:${PLAYER_COLORS[(i + 1) % 6].hex}` },
          el('button', {
            type: 'button', class: 'mw-bot-b', disabled: full || isYou || undefined, 'aria-pressed': String(on), title: isYou ? 'Das bist du' : `${b.name} – ${b.tagline}`,
            onclick: () => { if (on) { if (sel.size > 1) sel.delete(b.id); } else sel.add(b.id); settings.botIds = BOT_ROSTER.map((x) => x.id).filter((id) => sel.has(id)); ensureCast(); draw(); },
            html: `${avatarSVG(b.face, PLAYER_COLORS[(i + 1) % 6].hex, 52)}<small>${b.name}</small>`,
          }),
          el('div', { class: 'mw-dots', role: 'group', 'aria-label': `Stärke ${b.name}`, style: on ? '' : 'visibility:hidden' }, LEVELS.map(([v, l], k) => el('button', {
            type: 'button', class: LEVELS.findIndex(([x]) => x === lvl) >= k ? 'lit' : '', title: `${b.name}: ${l}`, 'aria-label': `${b.name}: ${l}`, tabindex: on ? undefined : -1,
            onclick: () => { settings.botDifficulty = { ...(settings.botDifficulty || {}), [b.id]: v }; draw(); },
          }))));
      })),
      el('p', { class: 'mw-note' }, 'Punkte unter dem Gegner = Spielstärke'));

    const hint = el('p', { class: 'mw-hint' });
    const num = el('b', { class: 'mw-vp-n' }, String(settings.targetVP));
    const updateHint = () => {
      const cap = realisticVP(settings.size, settings.bots + 1 + friends());
      hint.textContent = settings.targetVP > cap + 2 ? `Auf dieser Insel realistisch bis ca. ${cap} SP` : '';
      hint.style.display = hint.textContent ? '' : 'none';
    };
    updateHint();
    const range = el('input', {
      type: 'range', class: 'mw-range', min: 5, max: MAX_TARGET_VP, step: 1, value: settings.targetVP, 'aria-label': 'Siegpunkte',
      oninput: (e) => { settings.targetVP = Number(e.target.value); num.textContent = String(settings.targetVP); range.style.setProperty('--p', `${((settings.targetVP - 5) / (MAX_TARGET_VP - 5)) * 100}%`); updateHint(); },
      onchange: () => saveSettings(settings),
    });
    range.style.setProperty('--p', `${((settings.targetVP - 5) / (MAX_TARGET_VP - 5)) * 100}%`);
    const points = sec('Siegpunkte', el('div', { class: 'mw-vp' }, el('span', { class: 'mw-vp-ico', html: ic('trophy') }), num), range, hint);

    const ext = sec('Erweiterungen', el('div', { class: 'mw-rules' },
      sw('worldHarbor', 'Welthafen', 'Ein einziger Hafen, an dem alle Rohstoffe 2:1 getauscht werden', RULE_INFO.worldHarbor),
      sw('decreeCard', 'Erlass-Karte', 'Neue Karte: Zoll oder Strafe auf einen Rohstoff festlegen', RULE_INFO.decreeCard),
      sw('eventCards', 'Ereigniskarten', 'Schutzbrief, Rückenwind, Marktprivileg, Dieb vertreiben, Geburtstag', RULE_INFO.eventCards),
      sw('missions', 'Missionskarten', 'Ziele für +1 Siegpunkt: Weltentdecker, Metropole …', RULE_INFO.missions)));

    const more = el('section', { class: 'mw-sec more' },
      el('button', { type: 'button', class: `mw-more ${moreOpen ? 'open' : ''}`, 'aria-expanded': String(moreOpen), onclick: () => { moreOpen = !moreOpen; draw(); } }, el('span', {}, 'Weitere Regeln'), el('span', { class: 'mw-chev', html: ic('chev') })),
      moreOpen ? el('div', { class: 'mw-rules' },
        sw('antiBad', 'Anti-Pech-Marker', 'Pech wird ausgeglichen', RULE_INFO.antiBad), sw('remapCard', 'Weltenwandel', 'Karte: alle Felder neu mischen', RULE_INFO.remapCard),
        sw('harvestCard', 'Ernte', 'Karte: sofortiger Ertrag eines Feldes', RULE_INFO.harvestCard), sw('goldField', 'Wahlfeld', 'Feld mit freier Rohstoffwahl', RULE_INFO.goldField)) : null);

    const presets = el('div', { class: 'mw-presets', role: 'group', 'aria-label': 'Voreinstellung' }, PRESETS.map((pr) => el('button', {
      type: 'button', class: `mw-preset ${presetOn(pr) ? 'on' : ''}`, 'aria-pressed': String(presetOn(pr)),
      onclick: () => { Object.assign(settings, pr.set); draw(); },
    }, el('b', {}, pr.label), el('small', {}, pr.sub))));

    root.replaceChildren(el('div', { class: 'mw' },
      el('div', { class: 'mw-top' },
        el('button', { type: 'button', class: 'hbtn mw-back', 'aria-label': 'Zurück zum Start', title: 'Zurück', onclick: () => { view = 'home'; draw(); }, html: ic('arrow') }),
        el('h2', {}, 'Spiel einrichten')),
      presets,
      el('div', { class: 'mw-cols' },
        el('div', { class: 'mw-col' }, you, island, mates, bots),
        el('div', { class: 'mw-col' }, points, ext, more)),
      el('div', { class: 'mw-foot' },
        el('p', { class: 'mw-summary', 'aria-live': 'polite' }, summaryText()),
        el('button', { type: 'button', class: 'mw-start', onclick: startGame }, 'Spiel starten'))));
    const g = window.gsap;
    if (g && !this_animated) {
      this_animated = true;
      g.from('.mw-sec, .mw-you', { y: 18, opacity: 0, duration: 0.45, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' });
    }
  };

  let this_animated = false;
  const draw = () => {
    if (view === 'home') this_animated = false;
    ensureCast();
    saveSettings(settings);
    (view === 'home' ? drawHome : drawWizard)();
    root.scrollTop = 0;
  };
  draw();
}

export { PIP };
