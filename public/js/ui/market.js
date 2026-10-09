// Handelsmarkt: Schnellangebot, offene Angebote, Gegenvorschläge, Bank/Häfen und Protokoll.
import { RES, RES_INFO, COSTS } from '../engine/constants.js';
import {
  esc, ic, resSq, handHTML,
} from './dom.js';
import { avatarSVG } from './avatars.js';

const HUMAN = 0;
const sum = (o) => RES.reduce((a, r) => a + (o[r] || 0), 0);

/** Sinnvolle Vorbelegung: das Fehlende für die nächste Investition gegen einen Überschuss. */
export function suggestTrade(g) {
  const hand = g.s.players[HUMAN].hand;
  const missingCount = Object.fromEntries(RES.map((r) => [r, 0]));
  for (const kind of ['city', 'settlement', 'road', 'devcard']) {
    for (const [r, n] of Object.entries(COSTS[kind])) if (hand[r] < n) missingCount[r] += kind === 'road' ? 1 : 2;
  }
  const want = RES.filter((r) => missingCount[r] > 0).sort((a, b) => missingCount[b] - missingCount[a])[0];
  const give = RES.filter((r) => r !== want && hand[r] > 0).sort((a, b) => hand[b] - hand[a])[0];
  if (!want || !give) return { give: {}, get: {} };
  return { give: { [give]: 1 }, get: { [want]: 1 } };
}

function stepper(side, store, r, max) {
  const n = store[r] || 0;
  return `<div class="stp ${n ? 'has' : ''}">
    <button data-act="mk-step" data-side="${side}" data-res="${r}" data-d="1" aria-label="${RES_INFO[r].name} mehr" ${n >= max ? 'disabled' : ''}>${ic('plus')}</button>
    <div class="stp-sq">${resSq(r)}<b>${n}</b></div>
    <button data-act="mk-step" data-side="${side}" data-res="${r}" data-d="-1" aria-label="${RES_INFO[r].name} weniger" ${n <= 0 ? 'disabled' : ''}>${ic('minus')}</button>
  </div>`;
}

const stepRow = (side, store, hand, cap) => `<div class="stp-row">${RES.map((r) => stepper(side, store, r, cap ? hand[r] : 9)).join('')}</div>`;

function summary(give, get) {
  return `<div class="mk-summary">${sum(give) ? handHTML(give) : '–'}<span class="arrow">⇄</span>${sum(get) ? handHTML(get) : '–'}</div>`;
}

const chip = (p, extra = '') => `<span class="mk-who" style="--pc:${p.color}">${avatarSVG(p.face, p.color, 22)}<b>${esc(p.name)}</b>${extra}</span>`;

function respIcon(resp) {
  if (resp === null) return `<span class="rs wait" title="überlegt …">…</span>`;
  if (!resp) return `<span class="rs idle"></span>`;
  if (resp.type === 'accept') return `<span class="rs yes" title="nimmt an">${ic('plus')}</span>`;
  if (resp.type === 'counter') return `<span class="rs cnt" title="Gegenvorschlag">${ic('trade')}</span>`;
  return `<span class="rs no" title="lehnt ab">${ic('close')}</span>`;
}

function offerCard(app, offer) {
  const g = app.game;
  const s = g.s;
  const from = s.players[offer.from];
  const mine = offer.from === HUMAN;
  const myResp = offer.responses[HUMAN];
  let body = `<div class="oc-head">${chip(from)}<span class="oc-verb">${mine ? 'Dein Angebot' : 'bietet'}</span></div>
    <div class="oc-terms">${handHTML(offer.give)}<span class="arrow">⇄</span>${handHTML(offer.get)}</div>`;

  if (mine) {
    const others = s.players.filter((p) => p.id !== HUMAN);
    body += `<div class="oc-resp">${others.map((p) => `<span class="oc-r" title="${esc(p.name)}">${avatarSVG(p.face, p.color, 24)}${respIcon(offer.responses[p.id] || (app.busy.has(p.id) ? null : undefined))}</span>`).join('')}</div>`;
    for (const [pid, resp] of Object.entries(offer.responses)) {
      if (resp.type !== 'counter') continue;
      const p = s.players[pid];
      body += `<div class="oc-counter">${chip(p)}<div class="oc-terms">${handHTML(resp.give)}<span class="arrow">⇄</span>${handHTML(resp.get)}</div>
        <button class="btn small solid" data-act="mk-accept-counter" data-id="${offer.id}" data-pid="${pid}">Annehmen</button></div>`;
    }
    body += `<div class="oc-actions"><button class="btn small quiet" data-act="mk-withdraw" data-id="${offer.id}">Zurückziehen</button></div>`;
  } else if (myResp && myResp.type === 'decline') {
    body += '<div class="oc-note">Du hast abgelehnt.</div>';
  } else if (myResp && myResp.type === 'counter') {
    body += `<div class="oc-note">Dein Gegenvorschlag: ${handHTML(myResp.get)}<span class="arrow">⇄</span>${handHTML(myResp.give)} – wartet auf Antwort.</div>`;
  } else if (app.market.counterFor === offer.id) {
    const c = app.market.counter;
    body += `<div class="mk-label">Dein Gegenvorschlag</div>
      <div class="mk-sub">Ich gebe</div>${stepRow('cgive', c.give, s.players[HUMAN].hand, true)}
      <div class="mk-sub">Ich möchte</div>${stepRow('cget', c.get, s.players[HUMAN].hand, false)}
      ${summary(c.give, c.get)}
      <div class="oc-actions"><button class="btn small quiet" data-act="mk-counter-cancel">Abbrechen</button>
      <button class="btn small solid" data-act="mk-counter-send" data-id="${offer.id}" ${sum(c.give) && sum(c.get) ? '' : 'disabled'}>Senden</button></div>`;
  } else {
    const can = g.canAcceptOffer(HUMAN, offer);
    body += `<div class="oc-actions">
      <button class="btn small solid" data-act="mk-accept" data-id="${offer.id}" ${can ? '' : 'disabled'} title="${can ? '' : 'Dir fehlen die geforderten Karten'}">Annehmen</button>
      <button class="btn small" data-act="mk-counter-open" data-id="${offer.id}">Gegenvorschlag</button>
      <button class="btn small quiet" data-act="mk-decline" data-id="${offer.id}">Ablehnen</button></div>`;
    if (app.waitingOffer === offer.id) body += `<div class="oc-timer"><i style="animation-duration:${app.offerWaitMs}ms;animation-delay:-${Math.max(0, Date.now() - app.waitStart)}ms"></i></div>`;
  }
  return `<div class="offer-card ${mine ? 'mine' : ''}" data-oid="${offer.id}" style="--pc:${from.color}">${body}</div>`;
}

function historyLine(g, t) {
  const from = g.s.players[t.from];
  const to = t.to !== null && t.to !== undefined ? g.s.players[t.to] : null;
  const label = { accepted: 'Handel', withdrawn: 'zurückgezogen', expired: 'unbeantwortet', declined: 'abgelehnt' }[t.status] || t.status;
  return `<div class="hist ${t.status}"><span class="pdot" style="background:${from.color}"></span>
    <span class="h-main">${esc(from.name)}${to ? ` ↔ ${esc(to.name)}` : ''}: ${handHTML(t.give)}<span class="arrow">⇄</span>${handHTML(t.get)}</span>
    <em>${label}</em></div>`;
}

function bankTab(app) {
  const g = app.game;
  const me = g.s.players[HUMAN];
  const m = app.market;
  const myTurn = g.s.turn === HUMAN && g.s.sub === 'actions' && g.s.phase === 'main';
  const ports = RES.map((r) => g.portRatio(HUMAN, r));
  const give = m.bankGive;
  const get = m.bankGet;
  const ok = give && get && give !== get;
  return `<div class="mk-note">${myTurn ? 'Tausche mit der Bank (4:1). Häfen verbessern das Verhältnis.' : 'Mit der Bank tauschst du in deinem Zug.'}</div>
    <div class="mk-label">Ich gebe</div>
    <div class="res-row">${RES.map((r, i) => `<button class="res-pick ${give === r ? 'sel' : ''}" data-act="bank-give" data-res="${r}" ${!myTurn || me.hand[r] < ports[i] ? 'disabled' : ''}>${resSq(r)}<b>${me.hand[r]}</b><span class="ratio">${ports[i]}:1</span></button>`).join('')}</div>
    <div class="mk-label">Ich erhalte</div>
    <div class="res-row">${RES.map((r) => `<button class="res-pick ${get === r ? 'sel' : ''}" data-act="bank-get" data-res="${r}" ${!myTurn || !give || r === give || g.s.bank[r] < 1 ? 'disabled' : ''}>${resSq(r)}<b>${g.s.bank[r]}</b></button>`).join('')}</div>
    <div class="mk-summary">${ok ? `${ports[RES.indexOf(give)]}${ic(give, 'inline')}<span class="arrow">→</span>1${ic(get, 'inline')}` : '–'}</div>
    <button class="btn solid mk-send" data-act="bank-do" ${ok && myTurn ? '' : 'disabled'}>Tauschen</button>`;
}

function playersTab(app) {
  const g = app.game;
  const s = g.s;
  const me = s.players[HUMAN];
  const m = app.market;
  const myTurn = s.turn === HUMAN && s.sub === 'actions' && s.phase === 'main';
  const mineOpen = g.openOfferOf(HUMAN);
  const valid = sum(m.give) > 0 && sum(m.get) > 0 && !g.validTradeShape(m.give, m.get) && RES.every((r) => (m.give[r] || 0) <= me.hand[r]);
  let out = '';
  if (myTurn) {
    out += `<div class="mk-note">Erstelle ein Angebot an alle Mitspieler.</div>
      <div class="mk-label">Ich gebe</div>${stepRow('give', m.give, me.hand, true)}
      <div class="mk-label">Ich möchte</div>${stepRow('get', m.get, me.hand, false)}
      ${summary(m.give, m.get)}
      <button class="btn solid mk-send" data-act="mk-send" ${valid ? '' : 'disabled'}>${mineOpen ? 'Angebot ersetzen' : 'Angebot senden'}</button>`;
  } else {
    out += '<div class="mk-note">Eigene Angebote erstellst du in deinem Zug. Auf Angebote anderer kannst du jederzeit antworten.</div>';
  }
  if (s.offers.length) out += `<div class="mk-label">Offene Angebote</div>${s.offers.map((o) => offerCard(app, o)).join('')}`;
  const hist = s.trades.slice(-5).reverse();
  if (hist.length) out += `<div class="mk-label">Zuletzt</div><div class="hist-list">${hist.map((t) => historyLine(g, t)).join('')}</div>`;
  return out;
}

export function renderMarket(app) {
  const g = app.game;
  const s = g.s;
  const m = app.market;
  if (s.phase !== 'main') return '';
  if (!m.open) {
    return s.offers.length ? `<button class="mk-pill" data-act="mk-open">${ic('trade')} Markt · ${s.offers.length} Angebot${s.offers.length > 1 ? 'e' : ''}</button>` : '';
  }
  return `<div class="mk-panel">
    <div class="mk-top"><b>Handel</b>
      <div class="seg tiny"><button class="${m.tab === 'players' ? 'on' : ''}" data-act="mk-tab" data-tab="players">Spieler</button><button class="${m.tab === 'bank' ? 'on' : ''}" data-act="mk-tab" data-tab="bank">Bank</button></div>
      <button class="icon-btn small" data-act="mk-close" aria-label="Schließen">${ic('close')}</button></div>
    <div class="mk-body">${m.tab === 'bank' ? bankTab(app) : playersTab(app)}</div>
  </div>`;
}
