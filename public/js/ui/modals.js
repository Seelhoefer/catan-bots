// Dialoge: Handel, Entwicklungskarten, Anti-Pech, Abwerfen, Diebstahl, Angebote, Regeln, Spielende.
import { RES, RES_INFO, DEV_INFO } from '../engine/constants.js';
import { botEvaluateOffer } from '../engine/bot.js';
import { MISSION_POOL } from '../engine/missions.js';
import {
  el, esc, ic, iconize, resSq, handHTML,
} from './dom.js';
import { renderLogHTML } from './panels.js';

const root = () => document.getElementById('modalRoot');
const HUMAN = 0;
const stack = [];

export function openModal({ title, dismissable = true, wide = false, onClose } = {}) {
  const body = el('div', { class: 'modal-body' });
  const closeBtn = dismissable ? el('button', { class: 'icon-btn small', 'aria-label': 'Schließen', onclick: () => close(), html: ic('close') }) : null;
  const modal = el('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    el('header', {}, el('h2', {}, title || ''), closeBtn), body);
  const overlay = el('div', { class: 'overlay' }, modal);
  const handle = {
    body, overlay, closed: false,
    setTitle(t) { modal.querySelector('h2').textContent = t; },
    close,
  };
  function close() {
    if (handle.closed) return;
    handle.closed = true;
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 140);
    const i = stack.indexOf(handle);
    if (i >= 0) stack.splice(i, 1);
    if (onClose) onClose();
  }
  if (dismissable) overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  handle.dismissable = dismissable;
  stack.push(handle);
  root().append(overlay);
  return handle;
}

export function closeTopModal() {
  const top = stack[stack.length - 1];
  if (top && top.dismissable) { top.close(); return true; }
  return false;
}

export function closeAllModals() {
  for (const m of [...stack]) m.close();
}

export const hasModal = () => stack.length > 0;

/** Auswahlkachel für einen Rohstoff */
const resBtn = (r, { count, badge, disabled, selected, onclick, title } = {}) => el('button', {
  class: `res-pick ${selected ? 'sel' : ''}`, disabled: disabled || undefined, onclick, title: title || RES_INFO[r].name,
}, el('span', { html: resSq(r, 'lg') }), el('small', {}, RES_INFO[r].name),
count !== undefined ? el('b', {}, String(count)) : null, badge ? el('span', { class: 'ratio' }, badge) : null);

// ------------------------------------------------------------------ Handel
export function tradeModal(app) {
  const m = openModal({ title: 'Handeln', wide: true });
  let tab = 'bank';
  let give = null;
  let get = null;
  const offerGive = {};
  const offerGet = {};
  let answers = null;

  const draw = () => {
    const g = app.game;
    const me = g.s.players[HUMAN];
    m.body.replaceChildren();
    m.body.append(el('div', { class: 'tabs' },
      el('button', { class: tab === 'bank' ? 'on' : '', onclick: () => { tab = 'bank'; draw(); } }, 'Bank & Häfen'),
      el('button', { class: tab === 'players' ? 'on' : '', onclick: () => { tab = 'players'; draw(); } }, 'Mit Spielern')));

    if (tab === 'bank') {
      const ports = RES.map((r) => g.portRatio(HUMAN, r));
      m.body.append(el('p', { class: 'hint-text' }, 'Wähle, was du abgibst und was du bekommen möchtest. Häfen verbessern dein Verhältnis (4:1 → 3:1 → 2:1).'));
      m.body.append(el('h4', {}, 'Du gibst'));
      m.body.append(el('div', { class: 'res-row' }, RES.map((r, i) => resBtn(r, {
        count: me.hand[r], badge: `${ports[i]}:1`, selected: give === r, disabled: me.hand[r] < ports[i],
        onclick: () => { give = give === r ? null : r; if (get === give) get = null; draw(); },
      }))));
      m.body.append(el('h4', {}, 'Du erhältst'));
      m.body.append(el('div', { class: 'res-row' }, RES.map((r) => resBtn(r, {
        count: g.s.bank[r], selected: get === r, disabled: !give || r === give || g.s.bank[r] < 1,
        title: `${RES_INFO[r].name} (Bank: ${g.s.bank[r]})`,
        onclick: () => { get = get === r ? null : r; draw(); },
      }))));
      const ready = give && get;
      m.body.append(el('div', { class: 'modal-actions' },
        el('div', { class: 'summary', html: ready ? `${ports[RES.indexOf(give)]}${ic(give, 'inline')} <span class="arrow">→</span> 1${ic(get, 'inline')}` : 'Wähle Rohstoffe aus …' }),
        el('button', {
          class: 'btn solid', disabled: !ready || undefined,
          onclick: () => { const r = app.act('bankTrade', HUMAN, give, get); if (r.ok) { give = null; get = null; } draw(); },
        }, 'Tauschen')));
    } else {
      m.body.append(el('p', { class: 'hint-text' }, 'Biete den Bots einen Tausch an. Sie antworten sofort – du wählst dann, mit wem du handelst.'));
      const counter = (store, r, max) => el('div', { class: 'counter' },
        el('span', { html: resSq(r) }),
        el('button', { 'aria-label': 'weniger', html: ic('minus'), onclick: () => { store[r] = Math.max(0, (store[r] || 0) - 1); answers = null; draw(); } }),
        el('b', {}, String(store[r] || 0)),
        el('button', { 'aria-label': 'mehr', html: ic('plus'), onclick: () => { store[r] = Math.min(max, (store[r] || 0) + 1); if (store === offerGive) offerGet[r] = 0; else offerGive[r] = 0; answers = null; draw(); } }));
      m.body.append(el('div', { class: 'two-col' },
        el('div', {}, el('h4', {}, 'Du bietest'), RES.map((r) => counter(offerGive, r, me.hand[r]))),
        el('div', {}, el('h4', {}, 'Du möchtest'), RES.map((r) => counter(offerGet, r, 6)))));
      const ng = RES.reduce((a, r) => a + (offerGive[r] || 0), 0);
      const nt = RES.reduce((a, r) => a + (offerGet[r] || 0), 0);
      m.body.append(el('div', { class: 'modal-actions' },
        el('div', { class: 'summary', html: `${handHTML(offerGive)} <span class="arrow">⇄</span> ${handHTML(offerGet)}` }),
        el('button', {
          class: 'btn solid', disabled: !(ng && nt) || undefined,
          onclick: () => {
            answers = g.s.players.filter((p) => p.isBot).map((p) => ({ p, ...botEvaluateOffer(g, p.id, HUMAN, offerGive, offerGet) }));
            draw();
          },
        }, 'Angebot machen')));
      if (answers) {
        m.body.append(el('div', { class: 'answers' }, answers.map((a) => el('div', { class: `answer ${a.accept ? 'yes' : 'no'}` },
          el('span', { class: 'pdot', style: `background:${a.p.color}` }),
          el('b', {}, a.p.name),
          el('span', { class: 'say' }, a.accept ? '„Einverstanden!“' : `„${a.reason}“`),
          a.accept ? el('button', {
            class: 'btn small solid',
            onclick: () => {
              const r = app.act('tradeWith', HUMAN, a.p.id, { ...offerGive }, { ...offerGet });
              if (r.ok) { for (const k of RES) { offerGive[k] = 0; offerGet[k] = 0; } answers = null; }
              draw();
            },
          }, 'Tauschen') : null))));
      }
    }
  };
  draw();
  m.refresh = draw;
  return m;
}

// ------------------------------------------------------------------ Entwicklungskarten
export function devModal(app) {
  const m = openModal({ title: 'Entwicklungskarten' });
  let pick = null; // { type: 'plenty'|'monopoly', chosen }
  const draw = () => {
    const g = app.game;
    const me = g.s.players[HUMAN];
    m.body.replaceChildren();
    if (pick) {
      if (pick.type === 'monopoly') {
        m.body.append(el('h4', {}, 'Monopol – welchen Rohstoff willst du einsammeln?'));
        m.body.append(el('div', { class: 'res-row' }, RES.map((r) => resBtn(r, {
          onclick: () => { const x = app.act('playDev', HUMAN, 'monopoly', { res: r }); if (x.ok) m.close(); },
        }))));
      } else {
        m.body.append(el('h4', {}, `Erfindung – wähle 2 Rohstoffe (${pick.chosen.length}/2)`));
        m.body.append(el('div', { class: 'res-row' }, RES.map((r) => resBtn(r, {
          disabled: g.s.bank[r] < 1 + pick.chosen.filter((c) => c === r).length,
          onclick: () => {
            pick.chosen.push(r);
            if (pick.chosen.length === 2) {
              const x = app.act('playDev', HUMAN, 'plenty', { a: pick.chosen[0], b: pick.chosen[1] });
              if (x.ok) { m.close(); return; }
              pick.chosen = [];
            }
            draw();
          },
        }))));
        m.body.append(el('div', { class: 'summary', html: pick.chosen.map((c) => ic(c, 'inline')).join(' ') }));
      }
      m.body.append(el('div', { class: 'modal-actions' }, el('button', { class: 'btn', onclick: () => { pick = null; draw(); } }, 'Zurück')));
      return;
    }
    if (!me.dev.length) {
      m.body.append(el('p', { class: 'empty' }, 'Du hast keine Entwicklungskarten. Kaufe eine für Wolle + Getreide + Erz.'));
      return;
    }
    for (const t of ['knight', 'roadbuilding', 'plenty', 'monopoly', 'remap', 'victory']) {
      const cards = me.dev.filter((c) => c.type === t);
      if (!cards.length) continue;
      const info = DEV_INFO[t];
      const fresh = cards.filter((c) => c.turn >= g.s.turnNumber).length;
      const ready = g.playableDev(HUMAN, t);
      let note = '';
      if (t === 'victory') note = 'Zählt automatisch';
      else if (!ready && g.s.turn !== HUMAN) note = 'Nicht dein Zug';
      else if (!ready && fresh === cards.length) note = 'Ab der nächsten Runde';
      else if (!ready && g.s.devPlayed) note = 'Nur 1 Karte pro Zug';
      m.body.append(el('div', { class: `devrow ${t}` },
        el('div', { class: 'dev-icon', html: ic(info.icon) }),
        el('div', { class: 'dev-main' }, el('b', {}, `${info.name}${cards.length > 1 ? ` ×${cards.length}` : ''}`), el('p', {}, info.desc)),
        t === 'victory' ? el('span', { class: 'note' }, note)
          : el('button', {
            class: `btn small ${ready ? 'solid' : ''}`, disabled: !ready || undefined, title: note,
            onclick: () => {
              if (t === 'plenty') { pick = { type: 'plenty', chosen: [] }; draw(); } else if (t === 'monopoly') { pick = { type: 'monopoly' }; draw(); } else if (t === 'remap') {
                confirmDialog('Weltenwandel einsetzen?', 'Alle Landfelder werden zufällig neu verteilt – für alle Spieler! Siedlungen und Straßen bleiben stehen.', 'Neu mischen').then((yes) => {
                  if (yes) { const x = app.act('playDev', HUMAN, 'remap'); if (x.ok) m.close(); }
                });
              } else { const x = app.act('playDev', HUMAN, t); if (x.ok) m.close(); }
            },
          }, ready ? 'Ausspielen' : note || 'Nicht möglich')));
    }
  };
  draw();
  m.refresh = draw;
  return m;
}

export function confirmDialog(title, text, okLabel = 'OK') {
  return new Promise((resolve) => {
    const m = openModal({ title, onClose: () => resolve(false) });
    m.body.append(el('p', { class: 'hint-text' }, text), el('div', { class: 'modal-actions' },
      el('button', { class: 'btn', onclick: () => m.close() }, 'Abbrechen'),
      el('button', { class: 'btn solid', onclick: () => { resolve(true); m.close(); } }, okLabel)));
  });
}

// ------------------------------------------------------------------ Anti-Pech
export function tokensModal(app) {
  const m = openModal({ title: 'Anti-Pech-Marker' });
  const draw = () => {
    const g = app.game;
    const me = g.s.players[HUMAN];
    const cost = g.tokenCost(HUMAN);
    const canNow = g.s.turn === HUMAN && (g.s.sub === 'actions' || g.s.sub === 'roll') && g.s.phase === 'main';
    m.body.replaceChildren();
    m.body.append(el('div', { class: 'token-meter' },
      el('div', { class: 'tm-num' }, `${me.tokens}`, el('small', {}, ` / ${cost}`)),
      el('div', { class: 'tm-bar' }, el('div', { style: `width:${Math.min(100, (me.tokens / cost) * 100)}%` }))));
    m.body.append(el('p', { class: 'hint-text' },
      `Erhältst du bei einem Wurf (außer 7) keinen Rohstoff, bekommst du 1 Marker. Für ${cost} Marker – so viele wie du Siegpunkte hast – tauschst du sie gegen einen Rohstoff deiner Wahl.`));
    m.body.append(el('div', { class: 'res-row' }, RES.map((r) => resBtn(r, {
      disabled: !canNow || me.tokens < cost || g.s.bank[r] < 1,
      onclick: () => { const x = app.act('exchangeTokens', HUMAN, r); if (x.ok) draw(); },
    }))));
    if (!canNow) m.body.append(el('p', { class: 'muted' }, 'Tauschen kannst du in deinem eigenen Zug.'));
    else if (me.tokens < cost) m.body.append(el('p', { class: 'muted' }, `Dir fehlen noch ${cost - me.tokens} Marker.`));
  };
  draw();
  m.refresh = draw;
  return m;
}

// ------------------------------------------------------------------ Abwerfen (7)
export function discardModal(app, need) {
  const m = openModal({ title: `Räuber! Wirf ${need} Karten ab`, dismissable: false });
  const chosen = {};
  const draw = () => {
    const me = app.game.s.players[HUMAN];
    const n = RES.reduce((a, r) => a + (chosen[r] || 0), 0);
    m.body.replaceChildren();
    m.body.append(el('p', { class: 'hint-text' }, `Du hast mehr als 7 Karten. Tippe auf die Karten, die du abgeben möchtest.`));
    m.body.append(el('div', { class: 'res-row' }, RES.map((r) => el('div', { class: 'discard-col' },
      resBtn(r, { count: me.hand[r] - (chosen[r] || 0), disabled: (chosen[r] || 0) >= me.hand[r] || n >= need, onclick: () => { chosen[r] = (chosen[r] || 0) + 1; draw(); } }),
      el('div', { class: 'disc-sel' }, chosen[r] ? el('button', { class: 'chipbtn', onclick: () => { chosen[r]--; draw(); } }, `−${chosen[r]}`) : null)))));
    m.body.append(el('div', { class: 'modal-actions' },
      el('div', { class: 'summary' }, `${n} / ${need} gewählt`),
      el('button', {
        class: 'btn solid', disabled: n !== need || undefined,
        onclick: () => { const x = app.act('discard', HUMAN, { ...chosen }); if (x.ok) m.close(); },
      }, 'Abwerfen')));
  };
  draw();
  return m;
}

// ------------------------------------------------------------------ Diebstahl
export function stealModal(app, targets) {
  const m = openModal({ title: 'Von wem stehlen?', dismissable: false });
  const g = app.game;
  m.body.append(el('div', { class: 'victims' }, targets.map((t) => {
    const p = g.s.players[t];
    return el('button', { class: 'victim', style: `--pc:${p.color}`, onclick: () => { const x = app.act('steal', HUMAN, t); if (x.ok) m.close(); } },
      el('span', { class: 'opp-dot' }, p.name[0]), el('b', {}, p.name), el('small', {}, `${g.handCount(t)} Karten`));
  })));
  return m;
}

// ------------------------------------------------------------------ Angebot eines Bots
export function offerModal(app, from, give, get) {
  return new Promise((resolve) => {
    const m = openModal({ title: `${from.name} macht dir ein Angebot`, dismissable: false });
    m.body.append(
      el('div', { class: 'offer' },
        el('div', { class: 'offer-side' }, el('small', {}, `${from.name} gibt`), el('b', { html: handHTML(give) })),
        el('div', { class: 'offer-arrow' }, '⇄'),
        el('div', { class: 'offer-side' }, el('small', {}, 'Du gibst'), el('b', { html: handHTML(get) }))),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn', onclick: () => { m.close(); resolve(false); } }, 'Ablehnen'),
        el('button', { class: 'btn solid', onclick: () => { m.close(); resolve(true); } }, 'Annehmen')));
  });
}

// ------------------------------------------------------------------ Verlauf (vollständig)
export function logModal(app) {
  const m = openModal({ title: 'Spielverlauf', wide: true });
  m.body.append(el('div', { class: 'loglist full', html: renderLogHTML(app.game, 300) }));
  const lg = m.body.querySelector('.loglist');
  lg.scrollTop = lg.scrollHeight;
  return m;
}

// ------------------------------------------------------------------ Regeln
export function rulesModal() {
  const m = openModal({ title: 'Regeln & Besonderheiten', wide: true });
  m.body.append(el('div', { class: 'rules', html: iconize(`
    <h3>So spielst du</h3>
    <ul>
      <li><b>Gründung:</b> Setze reihum 2 Siedlungen mit je einer Straße. Die zweite Siedlung bringt Startrohstoffe.</li>
      <li><b>Dein Zug:</b> 🎲 Würfeln → alle Felder mit der Zahl bringen Rohstoffe (Siedlung 1×, Stadt 2×) → bauen, handeln, Karten spielen → Zug beenden.</li>
      <li><b>Bauen:</b> Straße (🌲🧱), Siedlung (🌲🧱🐑🌾, mind. 2 Kanten Abstand, an eigener Straße), Stadt (🌾🌾⛰️⛰️⛰️ auf einer Siedlung), Entwicklungskarte (🐑🌾⛰️).</li>
      <li><b>Eine 7:</b> Wer mehr als 7 Karten hat, gibt die Hälfte ab. Der Würfler versetzt den Räuber und stiehlt eine Karte.</li>
      <li><b>Handeln:</b> Mit Bots frei verhandeln, mit der Bank 4:1, mit einem 3:1-Hafen 3:1, mit einem 2:1-Hafen 2:1 für den jeweiligen Rohstoff.</li>
      <li><b>Sonderkarten:</b> Längste Handelsstraße (ab 5 Straßen) und Größte Rittermacht (ab 3 Rittern) geben je 2 Siegpunkte.</li>
    </ul>
    <h3>Neu in dieser Version</h3>
    <ul>
      <li>🌫️ <b>Nebel-Variante (Seefahrer):</b> Verdeckte Felder werden aufgedeckt, sobald eine Straße an sie grenzt – und du erhältst 1 Rohstoff davon.</li>
      <li>🌍 <b>Weltenwandel:</b> Neue Entwicklungskarte. Alle Landfelder werden zufällig neu gemischt; Siedlungen &amp; Straßen bleiben.</li>
      <li>🍀 <b>Anti-Pech-Marker:</b> Erhältst du bei einem Wurf (außer 7) nichts, bekommst du 1 Marker. So viele Marker wie du Siegpunkte hast = 1 Rohstoff deiner Wahl.</li>
      <li>🎖️ <b>Öffentliche Missionen:</b> 3 zufällige Ziele für alle sichtbar. Wer sie als Erster schafft, bekommt +1 Siegpunkt.</li>
    </ul>
    <h3>Bedienung</h3>
    <ul>
      <li>Markierte Punkte, Linien und Felder auf dem Brett zeigen, wohin du klicken kannst – beim Darüberfahren siehst du eine Vorschau. <kbd>Esc</kbd> bricht ab, <kbd>R</kbd> würfelt.</li>
      <li>Mausrad zoomt, Ziehen verschiebt das Spielfeld.</li>
    </ul>
    <h3>Mögliche Missionen</h3>
    <ul class="mlist">${MISSION_POOL.map((x) => `<li>${ic(x.icon, 'inline')} <b>${x.name}:</b> ${esc(x.desc)}</li>`).join('')}</ul>`) }));
  return m;
}

// ------------------------------------------------------------------ Spielende
export function gameOverModal(app, { onNew, onMenu }) {
  const g = app.game;
  const s = g.s;
  const winner = s.players[s.winner];
  const m = openModal({ title: s.winner === HUMAN ? 'Du hast gewonnen!' : `${winner.name} gewinnt`, wide: true });
  const rows = s.players.map((p) => ({ p, b: g.vpBreakdown(p.id) })).sort((a, b) => b.b.total - a.b.total);
  m.body.append(
    el('p', { class: 'hint-text' }, s.winner === HUMAN ? 'Glückwunsch – du hast alle Bots hinter dir gelassen!' : `${winner.name} erreicht ${s.settings.targetVP} Siegpunkte.`),
    el('table', { class: 'score', html: `
      <thead><tr><th>Spieler</th><th title="Siedlungen">${ic('house', 'inline')}</th><th title="Städte">${ic('city', 'inline')}</th><th title="Längste Handelsstraße">${ic('road', 'inline')}</th><th title="Größte Rittermacht">${ic('sword', 'inline')}</th><th title="Siegpunktkarten">${ic('card', 'inline')}</th><th title="Missionen">${ic('flag', 'inline')}</th><th>Σ</th></tr></thead>
      <tbody>${rows.map(({ p, b }) => `<tr class="${p.id === s.winner ? 'win' : ''}"><td><span class="pdot" style="background:${p.color}"></span>${esc(p.name)}</td><td>${b.settlements}</td><td>${b.cities * 2}</td><td>${b.longestRoad}</td><td>${b.largestArmy}</td><td>${b.victoryCards}</td><td>${b.missions}</td><td><b>${b.total}</b></td></tr>`).join('')}</tbody>` }),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn', onclick: () => m.close() }, 'Spielfeld ansehen'),
      el('button', { class: 'btn', onclick: () => { m.close(); onMenu(); } }, 'Hauptmenü'),
      el('button', { class: 'btn solid', onclick: () => { m.close(); onNew(); } }, 'Nochmal spielen')));
  return m;
}
