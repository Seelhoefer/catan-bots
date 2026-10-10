// Illustrierte Grafiken (Community Asset Pack): Pfade, Maße und Vorladen.
// Fällt etwas aus, bleibt `art.ok` false und die UI nutzt die flachen Vektor-Icons.
import { PLAYER_COLORS } from '../engine/constants.js';

export const art = { ok: false };

const BASE = 'assets/illustrated/';
export const COLOR_ID = Object.fromEntries(PLAYER_COLORS.map((c) => [c.hex, c.id]));

export const piece = (colorId, kind) => `${BASE}pieces/${colorId}-${kind}.webp`;
export const cardImgSrc = (type) => `assets/cards/${type}.webp`;
export const IMG = {
  oceanMinimal: `${BASE}ocean-minimal.webp`,
  thief: `${BASE}thief.webp`,
  trophy: `${BASE}trophy.webp`,
  harbor: `${BASE}special/harbor-3to1.webp`,
  desert: `${BASE}desert.webp`,
  choice: `${BASE}special/resource-choice.svg`,
  wild: `${BASE}special/wild-terrain.svg`,
  ship: `${BASE}special/ship.webp`,
};

// ------------------------------------------------------------------ Grafikstile
// new = illustrierte Motive (SVG-Paket, als WebP extrahiert), vector = reine Pfad-SVGs, classic = erster Illustrations-Satz.
const harborName = (t) => (t === 'any' ? 'harbor-3to1' : `${t}-2to1`);
export const ART_STYLES = {
  new: {
    label: 'Illustriert',
    res: (r) => `assets/art-v2/resources/${r}.webp`,
    harbor: (t) => `assets/art-v2/harbors/${harborName(t)}.webp`,
    fog: 'assets/art-v2/fog/fog-hex.webp',
    tile: (t) => `assets/hexbg/${t}.webp`, // komplette Feld-Hintergründe (Zahl liegt mittig darauf, keine Icons nötig)
  },
  vector: {
    label: 'Vektor',
    res: (r) => `assets/vector-svg/resources/${r}.svg`,
    harbor: (t) => `assets/vector-svg/harbors/${harborName(t)}.svg`,
    fog: 'assets/vector-svg/fog/fog-hex.svg',
    tile: null,
  },
  classic: {
    label: 'Klassisch',
    res: (r) => `${BASE}resources/${r}.webp`,
    harbor: (t) => (t === 'any' ? IMG.harbor : null), // 2:1-Häfen setzt das Brett aus Rohstoffbild + Schrift zusammen
    fog: null,
    tile: null,
  },
};
const STYLE_KEY = 'catan-art';
let styleId = 'new';
try { const saved = localStorage.getItem(STYLE_KEY); if (ART_STYLES[saved]) styleId = saved; } catch { /* egal */ }

export const artStyle = () => styleId;
export const resImg = (r) => ART_STYLES[styleId].res(r);
/** Hafen-Medaillon als fertiges Bild (null = selbst zusammensetzen). */
export const harborImg = (type) => ART_STYLES[styleId].harbor(type);
/** Nebelkachel als Bild über dem Sechseck (null = Platzhalter-Symbol). */
export const fogImg = () => ART_STYLES[styleId].fog;
/** Komplettes Feld-Hintergrundbild (null = Farbverlauf + Rohstoff-Icon). */
export const tileImg = (type) => (ART_STYLES[styleId].tile ? ART_STYLES[styleId].tile(type) : null);

/** Bilder, die an Stelle flacher Sprite-Icons verwendet werden, sobald `art.ok` gilt. */
export const ICON_IMAGE = {};
function syncIcons() {
  for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) ICON_IMAGE[r] = resImg(r);
  ICON_IMAGE.clover = IMG.choice;
  ICON_IMAGE.trophy = IMG.trophy;
}
syncIcons();

const styleList = (id) => {
  const st = ART_STYLES[id];
  return [
    ...['wood', 'brick', 'sheep', 'wheat', 'ore'].map(st.res),
    ...['any', 'wood', 'brick', 'sheep', 'wheat', 'ore'].map(st.harbor).filter(Boolean),
    ...(st.fog ? [st.fog] : []),
    ...(st.tile ? ['wood', 'brick', 'sheep', 'wheat', 'ore', 'desert', 'gold'].map(st.tile) : []),
  ];
};

/** Grafikstil wechseln (lädt die Bilder vor; bei Fehlern bleibt der alte Stil). Gibt true zurück, wenn gewechselt wurde. */
export async function setArtStyle(id) {
  if (!ART_STYLES[id]) return false;
  const ok = (await Promise.all(styleList(id).map(load))).every(Boolean);
  if (!ok) return false;
  styleId = id;
  syncIcons();
  try { localStorage.setItem(STYLE_KEY, id); } catch { /* egal */ }
  return true;
}

// Sichtbarer Inhalt (Bildbereich ohne transparenten Rand), in Bildpixeln – für die Platzierung auf dem Brett.
export const PIECE_BOX = {
  // w/h = Bildgröße, l/r = sichtbarer Inhalt waagerecht, b = unterste sichtbare Zeile, target = Breite des Inhalts auf dem Brett (Kante = 1)
  settlement: { w: 256, h: 256, l: 8, r: 248, b: 252, target: 0.96 },
  city: { w: 256, h: 256, l: 12, r: 244, b: 252, target: 1.2 },
};
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
    ...PLAYER_COLORS.flatMap((c) => ['settlement', 'city'].map((k) => piece(c.id, k))),
    ...styleList(styleId),
    IMG.thief, IMG.trophy, IMG.harbor, IMG.choice, IMG.wild, IMG.desert,
  ];
  const results = await Promise.all(list.map(load));
  art.ok = results.every(Boolean);
  // Karten im Hintergrund nachladen (nicht kritisch)
  ['knight', 'victory', 'roadbuilding', 'plenty', 'monopoly', 'harvest', 'remap'].forEach((t) => load(cardImgSrc(t)));
  return art.ok;
}
