import { Game } from '../public/js/engine/game.js';
import { botAct, botEvaluateOffer } from '../public/js/engine/bot.js';
import { makeRng } from '../public/js/engine/rng.js';

/** Löst ein Bot-Angebot unter den anderen Bots auf (wie der Browser-Controller). */
export function resolveOffer(g, pi, offer) {
  for (const o of g.s.players) {
    if (o.id === pi) continue;
    const ev = botEvaluateOffer(g, o.id, pi, offer.give, offer.get);
    if (ev.accept && g.tradeWith(pi, o.id, offer.give, offer.get).ok) return true;
  }
  return false;
}

/** Lässt alle Spieler (auch Spieler 0) als Bots spielen, bis jemand gewinnt. */
export function runBotGame(settings = {}, seed = 1, maxSteps = 60000) {
  const g = Game.create({ ...settings, seed }, makeRng(seed));
  for (const p of g.s.players) p.isBot = true;
  let steps = 0;
  while (g.s.phase !== 'over' && steps++ < maxSteps) {
    const actors = g.pendingActors();
    if (!actors.length) throw new Error('Kein Akteur – Spiel hängt');
    const pi = actors[0];
    const r = botAct(g, pi);
    if (r.end) continue;
    if (r.offer) { resolveOffer(g, pi, r.offer); continue; }
    if (r.wait) throw new Error(`Bot ${pi} wartet, obwohl er handeln müsste (phase=${g.s.phase}, sub=${g.s.sub})`);
  }
  return { g, steps };
}
