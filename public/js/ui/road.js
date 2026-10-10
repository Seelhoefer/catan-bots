// Straßen als reine Vektorformen (Draufsicht): flache, leicht abgerundete Holzmarker ohne Bildassets.
// Eine Straße liegt mittig auf einer Hex-Kante; die Kantenlänge entspricht 1 Brett-Einheit.
import { PLAYER_COLORS } from '../engine/constants.js';

/** Voreinstellungen in Brett-Einheiten: Eckpunkt zu Eckpunkt (leichte Überlappung), damit Straßen einander und die Gebäude berühren. */
export const ROAD_DEFAULTS = { length: 1.04, width: 0.15 };

/** Drehwinkel (Grad) der drei möglichen Ausrichtungen auf einem Hex-Feld mit Spitze nach oben. */
export const ROAD_ANGLE = { vertical: 90, 'diagonal-down': 30, 'diagonal-up': -30 };

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
/** Mischt `hex` mit Weiß (t > 0) oder Schwarz (t < 0). */
function shade(hex, t) {
  const target = t > 0 ? 255 : 0;
  return rgbToHex(hexToRgb(hex).map((v) => v + (target - v) * Math.abs(t)));
}

/** Farbpalette pro Spielerfarbe: Licht, Basis, Schatten und Maserung. */
export const ROAD_PALETTE = Object.fromEntries(PLAYER_COLORS.map((c) => [c.id, {
  light: shade(c.hex, 0.22), base: c.hex, dark: shade(c.hex, -0.2), grain: shade(c.hex, -0.38),
}]));
const hexToId = Object.fromEntries(PLAYER_COLORS.map((c) => [c.hex, c.id]));
const paletteOf = (color) => ROAD_PALETTE[color] || ROAD_PALETTE[hexToId[color]] || ROAD_PALETTE.blue;
const idOf = (color) => (ROAD_PALETTE[color] ? color : hexToId[color] || 'blue');

/** `<linearGradient>`-Definitionen (einmal ins <defs> des Bretts). */
/** `ns` trennt die IDs, falls dieselben Verläufe in mehreren <svg> desselben Dokuments stehen. */
export function roadDefs(ns = 'rd') {
  return PLAYER_COLORS.map((c) => {
    const p = ROAD_PALETTE[c.id];
    return `<linearGradient id="${ns}-${c.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.light}"/><stop offset=".55" stop-color="${p.base}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient>`;
  }).join('');
}

/** Drehwinkel der Kante a→b, auf (-90°, 90°] normalisiert. */
export function edgeAngle(a, b) {
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  while (ang > 90) ang -= 180;
  while (ang <= -90) ang += 180;
  return ang;
}

export function edgeOrientation(a, b) {
  const ang = edgeAngle(a, b);
  if (Math.abs(ang) > 60) return 'vertical';
  return ang < 0 ? 'diagonal-up' : 'diagonal-down';
}

/**
 * Zeichnet eine Straße als SVG-Gruppe, zentriert auf (x, y).
 * @param {{x:number,y:number,orientation?:'vertical'|'diagonal-down'|'diagonal-up',angle?:number,color:string,length?:number,width?:number,cls?:string,ns?:string}} o
 *   `color` = Farb-ID (red, blue …) oder Hex-Wert; `angle` überschreibt `orientation` (Grad).
 */
export function drawRoad(o) {
  const length = o.length ?? ROAD_DEFAULTS.length;
  const width = o.width ?? ROAD_DEFAULTS.width;
  const angle = o.angle ?? ROAD_ANGLE[o.orientation || 'vertical'];
  const id = idOf(o.color);
  const p = paletteOf(o.color);
  const l = length / 2;
  const w = width / 2;
  const rx = w * 0.9;
  // Maserung: zwei feine, leicht versetzte Linien entlang der Länge
  const grain = [-0.28, 0.2].map((k, i) => `<path d="M${(-l * (0.78 - i * 0.12)).toFixed(3)} ${(w * k).toFixed(3)}H${(l * (0.62 + i * 0.2)).toFixed(3)}" stroke="${p.grain}" stroke-opacity=".28" stroke-width="${(width * 0.055).toFixed(3)}" stroke-linecap="round"/>`).join('');
  return `<g class="road-vec${o.cls ? ` ${o.cls}` : ''}" transform="translate(${o.x.toFixed(3)} ${o.y.toFixed(3)}) rotate(${angle.toFixed(2)})">
    <rect x="${-l}" y="${-w}" width="${length}" height="${width}" rx="${rx.toFixed(3)}" fill="url(#${o.ns || 'rd'}-${id})" stroke="${p.dark}" stroke-opacity=".55" stroke-width="${(width * 0.035).toFixed(3)}"/>
    ${grain}
    <path d="M${(-l + rx).toFixed(3)} ${(-w * 0.55).toFixed(3)}H${(l - rx).toFixed(3)}" stroke="#fff" stroke-opacity=".28" stroke-width="${(width * 0.07).toFixed(3)}" stroke-linecap="round"/>
  </g>`;
}

/** Straße auf der Kante a→b (Eckpunkte mit x/y). */
export function roadOnEdge(a, b, color, cls = '', ns = 'rd') {
  return drawRoad({
    x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: edgeAngle(a, b), color, cls, ns,
  });
}

/** Kleines Straßen-Symbol für die Aktionsleiste (eigenständiges <svg>). */
export function roadIconSVG(color) {
  const id = idOf(color);
  return `<svg class="tool-piece road-icon" viewBox="-0.4 -0.24 0.8 0.48" aria-hidden="true"><defs>${roadDefs('ri').match(new RegExp(`<linearGradient id="ri-${id}".*?</linearGradient>`))[0]}</defs>${drawRoad({ x: 0, y: 0, angle: -24, color: id, length: 0.62, width: 0.2, ns: 'ri' })}</svg>`;
}
