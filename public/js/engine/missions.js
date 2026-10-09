// Öffentliche Missionen: Wer die Bedingung zuerst erfüllt, erhält 1 zusätzlichen Siegpunkt.

import { RES } from './constants.js';

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

export const MISSION_POOL = [
  {
    id: 'harbor', name: 'Hafenmeister', icon: '⚓', max: 2,
    desc: 'Besitze Siedlungen an 2 verschiedenen Häfen.',
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
    id: 'explorer', name: 'Entdecker', icon: '🧭', max: 5,
    desc: 'Besitze Gebäude an allen 5 Rohstoffarten.',
    progress(g, pi) {
      const types = new Set(adjacentHexes(g, pi).map((h) => h.type));
      return RES.filter((r) => types.has(r)).length;
    },
  },
  {
    id: 'citybuilder', name: 'Städtebauer', icon: '🏰', max: 3,
    desc: 'Errichte 3 Städte.',
    progress: (g, pi) => myBuildings(g, pi).filter((b) => b.type === 'city').length,
  },
  {
    id: 'roads', name: 'Wegbereiter', icon: '🛣️', max: 8,
    desc: 'Besitze 8 Straßen.',
    progress: (g, pi) => Object.values(g.s.roads).filter((o) => o === pi).length,
  },
  {
    id: 'expansion', name: 'Expansion', icon: '🏘️', max: 6,
    desc: 'Besitze 6 Gebäude (Siedlungen + Städte).',
    progress: (g, pi) => myBuildings(g, pi).length,
  },
  {
    id: 'knights', name: 'Ritterschlag', icon: '⚔️', max: 2,
    desc: 'Spiele 2 Ritterkarten aus.',
    progress: (g, pi) => g.s.players[pi].playedKnights,
  },
  {
    id: 'trader', name: 'Handelsmann', icon: '⚖️', max: 3,
    desc: 'Tausche 3-mal mit der Bank oder einem Hafen.',
    progress: (g, pi) => g.s.players[pi].bankTrades,
  },
  {
    id: 'lucky', name: 'Glückspilz', icon: '🎯', max: 2,
    desc: 'Besitze Gebäude an einem 6er- und einem 8er-Feld.',
    progress(g, pi) {
      const hs = adjacentHexes(g, pi);
      return (hs.some((h) => h.num === 6) ? 1 : 0) + (hs.some((h) => h.num === 8) ? 1 : 0);
    },
  },
  {
    id: 'cards', name: 'Kartenhai', icon: '🃏', max: 3,
    desc: 'Kaufe 3 Entwicklungskarten.',
    progress: (g, pi) => g.s.players[pi].devBought,
  },
];

export function missionById(id) {
  return MISSION_POOL.find((m) => m.id === id);
}
