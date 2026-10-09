// Kleine DOM-Helfer.
import { RES_INFO, RES } from '../engine/constants.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** el('div', {class:'x', onclick: fn}, child, 'text', ...) */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

export const resIcon = (r) => RES_INFO[r].icon;

/** "2× 🌲 1× 🧱" als HTML */
export function costHTML(cost) {
  return RES.filter((r) => cost[r]).map((r) => `<span class="cost-chip">${cost[r] > 1 ? cost[r] : ''}${RES_INFO[r].icon}</span>`).join('');
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function dieHTML(n, rolling = false) {
  const cells = Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('');
  return `<div class="die ${rolling ? 'rolling' : ''}">${cells}</div>`;
}

export function playerDot(color) {
  return `<span class="pdot" style="background:${color}"></span>`;
}
