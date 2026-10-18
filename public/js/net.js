// Verbindung zum Vermittler-Server (siehe relay.js): Nachrichten laufen als Server-Sent Events hin und als POST zurück.
const json = { 'Content-Type': 'application/json' };

export async function createRoom() {
  const r = await fetch('/api/room', { method: 'POST' });
  if (!r.ok) throw new Error('Raum konnte nicht angelegt werden');
  return r.json(); // { code, key }
}

export async function serverInfo() {
  try { return await (await fetch('/api/info')).json(); } catch { return null; }
}

export async function roomExists(code) {
  try { return (await fetch(`/api/room/${encodeURIComponent(code)}`)).ok; } catch { return false; }
}

/** Nachrichten nacheinander abschicken, damit ihre Reihenfolge erhalten bleibt. */
function sequential() {
  let tail = Promise.resolve();
  return (fn) => { tail = tail.then(fn, fn); return tail; };
}

/** Gastgeber: empfängt Nachrichten der Mitspieler, antwortet einzeln (`to` = Client-ID) oder an alle ('*'). */
export class HostLink {
  constructor(code, key, onMessage) {
    this.code = code;
    this.key = key;
    this.queue = sequential();
    this.es = new EventSource(`/api/room/${code}/host?key=${key}`);
    this.es.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  }

  reply(to, msg) {
    return this.queue(() => fetch(`/api/room/${this.code}/reply`, { method: 'POST', headers: json, body: JSON.stringify({ key: this.key, to, msg }) }).catch(() => {}));
  }

  close() {
    this.es.close();
    fetch(`/api/room/${this.code}/close`, { method: 'POST', headers: json, body: JSON.stringify({ key: this.key }) }).catch(() => {});
  }
}

/** Mitspieler: empfängt den Spielstand vom Gastgeber und schickt Aktionen. */
export class ClientLink {
  constructor(code, cid, onMessage, onStatus = () => {}) {
    this.code = code;
    this.cid = cid;
    this.queue = sequential();
    this.es = new EventSource(`/api/room/${code}/join?cid=${encodeURIComponent(cid)}`);
    this.es.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    this.es.onerror = () => onStatus('offline');
    this.es.onopen = () => onStatus('online');
  }

  send(msg) {
    return this.queue(() => fetch(`/api/room/${this.code}/send`, { method: 'POST', headers: json, body: JSON.stringify({ cid: this.cid, msg }) }).catch(() => {}));
  }

  close() { this.es.close(); }
}

/** Beständige Kennung dieses Geräts (damit ein Handy nach einem Verbindungsabbruch denselben Platz zurückbekommt). */
export function clientId() {
  try {
    let id = localStorage.getItem('catan-cid');
    if (!id) { id = `c${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`; localStorage.setItem('catan-cid', id); }
    return id;
  } catch { return `c${Math.random().toString(36).slice(2, 12)}`; }
}
