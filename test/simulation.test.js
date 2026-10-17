import test from 'node:test';
import assert from 'node:assert/strict';
import { runBotGame } from './helpers.js';

const configs = [
  { size: 'small', variant: 'classic', bots: 3, targetVP: 10 },
  { size: 'small', variant: 'fog', bots: 3, targetVP: 10, difficulty: 'hard' },
  { size: 'small', variant: 'classic', bots: 1, targetVP: 8, difficulty: 'easy' },
  { size: 'large', variant: 'fog', bots: 4, targetVP: 12 },
  { size: 'huge', variant: 'classic', bots: 5, targetVP: 15 },
  { size: 'huge', variant: 'classic', bots: 3, targetVP: 50 },
  { size: 'small', variant: 'classic', bots: 3, targetVP: 10, antiBad: false, missions: false, remapCard: false },
];

for (const [i, cfg] of configs.entries()) {
  test(`Bot-Partie ${i + 1} (${cfg.size}/${cfg.variant}/${cfg.bots + 1} Spieler) endet mit Sieger`, () => {
    for (const seed of [11, 22, 33]) {
      const { g, steps } = runBotGame(cfg, seed);
      assert.equal(g.s.phase, 'over', `Seed ${seed}: Spiel nicht beendet nach ${steps} Schritten (Zug ${g.s.turnNumber})`);
      assert.ok(g.vp(g.s.winner) >= cfg.targetVP || g.s.stalemate, `Seed ${seed}: Sieger ohne Ziel und ohne Patt`);
      // Bank-Invariante: Rohstoffe bleiben erhalten
      const factor = { small: 1, large: 2, huge: 3 }[cfg.size];
      for (const r of ['wood', 'brick', 'sheep', 'wheat', 'ore']) {
        const inHands = g.s.players.reduce((a, p) => a + p.hand[r], 0);
        assert.equal(inHands + g.s.bank[r], 19 * factor, `Rohstoff ${r} (Seed ${seed}) nicht erhalten`);
      }
    }
  });
}
