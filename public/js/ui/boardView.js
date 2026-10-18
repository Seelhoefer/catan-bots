// SVG-Darstellung des Spielfelds inkl. Zoom/Pan und anklickbarer Positionen.
import { RES_INFO } from '../engine/constants.js';
import {
  art, COLOR_ID, piece, resImg, harborImg, fogImg, tileImg, IMG, pieceBox, artStyle, compactView, classicResImg,
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
  const b = pieceBox(kind);
  const w = (b.w * b.target) / (b.r - b.l);
  const h = (b.h * b.target) / (b.r - b.l);
  const x = vx - ((b.l + b.r) / 2 / b.w) * w;
  const y = vy + (kind === 'city' ? 0.26 : 0.22) - (b.b / b.h) * h;
  const shadow = `<ellipse cx="${vx.toFixed(3)}" cy="${(vy + 0.2).toFixed(3)}" rx="${(w * 0.4).toFixed(3)}" ry="${(w * 0.11).toFixed(3)}" class="piece-shadow"/>`;
  return `${shadow}<image href="${piece(COLOR_ID[hex] || 'blue', kind)}" x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" class="piece-img" ${extra}/>`;
}

const THIEF_W = 1.08;
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
        <radialGradient id="worldGrad" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#fff2c4"/><stop offset="1" stop-color="#d9a73a"/></radialGradient>
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
      <g id="world"></g>
      <g id="flagLayer" pointer-events="none"></g>
      <g id="robberLayer" pointer-events="none"></g>`;
    this.world = svg.querySelector('#world');
    this.robberLayer = svg.querySelector('#robberLayer');
    this.flagLayer = svg.querySelector('#flagLayer');
    this.flags = new Map();
    this.flagsFresh = true;
    this.robberAt = null;
    this.robberEnd = 0;
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
      this.stopZoom();
      this.stopInertia();
      this.drag = { x: e.clientX, y: e.clientY, vb: this.getVB(), id: e.pointerId, type: e.pointerType };
      this.samples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
      this.moved = false;
    });
    svg.addEventListener('pointermove', (e) => {
      if (!this.drag || this.pinching) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.moved && Math.hypot(dx, dy) < 6) return;
      if (!this.moved) { this.moved = true; svg.classList.add('panning'); try { svg.setPointerCapture(e.pointerId); } catch { /* egal */ } }
      const now = performance.now();
      this.samples.push({ t: now, x: e.clientX, y: e.clientY });
      while (this.samples.length > 2 && now - this.samples[0].t > 100) this.samples.shift();
      const rect = svg.getBoundingClientRect();
      const vb = this.drag.vb;
      const k = Math.max(vb.w / rect.width, vb.h / rect.height);
      this.queueVB(this.clampVB({ x: vb.x - dx * k, y: vb.y - dy * k, w: vb.w, h: vb.h }));
    });
    const end = (e) => {
      const wasMoved = this.moved;
      const drag = this.drag;
      this.drag = null;
      svg.classList.remove('panning');
      if (wasMoved && drag && drag.type === 'touch' && e && e.type === 'pointerup' && !this.pinching) this.startInertia();
      setTimeout(() => { this.moved = false; }, 0);
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    svg.addEventListener('click', (e) => {
      if (this.moved || this.gestureTouch) return;
      const t = e.target.closest('[data-v],[data-e],[data-h]');
      if (!t) {
        // Doppeltipp auf freie Fläche: näher heranzoomen bzw. wieder alles zeigen
        if (e.pointerType !== 'touch') return;
        const now = performance.now();
        const prev = this.lastTap;
        this.lastTap = { t: now, x: e.clientX, y: e.clientY };
        if (prev && now - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 32) {
          this.lastTap = null;
          const vb = this.getVB();
          const fitW = this.fitW || vb.w;
          if (vb.w < fitW * 0.75) this.fit(this.board, true); else this.zoomAt(e.clientX, e.clientY, 0.45);
        }
        return;
      }
      if (t.dataset.v !== undefined) this.onPick('vertex', Number(t.dataset.v));
      else if (t.dataset.e !== undefined) this.onPick('edge', Number(t.dataset.e));
      else if (t.dataset.h !== undefined) this.onPick('hex', Number(t.dataset.h));
    });

    // Pinch-Zoom für Touch: Der Punkt unter der Fingermitte bleibt unter der Fingermitte (zoomt und verschiebt mit),
    // gerechnet immer gegen den Start der Geste (kein Aufsummieren von Rundungsfehlern), je Bild genau eine Aktualisierung.
    // Über die Zoomgrenzen hinaus gibt das Brett gedämpft nach und federt beim Loslassen weich zurück.
    const pts = new Map();
    let g0 = null;
    const spread = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; };
    const damp = (w, lo, hi) => (w < lo ? lo * (w / lo) ** 0.45 : w > hi ? hi * (w / hi) ** 0.45 : w);
    svg.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, e);
      if (pts.size === 2) {
        this.stopZoom();
        this.pinching = true;
        this.gestureTouch = true; // der Rest der Geste löst keinen Tipp aufs Brett aus
        this.drag = null;
        this.moved = true;
        svg.classList.remove('panning');
        g0 = { ...spread(), vb: this.getVB() };
      }
    });
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size !== 2 || !g0) return;
      const cur = spread();
      const rect = svg.getBoundingClientRect();
      const vb0 = g0.vb;
      const lo = this.minW || 4;
      const hi = this.maxW || 80;
      const w = damp(vb0.w * (g0.d / cur.d), lo, hi);
      const f = w / vb0.w;
      const k0 = Math.max(vb0.w / rect.width, vb0.h / rect.height);
      const offX = (rect.width - vb0.w / k0) / 2;
      const offY = (rect.height - vb0.h / k0) / 2;
      const px = vb0.x + (g0.x - rect.left - offX) * k0; // Brettpunkt unter der Fingermitte beim Start
      const py = vb0.y + (g0.y - rect.top - offY) * k0;
      const k1 = k0 * f;
      this.queueVB(this.clampVB({ x: px - (cur.x - rect.left - offX) * k1, y: py - (cur.y - rect.top - offY) * k1, w, h: vb0.h * f }));
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0 && this.gestureTouch) setTimeout(() => { this.gestureTouch = false; }, 80);
      if (pts.size < 2 && g0) {
        g0 = null;
        if (this._rafVB) { cancelAnimationFrame(this._rafVB); this._rafVB = 0; if (this._pendVB) this.setVB(this._pendVB); this._pendVB = null; }
        // über die Grenze gezoomt → weich zurückfedern
        const vb = this.getVB();
        const lo = this.minW || 4;
        const hi = this.maxW || 80;
        if (vb.w < lo - 0.01 || vb.w > hi + 0.01) this.zoomAt(window.innerWidth / 2, window.innerHeight / 2, Math.min(hi, Math.max(lo, vb.w)) / vb.w);
        // ein Finger bleibt liegen: er schiebt weiter, ohne dass das Brett springt
        const rest = [...pts.values()][0];
        if (rest) { this.drag = { x: rest.clientX, y: rest.clientY, vb: this.getVB(), id: rest.pointerId, type: 'touch' }; this.samples = [{ t: performance.now(), x: rest.clientX, y: rest.clientY }]; this.moved = true; }
        setTimeout(() => { this.pinching = false; }, 120);
      }
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    // iOS: Browser-eigenes Seiten-Zoomen per Geste unterdrücken
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) svg.addEventListener(t, (e) => e.preventDefault());
  }

  /** Änderungen der Sicht bündeln: höchstens eine Aktualisierung pro Bild (weicheres Wischen auf dem Handy). */
  queueVB(vb) {
    this._pendVB = vb;
    if (this._rafVB) return;
    this._rafVB = requestAnimationFrame(() => { this._rafVB = 0; if (this._pendVB) this.setVB(this._pendVB); this._pendVB = null; });
  }

  /** Bildmitte darf das Brett nur ein Stück weit verlassen. */
  clampVB(vb) {
    const b = this.board?.bounds;
    if (!b) return vb;
    const mx = (b.maxX - b.minX) * 0.35;
    const my = (b.maxY - b.minY) * 0.35;
    const cx = Math.min(b.maxX + mx, Math.max(b.minX - mx, vb.x + vb.w / 2));
    const cy = Math.min(b.maxY + my, Math.max(b.minY - my, vb.y + vb.h / 2));
    return { ...vb, x: cx - vb.w / 2, y: cy - vb.h / 2 };
  }

  panByPx(dx, dy) {
    const vb = this.getVB();
    const rect = this.svg.getBoundingClientRect();
    const k = Math.max(vb.w / rect.width, vb.h / rect.height);
    this.setVB(this.clampVB({ x: vb.x - dx * k, y: vb.y - dy * k, w: vb.w, h: vb.h }));
  }

  /** Nachlauf nach dem Wischen: gleitet mit abnehmender Geschwindigkeit weiter (wie bei Karten-Apps). */
  startInertia() {
    const sm = this.samples || [];
    if (sm.length < 2) return;
    const a = sm[0];
    const z = sm[sm.length - 1];
    const dt = z.t - a.t;
    if (dt < 8 || performance.now() - z.t > 80) return; // am Ende gestoppt → kein Nachlauf
    let vx = (z.x - a.x) / dt; // Pixel pro ms
    let vy = (z.y - a.y) / dt;
    if (Math.hypot(vx, vy) < 0.18) return;
    const cap = 3.2;
    const sp = Math.hypot(vx, vy);
    if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    let last = performance.now();
    const step = (t) => {
      const d = Math.min(40, t - last);
      last = t;
      this.panByPx(vx * d, vy * d);
      const f = Math.exp(-d / 320); // Auslaufzeit
      vx *= f; vy *= f;
      if (Math.hypot(vx, vy) > 0.02) this._inertia = requestAnimationFrame(step); else this._inertia = 0;
    };
    this._inertia = requestAnimationFrame(step);
  }

  stopInertia() {
    if (this._inertia) cancelAnimationFrame(this._inertia);
    this._inertia = 0;
  }

  getVB() {
    const [x, y, w, h] = this.svg.getAttribute('viewBox').split(' ').map(Number);
    return { x, y, w, h };
  }

  setVB({ x, y, w, h }) {
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }

  /** Zoom um den Punkt (cx, cy); mit GSAP weich animiert (Folge-Impulse, z. B. Mausrad, bauen auf dem Ziel auf). */
  zoomAt(cx, cy, factor, animate = true) {
    const vb = (animate && this.zoomTarget) || this.getVB();
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
    const target = { x: px - (px - vb.x) * f, y: py - (py - vb.y) * f, w: nw, h: nh };
    const g = window.gsap;
    if (!animate || !g) { this.stopZoom(); this.setVB(target); return; }
    this.zoomTarget = target;
    const cur = { ...this.getVB() };
    if (this.zoomTween) this.zoomTween.kill();
    this.zoomTween = g.to(cur, {
      x: target.x, y: target.y, w: target.w, h: target.h, duration: 0.32, ease: 'power3.out',
      onUpdate: () => this.setVB(cur),
      onComplete: () => { this.zoomTarget = null; this.zoomTween = null; },
    });
  }

  animateTo(target) {
    const cur = { ...this.getVB() };
    if (this.zoomTween) this.zoomTween.kill();
    this.zoomTarget = target;
    this.zoomTween = window.gsap.to(cur, {
      ...target, duration: 0.55, ease: 'power3.inOut',
      onUpdate: () => this.setVB(cur),
      onComplete: () => { this.zoomTarget = null; this.zoomTween = null; },
    });
  }

  stopZoom() {
    this.stopInertia();
    if (this.zoomTween) this.zoomTween.kill();
    this.zoomTween = null;
    this.zoomTarget = null;
  }

  /** Brett-Koordinate → Bildschirm (für Effekte über dem Brett). */
  screenPoint(x, y) {
    const pt = this.svg.createSVGPoint();
    pt.x = x; pt.y = y;
    const r = pt.matrixTransform(this.svg.getScreenCTM());
    return { x: r.x, y: r.y };
  }

  /** Bildschirmpixel pro Brett-Einheit. */
  pxPerUnit() { return this.svg.getScreenCTM().a; }

  zoomBy(factor) {
    const r = this.svg.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }

  fit(board = this.board, animate = false) {
    if (!board) return;
    const b = board.bounds;
    const narrow = window.innerWidth < 600 && window.innerHeight > window.innerWidth;
    const pad = narrow ? 1.1 : 1.5;
    const top = 1.3;
    const footer = window.matchMedia('(min-width: 861px) and (min-height: 521px)').matches;
    const bottom = footer ? 4.4 : narrow ? (artStyle() === 'mobile' ? 3.0 : 2.6) : 2.2; // am Handy mit Rohstoffkarten mehr Platz unten
    const w = b.maxX - b.minX + pad * 2;
    const h = b.maxY - b.minY + top + bottom;
    this.minW = w * 0.1;
    this.fitW = w;
    const target = { x: b.minX - pad, y: b.minY - top, w, h };
    if (animate && window.gsap) this.animateTo(target); else { this.stopZoom(); this.setVB(target); }
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
    if (this.fitKey !== key) { this.board = board; this.fit(board); this.fitKey = key; this.flags.clear(); this.flagLayer.innerHTML = ''; this.flagsFresh = true; }
    this.board = board;
    const s = game.s;
    const out = [];
    const hitHexes = ui.hitHexes || new Set();
    const picking = !!(ui.vertices?.size || ui.edges?.size || ui.hexes?.size);
    const hitVerts = new Set();
    for (const id of hitHexes) for (const v of board.hexes[id].verts) hitVerts.add(v);

    // Küste / Meer
    out.push('<g class="shore">');
    for (const h of board.hexes) for (const [sc, op] of [[1.2, 0.1], [1.14, 0.14], [1.08, 0.18]]) out.push(`<polygon points="${this.hexPoints(board, h, sc)}" fill="#3aa3c2" opacity="${op}"/>`);
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
    // Vektor-Grafik auf dem Handy: Rohstoffsymbol über der Zahl, beides mittig im Feld
    const stacked = art.ok && artStyle() === 'vector' && compactView();
    const topTokens = []; // Zahlenmarken liegen in dieser Ansicht über den Gebäuden, damit keine Zahl verdeckt wird
    for (const h of board.hexes) {
            const fresh = ui.fresh?.hexes?.has(h.id) ? ' flip' : '';
      const remap = ui.fresh?.remap ? ' remap' : '';
      out.push(`<g class="hex${fresh}${remap}${hitHexes.has(h.id) ? ' hit' : ''}" data-hid="${h.id}" style="--d:${(h.id % 7) * 40}ms">`);
      out.push(`<polygon points="${this.hexPoints(board, h, 0.965)}" fill="url(#g-${h.fog ? 'fog' : h.type})" class="hexpoly" stroke="rgba(0,0,0,.3)" stroke-width="0.04"/>`);
      const tile = art.ok && !h.fog ? tileImg(h.type) : null;
      const blocked = h.id === s.robber;
      if (tile) {
        // Komplettes Feld-Hintergrundbild (Sechseck samt Rand); die Zahl liegt mittig darauf
        out.push(`<polygon points="${this.hexPoints(board, h, 1.02)}" transform="translate(0.02 0.05)" class="tile-shadow"/>`);
        out.push(`<image href="${tile}" x="${(h.x - 0.866).toFixed(3)}" y="${(h.y - 1).toFixed(3)}" width="1.732" height="2" preserveAspectRatio="none" class="hex-img${blocked ? ' dim' : ''}" pointer-events="none"/>`);
        if (blocked) out.push(`<polygon points="${this.hexPoints(board, h, 1)}" class="blocked-dim"/>`);
        if (h.num) {
          const red = h.num === 6 || h.num === 8;
          const two = h.num >= 10;
          (artStyle() === 'mobile' ? topTokens : out).push(`<g transform="translate(${h.x},${h.y}) scale(1.1)" class="token${blocked ? ' dim' : ''}"><circle r="0.36" cy="0.035" class="token-shadow"/><circle r="0.36" fill="url(#tokenGrad)" stroke="#b69a58" stroke-width="0.035"/><circle r="0.3" fill="none" stroke="rgba(120,90,40,.35)" stroke-width="0.016"/><text y="0.012" class="num${red ? ' red' : ''}${two ? ' two' : ''}">${h.num}</text></g>`);
          if (h.type === 'gold') out.push(`<text x="${h.x}" y="${(h.y + 0.62).toFixed(3)}" class="gold-label big">WAHL</text>`);
        }
      } else {
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
            const cx = stacked ? h.x : h.x - 0.4;
            const cy = stacked ? h.y - 0.31 : h.y - 0.1;
            const five = ['wood', 'brick', 'sheep', 'wheat', 'ore'].map((r, i) => {
              const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
              // doppelt so groß zeichnen und halbieren: sehr kleine SVG-Bilder werden von manchen Browsern sonst nicht gerendert
              return `<image href="${stacked ? classicResImg(r) : resImg(r)}" x="-0.34" y="-0.34" width="0.68" height="0.68" transform="translate(${(cx + Math.cos(a) * 0.27).toFixed(3)} ${(cy + Math.sin(a) * 0.27).toFixed(3)}) scale(.5)"/>`;
            }).join('');
            out.push(`<g class="hex-art gold-emblem${blocked ? ' dim' : ''}"${stacked ? ` transform="translate(${cx} ${cy}) scale(.62) translate(${-cx} ${-cy})"` : ''}><circle cx="${cx}" cy="${cy}" r="0.5" class="gold-ring"/>${five}${stacked ? '' : `<text x="${cx}" y="${(h.y + 0.62).toFixed(3)}" class="gold-label">WAHL</text>`}</g>`);
          } else if (art.ok) {
            if (stacked) out.push(`<image href="${classicResImg(h.type)}" x="${(h.x - 0.31).toFixed(3)}" y="${(h.y - 0.61).toFixed(3)}" width="0.62" height="0.62" class="hex-art${blocked ? ' dim' : ''}"/>`);
            else out.push(`<image href="${resImg(h.type)}" x="${(h.x - 0.63).toFixed(3)}" y="${(h.y - 0.33).toFixed(3)}" width="0.62" height="0.62" class="hex-art${blocked ? ' dim' : ''}"/>`);
          }
          else out.push(`<use href="#i-${h.type === 'gold' ? 'coin' : h.type}" x="${h.x - 0.6}" y="${h.y - 0.3}" width="0.56" height="0.56" class="hex-ico"/>`);
          const red = h.num === 6 || h.num === 8;
          const two = h.num >= 10;
          (stacked ? topTokens : out).push(`<g transform="${stacked ? `translate(${h.x},${h.y + 0.3}) scale(.86)` : `translate(${h.x + 0.33},${h.y + 0.02})`}" class="token${blocked ? ' dim' : ''}"><circle r="0.36" cy="0.035" class="token-shadow"/><circle r="0.36" fill="url(#tokenGrad)" stroke="#b69a58" stroke-width="0.035"/><circle r="0.3" fill="none" stroke="rgba(120,90,40,.35)" stroke-width="0.016"/>`);
          if (stacked) topTokens.push(`<text y="${two ? 0.162 : 0.195}" class="num big${red ? ' red' : ''}${two ? ' two' : ''}">${h.num}</text></g>`); // Grundlinie = halbe Ziffernhöhe: Zahl sitzt genau mittig im Kreis
          else out.push(`<text y="0.012" class="num${red ? ' red' : ''}${two ? ' two' : ''}">${h.num}</text></g>`);
        }

      }
      if (picking) out.push(`<polygon points="${this.hexPoints(board, h, 1)}" class="pick-dim"/>`);
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
      if (p.type === 'all') { // Welthafen: goldene Marke, alle Rohstoffe 2:1
        out.push(`<g transform="translate(${p.x},${p.y})" class="port world"><circle r="0.45" cy="0.05" class="port-shadow"/>`
          + '<image href="assets/art-v2/harbors/world-harbor.webp" x="-0.5" y="-0.5" width="1" height="1" class="port-img"/></g>'); // gleicher Aufbau wie die anderen Hafenkarten, nur etwas größer
        continue;
      }
      const hb = art.ok ? harborImg(p.type) : null;
      if (hb) {
        out.push(`<g transform="translate(${p.x},${p.y})" class="port${p.type === 'any' ? ' any' : ''}"><circle r="0.45" cy="0.05" class="port-shadow"/><image href="${hb}" x="-0.47" y="-0.47" width="0.94" height="0.94" class="port-img"/></g>`);
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
    if (topTokens.length) out.push(`<g class="tokenlayer" pointer-events="none">${topTokens.join('')}</g>`);

    // Räuber: eigene, dauerhafte Ebene (damit sein Sprung beim Neuzeichnen nicht abbricht)
    this.placeRobber(board, s.robber);

    // Hervorhebungen (klickbar) – ruhig, mit Vorschau der Figur beim Darüberfahren
    const ghost = ui.ghost || {};
    const gcol = ghost.color || '#fff';
    out.push(`<g class="hl" style="--ph:${(-(performance.now() % 2600)).toFixed(0)}ms">`);
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
        const vic = ui.victims ? ui.victims.get(id) || [] : null;
        const marks = vic && vic.length
          ? `<g class="victims" transform="translate(${h.x},${h.y - 0.62})">${vic.map((v, i) => `<g transform="translate(${((i - (vic.length - 1) / 2) * 0.46).toFixed(2)},0)"><circle r="0.21" fill="${v.color}" stroke="#fff" stroke-width="0.04"/><text class="vic-n" y="0.075">${v.cards}</text></g>`).join('')}</g>`
          : '';
        out.push(`<g class="hl-hex${pend ? ' pending' : ''}${vic ? (vic.length ? ' has-victim' : ' no-victim') : ''}" data-h="${id}"><polygon points="${this.hexPoints(board, h, 0.93)}" class="hl-hex-vis"/>${marks}`
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
    this.svg.classList.toggle('picking', picking);
    this.svg.dataset.ghost = ghost.kind || '';
  }

  /** Setzt den Räuber; bei Positionswechsel springt er in einem Bogen auf das neue Feld. Dauer in `robberEnd` (Zeitstempel). */
  placeRobber(board, hexId) {
    const h = board.hexes[hexId];
    const x = h.x;
    const y = h.y + 0.8;
    const g = window.gsap;
    if (!this.robberEl) {
      this.robberLayer.innerHTML = `<g class="robber"><g class="robber-in">${art.ok ? `<ellipse class="rb-shadow" cx="0" cy="0" rx="0.5" ry="0.14" fill="rgba(0,0,0,.4)"/><g class="rb-body">${thiefImage()}</g>` : `<g transform="translate(0,-.34)">${ROBBER}</g>`}</g></g>`;
      this.robberEl = this.robberLayer.firstChild;
      this.robberEl.setAttribute('transform', `translate(${x},${y})`);
      this.robberAt = hexId;
      return;
    }
    if (this.robberAt === hexId) return;
    const from = board.hexes[this.robberAt];
    this.robberAt = hexId;
    const el = this.robberEl;
    const body = el.querySelector('.rb-body') || el.querySelector('.robber-in');
    const shadow = el.querySelector('.rb-shadow');
    if (!g || !from) { el.setAttribute('transform', `translate(${x},${y})`); return; }
    const dx = x - from.x;
    const dy = y - (from.y + 0.8);
    const dist = Math.hypot(dx, dy);
    const T = Math.min(1.9, 0.95 + dist * 0.15);
    this.robberEnd = Date.now() + T * 1000 + 350;
    g.killTweensOf([el, body, shadow]);
    el.setAttribute('transform', `translate(${x},${y})`);
    const tl = g.timeline();
    // Der Räuber wird (samt Schatten) gleichmäßig vom alten zum neuen Feld geschoben – kein Hüpfen
    tl.fromTo(el.querySelector('.robber-in'), { x: -dx, y: -dy }, { x: 0, y: 0, duration: T, ease: 'power2.inOut' }, 0);
    // Landung: ruhiges Absetzen
    tl.fromTo(body, { scaleY: 0.95, scaleX: 1.03, transformOrigin: '50% 100%' }, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'power2.out' }, T);
    tl.call(() => { this.onRobberLand?.(x, y); }, null, T);
  }

  /**
   * Fähnchen für die Auszeichnungen: auf jeder Straße der längsten Handelsstraße weht ein kleiner Wimpel, auf den Gebäuden des Rittermacht-Halters
   * ein Banner mit Schwertern – beim Wechsel werden die alten eingeholt und die neuen nacheinander gehisst.
   * `shown` = {road, army} (Spielerindex oder null), ohne Animation beim ersten Aufruf eines Spiels.
   */
  setFlags(game, shown) {
    if (!this.flagLayer) return;
    const s = game.s;
    const board = s.board;
    const g = window.gsap;
    const want = new Map();
    if (shown.road !== null && shown.road !== undefined) {
      const color = s.players[shown.road].color;
      for (const eid of game.longestRoadPath(shown.road)) {
        const e = board.edges[eid];
        const a = board.vertices[e.a];
        const b = board.vertices[e.b];
        want.set(`r${eid}`, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, color, kind: 'road' });
      }
    }
    if (shown.army !== null && shown.army !== undefined) {
      const color = s.players[shown.army].color;
      for (const b of game.buildingsOf(shown.army)) {
        const v = board.vertices[b.vid];
        want.set(`a${b.vid}`, { x: v.x + 0.3, y: v.y + 0.14, color, kind: 'army' });
      }
    }
    const animate = !this.flagsFresh && !!g;
    this.flagsFresh = false;
    for (const [k, f] of [...this.flags]) {
      const w = want.get(k);
      if (w && w.color === f.color) continue;
      this.flags.delete(k);
      const el = f.el;
      if (!animate) { el.remove(); continue; }
      const pole = el.querySelector('.fp');
      const cloth = el.querySelector('.fc');
      g.killTweensOf([el, pole, cloth]);
      g.to(cloth, { y: f.kind === 'army' ? 0.5 : 0.36, opacity: 0, duration: 0.35, ease: 'power2.in' });
      g.to(pole, { scaleY: 0, duration: 0.4, delay: 0.15, ease: 'power2.in', transformOrigin: '0px 0px', onComplete: () => el.remove() });
    }
    let i = 0;
    for (const [k, w] of want) {
      if (this.flags.has(k)) continue;
      const army = w.kind === 'army';
      const h = army ? 0.78 : 0.5;
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      el.setAttribute('transform', `translate(${w.x.toFixed(3)},${w.y.toFixed(3)})`);
      el.innerHTML = `<g class="fl"><line class="fp" x1="0" y1="0" x2="0" y2="${-h}" stroke="#4a3418" stroke-width="0.05" stroke-linecap="round"/>`
        + (army
          ? `<path class="fc" d="M0.025 ${-h} h0.3 v0.36 l-0.15 -0.11 l-0.15 0.11 Z" fill="${w.color}" stroke="rgba(0,0,0,.5)" stroke-width="0.022" stroke-linejoin="round"/>
             <path class="fc fs" d="M0.11 ${-h + 0.07} L0.24 ${-h + 0.22} M0.24 ${-h + 0.07} L0.11 ${-h + 0.22}" stroke="#fff" stroke-width="0.04" stroke-linecap="round" fill="none"/>`
          : `<path class="fc" d="M0.025 ${-h} L0.36 ${-h + 0.11} L0.025 ${-h + 0.22} Z" fill="${w.color}" stroke="rgba(0,0,0,.5)" stroke-width="0.022" stroke-linejoin="round"/>`)
        + `<circle cx="0" cy="${-h}" r="0.04" fill="#e9b949"/></g>`;
      this.flagLayer.append(el);
      this.flags.set(k, { el, color: w.color, kind: w.kind });
      if (!animate) continue;
      const pole = el.querySelector('.fp');
      const cloths = el.querySelectorAll('.fc');
      const delay = i++ * 0.12;
      g.fromTo(pole, { scaleY: 0, transformOrigin: '0px 0px' }, { scaleY: 1, duration: 0.5, delay, ease: 'power2.out' });
      g.fromTo(cloths, { y: h, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, delay: delay + 0.15, ease: 'back.out(1.5)' });
      g.fromTo(el.querySelector('.fl'), { rotation: -3, transformOrigin: '0px 0px' }, { rotation: 3, duration: 1.3 + Math.random() * 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: delay + 0.8 });
    }
    if (!animate) for (const f of this.flags.values()) { // ohne Hissen: Wehen trotzdem anschalten
      if (f.waving || !g) continue;
      f.waving = true;
      g.fromTo(f.el.querySelector('.fl'), { rotation: -3, transformOrigin: '0px 0px' }, { rotation: 3, duration: 1.3 + Math.random() * 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
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
