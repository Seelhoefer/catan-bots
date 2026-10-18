// Minimaler statischer Server ohne Abhängigkeiten: `npm start` → http://localhost:3000
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './relay.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT) || 3000;
// Standard: nur dieser Rechner. HOST=0.0.0.0 (oder `npm run start:lan`) macht das Spiel im WLAN erreichbar, z. B. fürs Handy.
const host = process.env.HOST || '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/') && handleApi(req, res, url)) return;
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden'); return; }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`\n  🎲 Catan gegen Bots läuft auf  http://localhost:${port}`);
  if (host === '0.0.0.0' || host === '::') {
    const urls = Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => `http://${n.address}:${port}`);
    console.log('\n  📱 Am Handy (im selben WLAN) öffnen:');
    for (const u of urls) console.log(`     ${u}`);
    console.log('\n  Hinweis: Der Server ist jetzt für alle Geräte im Netzwerk erreichbar.');
  } else {
    console.log('  (Fürs Handy im WLAN: npm run start:lan)');
  }
  console.log('');
});
