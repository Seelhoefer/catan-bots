// Spielfeld-Geometrie und -Erzeugung (Hex-Raster, Ecken, Kanten, Häfen, Nebel).

import { RES, SIZES, PIP } from './constants.js';
import { shuffle } from './rng.js';

const SQRT3 = Math.sqrt(3);
export const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const BASE_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const RES_WEIGHT = { wood: 4, wheat: 4, sheep: 4, brick: 3, ore: 3 };

export function hexCenter(q, r) {
  return { x: SQRT3 * (q + r / 2), y: 1.5 * r };
}

export function hexCorner(cx, cy, k) {
  const ang = ((60 * k - 30) * Math.PI) / 180;
  return { x: cx + Math.cos(ang), y: cy + Math.sin(ang) };
}

const vKey = (p) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

export function hexNeighbors(board, id) {
  const h = board.hexes[id];
  const out = [];
  for (const [dq, dr] of HEX_DIRS) {
    const n = board.hexIndex[`${h.q + dq},${h.r + dr}`];
    if (n !== undefined) out.push(n);
  }
  return out;
}

// Verteilt `numbers` auf die Nicht-Wüstenfelder. Rote Zahlen (6/8) werden zuerst auf paarweise
// nicht benachbarte Felder gelegt, danach werden die übrigen Zahlen gemischt (gleiche Zahlen
// möglichst nicht nebeneinander).
function placeNumbers(board, numbers, rng) {
  const ids = board.hexes.filter((h) => h.type !== 'desert').map((h) => h.id);
  const neighbors = {};
  for (const id of ids) neighbors[id] = hexNeighbors(board, id);
  const isRed = (n) => n === 6 || n === 8;
  const reds = numbers.filter(isRed);
  const others = numbers.filter((n) => !isRed(n));

  let redSpots = null;
  for (let attempt = 0; attempt < 300 && !redSpots; attempt++) {
    const chosen = new Set();
    for (const id of shuffle(ids, rng)) {
      if (chosen.size >= reds.length) break;
      if (neighbors[id].every((n) => !chosen.has(n))) chosen.add(id);
    }
    if (chosen.size === reds.length) redSpots = [...chosen];
  }
  if (!redSpots) redSpots = shuffle(ids, rng).slice(0, reds.length); // Notlösung

  const byId = {};
  const redShuffled = shuffle(reds, rng);
  redSpots.forEach((id, i) => { byId[id] = redShuffled[i]; });
  const rest = ids.filter((id) => byId[id] === undefined);

  let best = null;
  let bestScore = Infinity;
  for (let attempt = 0; attempt < 120; attempt++) {
    const nums = shuffle(others, rng);
    const trial = {};
    rest.forEach((id, i) => { trial[id] = nums[i]; });
    let bad = 0;
    for (const id of rest) for (const n of neighbors[id]) if (n > id && trial[n] !== undefined && trial[n] === trial[id]) bad++;
    if (bad < bestScore) { bestScore = bad; best = trial; }
    if (bad === 0) break;
  }
  Object.assign(byId, best);
  for (const h of board.hexes) h.num = h.type === 'desert' ? null : byId[h.id];
}

function buildTypeList(count, rng, withGold = false) {
  const desertCount = Math.max(1, Math.round(count / 19));
  const goldCount = withGold ? Math.max(1, Math.round(count / 19)) : 0;
  const m = count - desertCount - goldCount;
  const total = Object.values(RES_WEIGHT).reduce((a, b) => a + b, 0);
  const counts = {};
  const fracs = [];
  let used = 0;
  for (const r of RES) {
    const exact = (m * RES_WEIGHT[r]) / total;
    counts[r] = Math.floor(exact);
    used += counts[r];
    fracs.push([r, exact - counts[r], rng()]);
  }
  fracs.sort((a, b) => b[1] - a[1] || a[2] - b[2]);
  for (let i = 0; used < m; i++, used++) counts[fracs[i % fracs.length][0]]++;
  const list = [];
  for (const r of RES) for (let i = 0; i < counts[r]; i++) list.push(r);
  for (let i = 0; i < desertCount; i++) list.push('desert');
  for (let i = 0; i < goldCount; i++) list.push('gold');
  return shuffle(list, rng);
}

function buildNumberList(m) {
  const nums = [];
  for (let i = 0; i < m; i++) nums.push(BASE_NUMBERS[i % BASE_NUMBERS.length]);
  return nums;
}

function buildGraph(board) {
  const vmap = new Map();
  const emap = new Map();
  board.vertices = [];
  board.edges = [];
  for (const h of board.hexes) {
    const ids = [];
    for (let k = 0; k < 6; k++) {
      const p = hexCorner(h.x, h.y, k);
      const key = vKey(p);
      let id = vmap.get(key);
      if (id === undefined) {
        id = board.vertices.length;
        vmap.set(key, id);
        board.vertices.push({ id, x: p.x, y: p.y, hexes: [], adj: [], edges: [], port: null });
      }
      if (!board.vertices[id].hexes.includes(h.id)) board.vertices[id].hexes.push(h.id);
      ids.push(id);
    }
    h.verts = ids;
    for (let k = 0; k < 6; k++) {
      const a = ids[k];
      const b = ids[(k + 1) % 6];
      const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
      let eid = emap.get(ek);
      if (eid === undefined) {
        eid = board.edges.length;
        emap.set(ek, eid);
        board.edges.push({ id: eid, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        board.vertices[a].adj.push(b);
        board.vertices[b].adj.push(a);
        board.vertices[a].edges.push(eid);
        board.vertices[b].edges.push(eid);
      }
      board.edges[eid].hexes.push(h.id);
    }
  }
  board.edgeIndex = Object.fromEntries(emap);
}

function placePorts(board, rng, opts = {}) {
  const coast = board.edges.filter((e) => e.hexes.length === 1);
  const cx = 0;
  const cy = 0;
  const mid = (e) => {
    const a = board.vertices[e.a];
    const b = board.vertices[e.b];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  coast.sort((e1, e2) => {
    const m1 = mid(e1);
    const m2 = mid(e2);
    return Math.atan2(m1.y - cy, m1.x - cx) - Math.atan2(m2.y - cy, m2.x - cx);
  });
  const C = coast.length;
  const P = Math.max(4, Math.round(C / 3.33));
  const anyCount = Math.round((P * 4) / 9);
  const types = [];
  for (let i = 0; i < anyCount; i++) types.push('any');
  if (opts.worldHarbor) { const i = types.indexOf('any'); if (i >= 0) types[i] = 'all'; } // genau ein Welthafen (ersetzt einen 3:1-Hafen)
  const specific = shuffle(RES, rng);
  for (let i = 0; types.length < P; i++) types.push(specific[i % specific.length]);
  const shuffled = shuffle(types, rng);
  const offset = rng() * (C / P);
  const used = new Set();
  board.ports = [];
  for (let i = 0; i < P; i++) {
    let idx = Math.floor(offset + (i * C) / P) % C;
    for (let tries = 0; tries < C; tries++) {
      const e = coast[idx];
      if (!used.has(e.a) && !used.has(e.b)) break;
      idx = (idx + 1) % C;
    }
    const e = coast[idx];
    if (used.has(e.a) || used.has(e.b)) continue;
    used.add(e.a); used.add(e.b);
    const m = mid(e);
    const len = Math.hypot(m.x - cx, m.y - cy) || 1;
    const type = shuffled[i];
    board.vertices[e.a].port = type;
    board.vertices[e.b].port = type;
    board.ports.push({
      id: board.ports.length, type, edge: e.id, verts: [e.a, e.b],
      x: m.x + ((m.x - cx) / len) * 0.76, y: m.y + ((m.y - cy) / len) * 0.76,
      ex: m.x, ey: m.y,
    });
  }
}

function placeFog(board, rng) {
  const N = board.hexes.length;
  const k = Math.round(N * 0.3);
  const ang = rng() * Math.PI * 2;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const cand = board.hexes
    .filter((h) => h.type !== 'desert')
    .map((h) => ({ id: h.id, s: h.x * dx + h.y * dy + (rng() - 0.5) * 0.9 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k);
  for (const c of cand) board.hexes[c.id].fog = true;
}

export function generateBoard(sizeId, variant, rng, opts = {}) {
  const size = SIZES[sizeId];
  const R = size.radius;
  const hexes = [];
  for (let r = -R; r <= R; r++) {
    for (let q = -R; q <= R; q++) {
      if (Math.abs(q + r) > R) continue;
      const { x, y } = hexCenter(q, r);
      hexes.push({ id: hexes.length, q, r, x, y, type: 'desert', num: null, fog: false });
    }
  }
  const board = { size: sizeId, variant, radius: R, hexes, hexIndex: {} };
  hexes.forEach((h) => { board.hexIndex[`${h.q},${h.r}`] = h.id; });

  const types = buildTypeList(hexes.length, rng, !!opts.gold);
  hexes.forEach((h, i) => { h.type = types[i]; });
  placeNumbers(board, buildNumberList(types.filter((t) => t !== 'desert').length), rng);

  buildGraph(board);
  placePorts(board, rng, opts);
  if (variant === 'fog') placeFog(board, rng);

  computeBounds(board);
  return board;
}

// "Weltenwandel": alle Landfelder (Rohstoff + Zahl) werden komplett neu gemischt.
// Nebel-Positionen bleiben verdeckt. Ecken/Kanten/Häfen ändern sich nicht.
export function remapBoard(board, rng) {
  const types = shuffle(board.hexes.map((h) => h.type), rng);
  const numbers = board.hexes.filter((h) => h.type !== 'desert').map((h) => h.num);
  board.hexes.forEach((h, i) => { h.type = types[i]; });
  placeNumbers(board, numbers, rng);
}

function computeBounds(board) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of board.vertices) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  board.bounds = { minX, maxX, minY, maxY };
}

/** Neue Felder in das bestehende Ecken-/Kanten-Netz einfügen (alte IDs bleiben unverändert, neue werden angehängt). */
function extendGraph(board, fromIndex) {
  const vmap = new Map(board.vertices.map((v) => [vKey(v), v.id]));
  const emap = new Map(Object.entries(board.edgeIndex).map(([k, id]) => [k, id]));
  for (let hi = fromIndex; hi < board.hexes.length; hi++) {
    const h = board.hexes[hi];
    const ids = [];
    for (let k = 0; k < 6; k++) {
      const p = hexCorner(h.x, h.y, k);
      const key = vKey(p);
      let id = vmap.get(key);
      if (id === undefined) {
        id = board.vertices.length;
        vmap.set(key, id);
        board.vertices.push({ id, x: p.x, y: p.y, hexes: [], adj: [], edges: [], port: null });
      }
      if (!board.vertices[id].hexes.includes(h.id)) board.vertices[id].hexes.push(h.id);
      ids.push(id);
    }
    h.verts = ids;
    for (let k = 0; k < 6; k++) {
      const a = ids[k];
      const b = ids[(k + 1) % 6];
      const ek = a < b ? `${a}-${b}` : `${b}-${a}`;
      let eid = emap.get(ek);
      if (eid === undefined) {
        eid = board.edges.length;
        emap.set(ek, eid);
        board.edges.push({ id: eid, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        board.vertices[a].adj.push(b);
        board.vertices[b].adj.push(a);
        board.vertices[a].edges.push(eid);
        board.vertices[b].edges.push(eid);
      }
      board.edges[eid].hexes.push(h.id);
    }
  }
  board.edgeIndex = Object.fromEntries(emap);
}

const hexDist = (q, r) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

/**
 * Eine neue Insel (Zeitalter): Mitte + Ring (7 Felder, auf großen Karten mehr), durch mindestens ein Meeresfeld vom Rest getrennt.
 * Hat zwei Häfen (einen Kolonialhafen 2:1 und einen 3:1). Gibt die IDs der neuen Felder zurück.
 */
export function addIsland(board, rng, number = 1, extraRing = 0) {
  const R = board.radius;
  const cells = [[0, 0], ...HEX_DIRS];
  const ring2 = [];
  for (let i = 0; i < 6; i++) { // Ring 2 in Winkelreihenfolge: Ecken und Kantenmitten
    const [a, b] = [HEX_DIRS[i], HEX_DIRS[(i + 1) % 6]];
    ring2.push([a[0] * 2, a[1] * 2], [a[0] + b[0], a[1] + b[1]]);
  }
  for (let i = 0; i < extraRing; i++) cells.push(ring2[i]);
  const existing = board.hexes.filter((h) => h.island).map((h) => ({ x: h.x, y: h.y }));
  let center = null;
  for (let D = R + 3 + (extraRing ? 1 : 0); D < R + 9 && !center; D++) {
    let best = null;
    for (let q = -D; q <= D; q++) {
      for (let r = -D; r <= D; r++) {
        if (hexDist(q, r) !== D) continue;
        const spots = cells.map(([dq, dr]) => [q + dq, r + dr]);
        const clash = spots.some(([sq, sr]) => board.hexIndex[`${sq},${sr}`] !== undefined
          || HEX_DIRS.some(([a, b]) => board.hexIndex[`${sq + a},${sr + b}`] !== undefined));
        if (clash) continue;
        const c = hexCenter(q, r);
        const far = existing.length ? Math.min(...existing.map((e) => Math.hypot(e.x - c.x, e.y - c.y))) : 0;
        const score = far + rng() * 1.5;
        if (!best || score > best.score) best = { q, r, score };
      }
    }
    if (best) center = best;
  }
  if (!center) return [];
  const from = board.hexes.length;
  const kinds = shuffle([...RES, ...RES], rng);
  const nums = shuffle(cells.length <= 7 ? [3, 4, 5, 6, 8, 9, 10] : [3, 4, 5, 6, 8, 9, 10, 11, 5, 9], rng);
  const ids = [];
  cells.forEach(([dq, dr], i) => {
    const q = center.q + dq;
    const r = center.r + dr;
    const { x, y } = hexCenter(q, r);
    const h = { id: board.hexes.length, q, r, x, y, type: kinds[i % kinds.length], num: nums[i % nums.length], fog: false, island: number };
    board.hexes.push(h);
    board.hexIndex[`${q},${r}`] = h.id;
    ids.push(h.id);
  });
  // rote Zahlen nicht nebeneinander, gleiche Zahlen möglichst auch nicht
  for (let tries = 0; tries < 200; tries++) {
    let bad = 0;
    for (const id of ids) for (const n of hexNeighbors(board, id)) {
      if (!ids.includes(n) || n < id) continue;
      const a = board.hexes[id].num; const b = board.hexes[n].num;
      if (a === b || ((a === 6 || a === 8) && (b === 6 || b === 8))) bad++;
    }
    if (!bad) break;
    const sh = shuffle(ids.map((id) => board.hexes[id].num), rng);
    ids.forEach((id, i) => { board.hexes[id].num = sh[i]; });
  }
  extendGraph(board, from);
  // Häfen: ein Kolonialhafen (2:1 für die Ware der Insel) und ein 3:1-Hafen an der Küste der Insel
  const mine = new Set(ids);
  const coast = board.edges.filter((e) => e.hexes.length === 1 && mine.has(e.hexes[0]));
  const c0 = hexCenter(center.q, center.r);
  const mid = (e) => ({ x: (board.vertices[e.a].x + board.vertices[e.b].x) / 2, y: (board.vertices[e.a].y + board.vertices[e.b].y) / 2 });
  coast.sort((e1, e2) => Math.atan2(mid(e1).y - c0.y, mid(e1).x - c0.x) - Math.atan2(mid(e2).y - c0.y, mid(e2).x - c0.x));
  const specialty = RES[Math.floor(rng() * RES.length)];
  const types = [specialty, 'any'];
  const used = new Set();
  let idx = Math.floor(rng() * coast.length);
  types.forEach((type, k) => {
    let at = (idx + Math.floor((k * coast.length) / 2)) % coast.length;
    for (let t = 0; t < coast.length; t++) {
      const e = coast[at];
      if (!used.has(e.a) && !used.has(e.b)) break;
      at = (at + 1) % coast.length;
    }
    const e = coast[at];
    if (used.has(e.a) || used.has(e.b)) return;
    used.add(e.a); used.add(e.b);
    const m = mid(e);
    const len = Math.hypot(m.x - c0.x, m.y - c0.y) || 1;
    board.vertices[e.a].port = type;
    board.vertices[e.b].port = type;
    board.ports.push({ id: board.ports.length, type, edge: e.id, verts: [e.a, e.b], x: m.x + ((m.x - c0.x) / len) * 0.76, y: m.y + ((m.y - c0.y) / len) * 0.76, ex: m.x, ey: m.y, island: number });
  });
  computeBounds(board);
  return ids;
}

export function hexPips(h) {
  return h.type === 'desert' || !h.num ? 0 : PIP[h.num];
}
