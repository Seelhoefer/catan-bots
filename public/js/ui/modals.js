// Dialoge: Handel, Entwicklungskarten, Anti-Pech, Abwerfen, Diebstahl, Angebote, Regeln, Spielende.
import { avatarSVG } from './avatars.js';
import { sfx } from './sfx.js';
import { RES, RES_INFO, DEV_INFO } from '../engine/constants.js';
import { MISSION_POOL } from '../engine/missions.js';
import {
  el, esc, ic, iconize, resSq, handHTML,
} from './dom.js';
import { renderLogHTML } from './panels.js';
import { cardHTML } from './cards.js';
import { IMG, art } from './assets.js';

const root = () => document.getElementById('modalRoot');
import { HUMAN } from './viewer.js';
const stack = [];

export function openModal({ title, dismissable = true, wide = false, bare = false, onClose } = {}) {
  const body = el('div', { class: 'modal-body' });
  const closeBtn = dismissable ? el('button', { class: 'icon-btn small', 'aria-label': 'Schließen', onclick: () => close(), html: ic('close') }) : null;
  const modal = el('div', { class: `modal ${wide ? 'wide' : ''} ${bare ? 'bare' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || undefined },
    bare ? null : el('header', {}, el('h2', {}, title || ''), closeBtn), body);
  const overlay = el('div', { class: `overlay ${bare ? 'dim' : ''}` }, modal);
  const handle = {
    body, overlay, closed: false,
    setTitle(t) { const h = modal.querySelector('h2'); if (h) h.textContent = t; },
    close,
  };
  function close() {
    if (handle.closed) return;
    handle.closed = true;
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 240);
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

// ------------------------------------------------------------------ Entwicklungskarten
export function devModal(app) {
  const m = openModal({ title: 'Entwicklungskarten', wide: true });
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
    const grid = el('div', { class: 'cardgrid' });
    for (const t of ['knight', 'roadbuilding', 'plenty', 'monopoly', 'harvest', 'remap', 'decree', 'victory']) {
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
      else if (!ready && t === 'harvest') note = 'Kein passendes Feld';
      const play = () => {
        if (t === 'harvest') { app.startHarvest(); m.close(); } else if (t === 'decree') { m.close(); decreeModal(app); } else if (t === 'plenty') { pick = { type: 'plenty', chosen: [] }; draw(); } else if (t === 'monopoly') { pick = { type: 'monopoly' }; draw(); } else if (t === 'remap') {
          confirmDialog('Weltenwandel einsetzen?', 'Alle Landfelder werden zufällig neu verteilt – für alle Spieler! Siedlungen und Straßen bleiben stehen.', 'Neu mischen').then((yes) => {
            if (yes) { const x = app.act('playDev', HUMAN, 'remap'); if (x.ok) m.close(); }
          });
        } else { const x = app.act('playDev', HUMAN, t); if (x.ok) m.close(); }
      };
      grid.append(el('div', { class: `cardslot ${ready || t === 'victory' ? '' : 'dim'}`, title: info.desc },
        el('div', { class: 'cs-img', html: cardHTML(t) + (cards.length > 1 ? `<span class="cs-count">×${cards.length}</span>` : '') }),
        t === 'victory' ? el('div', { class: 'cs-note' }, note)
          : el('button', { class: `btn small ${ready ? 'solid' : ''}`, disabled: !ready || undefined, title: note, onclick: play }, ready ? 'Ausspielen' : note || 'Nicht möglich')));
    }
    m.body.append(grid);
  };
  draw();
  m.refresh = draw;
  return m;
}

/** Warum eine Entwicklungskarte gerade nicht spielbar ist. */
export function devNote(g, t) {
  const cards = g.s.players[HUMAN].dev.filter((c) => c.type === t);
  const fresh = cards.filter((c) => c.turn >= g.s.turnNumber).length;
  if (t === 'victory') return 'Siegpunktkarten zählen automatisch.';
  if (g.s.turn !== HUMAN) return 'Du bist gerade nicht dran.';
  if (fresh === cards.length) return 'Frisch gekaufte Karten sind erst ab der nächsten Runde spielbar.';
  if (g.s.devPlayed) return 'Pro Zug darfst du nur eine Entwicklungskarte spielen.';
  if (t === 'harvest') return 'Du hast kein Feld mit Siedlung, das gerade Ertrag bringt.';
  return 'Diese Karte kann jetzt nicht gespielt werden.';
}

/** Eine Entwicklungskarte aus dem Kartenfächer ausspielen (inkl. Rohstoffwahl bei Monopol/Erfindung). */
export function playDevCard(app, type) {
  const g = app.game;
  if (type === 'victory' || !g.playableDev(HUMAN, type)) { app.toast(devNote(g, type), 'info'); return; }
  if (type === 'harvest') { app.startHarvest(); return; }
  if (type === 'remap') {
    confirmDialog('Weltenwandel einsetzen?', 'Alle Landfelder werden zufällig neu verteilt – für alle Spieler! Siedlungen und Straßen bleiben stehen.', 'Neu mischen').then((yes) => { if (yes) app.act('playDev', HUMAN, 'remap'); });
    return;
  }
  if (type === 'decree') { decreeModal(app); return; }
  if (type === 'monopoly') {
    const m = openModal({ title: 'Monopol', bare: true });
    m.body.append(el('div', { class: 'pk-row' }, RES.map((r) => circPick(r, { onclick: () => { const x = app.act('playDev', HUMAN, 'monopoly', { res: r }); if (x.ok) m.close(); } }))));
    return;
  }
  if (type === 'plenty') {
    const m = openModal({ title: 'Erfindung', bare: true });
    const chosen = [];
    const draw = () => {
      const cnt = (r) => chosen.filter((c) => c === r).length;
      m.body.replaceChildren(
        el('div', { class: 'pk-row' }, RES.map((r) => circPick(r, {
          count: cnt(r), disabled: chosen.length >= 2 || g.s.bank[r] < cnt(r) + 1,
          onclick: () => {
            chosen.push(r);
            if (chosen.length === 2) {
              const x = app.act('playDev', HUMAN, 'plenty', { a: chosen[0], b: chosen[1] });
              if (x.ok) { m.close(); return; }
              chosen.length = 0;
            }
            draw();
          },
        }))),
        el('div', { class: 'pk-slots' }, [0, 1].map((i) => (chosen[i] ? el('span', { class: `rcirc static mini r-${chosen[i]}`, html: ic(chosen[i]) }) : el('span', { class: 'pk-slot' })))),
      );
    };
    draw();
    return;
  }
  app.act('playDev', HUMAN, type);
}

/** Erlass: erst Zoll oder Strafe wählen, dann den Rohstoff antippen. */
export function decreeModal(app) {
  const m = openModal({ title: 'Erlass', bare: true });
  let kind = 'toll';
  const draw = () => m.body.replaceChildren(
    el('div', { class: 'dc-kinds' }, [['toll', 'Zoll', 'Gegner zahlen dir 1 Karte'], ['penalty', 'Strafe', 'Gegner erhalten 1 Karte weniger']].map(([k, label, sub]) => el('button', {
      type: 'button', class: `dc-kind ${kind === k ? 'on' : ''}`, 'aria-pressed': String(kind === k), onclick: () => { kind = k; draw(); },
    }, el('b', {}, label), el('small', {}, sub)))),
    el('p', { class: 'dc-hint' }, 'Gilt für jeden Wurf, bei dem ein Gegner den Rohstoff erhält – bis du wieder am Zug bist. Rohstoff wählen:'),
    el('div', { class: 'pk-row' }, RES.map((r) => circPick(r, { onclick: () => { const x = app.act('playDev', HUMAN, 'decree', { res: r, kind }); if (x.ok) m.close(); } }))),
  );
  draw();
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
    m.body.append(el('div', { class: 'token-meter' }, art.ok ? el('img', { class: 'modal-art small', src: IMG.choice, alt: '' }) : null,
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
    if (art.ok) m.body.append(el('img', { class: 'modal-art', src: IMG.thief, alt: '' }));
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

// ------------------------------------------------------------------ Wahlfeld: Rohstoff nach Wahl
/** Rohstoff als großer Kreis (Klick = wählen). */
const circPick = (r, { count = 0, disabled, onclick, title } = {}) => el('button', {
  type: 'button', class: `rcirc r-${r} ${count ? 'has' : ''}`, disabled: disabled || undefined, title: title || RES_INFO[r].name, 'aria-label': RES_INFO[r].name, onclick,
  html: `${ic(r)}${count ? `<b class="rc-n">${count}</b>` : ''}`,
});

/** Wahlfeld: nur Kreise – antippen wählt, unten füllen sich die Plätze; Haken bestätigt. */
export function goldModal(app, n) {
  const m = openModal({ title: 'Rohstoff wählen', dismissable: false, bare: true });
  const picks = [];
  const draw = () => {
    const g = app.game;
    const count = (r) => picks.filter((x) => x === r).length;
    m.body.replaceChildren(
      el('div', { class: 'pk-banner' },
        el('img', { class: 'pk-banner-ico', src: IMG.choice, alt: '', draggable: 'false' }),
        el('div', { class: 'pk-banner-txt' }, el('small', {}, 'Wahlfeld getroffen!'), el('b', {}, n === 1 ? 'Wähle 1 Rohstoff' : `Wähle ${n} Rohstoffe`))),
      el('div', { class: 'pk-row' }, RES.map((r) => circPick(r, {
        count: count(r), disabled: picks.length >= n || g.s.bank[r] < count(r) + 1, title: `${RES_INFO[r].name} (Bank: ${g.s.bank[r]})`,
        onclick: () => { picks.push(r); sfx.play('tick'); draw(); },
      }))),
      el('div', { class: 'pk-slots' }, Array.from({ length: n }, (_, i) => (picks[i]
        ? el('button', { type: 'button', class: `rcirc static mini r-${picks[i]}`, title: 'Entfernen', 'aria-label': 'Entfernen', onclick: () => { picks.splice(i, 1); draw(); }, html: ic(picks[i]) })
        : el('span', { class: 'pk-slot' })))),
      el('button', { type: 'button', class: 'pk-ok', 'aria-label': 'Bestätigen', disabled: picks.length !== n || undefined,
        onclick: () => { const chosen = {}; for (const r of picks) chosen[r] = (chosen[r] || 0) + 1; const x = app.act('chooseGold', HUMAN, chosen); if (x.ok) m.close(); }, html: ic('check') }),
    );
  };
  draw();
  return m;
}

// ------------------------------------------------------------------ Diebstahl
export function stealModal(app, targets) {
  const m = openModal({ title: 'Von wem stehlen?', dismissable: false });
  const g = app.game;
  if (art.ok) m.body.append(el('img', { class: 'modal-art', src: IMG.thief, alt: '' }));
  m.body.append(el('div', { class: 'victims' }, targets.map((t) => {
    const p = g.s.players[t];
    return el('button', { class: 'victim', style: `--pc:${p.color}`, onclick: () => { const x = app.act('steal', HUMAN, t); if (x.ok) m.close(); } },
      el('span', { class: 'victim-av', html: avatarSVG(p.face, p.color, 44) }), el('b', {}, p.name), el('small', {}, `${g.handCount(t)} Karten`));
  })));
  return m;
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
      <li><b>Gründung:</b> Setze reihum 2 Siedlungen mit je einer Straße (auf der riesigen Karte 3). Jede Siedlung nach der ersten bringt Startrohstoffe.</li>
      <li><b>Dein Zug:</b> 🎲 Würfeln → alle Felder mit der Zahl bringen Rohstoffe (Siedlung 1×, Stadt 2×) → bauen, handeln, Karten spielen → Zug beenden.</li>
      <li><b>Bauen:</b> Straße (🌲🧱), Siedlung (🌲🧱🐑🌾, mind. 2 Kanten Abstand, an eigener Straße), Stadt (🌾🌾⛰️⛰️⛰️ auf einer Siedlung), Entwicklungskarte (🐑🌾⛰️).</li>
      <li><b>Eine 7:</b> Wer mehr als 7 Karten hat, gibt die Hälfte ab. Der Würfler versetzt den Räuber und stiehlt eine Karte.</li>
      <li><b>Handeln:</b> Mit Bots frei verhandeln, mit der Bank 4:1, mit einem 3:1-Hafen 3:1, mit einem 2:1-Hafen 2:1 für den jeweiligen Rohstoff.</li>
      <li><b>Sonderkarten:</b> Längste Handelsstraße (ab 5 Straßen) und Größte Rittermacht (ab 3 Rittern) geben je 2 Siegpunkte.</li>
    </ul>
    <h3>Neu in dieser Version</h3>
    <ul>
      <li>✨ <b>Wahlfeld:</b> Wird die Zahl eines Wahlfelds gewürfelt, darfst du dir für jede angrenzende Siedlung (Stadt = 2) einen beliebigen Rohstoff aussuchen.</li>
      <li>🌫️ <b>Nebel-Variante (Seefahrer):</b> Verdeckte Felder werden aufgedeckt, sobald eine Straße an sie grenzt – und du erhältst 1 Rohstoff davon.</li>
      <li>🌾 <b>Ernte:</b> Neue Entwicklungskarte. Du wählst eines deiner Felder mit Siedlung oder Stadt und erhältst sofort dessen Ertrag (Stadt = doppelt).</li>
      <li>🌍 <b>Weltenwandel:</b> Neue Entwicklungskarte. Alle Landfelder werden zufällig neu gemischt; Siedlungen &amp; Straßen bleiben.</li>
      <li>⚓ <b>Welthafen (Erweiterung):</b> Ein einziger Hafen am Rand tauscht alle Rohstoffe 2:1 – er ersetzt einen 3:1-Hafen und ist golden markiert.</li>
      <li>📜 <b>Erlass-Karte (Erweiterung):</b> Entwicklungskarte. Lege einen <b>Zoll</b> (Gegner, die den Rohstoff erwürfeln, zahlen dir 1 Karte) oder eine <b>Strafe</b> (sie erhalten 1 Karte weniger) auf einen Rohstoff. Gilt für jeden Wurf, bis du wieder am Zug bist; du selbst bist ausgenommen.</li>
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
/** Siegerbildschirm: großes Portrait des Gewinners mit Konfetti, darunter die Platzierungen als schlichte Tabelle (ohne Kacheln). */
export function gameOverModal(app, { onNew, onMenu }) {
  const g = app.game;
  const s = g.s;
  const winner = s.players[s.winner];
  const mine = s.winner === HUMAN;
  const m = openModal({ title: mine ? 'Du hast gewonnen!' : `${winner.name} gewinnt`, dismissable: false, bare: true });
  m.overlay.classList.add('victory');
  const rows = s.players
    .map((p) => {
      const b = g.vpBreakdown(p.id);
      return { p, total: b.total, houses: b.settlements, cities: b.cities, roads: g.roadsOf(p.id).length, dev: p.devBought || 0 };
    })
    .sort((a, b) => (b.p.id === s.winner) - (a.p.id === s.winner) || b.total - a.total);
  const head = (icon, tip, short = tip) => `<th title="${tip}" aria-label="${tip}">${ic(icon)}<small>${short}</small></th>`;
  m.body.append(
    el('div', { class: 'vc-hero' },
      el('div', { class: 'vc-rays' }),
      el('div', { class: 'vc-portrait', style: `--pc:${winner.color}`, html: `${avatarSVG(winner.face, winner.color, 168)}${art.ok ? `<img class="vc-trophy" src="${IMG.trophy}" alt="" draggable="false">` : ''}` }),
      el('div', { class: 'vc-name' }, el('small', {}, s.stalemate ? 'Patt – alle Bauplätze vergeben' : mine ? 'Sieg!' : 'Sieger'), el('h1', {}, mine ? 'Du hast gewonnen!' : `${winner.name} gewinnt`)),
      el('div', { class: 'vc-vp', html: `${ic('trophy')}<b>${rows[0].total}</b><span>Siegpunkte</span>` })),
    el('table', { class: 'vc-table', html: `
      <thead><tr><th></th><th class="vc-who"></th>${head('house', 'Siedlungen')}${head('city', 'Städte')}${head('road', 'Straßen')}${head('cards', 'Entwicklungskarten', 'Karten')}${head('trophy', 'Siegpunkte', 'Punkte')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="${r.p.id === s.winner ? 'first' : ''}"><td class="vc-rank">${i + 1}</td><td class="vc-who"><div>${avatarSVG(r.p.face, r.p.color, 34)}<span>${esc(r.p.name)}${r.p.id === HUMAN && r.p.name !== 'Du' ? ' <em>(Du)</em>' : ''}</span></div></td><td>${r.houses}</td><td>${r.cities}</td><td>${r.roads}</td><td>${r.dev}</td><td class="vc-pts">${r.total}</td></tr>`).join('')}</tbody>` }),
    el('div', { class: 'vc-actions' },
      el('button', { class: 'btn solid big', onclick: () => { m.close(); onNew(); } }, 'Nochmal spielen'),
      el('button', { class: 'btn', onclick: () => { m.close(); onMenu(); } }, 'Hauptmenü'),
      el('button', { class: 'btn quiet', onclick: () => m.close() }, 'Spielfeld ansehen')));
  const gs = window.gsap;
  if (gs) {
    const q = (sel) => m.body.querySelectorAll(sel);
    gs.from(q('.vc-portrait'), { scale: 0.2, opacity: 0, rotate: -8, duration: 0.9, ease: 'elastic.out(1, 0.55)' });
    gs.from(q('.vc-name, .vc-vp'), { y: 18, opacity: 0, duration: 0.5, stagger: 0.12, delay: 0.35, ease: 'power2.out' });
    gs.from(q('.vc-table thead th, .vc-table tbody tr'), { y: 14, opacity: 0, duration: 0.4, stagger: 0.07, delay: 0.7, ease: 'power2.out' });
    gs.from(q('.vc-actions .btn'), { y: 10, opacity: 0, duration: 0.4, stagger: 0.08, delay: 1.2 });
  }
  return m;
}

/** Raumcode und Adresse für Mitspieler am Handy (auch während des Spiels abrufbar). */
export function inviteModal(info) {
  const m = openModal({ title: 'Mitspieler am Handy' });
  if (!info) { m.body.append(el('p', { class: 'hint-text' }, 'Es ist kein Raum offen.')); return m; }
  const taken = [...info.clients.values()];
  m.body.append(
    el('div', { class: 'lb-code' }, el('small', {}, 'Raumcode'), el('b', { class: 'lb-big' }, info.code)),
    el('p', { class: 'hint-text' }, 'Am Handy diese Adresse öffnen (selbes WLAN):'),
    el('div', { class: 'lb-url' }, el('code', {}, info.url)),
    el('ul', { class: 'lb-seats' }, info.seats.map((k, i) => (k !== 'remote' ? null : (() => {
      const p = info.game.s.players[i];
      const c = taken.find((x) => x.seat === i);
      return el('li', { class: `lb-seat ${c?.online ? 'ok' : 'wait'}`, style: `--pc:${p.color}` }, el('span', { class: 'lb-av', html: avatarSVG(p.face, p.color, 36) }),
        el('span', { class: 'lb-name' }, el('b', {}, p.name), el('small', {}, c ? (c.online ? 'verbunden' : 'Verbindung weg') : 'frei')));
    })()))));
  return m;
}
