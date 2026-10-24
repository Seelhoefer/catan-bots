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
  colony: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 1 }, // Kolonie auf einer neuen Insel: Siedlung + Schiff (1 Erz), ohne Straßenanschluss
};

/** Zeitalter (ab 20 Siegpunkten Ziel): so viel Prozent des Ziels muss der Führende erreichen. */
export const ERA_STEPS = [0.25, 0.5, 0.7];
export const ERA_MIN_VP = 20;
export const ERA_INFO = [
  null,
  { name: 'Entdeckung', text: 'Eine neue Insel taucht auf! Kolonien bringen dir jede Runde Gold, ein neuer Hafen wartet.' },
  { name: 'Industrie', text: 'Neue Gebäude (Markt, Werkstatt, Festung), Erfindungen für Gold – und Weltereignisse. Die Bank tauscht für alle nur noch 3:1.' },
  { name: 'Neue Welt', text: 'Eine zweite Insel taucht auf, die Weltereignisse werden häufiger.' },
];

/** Spezialgebäude (ab Zeitalter 2): werden auf eine eigene Stadt gesetzt, je Spieler eines pro Art, je Stadt eines. */
export const SPECIALS = {
  market: { name: 'Markt', icon: 'coin', vp: 1, text: '+1 Siegpunkt · bringt dir zu Beginn jedes eigenen Zuges 1 Gold.' },
  workshop: { name: 'Werkstatt', icon: 'hammer', vp: 1, text: '+1 Siegpunkt · diese Stadt liefert 1 Karte mehr, wenn ihre Zahl fällt.' },
  fortress: { name: 'Festung', icon: 'shield', vp: 1, text: '+1 Siegpunkt · der Räuber darf nicht auf die angrenzenden Felder; schützt vor Piraten.' },
};
COSTS.market = { wood: 1, brick: 1, sheep: 2 };
COSTS.workshop = { wheat: 2, ore: 2, wood: 1 };
COSTS.fortress = { brick: 3, ore: 2 };

/** Erfindungen (ab Zeitalter 2): gegen Gold, einmalig. */
export const TECHS = {
  compass: { name: 'Kompass', gold: 3, icon: 'compass', text: 'Dein Banktausch wird um 1 günstiger (mindestens 2:1).' },
  ironplow: { name: 'Eisenpflug', gold: 4, icon: 'wheat', text: 'Städte kosten dich nur 2 Getreide + 2 Erz.' },
  colonial: { name: 'Kolonialrecht', gold: 4, icon: 'anchor', text: 'Jede deiner Kolonien bringt 1 Gold mehr pro Zug.' },
  scholars: { name: 'Gelehrsamkeit', gold: 7, icon: 'bulb', vp: 1, text: '+1 Siegpunkt.' },
};
export const GOLD_RATE = 2; // 2 Gold = 1 Rohstoff deiner Wahl

/** Weltereignisse (ab Zeitalter 2): dauern eine Runde, Piraten wirken sofort. */
export const WORLD_EVENTS = {
  drought: { name: 'Dürre', icon: 'sun', text: 'Ein Rohstoff bringt diese Runde keinen Ertrag.' },
  bounty: { name: 'Erntesegen', icon: 'wheat', text: 'Jedes getroffene Gebäude bringt diese Runde 1 Karte extra.' },
  boom: { name: 'Handelsboom', icon: 'coin', text: 'Alles Gold wird diese Runde verdoppelt.' },
  pirates: { name: 'Piraten', icon: 'sword', text: 'Spieler mit 8 oder mehr Karten verlieren 2 zufällige – außer mit Festung.' },
};

// Spielfeldgrößen. `radius` = Anzahl der Hex-Ringe um die Mitte.
export const SIZES = {
  small: {
    id: 'small', label: 'Klein', radius: 2, hexes: 19, maxPlayers: 4,
    sizeBonus: 0, factor: 1, startSettlements: 2, desc: '19 Felder · klassisch',
  },
  large: {
    id: 'large', label: 'Groß', radius: 3, hexes: 37, maxPlayers: 6,
    sizeBonus: 2, factor: 2, startSettlements: 2, desc: '37 Felder · lange Partie',
  },
  huge: {
    id: 'huge', label: 'Riesig', radius: 4, hexes: 61, maxPlayers: 6,
    sizeBonus: 4, factor: 3, startSettlements: 3, desc: '61 Felder · 3 Startsiedlungen',
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
  shield: { name: 'Schutzbrief', icon: 'shield', passive: true, event: true, desc: 'Bleibt auf der Hand und wirkt von selbst: Einmal bleibst du vom Dieb verschont – er darf dich nicht bestehlen, oder du musst bei einer 7 nicht abwerfen (was zuerst passiert).' },
  blessing: { name: 'Rückenwind', icon: 'sun', event: true, desc: 'Bei deinem nächsten Wurf bringt jedes deiner Felder, das getroffen wird, 1 Karte extra.' },
  fair: { name: 'Marktprivileg', icon: 'trade', event: true, desc: 'Bis zum Ende deines Zuges tauschst du mit der Bank jeden Rohstoff 2:1.' },
  exile: { name: 'Dieb vertreiben', icon: 'exit', event: true, desc: 'Der Räuber wird sofort in die Wüste verbannt – ohne dass jemand bestohlen wird.' },
  birthday: { name: 'Geburtstag', icon: 'gift', event: true, desc: 'Jeder Gegner schenkt dir 1 Karte – die, von der er am meisten hat.' },
  levy: { name: 'Zollhaus', icon: 'scroll', event: true, desc: 'Wähle eine Zahl von 2 bis 12 (außer 7). Bis du wieder am Zug bist, erhältst du jedes Mal, wenn jemand diese Zahl würfelt, 1 Karte von jedem Rohstoff, den der Wurf auf dem Brett einbringt (aus der Bank).' },
  decree: { name: 'Erlass', icon: 'scroll', desc: 'Lege für eine Runde einen Zoll oder eine Strafe auf einen Rohstoff fest. Zoll: Gegner, die ihn würfeln, zahlen dir 1 Karte. Strafe: Gegner erhalten 1 Karte weniger.' },
  remap: { name: 'Weltenwandel', icon: 'globe', desc: 'Alle Landfelder werden zufällig neu verteilt. Siedlungen und Straßen bleiben stehen.' },
};

/** Karten, die nicht ausgespielt werden, sondern von selbst wirken (bleiben auf der Hand). */
/** Reihenfolge der Karten in Fächer und Übersicht. */
export const DEV_ORDER = ['knight', 'roadbuilding', 'plenty', 'monopoly', 'harvest', 'remap', 'decree', 'levy', 'blessing', 'fair', 'exile', 'birthday', 'shield', 'victory'];

export const PASSIVE_CARDS = new Set(['victory', 'shield']);

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
  { id: 'mira', name: 'Mira', trait: 'expander', tagline: 'Expandiert aggressiv', face: { portrait: 'mira', skin: '#d9a47c', hair: 'curly', hairColor: '#6b3a22', acc: 'none', mouth: 'grin' } },
  { id: 'cassian', name: 'Cassian', trait: 'trader', tagline: 'Handelt oft fair', face: { portrait: 'cassian', skin: '#d9a47c', hair: 'short', hairColor: '#2a1b16', acc: 'none', mouth: 'smile' } },
  { id: 'elara', name: 'Elara', trait: 'builder', tagline: 'Baut schnell Straßen', face: { portrait: 'elara', skin: '#f1c7a1', hair: 'bun', hairColor: '#b5541f', acc: 'none', mouth: 'smile' } },
  { id: 'lyra', name: 'Lyra', trait: 'strategist', tagline: 'Spart auf Städte', face: { portrait: 'lyra', skin: '#e0ac85', hair: 'long', hairColor: '#1d1410', acc: 'none', mouth: 'smile' } },
  { id: 'valen', name: 'Valen', trait: 'knight', tagline: 'Liebt Ritterkarten', face: { portrait: 'valen', skin: '#e0ac85', hair: 'short', hairColor: '#6b3a22', acc: 'beard', mouth: 'flat' } },
  { id: 'aurelio', name: 'Aurelio', trait: 'gambler', tagline: 'Zieht gern Entwicklungskarten', face: { portrait: 'aurelio', skin: '#d9a47c', hair: 'short', hairColor: '#2a1b16', acc: 'beard', mouth: 'grin' } },
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
  humans: 1, // Menschen an diesem oder anderen Geräten (Plätze 0 … humans-1); danach folgen die Bots
  humanNames: [], // Namen der Menschen (Platz 0 nimmt playerName)
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
  eventCards: false, // Erweiterung: Ereigniskarten (Schutzbrief, Rückenwind, Marktprivileg, Dieb vertreiben, Geburtstag, Zollhaus)
  worldHarbor: false, // Erweiterung: ein einziger Welthafen, an dem alle Rohstoffe 2:1 getauscht werden
  decreeCard: false, // Erweiterung: Erlass-Karte – Zoll oder Strafe auf einen Rohstoff
  eras: true, // Zeitalter: ab 20 Siegpunkten Ziel erscheinen neue Inseln (Kolonien) und neue Handelsregeln
};

/** Spielpläne der Bots (siehe bot.js). */
export const STRATEGY_LABEL = { expand: 'Expansion', cities: 'Städtebau', harbor: 'Hafenhandel', army: 'Rittermacht' };

/** Obergrenze für das Siegpunktziel. */
export const MAX_TARGET_VP = 100;

/** Grobe Schätzung, bis zu welchem Siegpunktziel eine Partie auf dieser Karte realistisch endet (Bauplätze sind begrenzt). */
export function realisticVP(sizeId, players, eras = false) {
  const size = SIZES[sizeId] || SIZES.small;
  const r = size.radius;
  const sites = (6 * r * r + 12 * r + 6) / 2; // Bauplätze mit Abstandsregel
  const perPlayer = (sites / Math.max(1, players)) * 2 * 0.85; // fast alles zu Städten ausgebaut
  const cap = Math.floor(perPlayer + 4 + (5 * size.factor) / Math.max(1, players));
  if (!eras) return cap;
  return cap + Math.floor((2 * 12 * 1.7) / Math.max(1, players)); // mit Zeitalter: zwei neue Inseln bieten zusätzliche Bauplätze
}
