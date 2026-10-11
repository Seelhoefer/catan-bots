// Handel: abgedunkelter Bildschirm, Rohstoffe als Kreise, Angebot → Antworten der Gegner → Bestätigung.
import { RES, RES_INFO, COSTS } from '../engine/constants.js';
import { esc, ic } from './dom.js';
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

/** Welcher Teil des Angebots fehlt dem Menschen? ("1 Lehm, 2 Holz") */
function missingText(hand, need) {
  return RES.filter((r) => (need[r] || 0) > hand[r]).map((r) => `${need[r] - hand[r]} ${RES_INFO[r].name}`).join(', ');
}

// ------------------------------------------------------------------ Bausteine
const storeOf = (m, side) => ({ give: m.give, get: m.get, cgive: m.counter.give, cget: m.counter.get })[side];

/** Rohstoff als Kreis: jeder Klick erhöht die Menge; das kleine × setzt sie zurück. */
function circ(app, side, r, cap, have) {
  const m = app.market;
  const n = storeOf(m, side)[r] || 0;
  return `<div class="rc-wrap">
    <button class="rcirc r-${r} ${n ? 'has' : ''}" data-act="mk-inc" data-side="${side}" data-res="${r}" aria-label="${RES_INFO[r].name}: ${n}" ${cap <= 0 ? 'disabled' : ''}>
      ${ic(r)}${n ? `<b class="rc-n">${n}</b>` : ''}
    </button>
    ${n ? `<button class="rc-x" data-act="mk-clear" data-side="${side}" data-res="${r}" aria-label="${RES_INFO[r].name} zurücksetzen">${ic('close')}</button>` : ''}
    <small>${have === null ? '' : have}</small>
  </div>`;
}

const circRow = (app, side, hand, capped) => `<div class="rc-row">${RES.map((r) => circ(app, side, r, capped ? hand[r] : 9, capped ? hand[r] : null)).join('')}</div>`;

const chips = (h) => `<span class="tp-hand">${RES.filter((r) => h[r] > 0).map((r) => `<span class="rcirc static r-${r}">${ic(r)}<b class="rc-n">${h[r]}</b></span>`).join('')}</span>`;

function terms(leftLabel, left, rightLabel, right) {
  return `<div class="tp-terms">
    <div><span class="tp-lbl">${leftLabel}</span>${chips(left)}</div>
    <span class="tp-arrow">${ic('trade')}</span>
    <div><span class="tp-lbl">${rightLabel}</span>${chips(right)}</div>
  </div>`;
}

const who = (p, text) => `<div class="tp-who" style="--pc:${p.color}">${avatarSVG(p.face, p.color, 46)}<div><b>${esc(p.name)}</b><span>${text}</span></div></div>`;

// ------------------------------------------------------------------ Eingehendes Angebot (Bot → Mensch)

/** Das Angebot, über das der Mensch gerade entscheiden soll (oder auf dessen Antwort er wartet). */
function incomingOffer(app) {
  const s = app.game.s;
  return s.offers.find((o) => o.from !== HUMAN && ((app.waitingOffer === o.id && !o.responses[HUMAN]) || o.responses[HUMAN]?.type === 'counter')) || null;
}

function incomingView(app, offer) {
  const g = app.game;
  const s = g.s;
  const me = s.players[HUMAN];
  const from = s.players[offer.from];
  const myResp = offer.responses[HUMAN];
  const m = app.market;

  if (myResp) {
    return `<div class="tp-body">${who(from, 'überlegt …')}
      ${terms('Gebe', myResp.get, 'Erhalte', myResp.give)}<div class="tp-wait"><i></i><i></i><i></i></div></div>`;
  }

  if (m.counterFor === offer.id) {
    const c = m.counter;
    const ready = sum(c.give) > 0 && sum(c.get) > 0 && !g.validTradeShape(c.give, c.get);
    return `<div class="tp-body">${who(from, 'Gegenangebot')}
      <div class="tp-lbl">Gebe</div>${circRow(app, 'cgive', me.hand, true)}
      <div class="tp-divider"><i></i>${ic('trade')}<i></i></div>
      <div class="tp-lbl">Erhalte</div>${circRow(app, 'cget', me.hand, false)}
      <div class="tp-actions"><button class="btn quiet" data-act="mk-counter-cancel">Zurück</button>
      <button class="btn solid grow" data-act="mk-counter-send" data-id="${offer.id}" ${ready ? '' : 'disabled'}>Gegenvorschlag senden</button></div></div>`;
  }

  const can = g.canAcceptOffer(HUMAN, offer);
  const timer = app.waitingOffer === offer.id ? `<div class="tp-timer"><i style="animation-duration:${app.offerWaitMs}ms"></i></div>` : '';
  const circs = (h, hand) => `<span class="tp-hand">${RES.filter((r) => h[r] > 0).map((r) => `<span class="rcirc static r-${r} ${hand && hand[r] < h[r] ? 'lack' : ''}">${ic(r)}<b class="rc-n">${h[r]}</b></span>`).join('')}</span>`;
  const mine = `<div class="oc-hand"><span class="tp-lbl">Deine Karten</span><div class="oc-hand-row">${RES.map((r) => `<span class="rcirc static mini r-${r} ${me.hand[r] ? '' : 'none'}">${ic(r)}<b class="rc-n">${me.hand[r]}</b></span>`).join('')}</div></div>`;
  return `<div class="tp-body">${who(from, 'macht dir ein Angebot')}
    <div class="oc">
      <div class="oc-col up"><span class="oc-tag">Du bekommst</span>${circs(offer.give)}</div>
      <div class="oc-mid">${ic('trade')}</div>
      <div class="oc-col down"><span class="oc-tag">Du gibst</span>${circs(offer.get, me.hand)}</div>
    </div>
    <div class="tp-actions pair">
      <button class="btn big no" data-act="mk-decline" data-id="${offer.id}">Ablehnen</button>
      <button class="btn big solid" data-act="mk-accept" data-id="${offer.id}" ${can ? '' : 'disabled'}>Annehmen</button>
    </div>
    <button class="btn counter" data-act="mk-counter-open" data-id="${offer.id}">Gegenangebot</button>
    ${timer}
    ${mine}</div>`;
}

// ------------------------------------------------------------------ Eigenes Angebot: zusammenstellen

function composeView(app) {
  const g = app.game;
  const me = g.s.players[HUMAN];
  const m = app.market;
  const valid = sum(m.give) > 0 && sum(m.get) > 0 && !g.validTradeShape(m.give, m.get) && RES.every((r) => (m.give[r] || 0) <= me.hand[r]);
  return `<div class="tp-body">
    <div class="tp-lbl">Gebe</div>${circRow(app, 'give', me.hand, true)}
    <div class="tp-divider"><i></i>${ic('trade')}<i></i></div>
    <div class="tp-lbl">Erhalte</div>${circRow(app, 'get', me.hand, false)}
    <div class="tp-actions"><button class="btn solid grow" data-act="mk-send" ${valid ? '' : 'disabled'}>An alle senden</button></div></div>`;
}

function bankView(app) {
  const g = app.game;
  const me = g.s.players[HUMAN];
  const m = app.market;
  const ports = RES.map((r) => g.portRatio(HUMAN, r));
  const give = m.bankGive;
  const get = m.bankGet;
  const ok = give && get && give !== get;
  const pick = (act, sel, r, dis, tag, have) => `<div class="rc-wrap"><button class="rcirc r-${r} ${sel ? 'sel' : ''}" data-act="${act}" data-res="${r}" aria-label="${RES_INFO[r].name}" ${dis ? 'disabled' : ''}>${ic(r)}${tag}</button><small>${have}</small></div>`;
  return `<div class="tp-body">
    <div class="tp-lbl">Gebe</div>
    <div class="rc-row">${RES.map((r, i) => pick('bank-give', give === r, r, me.hand[r] < ports[i], `<b class="rc-n ratio">${ports[i]}:1</b>`, me.hand[r])).join('')}</div>
    <div class="tp-divider"><i></i>${ic('trade')}<i></i></div>
    <div class="tp-lbl">Erhalte</div>
    <div class="rc-row">${RES.map((r) => pick('bank-get', get === r, r, !give || r === give || g.s.bank[r] < 1, '', '')).join('')}</div>
    <div class="tp-actions"><button class="btn solid grow" data-act="bank-do" ${ok ? '' : 'disabled'}>${ok ? `${ports[RES.indexOf(give)]} ${RES_INFO[give].name} → 1 ${RES_INFO[get].name}` : 'Mit der Bank tauschen'}</button></div></div>`;
}

// ------------------------------------------------------------------ Eigenes Angebot: Antworten der Gegner

/** Bildschirm abgedunkelt; darüber die Gegner mit Häkchen / Kreuz / Gegenangebot. Anklicken = auswählen, dann bestätigen. */
function awaitView(app, offer) {
  const g = app.game;
  const s = g.s;
  const others = s.players.filter((p) => p.id !== HUMAN);
  const finished = others.every((p) => offer.responses[p.id]);
  const actionable = others.some((p) => ['accept', 'counter'].includes(offer.responses[p.id]?.type));
  const card = (p) => {
    const r = offer.responses[p.id];
    const st = !r ? 'think' : r.type;
    const badge = {
      think: '',
      accept: `<span class="aw-badge yes">${ic('check')}</span>`,
      decline: `<span class="aw-badge no">${ic('close')}</span>`,
      counter: `<span class="aw-badge cnt">${ic('trade')}</span>`,
    }[st];
    const label = { think: '', accept: 'einverstanden', decline: r?.reason || 'lehnt ab', counter: 'Gegenangebot' }[st];
    const clickable = st === 'accept' || st === 'counter';
    return `<button class="aw-p ${st}" ${clickable ? `data-act="mk-pick" data-pid="${p.id}"` : 'tabindex="-1" disabled'} style="--pc:${p.color}" title="${esc(p.name)}">
      <span class="aw-av">${avatarSVG(p.face, p.color, 76)}${badge}</span><b>${esc(p.name)}</b><small>${esc(label)}</small></button>`;
  };
  return `<div class="aw">
    <div class="aw-offer">${terms('Gebe', offer.give, 'Erhalte', offer.get)}</div>
    <div class="aw-row">${others.map(card).join('')}</div>
    ${finished && !actionable ? '<div class="aw-msg">Niemand tauscht zu diesen Bedingungen.</div>' : ''}
    <div class="aw-actions">${finished && !actionable
    ? '<button class="btn gbtn" data-act="mk-retry">Angebot ändern</button><button class="btn gbtn soft" data-act="mk-withdraw-close">Schließen</button>'
    : `<button class="btn gbtn soft" data-act="mk-withdraw" data-id="${offer.id}">Angebot zurückziehen</button>`}</div>
  </div>`;
}

/** Bestätigung: Handel mit dem gewählten Spieler ausführen. */
function confirmView(app, offer, pid) {
  const s = app.game.s;
  const p = s.players[pid];
  const r = offer.responses[pid];
  if (!r) return '';
  const counter = r.type === 'counter';
  const give = counter ? r.give : offer.give; // Gegenangebote stehen aus Sicht des Anbieters (= du)
  const get = counter ? r.get : offer.get;
  return `<div class="tp-body">${who(p, counter ? 'Gegenangebot' : 'einverstanden')}
    ${terms('Gebe', give, 'Erhalte', get)}
    <div class="tp-actions"><button class="btn quiet" data-act="mk-confirm-cancel">Zurück</button>
    <button class="btn solid grow" data-act="mk-confirm" data-id="${offer.id}" data-pid="${pid}">${counter ? 'Gegenangebot annehmen' : 'Handel bestätigen'}</button></div></div>`;
}

// ------------------------------------------------------------------ Einstieg

/** Liefert { html, key, dim, closeOnBack }: `key` ändert sich nur, wenn eine andere Ansicht erscheint (für die Einblend-Animation). */
export function renderMarket(app) {
  const g = app.game;
  const s = g.s;
  const m = app.market;
  if (s.phase !== 'main') return { html: '', key: '', dim: false };

  const offer = incomingOffer(app);
  if (offer) {
    const view = offer.responses[HUMAN] ? 'wait' : m.counterFor === offer.id ? 'counter' : 'decide';
    return {
      html: `<div class="tp in" role="dialog" aria-label="Handelsangebot">${incomingView(app, offer)}</div>`,
      key: `in-${offer.id}-${view}`,
      dim: true,
    };
  }

  const myTurn = s.turn === HUMAN && s.sub === 'actions';
  if (!m.open || !myTurn) return { html: '', key: '', dim: false };

  const mine = g.openOfferOf(HUMAN);
  if (mine && m.tab !== 'bank') {
    if (m.confirm !== null && mine.responses[m.confirm]) {
      return {
        html: `<div class="aw-dim">${awaitView(app, mine)}</div><div class="tp conf" role="dialog" aria-label="Handel bestätigen">${confirmView(app, mine, m.confirm)}</div>`,
        key: `conf-${mine.id}-${m.confirm}`,
        dim: true,
      };
    }
    const fin = s.players.filter((p) => p.id !== HUMAN).every((p) => mine.responses[p.id]);
    return { html: awaitView(app, mine), key: `aw-${mine.id}-${fin ? 'fin' : 'run'}`, dim: true };
  }

  const tab = m.tab === 'bank' ? 'bank' : 'players';
  return {
    html: `<div class="tp own" role="dialog" aria-label="Handel">
        <div class="tp-top">
          <div class="seg tiny"><button class="${tab === 'players' ? 'on' : ''}" data-act="mk-tab" data-tab="players">Spieler</button><button class="${tab === 'bank' ? 'on' : ''}" data-act="mk-tab" data-tab="bank">Bank</button></div>
          <button class="icon-btn small" data-act="mk-close" aria-label="Schließen">${ic('close')}</button>
        </div>
        ${tab === 'bank' ? bankView(app) : composeView(app)}
      </div>`,
    key: `own-${tab}`,
    dim: true,
    closeOnBack: true,
  };
}
