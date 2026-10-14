// Gemeinsame Konstanten für Engine und UI.

export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export const RES_INFO = {
  wood: { name: 'Holz', icon: '🌲', terrain: 'Wald', color: '#3d8b5f' },
  brick: { name: 'Lehm', icon: '🧱', terrain: 'Hügelland', color: '#c4673f' },
  sheep: { name: 'Wolle', icon: '🐑', terrain: 'Weideland', color: '#7fb069' },
  wheat: { name: 'Getreide', icon: '🌾', terrain: 'Ackerland', color: '#d9a93a' },
  ore: { name: 'Erz', icon: '⛰️', terrain: 'Gebirge', color: '#7d8aa5' },
};

export const COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devcard: { sheep: 1, wheat: 1, ore: 1 },
};

// Spielfeldgrößen. `radius` = Anzahl der Hex-Ringe um die Mitte.
export const SIZES = {
  small: {
    id: 'small', label: 'Klein', radius: 2, hexes: 19, maxPlayers: 4,
    sizeBonus: 0, factor: 1, desc: '19 Felder · klassisch',
  },
  large: {
    id: 'large', label: 'Groß', radius: 3, hexes: 37, maxPlayers: 6,
    sizeBonus: 2, factor: 2, desc: '37 Felder · lange Partie',
  },
  huge: {
    id: 'huge', label: 'Riesig', radius: 4, hexes: 61, maxPlayers: 6,
    sizeBonus: 4, factor: 3, desc: '61 Felder · Epos',
  },
};

// Wahrscheinlichkeitspunkte ("Pips") pro Würfelsumme.
export const PIP = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const DEV_INFO = {
  knight: { name: 'Ritter', icon: 'sword', desc: 'Versetze den Räuber und stiehl eine Karte. 3 Ritter = Größte Rittermacht (2 Siegpunkte).' },
  victory: { name: 'Siegpunkt', icon: 'trophy', desc: 'Zählt automatisch 1 Siegpunkt und bleibt verdeckt.' },
  roadbuilding: { name: 'Straßenbau', icon: 'road', desc: 'Baue sofort 2 Straßen kostenlos.' },
  plenty: { name: 'Erfindung', icon: 'bulb', desc: 'Nimm dir 2 beliebige Rohstoffe aus der Bank.' },
  monopoly: { name: 'Monopol', icon: 'coin', desc: 'Nenne einen Rohstoff – alle Gegner geben dir alle Karten dieser Sorte.' },
  harvest: { name: 'Ernte', icon: 'wheat', desc: 'Wähle eines deiner Felder mit Siedlung oder Stadt und erhalte sofort dessen Ertrag (Stadt = doppelt).' },
  remap: { name: 'Weltenwandel', icon: 'globe', desc: 'Alle Landfelder werden zufällig neu verteilt. Siedlungen und Straßen bleiben stehen.' },
};

export const PLAYER_COLORS = [
  { id: 'red', hex: '#e5484d', name: 'Rot' },
  { id: 'blue', hex: '#4c8dff', name: 'Blau' },
  { id: 'orange', hex: '#ff8a3d', name: 'Orange' },
  { id: 'green', hex: '#3fbf7f', name: 'Grün' },
  { id: 'violet', hex: '#a67cf5', name: 'Violett' },
  { id: 'pink', hex: '#f06ab4', name: 'Pink' },
];

// Computergegner mit Charakter. `trait` beeinflusst die Spielweise (siehe bot.js).
export const BOT_ROSTER = [
  { id: 'fritz', name: 'Fritz', trait: 'expander', tagline: 'Expandiert aggressiv', face: { portrait: 'fritz', skin: '#f1c7a1', hair: 'short', hairColor: '#8a4b25', acc: 'none', mouth: 'grin' } },
  { id: 'greta', name: 'Greta', trait: 'trader', tagline: 'Handelt oft fair', face: { portrait: 'greta', skin: '#f5d2b3', hair: 'long', hairColor: '#d9a441', acc: 'none', mouth: 'smile' } },
  { id: 'otto', name: 'Otto', trait: 'builder', tagline: 'Baut schnell Straßen', face: { portrait: 'otto', skin: '#e0ac85', hair: 'cap', hairColor: '#3b6ea5', acc: 'beard', mouth: 'flat' } },
  { id: 'mira', name: 'Mira', trait: 'strategist', tagline: 'Spart auf Städte', face: { portrait: 'mira', skin: '#c98f65', hair: 'bun', hairColor: '#2a1b16', acc: 'glasses', mouth: 'smile' } },
  { id: 'lea', name: 'Lea', trait: 'knight', tagline: 'Liebt Ritterkarten', face: { portrait: 'lea', skin: '#f6d9c3', hair: 'curly', hairColor: '#b5381f', acc: 'headband', mouth: 'grin' } },
  { id: 'amir', name: 'Amir', trait: 'gambler', tagline: 'Zieht gern Entwicklungskarten', face: { portrait: 'amir', skin: '#a8744f', hair: 'short', hairColor: '#18110d', acc: 'none', mouth: 'grin' } },
];

// Auswählbare Avatare für den Menschen
export const HUMAN_FACES = [
  { skin: '#f1c7a1', hair: 'short', hairColor: '#5b3a22', acc: 'none', mouth: 'smile' },
  { skin: '#e0ac85', hair: 'curly', hairColor: '#1d1410', acc: 'glasses', mouth: 'grin' },
  { skin: '#f6d9c3', hair: 'long', hairColor: '#c0392b', acc: 'none', mouth: 'smile' },
  { skin: '#c98f65', hair: 'bun', hairColor: '#2a1b16', acc: 'none', mouth: 'smile' },
  { skin: '#a8744f', hair: 'cap', hairColor: '#7a2f2f', acc: 'beard', mouth: 'flat' },
  { skin: '#f5d2b3', hair: 'bald', hairColor: '#000', acc: 'beard', mouth: 'grin' },
  { skin: '#e8b98f', hair: 'long', hairColor: '#2b1d14', acc: 'headband', mouth: 'smile' },
  { skin: '#8d5a3b', hair: 'short', hairColor: '#0f0a07', acc: 'glasses', mouth: 'smile' },
];

export const DEFAULT_SETTINGS = {
  playerName: 'Du',
  avatar: 0,
  avatarPortrait: null, // BOT_ROSTER-ID: der Mensch spielt mit einem der Bot-Gesichter (dieser Bot ist dann nicht dabei)
  botIds: null, // Liste von BOT_ROSTER-IDs oder null = die ersten N
  bots: 3,
  difficulty: 'normal', // easy | normal | hard (Vorgabe für alle Bots)
  botDifficulty: {}, // BOT_ROSTER-ID → easy | normal | hard (überschreibt die Vorgabe für einzelne Bots)
  size: 'small',
  variant: 'classic', // classic | fog
  targetVP: 10,
  antiBad: true,
  missions: true,
  remapCard: true,
  harvestCard: true,
  goldField: true, // Feld mit freier Rohstoffwahl
};

/** Spielpläne der Bots (siehe bot.js). */
export const STRATEGY_LABEL = { expand: 'Expansion', cities: 'Städtebau', harbor: 'Hafenhandel', army: 'Rittermacht' };
