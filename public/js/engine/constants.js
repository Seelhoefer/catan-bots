// Gemeinsame Konstanten für Engine und UI.

export const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];

export const RES_INFO = {
  wood: { name: 'Holz', icon: '🌲', terrain: 'Wald', color: '#2f8f5b' },
  brick: { name: 'Lehm', icon: '🧱', terrain: 'Hügelland', color: '#d1683f' },
  sheep: { name: 'Wolle', icon: '🐑', terrain: 'Weideland', color: '#9fd98b' },
  wheat: { name: 'Getreide', icon: '🌾', terrain: 'Ackerland', color: '#f0c648' },
  ore: { name: 'Erz', icon: '⛰️', terrain: 'Gebirge', color: '#8c9bb3' },
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
  knight: { name: 'Ritter', icon: '⚔️', desc: 'Versetze den Räuber und stiehl eine Karte. 3 Ritter = Größte Rittermacht (2 Siegpunkte).' },
  victory: { name: 'Siegpunkt', icon: '🏆', desc: 'Zählt automatisch 1 Siegpunkt und bleibt verdeckt.' },
  roadbuilding: { name: 'Straßenbau', icon: '🛣️', desc: 'Baue sofort 2 Straßen kostenlos.' },
  plenty: { name: 'Erfindung', icon: '💡', desc: 'Nimm dir 2 beliebige Rohstoffe aus der Bank.' },
  monopoly: { name: 'Monopol', icon: '💰', desc: 'Nenne einen Rohstoff – alle Gegner geben dir alle Karten dieser Sorte.' },
  remap: { name: 'Weltenwandel', icon: '🌍', desc: 'Alle Landfelder werden zufällig neu verteilt. Siedlungen und Straßen bleiben stehen.' },
};

export const PLAYER_COLORS = [
  { id: 'red', hex: '#ef4444', name: 'Rot' },
  { id: 'blue', hex: '#3b82f6', name: 'Blau' },
  { id: 'amber', hex: '#f59e0b', name: 'Gelb' },
  { id: 'green', hex: '#22c55e', name: 'Grün' },
  { id: 'purple', hex: '#a855f7', name: 'Lila' },
  { id: 'pink', hex: '#ec4899', name: 'Pink' },
];

export const BOT_NAMES = ['Fritz', 'Greta', 'Otto', 'Liesl', 'Hans', 'Mia'];

export const DEFAULT_SETTINGS = {
  playerName: 'Du',
  bots: 3,
  difficulty: 'normal', // easy | normal | hard
  size: 'small',
  variant: 'classic', // classic | fog
  targetVP: 10,
  antiBad: true,
  missions: true,
  remapCard: true,
};
