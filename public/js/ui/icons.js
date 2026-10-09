// Einheitliches Icon-Set (gefüllte Glyphen, 24×24, currentColor) als SVG-Sprite.
import { art, ICON_IMAGE } from './assets.js';

const ICONS = {
  // Rohstoffe
  wood: '<path d="M12 2.5 17.5 10h-3l4.5 6.5h-5.6v5h-2.8v-5H5L9.5 10h-3z"/>',
  brick: '<path d="M2.5 5h19v4.2h-19z M2.5 10.4h8.6v4.2H2.5z M12.9 10.4h8.6v4.2h-8.6z M2.5 15.8h4.6V20H2.5z M8.9 15.8h6.2V20H8.9z M16.9 15.8h4.6V20h-4.6z"/>',
  sheep: '<circle cx="8" cy="10" r="3.6"/><circle cx="13" cy="8.5" r="4"/><circle cx="12" cy="13" r="4.2"/><circle cx="7.5" cy="13.5" r="3"/><ellipse cx="19.6" cy="12.2" rx="2.3" ry="2.9"/><rect x="8" y="16" width="1.9" height="4.6" rx=".7"/><rect x="13.6" y="16" width="1.9" height="4.6" rx=".7"/>',
  wheat: '<rect x="11.2" y="9" width="1.6" height="13" rx=".6"/><ellipse cx="12" cy="4.8" rx="1.7" ry="3"/><ellipse cx="8.5" cy="9.2" rx="1.6" ry="3" transform="rotate(-35 8.5 9.2)"/><ellipse cx="15.5" cy="9.2" rx="1.6" ry="3" transform="rotate(35 15.5 9.2)"/><ellipse cx="8.5" cy="14.4" rx="1.6" ry="3" transform="rotate(-35 8.5 14.4)"/><ellipse cx="15.5" cy="14.4" rx="1.6" ry="3" transform="rotate(35 15.5 14.4)"/>',
  ore: '<path d="M2 20.5 9 8.5l3.2 5.2L15 9.8l7 10.7z"/>',
  // Gelände
  cloud: '<path d="M7.5 19a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 18.2 9.6 4.7 4.7 0 0 1 17.5 19z"/>',
  dune: '<circle cx="17" cy="7.5" r="3"/><path d="M2 20c2.8-5.2 6-7.6 10-7.6s7.2 2.4 10 7.6z"/>',
  // Bauen
  road: '<path fill-rule="evenodd" d="M8 3h8l4.5 18h-4.1l-.9-3.8H8.5L7.6 21H3.5z M11.2 6h1.6v3h-1.6z M11.2 11h1.6v3h-1.6z"/>',
  house: '<path d="M12 3 2.5 11.2h2.7V21h5.2v-6h3.2v6h5.2v-9.8h2.7z"/>',
  city: '<path fill-rule="evenodd" d="M2.5 21V11h6V7.5L13 3l3.5 3.5V11h5v10z M5 14h2.2v2.2H5z M5 17.5h2.2v2H5z M16.5 14h2.2v2.2h-2.2z M16.5 17.5h2.2v2h-2.2z M11 14h2.4v2.4H11z"/>',
  card: '<path fill-rule="evenodd" d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 7.2l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"/>',
  cards: '<rect x="3.5" y="7" width="12" height="14" rx="2" opacity=".55"/><rect x="8.5" y="3" width="12" height="14" rx="2"/>',
  trade: '<path d="M6 7h10.2l-2.4-2.4 1.4-1.4 5.4 5.4L15.2 14l-1.4-1.4 2.4-2.6H6z M18 17H7.8l2.4 2.4-1.4 1.4-5.4-5.4L8.8 10l1.4 1.4L7.8 14H18z"/>',
  dice: '<path fill-rule="evenodd" d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z M8 6.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z M16 6.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z M12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z M8 14.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z M16 14.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>',
  clover: '<circle cx="7.9" cy="7.9" r="3.6"/><circle cx="16.1" cy="7.9" r="3.6"/><circle cx="7.9" cy="16.1" r="3.6"/><circle cx="16.1" cy="16.1" r="3.6"/><circle cx="12" cy="12" r="2"/>',
  // Karten / Missionen
  sword: '<path d="M21 3v6L11 19l-3-3L18 6z M6.6 16.6 9.6 19.6 7.6 21.6 6.2 20.2 4 22.4 2.6 21 4.8 18.8 3.4 17.4z"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0z M7 4.5H3V6a4 4 0 0 0 4 4V8.4A2.4 2.4 0 0 1 5 6v-.1h2z M17 4.5h4V6a4 4 0 0 1-4 4V8.4A2.4 2.4 0 0 0 19 6v-.1h-2z M11 13h2v4h3.5v2.5h-9V17H11z"/>',
  bulb: '<path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z M9 18.5h6V20a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/>',
  coin: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"/><circle cx="12" cy="12" r="3.2"/>',
  globe: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 3.9a8.1 8.1 0 1 1 0 16.2 8.1 8.1 0 0 1 0-16.2z"/><path fill-rule="evenodd" d="M12 2.6c3 2.6 4.6 6 4.6 9.4s-1.6 6.800-4.600 9.400C9 18.800 7.400 15.400 7.400 12S9 5.200 12 2.600z M12 5.400c-1.500 1.900-2.300 4.100-2.300 6.600s.8 4.700 2.300 6.600c1.500-1.900 2.300-4.100 2.300-6.600S13.500 7.300 12 5.400z"/><rect x="2.5" y="11" width="19" height="2"/>',
  anchor: '<path fill-rule="evenodd" d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/><rect x="11" y="7.5" width="2" height="13"/><rect x="7.5" y="10.5" width="9" height="2"/><path d="M4 13h2.200a5.800 5.800 0 0 0 11.600 0H20a8 8 0 0 1-16 0z"/>',
  compass: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"/><path d="M16 8l-2 6-6 2 2-6z"/>',
  flag: '<path d="M5 21V3h2v2h12l-2.5 4.500L19 14H7v7z"/>',
  hex: '<path d="M12 2l8.700 5v10L12 22l-8.700-5V7z"/>',
  // UI
  menu: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
  chev: '<path d="M6 14.600 12 8.600l6 6-1.400 1.400L12 11.400l-4.600 4.600z"/>',
  close: '<path d="M6 7.400 7.400 6 12 10.600 16.600 6 18 7.400 13.400 12 18 16.600 16.600 18 12 13.400 7.400 18 6 16.600 10.600 12z"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
  minus: '<path d="M5 11h14v2H5z"/>',
  target: '<path d="M11 2h2v5h-2z M11 17h2v5h-2z M2 11h5v2H2z M17 11h5v2h-5z"/><circle cx="12" cy="12" r="3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.400 3.600-7 8-7s8 2.600 8 7z"/>',
};

export const ICON_NAMES = Object.keys(ICONS);

/** Emoji aus Engine-Texten → Icon-Name (für Log, Toasts, Dialoge). */
const EMOJI = {
  '🌲': 'wood', '🧱': 'brick', '🐑': 'sheep', '🌾': 'wheat', '⛰': 'ore', '⛰️': 'ore',
  '🍀': 'clover', '🎖️': 'flag', '🎖': 'flag', '🌍': 'globe', '🛣️': 'road', '🛣': 'road',
  '⚔️': 'sword', '⚔': 'sword', '🌫️': 'cloud', '🌫': 'cloud', '🏆': 'trophy', '🎲': 'dice',
};
const EMOJI_RE = new RegExp(Object.keys(EMOJI).sort((a, b) => b.length - a.length).join('|'), 'g');

export function ic(name, cls = '') {
  if (art.ok && ICON_IMAGE[name]) return `<img class="ic img ${cls}" src="${ICON_IMAGE[name]}" alt="" draggable="false">`;
  return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** Ersetzt bekannte Emoji in (bereits escaptem) Text durch Icons. */
export function iconize(html) {
  return html.replace(EMOJI_RE, (m) => ic(EMOJI[m], 'inline'));
}

export function installIcons() {
  if (document.getElementById('icon-sprite')) return;
  const svg = `<svg id="icon-sprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${
    Object.entries(ICONS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="currentColor">${v}</symbol>`).join('')}</svg>`;
  document.body.insertAdjacentHTML('afterbegin', svg);
}
