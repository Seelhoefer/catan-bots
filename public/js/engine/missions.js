// Öffentliche Missionskarten: Wer die Bedingung zuerst erfüllt, erhält 1 zusätzlichen Siegpunkt.
// Die Zielwerte wachsen mit der Inselgröße; `max` und `desc` sind Funktionen des Spiels (g = null: Standardwerte der kleinen Insel).

import { RES, SIZES } from './constants.js';

function myBuildings(g, pi) {
  const out = [];
  for (const [vid, b] of Object.entries(g.s.buildings)) {
    if (b.owner === pi) out.push({ vid: Number(vid), type: b.type });
  }
  return out;
}

function adjacentHexes(g, pi) {
  const seen = new Set();
  for (const b of myBuildings(g, pi)) {
    for (const hid of g.s.board.vertices[b.vid].hexes) {
      const h = g.s.board.hexes[hid];
      if (!h.fog) seen.add(h);
    }
  }
  return [...seen];
}

/** Zielwert: `base` auf der kleinen Insel, `step` mehr je Größenstufe (groß, riesig). */
const scaled = (base, step = 1) => (g) => Math.ceil(base + step * ((SIZES[g?.s.settings.size]?.factor || 1) - 1));

const count = (v) => v || 0;

export const MISSION_POOL = [
  {
    id: 'harbor', name: 'Hafenmeister', icon: 'anchor', max: () => 2,
    desc: () => 'Besitze Siedlungen an 2 verschiedenen Häfen.',
    progress(g, pi) {
      const types = new Set();
      for (const b of myBuildings(g, pi)) {
        const p = g.s.board.vertices[b.vid].port;
        if (p) types.add(p);
      }
      return types.size;
    },
  },
  {
    id: 'explorer', name: 'Weltentdecker', icon: 'compass', max: () => 5,
    desc: () => 'Besitze Gebäude an allen 5 Rohstoffarten (Wald, Hügel, Weide, Acker, Gebirge).',
    progress(g, pi) {
      const types = new Set(adjacentHexes(g, pi).map((h) => h.type));
      return RES.filter((r) => types.has(r)).length;
    },
  },
  {
    id: 'citybuilder', name: 'Metropole', icon: 'city', max: scaled(3),
    desc: (n) => `Besitze ${n} Städte.`,
    progress: (g, pi) => myBuildings(g, pi).filter((b) => b.type === 'city').length,
  },
  {
    id: 'roads', name: 'Wegbereiter', icon: 'road', max: scaled(8, 2),
    desc: (n) => `Besitze ${n} Straßen.`,
    progress: (g, pi) => Object.values(g.s.roads).filter((o) => o === pi).length,
  },
  {
    id: 'pathfinder', name: 'Pfadfinder', icon: 'road', max: scaled(4),
    desc: (n) => `Baue eine zusammenhängende Straße aus ${n} Teilen.`,
    progress: (g, pi) => g.longestRoadFor(pi),
  },
  {
    id: 'expansion', name: 'Expansion', icon: 'house', max: scaled(6, 2),
    desc: (n) => `Besitze ${n} Gebäude (Siedlungen und Städte).`,
    progress: (g, pi) => myBuildings(g, pi).length,
  },
  {
    id: 'coast', name: 'Küstenwache', icon: 'anchor', max: scaled(3),
    desc: (n) => `Besitze ${n} Gebäude direkt an der Küste.`,
    progress: (g, pi) => myBuildings(g, pi).filter((b) => g.s.board.vertices[b.vid].hexes.length < 3).length,
  },
  {
    id: 'triple', name: 'Dreiländereck', icon: 'globe', max: () => 3,
    desc: () => 'Besitze ein Gebäude, das an 3 verschiedene Rohstoffarten grenzt.',
    progress(g, pi) {
      let best = 0;
      for (const b of myBuildings(g, pi)) {
        const types = new Set(g.s.board.vertices[b.vid].hexes.map((hid) => g.s.board.hexes[hid]).filter((h) => !h.fog && RES.includes(h.type)).map((h) => h.type));
        best = Math.max(best, types.size);
      }
      return best;
    },
  },
  {
    id: 'mono', name: 'Monokultur', icon: 'wheat', max: () => 3,
    desc: () => 'Besitze Gebäude an 3 Feldern derselben Rohstoffart.',
    progress(g, pi) {
      const per = {};
      for (const h of adjacentHexes(g, pi)) if (RES.includes(h.type)) per[h.type] = (per[h.type] || 0) + 1;
      return Math.max(0, ...Object.values(per));
    },
  },
  {
    id: 'lucky', name: 'Glückspilz', icon: 'dice', max: () => 2,
    desc: () => 'Besitze Gebäude an einem 6er- und einem 8er-Feld.',
    progress(g, pi) {
      const hs = adjacentHexes(g, pi);
      return (hs.some((h) => h.num === 6) ? 1 : 0) + (hs.some((h) => h.num === 8) ? 1 : 0);
    },
  },
  {
    id: 'knights', name: 'Ritterschlag', icon: 'sword', max: scaled(2, 0.5),
    desc: (n) => `Spiele ${n} Ritterkarten aus.`,
    progress: (g, pi) => g.s.players[pi].playedKnights,
  },
  {
    id: 'trader', name: 'Handelsmann', icon: 'trade', max: scaled(3),
    desc: (n) => `Tausche ${n}-mal mit der Bank oder einem Hafen.`,
    progress: (g, pi) => count(g.s.players[pi].bankTrades),
  },
  {
    id: 'diplomat', name: 'Diplomat', icon: 'user', max: scaled(3),
    desc: (n) => `Schließe ${n} Tauschgeschäfte mit Mitspielern ab.`,
    progress: (g, pi) => count(g.s.players[pi].playerTrades),
  },
  {
    id: 'cards', name: 'Kartenhai', icon: 'card', max: scaled(3),
    desc: (n) => `Kaufe ${n} Entwicklungskarten.`,
    progress: (g, pi) => count(g.s.players[pi].devBought),
  },
  {
    id: 'actor', name: 'Aktionsheld', icon: 'scroll', max: scaled(3),
    desc: (n) => `Spiele ${n} Entwicklungs- oder Ereigniskarten aus.`,
    progress: (g, pi) => count(g.s.players[pi].devPlayed),
  },
  {
    id: 'pickpocket', name: 'Taschendieb', icon: 'mask', max: () => 2,
    desc: () => 'Stiehl 2 Karten mit dem Räuber.',
    progress: (g, pi) => count(g.s.players[pi].steals),
  },
  {
    id: 'haul', name: 'Goldregen', icon: 'coin', max: scaled(4),
    desc: (n) => `Erhalte mit einem einzigen Wurf ${n} Karten.`,
    progress: (g, pi) => count(g.s.players[pi].bestHaul),
  },
  {
    id: 'hoard', name: 'Hamsterer', icon: 'cards', max: scaled(8),
    desc: (n) => `Halte gleichzeitig ${n} Rohstoffkarten auf der Hand (Vorsicht bei der 7!).`,
    progress: (g, pi) => g.handCount(pi),
  },
  {
    id: 'variety', name: 'Vielfalt', icon: 'clover', max: () => 5,
    desc: () => 'Halte gleichzeitig von jedem der 5 Rohstoffe mindestens eine Karte.',
    progress: (g, pi) => RES.filter((r) => g.s.players[pi].hand[r] > 0).length,
  },
];

export const missionById = (id) => MISSION_POOL.find((m) => m.id === id);
export const missionMax = (m, g) => m.max(g);
export const missionDesc = (m, g = null) => m.desc(m.max(g));
