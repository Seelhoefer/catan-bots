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
  const tile = (t) => `assets/hexbg/${t === 'desert' ? 'desert' : t}.webp`;
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


export function renderMenu(root, { hasSave, onStart, onResume, onRules }) {
  const settings = loadSettings();
  let view = 'home'; // home | wizard
  let step = 0;

  const maxBots = () => SIZES[settings.size].maxPlayers - 1;
  const LEVELS = [['easy', 'Leicht'], ['normal', 'Normal'], ['hard', 'Schwer']];
  const diffOf = (id) => (settings.botDifficulty && settings.botDifficulty[id]) || settings.difficulty;
  const ensureCast = () => {
    if (!BOT_ROSTER.some((b) => b.id === settings.avatarPortrait)) settings.avatarPortrait = BOT_ROSTER[BOT_ROSTER.length - 1].id; // dein Gesicht: immer eines der Portraits
    const others = BOT_ROSTER.filter((b) => b.id !== settings.avatarPortrait); // das eigene Gesicht spielt nicht als Gegner mit
    const want = Math.min((settings.botIds && settings.botIds.length) || settings.bots || 3, maxBots());
    const ids = (settings.botIds || []).filter((id) => others.some((b) => b.id === id));
    for (const o of others) { if (ids.length >= want) break; if (!ids.includes(o.id)) ids.push(o.id); }
    settings.botIds = BOT_ROSTER.map((b) => b.id).filter((id) => ids.includes(id)).slice(0, maxBots());
    settings.bots = settings.botIds.length;
  };

  const startGame = () => {
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
      el('button', { type: 'button', class: 'mh-link small', onclick: onRules }, 'Regeln')));
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
  const sw = (key, title, hint) => el('label', { class: 'mw-sw' },
    el('input', { type: 'checkbox', checked: settings[key] || undefined, onchange: (e) => { settings[key] = e.target.checked; saveSettings(settings); } }),
    el('span', { class: 'knob' }),
    el('span', { class: 'mw-sw-t' }, el('b', {}, title), hint ? el('small', {}, hint) : null));
  let moreOpen = false;

  const drawWizard = () => {
    ensureCast();
    const sel = new Set(settings.botIds);
    const max = maxBots();
    const me = BOT_ROSTER.find((b) => b.id === settings.avatarPortrait) || BOT_ROSTER[0];
    const sec = (label, ...kids) => el('section', { class: 'mw-sec' }, el('h3', {}, label), ...kids);

    const you = el('div', { class: 'mw-you' },
      el('button', { type: 'button', class: 'mw-face', 'aria-label': 'Anderes Gesicht wählen', title: 'Tippen für ein anderes Gesicht', onclick: () => cycleFace(1), html: avatarSVG(me.face, PLAYER_COLORS[0].hex, 56) }),
      el('input', { type: 'text', class: 'mw-name', value: settings.playerName === 'Du' ? '' : settings.playerName, placeholder: 'Dein Name', maxlength: 14, 'aria-label': 'Dein Name', oninput: (e) => { settings.playerName = e.target.value.trim() || 'Du'; saveSettings(settings); } }));

    const island = sec('Insel',
      el('div', { class: 'mw-islands' }, Object.values(SIZES).map((sz) => el('button', {
        type: 'button', class: `mw-isl ${settings.size === sz.id ? 'on' : ''}`, title: `${sz.hexes} Felder`, 'aria-pressed': String(settings.size === sz.id),
        onclick: () => { settings.size = sz.id; ensureCast(); draw(); },
        html: `${miniBoard(sz.radius, settings.variant === 'fog')}<b>${sz.label}</b>`,
      }))),
      el('label', { class: 'mw-sw tight' },
        el('input', { type: 'checkbox', checked: settings.variant === 'fog' || undefined, onchange: (e) => { settings.variant = e.target.checked ? 'fog' : 'classic'; draw(); } }),
        el('span', { class: 'knob' }),
        el('span', { class: 'mw-sw-t' }, el('b', {}, 'Nebel'), el('small', {}, 'Ein Teil der Insel ist verdeckt'))));

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
      const cap = realisticVP(settings.size, settings.bots + 1);
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
      sw('worldHarbor', 'Welthafen', 'Ein einziger Hafen, an dem alle Rohstoffe 2:1 getauscht werden'),
      sw('decreeCard', 'Erlass-Karte', 'Neue Karte: Zoll oder Strafe auf einen Rohstoff festlegen')));

    const more = el('section', { class: 'mw-sec more' },
      el('button', { type: 'button', class: `mw-more ${moreOpen ? 'open' : ''}`, 'aria-expanded': String(moreOpen), onclick: () => { moreOpen = !moreOpen; draw(); } }, el('span', {}, 'Weitere Regeln'), el('span', { class: 'mw-chev', html: ic('chev') })),
      moreOpen ? el('div', { class: 'mw-rules' },
        sw('antiBad', 'Anti-Pech-Marker'), sw('missions', 'Missionen'), sw('remapCard', 'Weltenwandel'), sw('harvestCard', 'Ernte'), sw('goldField', 'Wahlfeld')) : null);

    root.replaceChildren(el('div', { class: 'mw' },
      el('div', { class: 'mw-top' },
        el('button', { type: 'button', class: 'hbtn mw-back', 'aria-label': 'Zurück zum Start', title: 'Zurück', onclick: () => { view = 'home'; draw(); }, html: ic('arrow') }),
        el('h2', {}, 'Spiel einrichten')),
      you, island, bots, points, ext, more,
      el('div', { class: 'mw-foot' }, el('button', { type: 'button', class: 'mw-start', onclick: startGame }, 'Spiel starten'))));
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
