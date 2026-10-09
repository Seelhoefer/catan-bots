// Handel als Pop-up: Eingehende Angebote erscheinen von selbst, eigene Angebote und Bank im kompakten Dialog.
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

/** Welcher Teil des Angebots fehlt dem Menschen? ("1 Lehm, 2 Holz") */
function missingText(hand, need) {
  const parts = RES.filter((r) => (need[r] || 0) > hand[r]).map((r) => `${need[r] - hand[r]} ${RES_INFO[r].name}`);
  return parts.join(', ');
}

// ------------------------------------------------------------------ Bausteine

/** Rohstoff-Kachel: Tippen = +1, kleiner Minus-Knopf erscheint, sobald etwas gewählt ist. */
function tile(side, store, r, cap, have) {
  const n = store[r] || 0;
  const name = RES_INFO[r].name;
  return `<div class="tl ${n ? 'has' : ''}">
    <button class="tl-main" data-act="mk-step" data-side="${side}" data-res="${r}" data-d="1" aria-label="${name} hinzufügen" ${n >= cap ? 'disabled' : ''}>
      ${resSq(r, 'lg')}${n ? `<b class="tl-n">${n}</b>` : ''}
    </button>
    <button class="tl-minus" data-act="mk-step" data-side="${side}" data-res="${r}" data-d="-1" aria-label="${name} entfernen" ${n ? '' : 'tabindex="-1" aria-hidden="true"'}>${ic('minus')}</button>
    ${have === null ? '' : `<small>${have}</small>`}
  </div>`;
}

const tileRow = (side, store, hand, capped) => `<div class="tl-row">${RES.map((r) => tile(side, store, r, capped ? hand[r] : 9, capped ? hand[r] : null)).join('')}</div>`;

const chips = (h) => `<span class="tp-hand">${handHTML(h)}</span>`;

function terms(leftLabel, left, rightLabel, right) {
  return `<div class="tp-terms">
    <div><span class="tp-lbl">${leftLabel}</span>${chips(left)}</div>
    <span class="tp-arrow">⇄</span>
    <div><span class="tp-lbl">${rightLabel}</span>${chips(right)}</div>
  </div>`;
}

const who = (p, text) => `<div class="tp-who" style="--pc:${p.color}">${avatarSVG(p.face, p.color, 36)}<div><b>${esc(p.name)}</b><span>${text}</span></div></div>`;

function respIcon(resp, thinking) {
  if (thinking) return '<span class="rs wait" title="überlegt …">…</span>';
  if (!resp) return '<span class="rs idle"></span>';
  if (resp.type === 'accept') return `<span class="rs yes" title="nimmt an">${ic('plus')}</span>`;
  if (resp.type === 'counter') return `<span class="rs cnt" title="Gegenvorschlag">${ic('trade')}</span>`;
  return `<span class="rs no" title="lehnt ab">${ic('close')}</span>`;
}

// ------------------------------------------------------------------ Eingehendes Angebot

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
    return `<div class="tp-body">${who(from, 'prüft deinen Gegenvorschlag …')}
      ${terms('Du gibst', myResp.get, 'Du erhältst', myResp.give)}<div class="tp-wait"><i></i><i></i><i></i></div></div>`;
  }

  if (m.counterFor === offer.id) {
    const c = m.counter;
    const ready = sum(c.give) > 0 && sum(c.get) > 0 && !g.validTradeShape(c.give, c.get);
    return `<div class="tp-body">${who(from, 'Dein Gegenvorschlag')}
      <div class="tp-lbl">Du gibst</div>${tileRow('cgive', c.give, me.hand, true)}
      <div class="tp-lbl">Du möchtest</div>${tileRow('cget', c.get, me.hand, false)}
      <div class="tp-actions"><button class="btn quiet" data-act="mk-counter-cancel">Zurück</button>
      <button class="btn solid grow" data-act="mk-counter-send" data-id="${offer.id}" ${ready ? '' : 'disabled'}>Gegenvorschlag senden</button></div></div>`;
  }

  const can = g.canAcceptOffer(HUMAN, offer);
  const timer = app.waitingOffer === offer.id ? `<div class="tp-timer"><i style="animation-duration:${app.offerWaitMs}ms"></i></div>` : '';
  return `<div class="tp-body">${who(from, 'möchte tauschen')}
    ${terms('Du erhältst', offer.give, 'Du gibst', offer.get)}
    ${can ? '' : `<div class="tp-hint">Dir fehlt: ${missingText(me.hand, offer.get)}</div>`}
    <div class="tp-actions">
      <button class="btn quiet" data-act="mk-decline" data-id="${offer.id}">Ablehnen</button>
      <button class="btn" data-act="mk-counter-open" data-id="${offer.id}">Gegenangebot</button>
      <button class="btn solid grow" data-act="mk-accept" data-id="${offer.id}" ${can ? '' : 'disabled'}>Annehmen</button>
    </div>${timer}</div>`;
}

// ------------------------------------------------------------------ Eigenes Angebot & Bank

function ownOfferStatus(app, offer) {
  const g = app.game;
  const s = g.s;
  const others = s.players.filter((p) => p.id !== HUMAN);
  const counters = Object.entries(offer.responses).filter(([, r]) => r.type === 'counter');
  return `<div class="tp-body">
    ${terms('Du gibst', offer.give, 'Du möchtest', offer.get)}
    <div class="tp-resp">${others.map((p) => `<span class="tp-r" title="${esc(p.name)}">${avatarSVG(p.face, p.color, 34)}${respIcon(offer.responses[p.id], !offer.responses[p.id] && app.busy.has(p.id))}</span>`).join('')}</div>
    ${counters.map(([pid, r]) => `<div class="tp-counter">${who(s.players[pid], 'Gegenangebot')}${terms('Du gibst', r.get, 'Du erhältst', r.give)}
      <button class="btn solid" data-act="mk-accept-counter" data-id="${offer.id}" data-pid="${pid}">Annehmen</button></div>`).join('')}
    <div class="tp-actions"><button class="btn quiet grow" data-act="mk-withdraw" data-id="${offer.id}">Zurückziehen</button></div></div>`;
}

function playersTab(app) {
  const g = app.game;
  const me = g.s.players[HUMAN];
  const m = app.market;
  const open = g.openOfferOf(HUMAN);
  if (open) return ownOfferStatus(app, open);
  const valid = sum(m.give) > 0 && sum(m.get) > 0 && !g.validTradeShape(m.give, m.get) && RES.every((r) => (m.give[r] || 0) <= me.hand[r]);
  return `<div class="tp-body">
    <div class="tp-lbl">Ich gebe</div>${tileRow('give', m.give, me.hand, true)}
    <div class="tp-lbl">Ich möchte</div>${tileRow('get', m.get, me.hand, false)}
    <div class="tp-actions"><button class="btn solid grow" data-act="mk-send" ${valid ? '' : 'disabled'}>An alle senden</button></div></div>`;
}

function bankTab(app) {
  const g = app.game;
  const me = g.s.players[HUMAN];
  const m = app.market;
  const ports = RES.map((r) => g.portRatio(HUMAN, r));
  const give = m.bankGive;
  const get = m.bankGet;
  const ok = give && get && give !== get;
  const pick = (act, sel, r, dis, tag) => `<button class="tl-main bk ${sel ? 'sel' : ''}" data-act="${act}" data-res="${r}" aria-label="${RES_INFO[r].name}" ${dis ? 'disabled' : ''}>${resSq(r, 'lg')}${tag}</button>`;
  return `<div class="tp-body">
    <div class="tp-lbl">Ich gebe</div>
    <div class="tl-row">${RES.map((r, i) => `<div class="tl">${pick('bank-give', give === r, r, me.hand[r] < ports[i], `<b class="tl-n ratio">${ports[i]}:1</b>`)}<small>${me.hand[r]}</small></div>`).join('')}</div>
    <div class="tp-lbl">Ich erhalte</div>
    <div class="tl-row">${RES.map((r) => `<div class="tl">${pick('bank-get', get === r, r, !give || r === give || g.s.bank[r] < 1, '')}</div>`).join('')}</div>
    <div class="tp-actions"><button class="btn solid grow" data-act="bank-do" ${ok ? '' : 'disabled'}>${ok ? `${ports[RES.indexOf(give)]} ${RES_INFO[give].name} → 1 ${RES_INFO[get].name}` : 'Mit der Bank tauschen'}</button></div></div>`;
}

// ------------------------------------------------------------------ Einstieg

/** Liefert { html, key }: `key` ändert sich nur, wenn ein anderes Pop-up erscheint (für die Einblend-Animation). */
export function renderMarket(app) {
  const g = app.game;
  const s = g.s;
  const m = app.market;
  if (s.phase !== 'main') return { html: '', key: '' };

  const offer = incomingOffer(app);
  if (offer) {
    const view = offer.responses[HUMAN] ? 'wait' : m.counterFor === offer.id ? 'counter' : 'decide';
    return { html: `<div class="tp in" role="dialog" aria-label="Handelsangebot">${incomingView(app, offer)}</div>`, key: `in-${offer.id}-${view}` };
  }

  const myTurn = s.turn === HUMAN && s.sub === 'actions';
  if (!m.open || !myTurn) return { html: '', key: '' };
  const hasOpen = !!g.openOfferOf(HUMAN);
  const tab = m.tab === 'bank' ? 'bank' : 'players';
  return {
    html: `<div class="tp-back" data-act="mk-close"></div>
      <div class="tp own" role="dialog" aria-label="Handel">
        <div class="tp-top">
          <div class="seg tiny"><button class="${tab === 'players' ? 'on' : ''}" data-act="mk-tab" data-tab="players">Spieler</button><button class="${tab === 'bank' ? 'on' : ''}" data-act="mk-tab" data-tab="bank">Bank</button></div>
          <button class="icon-btn small" data-act="mk-close" aria-label="Schließen">${ic('close')}</button>
        </div>
        ${tab === 'bank' ? bankTab(app) : playersTab(app)}
      </div>`,
    key: `own-${tab}-${hasOpen ? 'open' : 'new'}`,
  };
}
