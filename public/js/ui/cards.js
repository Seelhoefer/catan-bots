// Entwicklungskarten als illustrierte Karten. Ohne Bilder: einfache Ersatzkarte aus HTML/CSS.
import { DEV_INFO } from '../engine/constants.js';
import { cardImgSrc, resImg, art } from './assets.js';
import { esc } from './dom.js';

export function cardHTML(type, cls = '') {
  const info = DEV_INFO[type];
  if (!art.ok) {
    return `<div class="devcard harvest-card ${cls}" role="img" aria-label="${esc(info.name)}">
      <div class="hc-title">${esc(info.name)}</div>
      <div class="hc-art"><img src="${resImg('wheat')}" alt="" draggable="false"></div>
      <div class="hc-text">${esc(info.desc.split('(')[0].trim())}</div></div>`;
  }
  return `<img class="devcard ${cls}" src="${cardImgSrc(type)}" alt="${esc(info.name)}" draggable="false">`;
}
