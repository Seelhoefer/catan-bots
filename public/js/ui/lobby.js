// Warteraum fürs Spiel mit Freunden: Gastgeber-Ansicht (Code, Adresse, Plätze) und Beitritts-Ansicht für das Handy.
import { el, ic } from './dom.js';
import { avatarSVG } from './avatars.js';

/** Adresse, unter der Handys das Spiel erreichen: im WLAN die Rechner-Adresse statt „localhost“. */
export function joinUrl(code, info) {
  const here = location.origin;
  const local = /^(localhost|127\.|\[?::1)/.test(location.hostname);
  const base = local && info?.lan?.length ? info.lan[0] : here;
  return `${base}/?join=${code}`;
}

/**
 * Gastgeber-Warteraum. `seats`: [{ kind: 'local'|'remote'|'bot', name, face, color, taken, online }]
 */
export function renderHostLobby(root, {
  code, info, seats, onStart, onCancel,
}) {
  const url = joinUrl(code, info);
  const local = /^(localhost|127\.|\[?::1)/.test(location.hostname);
  const unreachable = local && !(info && info.lanOpen);
  const missing = seats.filter((s) => s.kind === 'remote' && !s.taken).length;
  const row = (s) => {
    const label = s.kind === 'bot' ? 'Computer' : s.kind === 'local' ? 'an diesem Gerät'
      : s.taken ? (s.online ? 'am Handy · verbunden' : 'am Handy · Verbindung weg') : 'am Handy · wartet …';
    return el('li', { class: `lb-seat ${s.kind} ${s.kind === 'remote' && !s.taken ? 'wait' : 'ok'}`, style: `--pc:${s.color}` },
      el('span', { class: 'lb-av', html: avatarSVG(s.face, s.color, 44) }),
      el('span', { class: 'lb-name' }, el('b', {}, s.name), el('small', {}, label)),
      s.kind === 'remote' ? el('span', { class: 'lb-state', html: s.taken && s.online ? ic('check') : '<i class="lb-dots"><i></i><i></i><i></i></i>' }) : null);
  };
  root.replaceChildren(el('div', { class: 'mw lobby' },
    el('div', { class: 'mw-top' },
      el('button', { type: 'button', class: 'hbtn mw-back', 'aria-label': 'Abbrechen', title: 'Abbrechen', onclick: onCancel, html: ic('arrow') }),
      el('h2', {}, 'Mitspieler verbinden')),
    el('section', { class: 'mw-sec lb-code' },
      el('small', {}, 'Raumcode'),
      el('b', { class: 'lb-big' }, code),
      el('p', {}, 'Am Handy diese Adresse öffnen und, falls gefragt, den Code eingeben:'),
      el('div', { class: 'lb-url' },
        el('code', {}, url),
        el('button', { type: 'button', class: 'btn small', onclick: (e) => { navigator.clipboard?.writeText(url).then(() => { e.target.textContent = 'Kopiert'; }).catch(() => {}); } }, 'Kopieren')),
      info?.lan?.length > 1 && local ? el('p', { class: 'mw-note' }, `Andere Adressen dieses Rechners: ${info.lan.slice(1).map((u) => `${u}/?join=${code}`).join(' · ')}`) : null,
      unreachable ? el('p', { class: 'lb-warn' }, 'Der Server läuft nur auf diesem Rechner. Starte ihn mit „npm run start:lan“, damit sich Handys im selben WLAN verbinden können.') : null),
    el('section', { class: 'mw-sec' }, el('h3', {}, 'Spieler'), el('ul', { class: 'lb-seats' }, seats.map(row))),
    el('div', { class: 'mw-foot' },
      el('button', { type: 'button', class: 'mw-start', disabled: missing > 0 || undefined, onclick: onStart }, missing > 0 ? `Warte auf ${missing} ${missing === 1 ? 'Handy' : 'Handys'} …` : 'Spiel starten'))));
}

/** Beitritts-Ansicht am Handy: Code und Name, danach Wartetext. */
export function renderJoin(root, {
  code = '', name = '', status = null, seat = null, error = null, onJoin, onBack,
}) {
  const codeIn = el('input', {
    type: 'text', class: 'mw-name lb-codein', value: code, maxlength: 4, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', placeholder: 'CODE', 'aria-label': 'Raumcode',
    oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); },
  });
  const nameIn = el('input', { type: 'text', class: 'mw-name', value: name, maxlength: 14, placeholder: 'Dein Name', 'aria-label': 'Dein Name' });
  const go = () => onJoin({ code: codeIn.value.trim().toUpperCase(), name: nameIn.value.trim() });
  root.replaceChildren(el('div', { class: 'mw lobby' },
    el('div', { class: 'mw-top' },
      el('button', { type: 'button', class: 'hbtn mw-back', 'aria-label': 'Zurück', title: 'Zurück', onclick: onBack, html: ic('arrow') }),
      el('h2', {}, 'Spiel beitreten')),
    seat === null
      ? el('section', { class: 'mw-sec' },
        el('h3', {}, 'Raumcode'), codeIn,
        el('h3', {}, 'Dein Name'), nameIn,
        error ? el('p', { class: 'lb-warn' }, error) : null,
        status ? el('p', { class: 'mw-note' }, status) : null)
      : el('section', { class: 'mw-sec lb-code' },
        el('small', {}, 'Verbunden'),
        el('b', { class: 'lb-big small' }, seat.name),
        el('p', {}, status || 'Warte, bis der Gastgeber das Spiel startet …'),
        el('i', { class: 'lb-dots big' }, el('i'), el('i'), el('i'))),
    seat === null ? el('div', { class: 'mw-foot' }, el('button', { type: 'button', class: 'mw-start', onclick: go }, 'Beitreten')) : null));
  if (seat === null) (code ? nameIn : codeIn).focus();
}
