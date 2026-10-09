// Startbildschirm mit den Spieleinstellungen.
import { SIZES, DEFAULT_SETTINGS } from '../engine/constants.js';
import { hexCenter, hexCorner } from '../engine/board.js';
import { el, ic } from './dom.js';

const KEY = 'catan-settings-v1';

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* egal */ }
}

const MINI = ['#3f9467', '#d27249', '#a9d696', '#efcf62', '#9eabc4'];

function miniBoard(radius, fog) {
  const cells = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (Math.abs(q + r) > radius) continue;
      const c = hexCenter(q, r);
      const pts = [0, 1, 2, 3, 4, 5].map((k) => { const p = hexCorner(c.x, c.y, k); return `${(c.x + (p.x - c.x) * 0.9).toFixed(2)},${(c.y + (p.y - c.y) * 0.9).toFixed(2)}`; }).join(' ');
      const isFog = fog && (q * 0.9 + r * 0.4 > radius * 0.55);
      cells.push(`<polygon points="${pts}" fill="${isFog ? '#6c7d97' : MINI[(q * 3 + r * 5 + 50) % 5]}"/>`);
    }
  }
  const e = radius * 1.75 + 1.2;
  return `<svg viewBox="${-e} ${-e} ${e * 2} ${e * 2}" class="mini">${cells.join('')}</svg>`;
}

export function renderMenu(root, { hasSave, onStart, onResume, onRules }) {
  const settings = loadSettings();

  const draw = () => {
    const size = SIZES[settings.size];
    const maxBots = size.maxPlayers - 1;
    settings.bots = Math.min(settings.bots, maxBots);
    saveSettings(settings);

    const seg = (opts, value, onPick) => el('div', { class: 'seg' }, opts.map(([val, label]) => el('button', {
      class: val === value ? 'on' : '', type: 'button', onclick: () => { onPick(val); draw(); },
    }, label)));

    const toggle = (key, icon, title, desc) => el('label', { class: 'switch' },
      el('input', { type: 'checkbox', checked: settings[key] || undefined, onchange: (e) => { settings[key] = e.target.checked; saveSettings(settings); } }),
      el('span', { class: 'knob' }),
      el('span', { class: 'sw-text' }, el('b', { html: `${ic(icon, 'inline')} ${title}` }), el('small', {}, desc)));

    root.replaceChildren(el('div', { class: 'menu-wrap' },
      el('div', { class: 'hero' },
        el('div', { class: 'hero-hex', html: ic('hex') }),
        el('h1', {}, 'Catan'), el('p', {}, 'Baue, handle und erobere die Insel – gegen clevere Bots.')),

      el('div', { class: 'menu-grid' },
        el('section', { class: 'card wide' },
          el('h3', {}, 'Spielfeld'),
          el('div', { class: 'tiles' }, Object.values(SIZES).map((sz) => el('button', {
            type: 'button', class: `tile ${settings.size === sz.id ? 'on' : ''}`, onclick: () => { settings.size = sz.id; draw(); },
            html: `${miniBoard(sz.radius, settings.variant === 'fog')}<b>${sz.label}</b><small>${sz.desc}</small>`,
          }))),
          el('div', { class: 'tiles two' },
            [['classic', 'dune', 'Klassisch', 'Alle Felder offen – wie im Original.'], ['fog', 'cloud', 'Nebel (Seefahrer)', 'Ein Teil der Insel ist verdeckt. Baue eine Straße heran, um ihn zu lüften!']].map(([id, icon, name, desc]) => el('button', {
              type: 'button', class: `tile row ${settings.variant === id ? 'on' : ''}`, onclick: () => { settings.variant = id; draw(); },
              html: `<span class="t-icon">${ic(icon)}</span><span><b>${name}</b><small>${desc}</small></span>`,
            })))),

        el('section', { class: 'card' },
          el('h3', {}, 'Spieler'),
          el('label', { class: 'field' }, el('span', {}, 'Dein Name'),
            el('input', { type: 'text', value: settings.playerName === 'Du' ? '' : settings.playerName, placeholder: 'Du', maxlength: 14, oninput: (e) => { settings.playerName = e.target.value.trim() || 'Du'; saveSettings(settings); } })),
          el('div', { class: 'field' }, el('span', {}, 'Anzahl Gegner'),
            seg(Array.from({ length: maxBots }, (_, i) => [i + 1, String(i + 1)]), settings.bots, (v) => { settings.bots = v; })),
          el('div', { class: 'field' }, el('span', {}, 'Stärke der Bots'),
            seg([['easy', 'Leicht'], ['normal', 'Normal'], ['hard', 'Schwer']], settings.difficulty, (v) => { settings.difficulty = v; }))),

        el('section', { class: 'card' },
          el('h3', {}, 'Siegpunkte'),
          el('div', { class: 'vp-pick' },
            el('div', { class: 'vp-num' }, String(settings.targetVP)),
            el('input', { type: 'range', min: 5, max: 20, value: settings.targetVP, oninput: (e) => { settings.targetVP = Number(e.target.value); root.querySelector('.vp-num').textContent = settings.targetVP; saveSettings(settings); } }),
            el('div', { class: 'vp-labels' }, el('span', {}, 'kurz'), el('span', {}, 'klassisch (10)'), el('span', {}, 'lang')))),

        el('section', { class: 'card wide-2' },
          el('h3', {}, 'Neue Regeln'),
          el('div', { class: 'switches' },
            toggle('antiBad', 'clover', 'Anti-Pech-Marker', 'Ausbleibende Erträge werden ausgeglichen.'),
            toggle('missions', 'flag', 'Öffentliche Missionen', '3 Ziele, die zusätzliche Siegpunkte bringen.'),
            toggle('remapCard', 'globe', 'Weltenwandel-Karte', 'Neue Entwicklungskarte mischt alle Felder neu.')))),

      el('div', { class: 'menu-actions' },
        el('button', { class: 'btn solid xl', type: 'button', onclick: () => onStart({ ...settings }) }, 'Spiel starten'),
        hasSave ? el('button', { class: 'btn xl', type: 'button', onclick: onResume }, 'Fortsetzen') : null,
        el('button', { class: 'btn quiet', type: 'button', onclick: onRules }, 'Regeln & Neuheiten'))));
  };
  draw();
}
