// Illustrierte Grafiken (Community Asset Pack): Pfade, Maße und Vorladen.
// Fällt etwas aus, bleibt `art.ok` false und die UI nutzt die flachen Vektor-Icons.
import { PLAYER_COLORS } from '../engine/constants.js';

export const art = { ok: false };

const BASE = 'assets/illustrated/';
export const COLOR_ID = Object.fromEntries(PLAYER_COLORS.map((c) => [c.hex, c.id]));

export const piece = (colorId, kind) => `${BASE}pieces/${colorId}-${kind}.webp`;
export const resImg = (r) => `${BASE}resources/${r}.webp`;
export const cardImgSrc = (type) => `assets/cards/${type}.webp`;
export const IMG = {
  thief: `${BASE}thief.webp`,
  trophy: `${BASE}trophy.webp`,
  harbor: `${BASE}special/harbor.svg`,
  choice: `${BASE}special/resource-choice.svg`,
  wild: `${BASE}special/wild-terrain.svg`,
  ship: `${BASE}special/ship.svg`,
};

/** Bilder, die an Stelle flacher Sprite-Icons verwendet werden, sobald `art.ok` gilt. */
export const ICON_IMAGE = {
  wood: resImg('wood'),
  brick: resImg('brick'),
  sheep: resImg('sheep'),
  wheat: resImg('wheat'),
  ore: resImg('ore'),
  clover: IMG.choice,
  trophy: IMG.trophy,
};

// Sichtbarer Inhalt (Bildbereich ohne transparenten Rand), in Bildpixeln – für die Platzierung auf dem Brett.
export const PIECE_BOX = {
  settlement: { w: 191, h: 192, l: 14, r: 189, b: 185, target: 0.62 },
  city: { w: 192, h: 192, l: 18, r: 184, b: 179, target: 0.8 },
};
// Die Straße ist ein schräger Balken; Hauptachse im Bild: -25.7° (y nach unten), Länge ≈ 175 px bei 192 px Breite
export const ROAD_BOX = { w: 192, h: 189, axisDeg: -25.7, length: 175, target: 0.78 };

function load(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

export async function preloadArt() {
  const list = [
    ...PLAYER_COLORS.flatMap((c) => ['settlement', 'city', 'road'].map((k) => piece(c.id, k))),
    ...['wood', 'brick', 'sheep', 'wheat', 'ore'].map(resImg),
    IMG.thief, IMG.trophy, IMG.harbor, IMG.choice, IMG.wild,
  ];
  const results = await Promise.all(list.map(load));
  art.ok = results.every(Boolean);
  // Karten im Hintergrund nachladen (nicht kritisch)
  ['knight', 'victory', 'roadbuilding', 'plenty', 'monopoly', 'remap'].forEach((t) => load(cardImgSrc(t)));
  return art.ok;
}
