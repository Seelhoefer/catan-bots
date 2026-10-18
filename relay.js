// Vermittler für Spiele mit Freunden: Der Gastgeber (Browser) hält das Spiel, Mitspieler am Handy verbinden sich über einen Raumcode.
// Der Server reicht Nachrichten nur weiter (Server-Sent Events + POST, keine Abhängigkeiten) und kennt keine Spielregeln.
import crypto from 'node:crypto';
import os from 'node:os';

const rooms = new Map(); // code → { key, host: res|null, clients: Map(cid → res), last: timestamp }
const ROOM_TTL = 6 * 60 * 60 * 1000;

const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // ohne I und O
  for (let tries = 0; tries < 50; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[crypto.randomInt(letters.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('Kein freier Raumcode');
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > limit) { reject(new Error('zu groß')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function openStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\n\n');
  const beat = setInterval(() => res.write(': ♥\n\n'), 20000);
  req.on('close', () => clearInterval(beat));
}

const send = (res, msg) => { try { res.write(`data: ${JSON.stringify(msg)}\n\n`); } catch { /* Verbindung weg */ } };

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) if (now - r.last > ROOM_TTL) rooms.delete(code);
}, 10 * 60 * 1000).unref();

export function lanUrls(port) {
  return Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n.address}:${port}`);
}

/** Gibt true zurück, wenn die Anfrage verarbeitet wurde. */
export function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const [, what, code, action] = parts;

  if (what === 'info' && req.method === 'GET') {
    const bind = process.env.HOST || '127.0.0.1';
    json(res, 200, { lan: lanUrls(Number(process.env.PORT) || 3000), host: req.headers.host, lanOpen: bind === '0.0.0.0' || bind === '::' });
    return true;
  }

  if (what === 'room' && !code && req.method === 'POST') {
    const c = newCode();
    const key = crypto.randomBytes(12).toString('hex');
    rooms.set(c, { key, host: null, clients: new Map(), last: Date.now() });
    json(res, 200, { code: c, key });
    return true;
  }

  if (what !== 'room' || !code) return false;
  const room = rooms.get(code.toUpperCase());
  if (!room) { json(res, 404, { error: 'Raum nicht gefunden' }); return true; }
  room.last = Date.now();

  // Gastgeber hört auf Nachrichten der Mitspieler
  if (action === 'host' && req.method === 'GET') {
    if (url.searchParams.get('key') !== room.key) { json(res, 403, { error: 'Falscher Schlüssel' }); return true; }
    openStream(req, res);
    if (room.host) { try { room.host.end(); } catch { /* egal */ } }
    room.host = res;
    for (const r of room.clients.values()) send(r, { t: 'host', online: true });
    send(res, { from: null, msg: { t: 'ready' } });
    for (const cid of room.clients.keys()) send(res, { from: cid, msg: { t: 'online' } });
    req.on('close', () => {
      if (room.host === res) { room.host = null; for (const r of room.clients.values()) send(r, { t: 'host', online: false }); }
    });
    return true;
  }

  // Mitspieler hört auf Nachrichten des Gastgebers
  if (action === 'join' && req.method === 'GET') {
    const cid = url.searchParams.get('cid');
    if (!cid || cid.length > 64) { json(res, 400, { error: 'cid fehlt' }); return true; }
    openStream(req, res);
    const old = room.clients.get(cid);
    if (old) { try { old.end(); } catch { /* egal */ } }
    room.clients.set(cid, res);
    send(res, { t: 'connected', hostOnline: !!room.host });
    if (room.host) send(room.host, { from: cid, msg: { t: 'online' } });
    req.on('close', () => {
      if (room.clients.get(cid) === res) { room.clients.delete(cid); if (room.host) send(room.host, { from: cid, msg: { t: 'offline' } }); }
    });
    return true;
  }

  // Mitspieler → Gastgeber
  if (action === 'send' && req.method === 'POST') {
    readBody(req).then((b) => {
      if (!b.cid || !room.host) { json(res, 409, { error: 'Gastgeber nicht verbunden' }); return; }
      send(room.host, { from: String(b.cid), msg: b.msg });
      json(res, 200, { ok: true });
    }).catch(() => json(res, 400, { error: 'Ungültig' }));
    return true;
  }

  // Gastgeber → Mitspieler (to = cid oder '*')
  if (action === 'reply' && req.method === 'POST') {
    readBody(req, 8_000_000).then((b) => {
      if (b.key !== room.key) { json(res, 403, { error: 'Falscher Schlüssel' }); return; }
      if (b.to === '*') for (const r of room.clients.values()) send(r, b.msg);
      else { const r = room.clients.get(b.to); if (r) send(r, b.msg); }
      json(res, 200, { ok: true });
    }).catch(() => json(res, 400, { error: 'Ungültig' }));
    return true;
  }

  if (!action && req.method === 'GET') { json(res, 200, { code: code.toUpperCase(), hostOnline: !!room.host, players: room.clients.size }); return true; }
  if (action === 'close' && req.method === 'POST') {
    readBody(req).then((b) => {
      if (b.key !== room.key) { json(res, 403, { error: 'Falscher Schlüssel' }); return; }
      for (const r of room.clients.values()) { send(r, { t: 'closed' }); try { r.end(); } catch { /* egal */ } }
      rooms.delete(code.toUpperCase());
      json(res, 200, { ok: true });
    }).catch(() => json(res, 400, { error: 'Ungültig' }));
    return true;
  }
  return false;
}
