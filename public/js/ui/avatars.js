// Generierte Gesichter: flache SVG-Portraits aus einer kleinen Beschreibung (Haut, Frisur, Accessoire, Mund).
let uid = 0;

const HAIR_TOP = 'M19 27C19 14 26 10.500 32 10.500S45 14 45 27C42 21 38 19 32 19S22 21 19 27Z';

function hairBack(face) {
  if (face.hair === 'long') return `<path d="M15.500 30C13 52 20 58 32 58S51 52 48.500 30Z" fill="${face.hairColor}"/>`;
  return '';
}

function hairFront(face) {
  const c = face.hairColor;
  switch (face.hair) {
    case 'short': return `<path d="${HAIR_TOP}" fill="${c}"/>`;
    case 'long': return `<path d="${HAIR_TOP}" fill="${c}"/>`;
    case 'bun': return `<path d="${HAIR_TOP}" fill="${c}"/><circle cx="32" cy="9" r="5.500" fill="${c}"/>`;
    case 'cap': return `<path d="M19 25C19 11 27 7.500 32 7.500S45 11 45 25Z" fill="${c}"/><path d="M17 25h30c0 3-4 4.500-9 4.500H26c-5 0-9-1.500-9-4.500Z" fill="${c}" opacity=".78"/>`;
    case 'curly': return [[21, 20], [27, 15], [33, 13], [39, 15], [44, 20], [19.500, 27], [46.500, 27]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.200" fill="${c}"/>`).join('');
    default: return '';
  }
}

function mouth(face) {
  if (face.mouth === 'grin') return '<path d="M26.500 37Q32 44.500 37.500 37Z" fill="#fff" stroke="#7a3b2e" stroke-width="1.200" stroke-linejoin="round"/>';
  if (face.mouth === 'flat') return '<path d="M28.500 39.500H35.500" stroke="#7a3b2e" stroke-width="1.800" stroke-linecap="round"/>';
  return '<path d="M27 38Q32 42.500 37 38" fill="none" stroke="#7a3b2e" stroke-width="1.800" stroke-linecap="round"/>';
}

function accessory(face, color) {
  if (face.acc === 'glasses') return '<g fill="none" stroke="#1f2430" stroke-width="1.400"><circle cx="26.800" cy="31" r="4.300"/><circle cx="37.200" cy="31" r="4.300"/><path d="M31.100 30.600h1.800"/></g>';
  if (face.acc === 'beard') return `<path d="M19.800 32C19.800 47 44.200 47 44.200 32C44.200 40.500 38 43.500 32 43.500S19.800 40.500 19.800 32Z" fill="${face.hairColor}"/>`;
  if (face.acc === 'headband') return `<path d="M19.200 21.500H44.800V25H19.200Z" fill="${color}"/>`;
  return '';
}

/** Illustriertes Bot-Portrait im runden Ausschnitt (Gesicht), Hintergrund = Spielerfarbe. */
function portraitHTML(name, color, size) {
  return `<span class="avatar-svg portrait" style="width:${size}px;height:${size}px;background:radial-gradient(circle at 50% 35%, ${color}, color-mix(in srgb, ${color} 55%, #0b1626))"><b class="pi">${name[0].toUpperCase()}</b><img src="assets/portraits/${name}.webp" alt="" draggable="false" onerror="this.remove()"></span>`;
}

/** Portrait als HTML-String. Bots: illustriertes Bild; sonst generiertes SVG-Gesicht. `color` = Spielerfarbe. */
export function avatarSVG(face, color = '#4c8dff', size = 40) {
  if (face && face.portrait) return portraitHTML(face.portrait, color, size);
  const id = `av${uid++}`;
  const f = face || { skin: '#f1c7a1', hair: 'short', hairColor: '#5b3a22', acc: 'none', mouth: 'smile' };
  const beardBeforeMouth = f.acc === 'beard' ? accessory(f, color) : '';
  const other = f.acc === 'beard' ? '' : accessory(f, color);
  return `<svg class="avatar-svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <defs><clipPath id="${id}"><circle cx="32" cy="32" r="32"/></clipPath></defs>
    <g clip-path="url(#${id})">
      <rect width="64" height="64" fill="${color}"/>
      <rect width="64" height="64" fill="#fff" opacity=".12"/>
      ${hairBack(f)}
      <path d="M6 66C6 51 19 47 32 47S58 51 58 66Z" fill="#2b3950"/>
      <rect x="27.500" y="38" width="9" height="11" rx="3" fill="${f.skin}"/>
      <rect x="27.500" y="38" width="9" height="5" fill="#000" opacity=".12"/>
      <circle cx="19.500" cy="31.500" r="2.500" fill="${f.skin}"/><circle cx="44.500" cy="31.500" r="2.500" fill="${f.skin}"/>
      <ellipse cx="32" cy="30" rx="12.500" ry="14" fill="${f.skin}"/>
      ${beardBeforeMouth}
      <circle cx="27" cy="31" r="1.700" fill="#222"/><circle cx="37" cy="31" r="1.700" fill="#222"/>
      ${mouth(f)}
      ${hairFront(f)}
      ${other}
    </g>
  </svg>`;
}
