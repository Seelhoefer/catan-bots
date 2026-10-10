// Startseite (Hero) und Einstellungs-Assistent in drei Schritten: Karte → Spieler → Regeln.
import { SIZES, DEFAULT_SETTINGS, BOT_ROSTER, HUMAN_FACES, PLAYER_COLORS, PIP } from '../engine/constants.js';
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
    return `<polygon points="${pts}" fill="${h.fog ? '#6c7d97' : TERRAIN_FILL[h.type]}"/>`;
  }).join('');
  const b = board.bounds;
  return `<svg viewBox="${b.minX - 0.3} ${b.minY - 0.3} ${b.maxX - b.minX + 0.6} ${b.maxY - b.minY + 0.6}" class="mini">${cells}</svg>`;
}

const STEPS = ['Karte', 'Spieler', 'Regeln'];

export function renderMenu(root, { hasSave, onStart, onResume, onRules }) {
  const settings = loadSettings();
  let view = 'home'; // home | wizard
  let step = 0;

  const maxBots = () => SIZES[settings.size].maxPlayers - 1;
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

  // ---------------------------------------------------------------- Startseite
  const drawHome = () => {
    const last = loadLast();
    const lastText = last
      ? `${last.bots + 1} Spieler · ${SIZES[last.size]?.label || 'Klein'} · ${last.variant === 'fog' ? 'Nebel' : 'Klassisch'} · ${last.targetVP} SP`
      : null;
    const cast = BOT_ROSTER.map((b, i) => `<div class="ts-char" style="--pc:${PLAYER_COLORS[(i + 1) % 6].hex}" title="${esc(b.tagline)}">${avatarSVG(b.face, PLAYER_COLORS[(i + 1) % 6].hex, 64)}<b>${esc(b.name)}</b><small>${esc(b.tagline)}</small></div>`).join('');
    const btn = (cls, icon, title, sub, onclick) => el('button', { type: 'button', class: `ts-btn ${cls}`, onclick },
      el('span', { class: 'ts-ico', html: ic(icon) }), el('span', { class: 'ts-lbl' }, el('b', {}, title), sub ? el('small', {}, sub) : null), el('span', { class: 'ts-go', html: ic('arrow') }));
    root.replaceChildren(el('div', { class: 'title-screen' },
      el('div', { class: 'ts-sky' }, el('i', { class: 'ts-cloud c1' }), el('i', { class: 'ts-cloud c2' }), el('i', { class: 'ts-cloud c3' })),
      el('div', { class: 'ts-top' },
        el('button', { type: 'button', class: 'hbtn ts-music', id: 'tsMusic', 'aria-label': 'Musik an/aus', title: 'Musik an/aus', html: ic(music.enabled ? 'music' : 'music-off'),
          onclick: () => { music.setEnabled(!music.enabled); document.getElementById('tsMusic').innerHTML = ic(music.enabled ? 'music' : 'music-off'); } })),
      el('div', { class: 'ts-island', html: `<div class="ts-glow"></div>${heroArt()}<div class="ts-shadow"></div>` }),
      el('div', { class: 'ts-main' },
        el('div', { class: 'ts-brand' },
          el('div', { class: 'ts-pre' }, el('i'), el('span', {}, 'Die Siedler von'), el('i')),
          el('h1', { class: 'ts-logo' }, 'CATAN'),
          el('div', { class: 'ts-ribbon' }, el('span', {}, 'gegen Bots'))),
        el('nav', { class: 'ts-menu' },
          btn('primary', 'dice', 'Neues Spiel', 'Insel, Gegner und Regeln wählen', () => { view = 'wizard'; step = 0; draw(); }),
          hasSave ? btn('', 'compass', 'Fortsetzen', 'Gespeicherte Partie weiterspielen', onResume) : null,
          lastText ? btn('', 'trophy', 'Schnellstart', lastText, () => { Object.assign(settings, last); startGame(); }) : null,
          btn('minor', 'flag', 'Regeln & Neuheiten', null, onRules))),
      el('div', { class: 'ts-cast' }, el('div', { class: 'ts-cast-h' }, el('i'), el('span', {}, 'Deine Gegner'), el('i')), el('div', { class: 'ts-cast-row', html: cast })),
      el('div', { class: 'ts-foot' }, 'Dein Spielstand wird automatisch im Browser gespeichert.')));
    const g = window.gsap;
    if (g) {
      g.from('.ts-logo', { y: -50, opacity: 0, scale: 1.08, duration: 0.9, ease: 'back.out(1.5)' });
      g.from('.ts-pre, .ts-ribbon', { opacity: 0, y: -10, duration: 0.6, delay: 0.35, stagger: 0.12 });
      g.from('.ts-btn', { x: -50, opacity: 0, duration: 0.5, delay: 0.45, stagger: 0.09, ease: 'power3.out', clearProps: 'transform,opacity' });
      g.from('.ts-island', { y: 40, opacity: 0, duration: 1.1, delay: 0.2, ease: 'power3.out' });
      g.from('.ts-char', { y: 30, opacity: 0, duration: 0.5, delay: 0.8, stagger: 0.07, ease: 'back.out(1.6)', clearProps: 'transform,opacity' });
      g.to('.ts-island svg', { y: -12, rotation: 1.2, duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      g.to('.ts-shadow', { scaleX: 0.92, opacity: 0.5, duration: 3.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
  };

  // ---------------------------------------------------------------- Assistent
  const seg = (opts, value, onPick) => el('div', { class: 'seg' }, opts.map(([val, label]) => el('button', {
    class: val === value ? 'on' : '', type: 'button', onclick: () => { onPick(val); draw(); },
  }, label)));

  const toggle = (key, icon, title, desc) => el('label', { class: 'switch' },
    el('input', { type: 'checkbox', checked: settings[key] || undefined, onchange: (e) => { settings[key] = e.target.checked; saveSettings(settings); } }),
    el('span', { class: 'knob' }),
    el('span', { class: 'sw-text' }, el('b', { html: `${ic(icon, 'inline')} ${title}` }), el('small', {}, desc)));

  const stepMap = () => el('div', { class: 'wz-body' },
    el('h2', {}, 'Welche Insel?'),
    el('div', { class: 'tiles' }, Object.values(SIZES).map((sz) => el('button', {
      type: 'button', class: `tile ${settings.size === sz.id ? 'on' : ''}`,
      onclick: () => { settings.size = sz.id; ensureCast(); draw(); },
      html: `${miniBoard(sz.radius, settings.variant === 'fog')}<b>${sz.label}</b><small>${sz.desc}</small>`,
    }))),
    el('div', { class: 'tiles two' }, [['classic', 'dune', 'Klassisch', 'Alle Felder offen – wie im Original.'], ['fog', 'cloud', 'Nebel (Seefahrer)', 'Ein Teil der Insel ist verdeckt. Baue eine Straße heran, um ihn zu lüften!']].map(([id, icon, name, desc]) => el('button', {
      type: 'button', class: `tile row ${settings.variant === id ? 'on' : ''}`, onclick: () => { settings.variant = id; draw(); },
      html: `<span class="t-icon">${ic(icon)}</span><span><b>${name}</b><small>${desc}</small></span>`,
    }))));

  const stepPlayers = () => {
    ensureCast();
    const sel = new Set(settings.botIds);
    const max = maxBots();
    const preset = (n) => { settings.botIds = BOT_ROSTER.filter((b) => b.id !== settings.avatarPortrait).slice(0, Math.min(n - 1, max)).map((b) => b.id); ensureCast(); draw(); };
    return el('div', { class: 'wz-body' },
      el('h2', {}, 'Wer spielt mit?'),
      el('div', { class: 'you' },
        el('div', { class: 'you-faces' },
          BOT_ROSTER.map((b) => el('button', {
            type: 'button', class: `face portrait ${settings.avatarPortrait === b.id ? 'on' : ''}`, title: b.name, 'aria-label': `Gesicht ${b.name}`,
            onclick: () => {
              const before = (settings.botIds || []).length;
              settings.avatarPortrait = b.id;
              const ids = (settings.botIds || []).filter((id) => id !== b.id);
              // gleiche Spielerzahl behalten: für das gewählte Gesicht rückt der nächste freie Bot nach
              for (const o of BOT_ROSTER) { if (ids.length >= before) break; if (o.id !== b.id && !ids.includes(o.id)) ids.push(o.id); }
              settings.botIds = BOT_ROSTER.map((x) => x.id).filter((id) => ids.includes(id));
              draw();
            }, html: avatarSVG(b.face, PLAYER_COLORS[0].hex, 48),
          }))),
        el('label', { class: 'field' }, el('span', {}, 'Dein Name'),
          el('input', { type: 'text', value: settings.playerName === 'Du' ? '' : settings.playerName, placeholder: 'Du', maxlength: 14, oninput: (e) => { settings.playerName = e.target.value.trim() || 'Du'; saveSettings(settings); } }))),
      el('div', { class: 'wz-row' },
        el('h3', {}, `Gegner · ${settings.bots + 1} Spieler`),
        el('div', { class: 'presets' },
          el('button', { type: 'button', class: `btn small ${settings.bots === 3 ? 'solid' : ''}`, onclick: () => preset(4) }, '4 Spieler'),
          el('button', { type: 'button', class: `btn small ${settings.bots === 5 ? 'solid' : ''}`, disabled: max < 5 || undefined, title: max < 5 ? 'Für 6 Spieler brauchst du eine größere Insel' : '', onclick: () => preset(6) }, '6 Spieler'))),
      el('div', { class: 'roster' }, BOT_ROSTER.map((b, i) => {
        const you = settings.avatarPortrait === b.id;
        const on = sel.has(b.id) && !you;
        const full = !on && sel.size >= max;
        return el('button', {
          type: 'button', class: `char ${on ? 'on' : ''} ${you ? 'you' : ''}`, disabled: full || you || undefined, title: you ? 'Dieses Gesicht hast du gewählt' : undefined,
          onclick: () => { if (on) { if (sel.size > 1) sel.delete(b.id); } else sel.add(b.id); settings.botIds = BOT_ROSTER.map((x) => x.id).filter((id) => sel.has(id)); ensureCast(); draw(); },
          html: `${avatarSVG(b.face, PLAYER_COLORS[(i + 1) % 6].hex, 52)}<b>${b.name}</b><small>${you ? 'Das bist du' : b.tagline}</small>`,
        });
      })),
      el('div', { class: 'field' }, el('span', {}, 'Stärke der Bots'),
        seg([['easy', 'Leicht'], ['normal', 'Normal'], ['hard', 'Schwer']], settings.difficulty, (v) => { settings.difficulty = v; })));
  };

  const stepRules = () => el('div', { class: 'wz-body' },
    el('h2', {}, 'Wie lange und mit welchen Regeln?'),
    el('label', { class: 'vp-field' },
      el('span', { class: 'vp-ico', html: ic('trophy') }),
      el('span', { class: 'vp-txt' }, el('b', {}, 'Siegpunkte'), el('small', {}, 'Wer zuerst so viele Punkte hat, gewinnt (5–20).')),
      el('input', {
        type: 'number', inputmode: 'numeric', min: 5, max: 20, value: settings.targetVP, class: 'vp-input', 'aria-label': 'Siegpunkte',
        oninput: (e) => { const v = Math.round(Number(e.target.value)); if (v >= 5 && v <= 20) { settings.targetVP = v; saveSettings(settings); } },
        onblur: (e) => { settings.targetVP = Math.max(5, Math.min(20, Math.round(Number(e.target.value)) || 10)); e.target.value = settings.targetVP; saveSettings(settings); },
      })),
    el('div', { class: 'switches' },
      toggle('antiBad', 'clover', 'Anti-Pech-Marker', 'Ausbleibende Erträge werden ausgeglichen.'),
      toggle('missions', 'flag', 'Öffentliche Missionen', '3 Ziele mit Zusatz-Siegpunkten.'),
      toggle('remapCard', 'globe', 'Weltenwandel-Karte', 'Mischt alle Felder neu.'),
      toggle('harvestCard', 'wheat', 'Ernte-Karte', 'Ertrag eines eigenen Feldes sofort holen.'),
      toggle('goldField', 'coin', 'Wahlfeld', 'Ein Feld mit freier Rohstoffwahl (wie in Erweiterungen).')));

  const drawWizard = () => {
    const body = [stepMap, stepPlayers, stepRules][step]();
    root.replaceChildren(el('div', { class: 'wizard' },
      el('div', { class: 'wz-head' },
        el('button', { class: 'btn quiet small', type: 'button', onclick: () => { view = 'home'; draw(); } }, '← Start'),
        el('ol', { class: 'steps' }, STEPS.map((n, i) => el('li', { class: `${i === step ? 'on' : ''} ${i < step ? 'done' : ''}`, onclick: () => { step = i; draw(); } }, el('i', {}, String(i + 1)), n)))),
      body,
      el('div', { class: 'wz-foot' },
        step > 0 ? el('button', { class: 'btn', type: 'button', onclick: () => { step--; draw(); } }, 'Zurück') : el('span'),
        step < STEPS.length - 1
          ? el('button', { class: 'btn solid xl', type: 'button', onclick: () => { step++; draw(); } }, 'Weiter')
          : el('button', { class: 'btn solid xl', type: 'button', onclick: startGame }, 'Spiel starten'))));
  };

  const draw = () => {
    ensureCast();
    saveSettings(settings);
    (view === 'home' ? drawHome : drawWizard)();
    root.scrollTop = 0;
  };
  draw();
}

export { PIP };
