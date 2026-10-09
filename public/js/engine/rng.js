// Kleiner, seedbarer Zufallsgenerator (mulberry32) plus Helfer.

export function makeRng(seed = Math.floor(Math.random() * 2 ** 32)) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randInt(n, rng) {
  return Math.floor(rng() * n);
}
