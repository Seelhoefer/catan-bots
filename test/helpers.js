import { Game } from '../public/js/engine/game.js';
import { botAct, botRespondOffer, botJudgeCounter } from '../public/js/engine/bot.js';
import { makeRng } from '../public/js/engine/rng.js';

/** Löst ein Bot-Angebot über den öffentlichen Markt auf (wie der Browser-Controller). */
export function resolveOffer(g, pi, offer) {
  const created = g.createOffer(pi, offer.give, offer.get);
  if (!created.ok) return false;
  const id = created.offer.id;
  for (const o of g.s.players) {
    if (o.id === pi) continue;
    if (!g.offerById(id)) return true;
    const ans = botRespondOffer(g, o.id, g.offerById(id));
    if (ans.type === 'accept') { if (g.respondOffer(o.id, id, 'accept').ok) return true; } else if (ans.type === 'counter') {
      if (g.respondOffer(o.id, id, 'counter', { give: ans.give, get: ans.get }).ok && botJudgeCounter(g, pi, ans) && g.acceptCounter(pi, id, o.id).ok) return true;
    } else g.respondOffer(o.id, id, 'decline');
  }
  const open = g.offerById(id);
  if (open) g.withdrawOffer(pi, id);
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
