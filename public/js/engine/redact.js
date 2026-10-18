// Spielzustand für einen bestimmten Platz: fremde Handkarten, Entwicklungskarten und der Kartenstapel bleiben geheim,
// nur die Anzahl ist sichtbar. Wird verwendet, wenn Mitspieler am Handy mitspielen (der Gastgeber hält den vollständigen Zustand).
import { RES } from './constants.js';

/** Tiefe Kopie des Zustands aus Sicht von `seat` (-1 = Zuschauer, sieht nichts Verdecktes). Nach Spielende wird alles aufgedeckt. */
export function redactFor(state, seat) {
  const s = JSON.parse(JSON.stringify(state));
  if (s.phase === 'over') return s;
  for (const p of s.players) {
    if (p.id === seat) continue;
    const n = RES.reduce((a, r) => a + (p.hand[r] || 0), 0);
    p.hand = Object.fromEntries(RES.map((r, i) => [r, i === 0 ? n : 0])); // nur die Zahl bleibt erhalten
    p.dev = p.dev.map((c) => ({ type: 'hidden', turn: c.turn }));
  }
  s.devDeck = s.devDeck.map(() => 'hidden');
  s.botMemory = {};
  delete s.settings.seed;
  return s;
}
