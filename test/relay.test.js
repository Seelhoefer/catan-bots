import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handleApi } from '../relay.js';

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (!handleApi(req, res, url)) res.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** Öffnet einen Event-Stream und sammelt die Nachrichten. */
function listen(url) {
  const got = [];
  const waiters = [];
  let req;
  const ready = new Promise((resolve) => {
    req = http.get(url, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (line) { const m = JSON.parse(line.slice(6)); got.push(m); for (const w of waiters.splice(0)) w(); }
        }
      });
      resolve();
    });
  });
  const next = async (pred, ms = 2000) => {
    const t0 = Date.now();
    for (;;) {
      const i = got.findIndex(pred);
      if (i >= 0) return got.splice(i, 1)[0];
      if (Date.now() - t0 > ms) throw new Error('Zeitüberschreitung');
      await new Promise((r) => { waiters.push(r); setTimeout(r, 50); });
    }
  };
  return { ready, next, close: () => req.destroy(), got };
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

test('Relay: Raum anlegen, Gastgeber und Mitspieler tauschen Nachrichten aus', async () => {
  const { server, base } = await startServer();
  try {
    const { code, key } = await post(`${base}/api/room`, {});
    assert.match(code, /^[A-Z]{4}$/);
    assert.equal((await fetch(`${base}/api/room/${code}`).then((r) => r.json())).hostOnline, false);

    const host = listen(`${base}/api/room/${code}/host?key=${key}`);
    await host.ready;
    await host.next((m) => m.msg.t === 'ready');

    const guest = listen(`${base}/api/room/${code}/join?cid=anna`);
    await guest.ready;
    assert.equal((await guest.next((m) => m.t === 'connected')).hostOnline, true);
    assert.equal((await host.next((m) => m.from === 'anna' && m.msg.t === 'online')).from, 'anna');

    await post(`${base}/api/room/${code}/send`, { cid: 'anna', msg: { t: 'hello', name: 'Anna' } });
    assert.equal((await host.next((m) => m.msg.t === 'hello')).msg.name, 'Anna');

    await post(`${base}/api/room/${code}/reply`, { key, to: 'anna', msg: { t: 'state', n: 1 } });
    assert.equal((await guest.next((m) => m.t === 'state')).n, 1);

    const guest2 = listen(`${base}/api/room/${code}/join?cid=ben`);
    await guest2.ready;
    await guest2.next((m) => m.t === 'connected');
    await post(`${base}/api/room/${code}/reply`, { key, to: '*', msg: { t: 'all' } });
    await guest.next((m) => m.t === 'all');
    await guest2.next((m) => m.t === 'all');

    // falscher Schlüssel darf nichts senden
    const bad = await post(`${base}/api/room/${code}/reply`, { key: 'x', to: '*', msg: { t: 'evil' } });
    assert.ok(bad.error);

    guest.close(); guest2.close(); host.close();
  } finally { server.closeAllConnections?.(); server.close(); }
});

test('Relay: unbekannter Raum und fehlender Gastgeber', async () => {
  const { server, base } = await startServer();
  try {
    assert.equal((await fetch(`${base}/api/room/ZZZZ`)).status, 404);
    const { code } = await post(`${base}/api/room`, {});
    const r = await fetch(`${base}/api/room/${code}/send`, { method: 'POST', body: JSON.stringify({ cid: 'a', msg: {} }) });
    assert.equal(r.status, 409);
  } finally { server.closeAllConnections?.(); server.close(); }
});
