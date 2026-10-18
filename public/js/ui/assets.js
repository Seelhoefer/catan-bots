// Illustrierte Grafiken (Community Asset Pack): Pfade, Maße und Vorladen.
// Fällt etwas aus, bleibt `art.ok` false und die UI nutzt die flachen Vektor-Icons.
import { PLAYER_COLORS } from '../engine/constants.js';

export const art = { ok: false };

const BASE = 'assets/illustrated/';
export const COLOR_ID = Object.fromEntries(PLAYER_COLORS.map((c) => [c.hex, c.id]));

const MOBILE = 'assets/mobile/';
/** Web-Set (Illustriert): neue Felder, Häfen, Siedlungen/Städte in allen sechs Spielerfarben, Entwicklungskarten, Rohstoffkarten. */
const WEB = 'assets/web/';
const WEB_CARDS = new Set(['knight', 'victory', 'roadbuilding', 'plenty', 'monopoly', 'shield', 'blessing', 'fair', 'exile', 'birthday']);
const WEB_MISSIONS = new Set(['explorer', 'citybuilder', 'haul']);
/** Neue Ereigniskarten im Mobil-Set (die anderen Karten bleiben wie sie sind). */
const MOBILE_CARDS = new Set(['shield', 'blessing', 'fair', 'exile', 'birthday']);

export const piece = (colorId, kind) => (styleId === 'mobile' ? `${MOBILE}pieces/${colorId}-${kind}.webp` : styleId === 'new' ? `${WEB}pieces/${colorId}-${kind}.webp` : `${BASE}pieces/${colorId}-${kind}.webp`);
export const cardImgSrc = (type) => (styleId === 'mobile' && MOBILE_CARDS.has(type) ? `${MOBILE}cards/${type}.webp` : styleId === 'new' && WEB_CARDS.has(type) ? `${WEB}cards/${type}.webp` : `assets/cards/${type}.webp`);
/** Rohstoffkarte (Mobil-Set) für die Hand am Handy. */
export const resCardImg = (res) => `${MOBILE}cards/res-${res}.webp`;
/** Missionskarte (Mobil-Set); Missionen ohne eigenes Bild bekommen die allgemeine „Mission“-Karte. */
/** Missionskarte als Bild (null = keine vorhanden, dann nur Hinweis-Toast). */
export const missionCardImg = (id) => (styleId === 'new' ? (WEB_MISSIONS.has(id) ? `${WEB}missions/${id}.webp` : null) : missionCardImgMobile(id));
const missionCardImgMobile = (id) => `${MOBILE}missions/${{ explorer: 'weltentdecker', citybuilder: 'metropole', haul: 'goldregen' }[id] || 'mission'}.webp`;
export const IMG = {
  oceanMinimal: `${BASE}ocean-minimal.webp`,
  get thief() { return styleId === 'mobile' ? `${MOBILE}robber/robber.webp` : `${BASE}thief.webp`; },
  trophy: `${BASE}trophy.webp`,
  harbor: `${BASE}special/harbor-3to1.webp`,
  desert: `${BASE}desert.webp`,
  choice: `${BASE}special/resource-choice.svg`,
  wild: `${BASE}special/wild-terrain.svg`,
  ship: `${BASE}special/ship.webp`,
  hammer: `${BASE}special/build-hammer.webp`,
  scale: `${BASE}special/trade-scale.webp`,
};

// ------------------------------------------------------------------ Grafikstile
// new = illustrierte Motive (SVG-Paket, als WebP extrahiert), vector = reine Pfad-SVGs, classic = erster Illustrations-Satz.
const harborName = (t) => (t === 'any' ? 'harbor-3to1' : `${t}-2to1`);
/** Handy-Ansicht (Touch oder schmaler Bildschirm). */
export const compactView = () => { try { return window.matchMedia('(hover: none) and (pointer: coarse), (max-width: 860px)').matches; } catch { return false; } };
export const ART_STYLES = {
  mobile: {
    label: 'Mobil-Set',
    res: (r) => `assets/art-v2/resources/${r}.webp`,
    harbor: (t) => `assets/art-v2/harbors/${harborName(t)}.webp`,
    fog: 'assets/art-v2/fog/fog-hex.webp',
    tile: (t) => `${MOBILE}tiles/${t}.webp`, // neue Feld-Kacheln mit Rahmen; die Zahl liegt mittig darauf
    pieces: { settlement: { w: 256, h: 256, l: 22, r: 234, b: 252, target: 0.78 }, city: { w: 256, h: 256, l: 27, r: 229, b: 252, target: 0.92 } },
  },
  new: {
    label: 'Illustriert',
    res: (r) => `assets/art-v2/resources/${r}.webp`,
    harbor: (t) => `${WEB}harbors/${harborName(t)}.webp`,
    world: `${WEB}harbors/world-harbor.webp`,
    fog: 'assets/art-v2/fog/fog-hex.webp',
    tile: (t) => `${WEB}tiles/${t}.webp`, // komplette Feld-Hintergründe (Zahl liegt mittig darauf, keine Icons nötig)
    pieces: { settlement: { w: 256, h: 256, l: 14, r: 226, b: 249, target: 0.88 }, city: { w: 256, h: 256, l: 10, r: 238, b: 249, target: 1.0 } },
  },
  vector: {
    label: 'Vektor',
    res: (r) => `assets/vector-svg/resources/${r}.svg`,
    // Auf dem Handy bleiben die Häfen die normalen illustrierten Hafenkarten; am Desktop die Vektor-Medaillons
    harbor: (t) => (compactView() ? `assets/art-v2/harbors/${harborName(t)}.webp` : `assets/vector-svg/harbors/${harborName(t)}.svg`),
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
// Am Handy gilt standardmäßig das Mobil-Set; die Wahl wird getrennt von der am Desktop gemerkt.
const compactNow = compactView();
const STYLE_KEY = compactNow ? 'catan-art-m' : 'catan-art';
let styleId = compactNow ? 'mobile' : 'new';
try { const saved = localStorage.getItem(STYLE_KEY); if (ART_STYLES[saved] && (compactNow || saved !== 'mobile')) styleId = saved; } catch { /* egal */ }

/** Stil am <html>-Element, damit CSS (Kartenfächer, Kartenrücken) mitzieht. */
function syncArtAttr() { try { document.documentElement.dataset.art = styleId; } catch { /* egal */ } }
syncArtAttr();
export const artStyle = () => styleId;
/** Grafikstile, die in dieser Ansicht wählbar sind (das Mobil-Set nur am Handy). */
export const styleIds = () => Object.keys(ART_STYLES).filter((id) => compactNow || id !== 'mobile');
export const resImg = (r) => ART_STYLES[styleId].res(r);
/** Die ersten illustrierten Rohstoffbilder (Handy-Vektoransicht: groß über den Zahlen). */
export const classicResImg = (r) => `${BASE}resources/${r}.webp`;
/** Hafen-Medaillon als fertiges Bild (null = selbst zusammensetzen). */
export const harborImg = (type) => ART_STYLES[styleId].harbor(type);
/** Welthafen-Marke (Erweiterung): gleicher Stil wie die übrigen Häfen. */
export const worldHarborImg = () => ART_STYLES[styleId].world || 'assets/art-v2/harbors/world-harbor.webp';
/** Nebelkachel als Bild über dem Sechseck (null = Platzhalter-Symbol). */
export const fogImg = () => ART_STYLES[styleId].fog;
/** Komplettes Feld-Hintergrundbild (null = Farbverlauf + Rohstoff-Icon). */
/** Maße der Siedlung/Stadt im aktuellen Stil (sichtbarer Inhalt im Bild, in Bildpixeln). */
export const pieceBox = (kind) => ART_STYLES[styleId].pieces?.[kind] || PIECE_BOX[kind];
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
    ...(id === 'vector' ? ['wood', 'brick', 'sheep', 'wheat', 'ore'].map(classicResImg) : []),
    ...(id === 'vector' ? ['any', 'wood', 'brick', 'sheep', 'wheat', 'ore'].map((t) => `assets/art-v2/harbors/${harborName(t)}.webp`) : []),
    ...(st.fog ? [st.fog] : []),
    ...(st.tile ? ['wood', 'brick', 'sheep', 'wheat', 'ore', 'desert', 'gold'].map(st.tile) : []),
    ...(id === 'new' ? [ART_STYLES.new.world, ...PLAYER_COLORS.flatMap((c) => ['settlement', 'city'].map((k) => `${WEB}pieces/${c.id}-${k}.webp`)),
      ...['wood', 'brick', 'sheep', 'wheat', 'ore'].map((r) => `${WEB}cards/res-${r}.webp`), ...[...WEB_CARDS].map((t) => `${WEB}cards/${t}.webp`), ...[...WEB_MISSIONS].map((t) => `${WEB}missions/${t}.webp`)] : []),
    ...(id === 'mobile' ? [`${MOBILE}robber/robber.webp`, ...PLAYER_COLORS.flatMap((c) => ['settlement', 'city'].map((k) => `${MOBILE}pieces/${c.id}-${k}.webp`)),
      ...['wood', 'brick', 'sheep', 'wheat', 'ore'].map(resCardImg), ...[...MOBILE_CARDS].map((t) => `${MOBILE}cards/${t}.webp`)] : []),
  ];
};

/** Grafikstil wechseln (lädt die Bilder vor; bei Fehlern bleibt der alte Stil). Gibt true zurück, wenn gewechselt wurde. */
export async function setArtStyle(id) {
  if (!ART_STYLES[id]) return false;
  const ok = (await Promise.all(styleList(id).map(load))).every(Boolean);
  if (!ok) return false;
  styleId = id;
  syncArtAttr();
  syncIcons();
  try { localStorage.setItem(STYLE_KEY, id); } catch { /* egal */ }
  return true;
}

// Sichtbarer Inhalt (Bildbereich ohne transparenten Rand), in Bildpixeln – für die Platzierung auf dem Brett.
export const PIECE_BOX = {
  // w/h = Bildgröße, l/r = sichtbarer Inhalt waagerecht, b = unterste sichtbare Zeile, target = Breite des Inhalts auf dem Brett (Kante = 1)
  settlement: { w: 256, h: 256, l: 14, r: 241, b: 252, target: 0.9 },
  city: { w: 256, h: 256, l: 20, r: 236, b: 252, target: 1.05 },
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
    'assets/art-v2/harbors/world-harbor.webp', IMG.thief, IMG.trophy, IMG.hammer, IMG.scale, IMG.harbor, IMG.choice, IMG.wild, IMG.desert,
  ];
  const results = await Promise.all(list.map(load));
  art.ok = results.every(Boolean);
  // Karten im Hintergrund nachladen (nicht kritisch)
  ['knight', 'victory', 'roadbuilding', 'plenty', 'monopoly', 'harvest', 'remap', 'decree', 'shield', 'blessing', 'fair', 'exile', 'birthday'].forEach((t) => load(cardImgSrc(t)));
  return art.ok;
}
