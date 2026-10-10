// SVG-Darstellung des Spielfelds inkl. Zoom/Pan und anklickbarer Positionen.
import { RES_INFO } from '../engine/constants.js';
import {
  art, COLOR_ID, piece, resImg, harborImg, fogImg, IMG, PIECE_BOX,
} from './assets.js';
import { roadDefs, roadOnEdge } from './road.js';

const TERRAIN = {
  wood: { grad: ['#439165', '#2c6c4a'] },
  brick: { grad: ['#d27649', '#aa502d'] },
  sheep: { grad: ['#a3d08e', '#72a65f'] },
  wheat: { grad: ['#ebca5c', '#cb9d2d'] },
  ore: { grad: ['#a89f95', '#706862'] },
  desert: { grad: ['#ecdcab', '#d3bd86'] },
  fog: { grad: ['#c3cbe6', '#8c97bd'] },
  gold: { grad: ['#b79af0', '#6c4bb8'] },
};

const PIPCOUNT = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

const ROBBER = '<ellipse cx="0" cy="0.28" rx="0.2" ry="0.07" fill="rgba(0,0,0,.35)"/><path d="M-0.17,0.28 Q-0.2,-0.05 0,-0.12 Q0.2,-0.05 0.17,0.28 Z" fill="#20242c" stroke="#000" stroke-width="0.02"/><circle cx="0" cy="-0.2" r="0.11" fill="#20242c" stroke="#000" stroke-width="0.02"/>';
const HOUSE = 'M-0.2,0.17 L-0.2,-0.05 L0,-0.25 L0.2,-0.05 L0.2,0.17 Z';
const CITY = 'M-0.3,0.2 L-0.3,-0.06 L-0.1,-0.06 L-0.1,-0.26 L0.05,-0.4 L0.2,-0.26 L0.2,-0.02 L0.32,-0.02 L0.32,0.2 Z';


/** Illustrierte Siedlung/Stadt: Boden des sichtbaren Inhalts sitzt knapp unter der Ecke. */
function pieceImage(kind, hex, vx, vy, extra = '') {
  const b = PIECE_BOX[kind];
  const w = (b.w * b.target) / b.b;
  const h = (b.h * b.target) / b.b;
  const x = vx - ((b.l + b.r) / 2 / b.w) * w;
  const y = vy + (kind === 'city' ? 0.26 : 0.22) - (b.b / b.h) * h;
  const shadow = `<ellipse cx="${vx.toFixed(3)}" cy="${(vy + 0.2).toFixed(3)}" rx="${(w * 0.34).toFixed(3)}" ry="${(w * 0.1).toFixed(3)}" class="piece-shadow"/>`;
  return `${shadow}<image href="${piece(COLOR_ID[hex] || 'blue', kind)}" x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" class="piece-img" ${extra}/>`;
}

const THIEF_W = 0.64;
function thiefImage(extra = '') {
  return `<image href="${IMG.thief}" x="${-THIEF_W / 2}" y="${-THIEF_W * 1.024}" width="${THIEF_W}" height="${THIEF_W * 1.024}" class="piece-img" ${extra}/>`;
}

export class BoardView {
  constructor(svg, onPick) {
    this.svg = svg;
    this.onPick = onPick;
    this.drag = null;
    this.moved = false;
    this.fitKey = null;
    svg.innerHTML = `
      <defs>
        ${Object.entries(TERRAIN).map(([k, t]) => `
          <linearGradient id="g-${k}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${t.grad[0]}"/><stop offset="1" stop-color="${t.grad[1]}"/>
          </linearGradient>`).join('')}
        ${roadDefs()}
        <radialGradient id="tokenGrad" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#fffaea"/><stop offset="1" stop-color="#e6d6aa"/></radialGradient>
        <radialGradient id="portGrad" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#fff6dc"/><stop offset="1" stop-color="#ead9a6"/></radialGradient>
        <radialGradient id="fogVeil" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <pattern id="grain" width=".5" height=".5" patternUnits="userSpaceOnUse">
          <circle cx=".06" cy=".11" r=".012" fill="#000" opacity=".16"/><circle cx=".31" cy=".05" r=".010" fill="#fff" opacity=".22"/>
          <circle cx=".19" cy=".29" r=".012" fill="#000" opacity=".12"/><circle cx=".44" cy=".34" r=".010" fill="#fff" opacity=".2"/>
          <circle cx=".12" cy=".44" r=".010" fill="#fff" opacity=".16"/><circle cx=".37" cy=".47" r=".012" fill="#000" opacity=".14"/>
        </pattern>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.14"/></filter>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="0.05" stdDeviation="0.05" flood-color="#000" flood-opacity="0.55"/>
        </filter>
      </defs>
      <g id="world"></g>`;
    this.world = svg.querySelector('#world');
    this.bindEvents();
  }

  // ------------------------------------------------------------- Zoom & Pan
  bindEvents() {
    const svg = this.svg;
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 0.88 : 1.14);
    }, { passive: false });

    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      this.drag = { x: e.clientX, y: e.clientY, vb: this.getVB(), id: e.pointerId };
      this.moved = false;
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.moved && Math.hypot(dx, dy) < 6) return;
      if (!this.moved) { this.moved = true; svg.classList.add('panning'); try { svg.setPointerCapture(e.pointerId); } catch { /* egal */ } }
      const rect = svg.getBoundingClientRect();
      const vb = this.drag.vb;
      const k = Math.max(vb.w / rect.width, vb.h / rect.height);
      this.setVB({ x: vb.x - dx * k, y: vb.y - dy * k, w: vb.w, h: vb.h });
    });
    const end = () => {
      this.drag = null;
      svg.classList.remove('panning');
      setTimeout(() => { this.moved = false; }, 0);
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    svg.addEventListener('click', (e) => {
      if (this.moved) return;
      const t = e.target.closest('[data-v],[data-e],[data-h]');
      if (!t) return;
      if (t.dataset.v !== undefined) this.onPick('vertex', Number(t.dataset.v));
      else if (t.dataset.e !== undefined) this.onPick('edge', Number(t.dataset.e));
      else if (t.dataset.h !== undefined) this.onPick('hex', Number(t.dataset.h));
    });

    // Pinch-Zoom für Touch
    const pts = new Map();
    let pinch = null;
    svg.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') pts.set(e.pointerId, e); });
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch) this.zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, pinch / d);
        pinch = d;
        this.moved = true;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
  }

  getVB() {
    const [x, y, w, h] = this.svg.getAttribute('viewBox').split(' ').map(Number);
    return { x, y, w, h };
  }

  setVB({ x, y, w, h }) {
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }

  zoomAt(cx, cy, factor) {
    const vb = this.getVB();
    const rect = this.svg.getBoundingClientRect();
    const k = Math.max(vb.w / rect.width, vb.h / rect.height);
    // Mittelpunkt des sichtbaren Bereichs im Viewport (preserveAspectRatio = meet)
    const offX = (rect.width - vb.w / k) / 2;
    const offY = (rect.height - vb.h / k) / 2;
    const px = vb.x + (cx - rect.left - offX) * k;
    const py = vb.y + (cy - rect.top - offY) * k;
    const nw = Math.min(Math.max(vb.w * factor, this.minW || 4), this.maxW || 80);
    const f = nw / vb.w;
    const nh = vb.h * f;
    this.setVB({ x: px - (px - vb.x) * f, y: py - (py - vb.y) * f, w: nw, h: nh });
  }

  zoomBy(factor) {
    const r = this.svg.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  fit(board = this.board) {
    if (!board) return;
    const b = board.bounds;
    const narrow = window.innerWidth < 600 && window.innerHeight > window.innerWidth;
    const pad = narrow ? 1.1 : 1.5;
    const top = 1.3;
    const footer = window.matchMedia('(min-width: 861px) and (min-height: 521px)').matches;
    const bottom = footer ? 4.4 : narrow ? 3.2 : 2.7;
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + top + bottom;
    this.setVB({ x: b.minX - pad, y: b.minY - top, w, h });
    this.minW = w * 0.18;
    this.maxW = w * 1.8;
  }

  // ------------------------------------------------------------- Rendering
  /**
   * @param game   Game
   * @param ui     { vertices:Set, edges:Set, hexes:Set, kind, fresh:{pieces:Set,hexes:Set,remap:boolean} }
   */
  render(game, ui = {}) {
    const board = game.s.board;
    const key = `${board.size}-${board.variant}-${board.hexes.length}-${board.bounds.maxX}`;
    if (this.fitKey !== key) { this.board = board; this.fit(board); this.fitKey = key; }
    this.board = board;
    const s = game.s;
    const out = [];
    const hitHexes = ui.hitHexes || new Set();
    const hitVerts = new Set();
    for (const id of hitHexes) for (const v of board.hexes[id].verts) hitVerts.add(v);

    // Küste / Meer
    out.push('<g class="shore">');
    for (const h of board.hexes) out.push(`<polygon points="${this.hexPoints(board, h, 1.13)}" fill="#3aa3c2" opacity="0.5" filter="url(#blur)"/>`);
    out.push('</g>');

    // Häfen (unter den Feldern, damit die Stege nicht überdecken)
    out.push('<g class="ports">');
    for (const p of board.ports) {
      for (const vid of p.verts) {
        const v = board.vertices[vid];
        out.push(`<line x1="${p.x}" y1="${p.y}" x2="${v.x}" y2="${v.y}" class="pier"/><line x1="${p.x}" y1="${p.y}" x2="${v.x}" y2="${v.y}" class="pier-hi"/>`);
      }
    }
    out.push('</g>');

    // Felder
    out.push('<g class="hexes">');
    for (const h of board.hexes) {
            const fresh = ui.fresh?.hexes?.has(h.id) ? ' flip' : '';
      const remap = ui.fresh?.remap ? ' remap' : '';
      out.push(`<g class="hex${fresh}${remap}${hitHexes.has(h.id) ? ' hit' : ''}" data-hid="${h.id}" style="--d:${(h.id % 7) * 40}ms">`);
      out.push(`<polygon points="${this.hexPoints(board, h, 0.965)}" fill="url(#g-${h.fog ? 'fog' : h.type})" class="hexpoly" stroke="rgba(0,0,0,.3)" stroke-width="0.04"/>`);
      out.push(`<polygon points="${this.hexPoints(board, h, 0.965)}" fill="url(#grain)" pointer-events="none"/>`);
      if (h.fog) out.push(`<polygon points="${this.hexPoints(board, h, 0.965)}" fill="url(#fogVeil)" pointer-events="none"/>`);
      if (h.type === 'gold' && !h.fog) out.push(`<polygon points="${this.hexPoints(board, h, 0.965)}" fill="url(#fogVeil)" class="gold-shine" pointer-events="none"/>`);
      // Abgeschrägter Rand: Licht oben links, Schatten unten rechts
      const c = (k) => { const v = board.vertices[h.verts[k]]; return `${(h.x + (v.x - h.x) * 0.92).toFixed(3)},${(h.y + (v.y - h.y) * 0.92).toFixed(3)}`; };
      out.push(`<polyline points="${c(3)} ${c(4)} ${c(5)} ${c(0)}" class="bevel-light"/><polyline points="${c(0)} ${c(1)} ${c(2)} ${c(3)}" class="bevel-dark"/>`);
      const blocked = h.id === s.robber;
      if (h.fog) {
        if (art.ok && fogImg()) out.push(`<image href="${fogImg()}" x="${(h.x - 0.836).toFixed(3)}" y="${(h.y - 0.965).toFixed(3)}" width="1.672" height="1.93" preserveAspectRatio="none" pointer-events="none"/>`);
        else if (art.ok) out.push(`<image href="${IMG.wild}" x="${h.x - 0.55}" y="${h.y - 0.55}" width="1.1" height="1.1" class="hex-art" opacity=".95"/>`);
        else {
          out.push(`<use href="#i-cloud" x="${h.x - 0.5}" y="${h.y - 0.62}" width="1" height="1" class="hex-ico fogico"/>`);
          out.push(`<text x="${h.x}" y="${h.y + 0.62}" class="fog-q">?</text>`);
        }
      } else if (h.type === 'desert') {
        if (art.ok) out.push(`<image href="${IMG.desert}" x="${h.x - 0.62}" y="${h.y - 0.5}" width="1.24" height="0.92" class="hex-art"/>`);
        else out.push(`<use href="#i-dune" x="${h.x - 0.5}" y="${h.y - 0.5}" width="1" height="1" class="hex-ico"/>`);
      } else {
        // Bild in der breiten Mitte der Kachel, Chip leicht überlappend darunter
        if (art.ok && h.type === 'gold') {
          // Wahlfeld: alle fünf Rohstoffe im Kreis = „such dir einen aus“
          const cx = h.x - 0.4;
          const cy = h.y - 0.1;
          const five = ['wood', 'brick', 'sheep', 'wheat', 'ore'].map((r, i) => {
            const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
            // doppelt so groß zeichnen und halbieren: sehr kleine SVG-Bilder werden von manchen Browsern sonst nicht gerendert
            return `<image href="${resImg(r)}" x="-0.34" y="-0.34" width="0.68" height="0.68" transform="translate(${(cx + Math.cos(a) * 0.27).toFixed(3)} ${(cy + Math.sin(a) * 0.27).toFixed(3)}) scale(.5)"/>`;
          }).join('');
          out.push(`<g class="hex-art gold-emblem${blocked ? ' dim' : ''}"><circle cx="${cx}" cy="${cy}" r="0.5" class="gold-ring"/>${five}<text x="${cx}" y="${(h.y + 0.62).toFixed(3)}" class="gold-label">WAHL</text></g>`);
        } else if (art.ok) {
          out.push(`<image href="${resImg(h.type)}" x="${(h.x - 0.63).toFixed(3)}" y="${(h.y - 0.33).toFixed(3)}" width="0.62" height="0.62" class="hex-art${blocked ? ' dim' : ''}"/>`);
        }
        else out.push(`<use href="#i-${h.type === 'gold' ? 'coin' : h.type}" x="${h.x - 0.6}" y="${h.y - 0.3}" width="0.56" height="0.56" class="hex-ico"/>`);
        const red = h.num === 6 || h.num === 8;
        const two = h.num >= 10;
        out.push(`<g transform="translate(${h.x + 0.33},${h.y + 0.02})" class="token${blocked ? ' dim' : ''}"><circle r="0.36" fill="url(#tokenGrad)" stroke="#b69a58" stroke-width="0.035"/><circle r="0.3" fill="none" stroke="rgba(120,90,40,.35)" stroke-width="0.016"/>`);
        out.push(`<text y="-0.045" class="num${red ? ' red' : ''}${two ? ' two' : ''}">${h.num}</text>`);
        const n = PIPCOUNT[h.num];
        let dots = '';
        for (let i = 0; i < n; i++) dots += `<circle cx="${(i - (n - 1) / 2) * 0.096}" cy="0.2" r="0.032" fill="${red ? '#c62828' : '#5a4a2c'}"/>`;
        out.push(`${dots}</g>`);
      }
      out.push('</g>');
    }
    out.push('</g>');

    // Treffer des Würfelwurfs: einmaliges Aufleuchten der betroffenen Felder
    if (hitHexes.size) {
      out.push('<g class="hitrings">');
      for (const id of hitHexes) out.push(`<polygon points="${this.hexPoints(board, board.hexes[id], 0.965)}" class="hit-ring"/>`);
      out.push('</g>');
    }

    // Hafen-Marker
    out.push('<g class="portmarks">');
    for (const p of board.ports) {
      const hb = art.ok ? harborImg(p.type) : null;
      if (hb) {
        out.push(`<g transform="translate(${p.x},${p.y})" class="port${p.type === 'any' ? ' any' : ''}"><image href="${hb}" x="-0.47" y="-0.47" width="0.94" height="0.94" class="port-img"/></g>`);
        continue;
      }
      out.push(`<g transform="translate(${p.x},${p.y})" class="port"><circle r="0.45" class="port-bg"/><circle r="0.385" class="port-inner"/>`);
      if (p.type === 'any') out.push('<text y="0.1" class="port-ratio big">3:1</text>');
      else if (art.ok) out.push(`<image href="${resImg(p.type)}" x="-0.22" y="-0.34" width="0.44" height="0.44"/><text y="0.27" class="port-ratio">2:1</text>`);
      else out.push(`<use href="#i-${p.type}" x="-0.2" y="-0.31" width="0.4" height="0.4" class="port-ico"/><text y="0.27" class="port-ratio">2:1</text>`);
      out.push('</g>');
    }
    out.push('</g>');

    // Straßen
    out.push('<g class="roads">');
    for (const [eid, owner] of Object.entries(s.roads)) {
      const e = board.edges[eid];
      const a = board.vertices[e.a];
      const b = board.vertices[e.b];
      const pop = ui.fresh?.pieces?.has(`e${eid}`) ? ' draw' : '';
      out.push(`<g class="road${pop}">${roadOnEdge(a, b, s.players[owner].color)}</g>`);
    }
    out.push('</g>');

    // Gebäude
    out.push('<g class="buildings">');
    for (const [vid, b] of Object.entries(s.buildings)) {
      const v = board.vertices[vid];
      const pop = ui.fresh?.pieces?.has(`v${vid}`) ? ' pop' : '';
      const hit = hitVerts.has(Number(vid)) ? ' hit' : '';
      if (art.ok) out.push(`<g><g class="bld${pop}${hit}">${pieceImage(b.type, s.players[b.owner].color, v.x, v.y)}</g></g>`);
      else out.push(`<g transform="translate(${v.x},${v.y})" filter="url(#shadow)"><g class="bld${pop}${hit}"><path d="${b.type === 'city' ? CITY : HOUSE}" fill="${s.players[b.owner].color}" class="bld-shape"/></g></g>`);
    }
    out.push('</g>');

    // Räuber
    const rh = board.hexes[s.robber];
    out.push(`<g transform="translate(${rh.x},${rh.y + 0.8})" class="robber"><g class="robber-in">${art.ok ? `<ellipse cx="0" cy="0" rx="0.3" ry="0.09" fill="rgba(0,0,0,.45)"/>${thiefImage()}` : `<g transform="translate(0,-.34)">${ROBBER}</g>`}</g></g>`);

    // Hervorhebungen (klickbar) – ruhig, mit Vorschau der Figur beim Darüberfahren
    const ghost = ui.ghost || {};
    const gcol = ghost.color || '#fff';
    out.push('<g class="hl">');
    if (ui.selected) {
      for (const id of ui.selected) {
        const v = board.vertices[id];
        out.push(`<circle cx="${v.x}" cy="${v.y}" r="0.36" class="sel-ring"/>`);
      }
    }
    if (ui.hexes) {
      for (const id of ui.hexes) {
        const h = board.hexes[id];
        const pend = ui.pending && ui.pending.kind === 'hex' && ui.pending.id === id;
        out.push(`<g class="hl-hex${pend ? ' pending' : ''}" data-h="${id}"><polygon points="${this.hexPoints(board, h, 0.93)}" class="hl-hex-vis"/>`
          + `<circle cx="${h.x}" cy="${h.y}" r="0.5" class="hl-pulse"/><circle cx="${h.x}" cy="${h.y}" r="0.5" class="hl-pulse p2"/>`
          + (ghost.hexKind === 'harvest' ? '' : `<g transform="translate(${h.x},${h.y + 0.8})" class="ghost${pend ? ' on' : ''}">${art.ok ? thiefImage() : `<g transform="translate(0,-.34)">${ROBBER}</g>`}</g>`) + '</g>');
      }
    }
    if (ui.edges) {
      for (const id of ui.edges) {
        const e = board.edges[id];
        const a = board.vertices[e.a];
        const b = board.vertices[e.b];
        const [x1, y1, x2, y2] = this.shorten(a, b, 0.13);
        const pend = ui.pending && ui.pending.kind === 'edge' && ui.pending.id === id;
        out.push(`<g data-e="${id}" class="hl-edge${pend ? ' pending' : ''}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="hl-edge-vis"/>`
          + `<circle cx="${((a.x + b.x) / 2).toFixed(3)}" cy="${((a.y + b.y) / 2).toFixed(3)}" r="0.15" class="hl-pulse ep"/><circle cx="${((a.x + b.x) / 2).toFixed(3)}" cy="${((a.y + b.y) / 2).toFixed(3)}" r="0.15" class="hl-pulse ep p2"/><circle cx="${((a.x + b.x) / 2).toFixed(3)}" cy="${((a.y + b.y) / 2).toFixed(3)}" r="0.06" class="hl-dot"/>`
          + `<g class="ghost${pend ? ' on' : ''}">${roadOnEdge(a, b, gcol)}</g>`
          + `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="hl-hit"/></g>`);
      }
    }
    if (ui.vertices) {
      for (const id of ui.vertices) {
        const v = board.vertices[id];
        const shape = ghost.kind === 'city' ? CITY : HOUSE;
        const pend = ui.pending && ui.pending.kind === 'vertex' && ui.pending.id === id;
        out.push(`<g transform="translate(${v.x},${v.y})" data-v="${id}" class="hl-vertex${pend ? ' pending' : ''}"><circle r="0.17" class="hl-pulse vp"/><circle r="0.17" class="hl-pulse vp p2"/><circle r="0.17" class="hl-ring"/>`
          + (art.ok ? `<g class="ghost${pend ? ' on' : ''}">${pieceImage(ghost.kind === 'city' ? 'city' : 'settlement', gcol, 0, 0)}</g>` : `<g class="ghost${pend ? ' on' : ''}"><path d="${shape}" fill="${gcol}" class="bld-shape"/></g>`) + '<circle r="0.38" class="hl-hit"/></g>');
      }
    }
    out.push('</g>');

    this.world.innerHTML = out.join('');
    this.svg.classList.toggle('picking', !!(ui.vertices?.size || ui.edges?.size || ui.hexes?.size));
    this.svg.dataset.ghost = ghost.kind || '';
  }

  hexPoints(board, h, scale) {
    return h.verts
      .map((vid) => {
        const v = board.vertices[vid];
        return `${(h.x + (v.x - h.x) * scale).toFixed(3)},${(h.y + (v.y - h.y) * scale).toFixed(3)}`;
      })
      .join(' ');
  }

  shorten(a, b, d) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    return [a.x + ux * d, a.y + uy * d, b.x - ux * d, b.y - uy * d];
  }
}
