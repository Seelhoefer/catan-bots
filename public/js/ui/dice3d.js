// Echte 3D-Würfel (three.js, lazy geladen): normale weiße Würfel mit schwarzen Augen, abgerundeten Kanten, Licht und weichem Schatten.
// Der Wurf wird per GSAP choreografiert (die Augenzahl steht vorher fest): Wurf von außen, Rollen, Aufprall, Nachhüpfen, Liegenbleiben.
let T = null; // three-Modul
let loading = null;
let failed = false;
let stage = null; // { renderer, scene, camera, ... }

export function dice3dReady() { return !!T && !failed; }

/** Lädt three.js im Hintergrund. Löst mit true auf, wenn 3D verfügbar ist. */
export function preloadDice3d() {
  if (T) return Promise.resolve(true);
  if (failed) return Promise.resolve(false);
  if (!loading) {
    loading = import('../../vendor/three-dice.min.js').then((m) => {
      // WebGL-Test: ohne Kontext gleich auf die CSS-Würfel ausweichen
      const probe = document.createElement('canvas');
      if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
      T = m;
      return true;
    }).catch(() => { failed = true; return false; });
  }
  return loading;
}

// Augenzahl → Flächennormale (gegenüber = 7; 1 oben, 2 vorn, 3 rechts wie beim Standardwürfel)
const NORMAL = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
// BoxGeometry-Materialreihenfolge: +x, -x, +y, -y, +z, -z
const FACE_ORDER = [3, 4, 1, 6, 2, 5];
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function faceTexture(n) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S * 0.4, S * 0.35, S * 0.1, S / 2, S / 2, S * 0.75);
  g.addColorStop(0, '#fffefa');
  g.addColorStop(1, '#ece3cb');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const r = n === 1 ? 34 : 25;
  for (const [px, py] of PIPS[n]) {
    const cx = S / 2 + px * S * 0.255;
    const cy = S / 2 + py * S * 0.255;
    const pg = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    pg.addColorStop(0, '#3b4252');
    pg.addColorStop(1, '#0c1018');
    x.fillStyle = pg;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function build() {
  const canvas = document.createElement('canvas');
  canvas.className = 'dh3d';
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.1, 60);
  scene.add(new T.HemisphereLight(0xffffff, 0x8899aa, 1.1));
  const sun = new T.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-3.5, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 7;
  sun.shadow.bias = -0.0004;
  const sc = sun.shadow.camera;
  sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 30;
  scene.add(sun);
  const floor = new T.Mesh(new T.PlaneGeometry(40, 40), new T.ShadowMaterial({ opacity: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const mats = FACE_ORDER.map((n) => new T.MeshStandardMaterial({ map: faceTexture(n), roughness: 0.38, metalness: 0 }));
  const geo = new T.RoundedBoxGeometry(1, 1, 1, 5, 0.13);
  return { canvas, renderer, scene, camera, mats, geo, sun };
}

function frame(w, h) {
  const { renderer, camera } = stage;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Genug Platz: mindestens 8 Einheiten Breite und 5.5 Einheiten Höhe sichtbar
  const fov = (camera.fov * Math.PI) / 180;
  const needH = 5.8 / (2 * Math.tan(fov / 2));
  const needW = 8.6 / (2 * Math.tan(fov / 2) * camera.aspect);
  const dist = Math.max(needH, needW);
  camera.position.set(0, dist * 0.84, dist * 0.54);
  camera.lookAt(0, 0.2, 0);
  camera.updateProjectionMatrix();
  // sichtbare halbe Breite auf Höhe y=0 (für die Anflugbahn)
  const visH = 2 * Math.tan(fov / 2) * dist;
  return { halfW: (visH * camera.aspect) / 2, dist };
}

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Spielt den Wurf auf `container` ab.
 * @param {{dice:[number,number], sf?:number, onHit?:(k:number, i:number)=>void}} o
 * @returns {{ done: Promise<void>, settleMs:number, totalMs:number }}  settleMs = bis die Würfel liegen, totalMs = bis alles aufgeräumt ist.
 */
export function rollDice3D(container, o) {
  const g = window.gsap;
  const { dice, sf = 1, onHit } = o;
  if (!stage) stage = build();
  const { renderer, scene, camera, mats, geo, canvas } = stage;
  container.append(canvas);
  const w = Math.max(240, container.clientWidth);
  const h = Math.max(240, container.clientHeight);
  const { halfW } = frame(w, h);

  const spinT = 1.55 * sf; // Dauer von Wurf bis Liegenbleiben
  const hold = 0.5 * sf;
  const gather = 0.5 * sf;
  const meshes = dice.map((val, i) => {
    const m = new T.Mesh(geo, mats);
    m.castShadow = true;
    scene.add(m);
    const side = i === 0 ? -1 : 1;
    const rest = new T.Vector3(side * rand(0.95, 1.25), 0.5, rand(-0.5, 0.5));
    const start = new T.Vector3(side * (halfW + 1.4), 4.2, rand(-1.2, 1.4)); // von außen (links bzw. rechts)
    const n = new T.Vector3(...NORMAL[val]);
    const base = new T.Quaternion().setFromUnitVectors(n, new T.Vector3(0, 1, 0));
    base.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rand(-0.5, 0.5))); // leicht verdreht liegen
    const axis = new T.Vector3(rand(-0.25, 0.25), rand(-0.3, 0.3), 1).normalize(); // Rollen entlang der Flugrichtung (um die z-Achse)
    return {
      mesh: m, rest, start, base, axis, side, theta0: side * (Math.PI * rand(5, 7)), s: { p: 0, y: 0, rot: 1, g: 0 }, val,
    };
  });

  let running = true;
  const tick = () => {
    if (!running) return;
    renderer.render(scene, camera);
  };
  g.ticker.add(tick);

  const tl = g.timeline();
  const spin = new T.Quaternion();
  meshes.forEach((d, i) => {
    const t0 = i * 0.11 * sf;
    const dx = d.rest.x - d.start.x;
    const dz = d.rest.z - d.start.z;
    const apply = () => {
      const p = d.s.p;
      d.mesh.position.set(d.start.x + dx * p, 0.5 + d.s.y + d.s.g * 0.9, d.start.z + dz * p);
      spin.setFromAxisAngle(d.axis, d.theta0 * d.s.rot);
      d.mesh.quaternion.copy(spin).multiply(d.base);
    };
    d.s.y = d.start.y - 0.5;
    d.s.rot = 1;
    apply();
    // waagerechter Weg: schnell hinein, rutscht aus
    tl.to(d.s, { p: 1, duration: spinT, ease: 'power3.out', onUpdate: apply }, t0);
    // Höhe: Fall mit natürlichem Nachhüpfen
    tl.to(d.s, { y: 0, duration: spinT * 0.82, ease: 'bounce.out', onUpdate: apply }, t0);
    // Drehung läuft mit der Bewegung aus und endet exakt in der gewürfelten Lage
    tl.to(d.s, { rot: 0, duration: spinT, ease: 'power2.out', onUpdate: apply }, t0);
    // Aufprallklänge (bounce.out berührt den Boden bei 36 %, 73 % und 91 % der Fallzeit)
    if (onHit) [[0.364, 0], [0.727, 1], [0.909, 2]].forEach(([f, k]) => tl.call(() => onHit(k, i), null, t0 + spinT * 0.82 * f));
    // zusammengezogen: beide Würfel gleiten zur Mitte, heben ab und verschwinden
    const gt = t0 + spinT + hold;
    tl.to(d.s, {
      p: 1, g: 1, duration: gather, ease: 'power3.in',
      onUpdate() {
        const k = d.s.g;
        d.mesh.position.x = d.rest.x * (1 - k) + side0(i) * 0.5 * k;
        d.mesh.position.z = d.rest.z * (1 - k);
        d.mesh.position.y = 0.5 + k * 1.1;
        const sc = 1 - k * 0.85;
        d.mesh.scale.setScalar(sc);
        d.mesh.rotation.y += 0.16 * k;
      },
    }, gt);
  });
  const total = meshes.length ? spinT + hold + gather + 0.11 * sf : 0;
  const settleMs = (spinT + 0.11 * sf) * 1000;
  const done = new Promise((resolve) => {
    tl.call(() => {
      running = false;
      g.ticker.remove(tick);
      meshes.forEach((d) => scene.remove(d.mesh));
      canvas.remove();
      resolve();
    }, null, total + 0.05);
  });
  return { done, settleMs, totalMs: total * 1000 + 50, gatherAtMs: (spinT + hold + 0.11 * sf) * 1000, gatherMs: gather * 1000 };
}

function side0(i) { return i === 0 ? -1 : 1; }
