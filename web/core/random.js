// Seeded randomness: a stream generator (Rng) and a stateless per-position roll.

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rng {
  constructor(seed) { this.r = mulberry32((seed >>> 0) ^ 0x9E3779B9); for (let i = 0; i < 4; i++) this.r(); }
  f() { return this.r(); }
  int(a, b) { return b <= a ? a : a + Math.floor(this.r() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  uniform(a, b) { return a + (b - a) * this.r(); }
  normal(m = 0, s = 1) { const u = 1 - this.r(), v = this.r(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
}

// a fixed random roll per position: a block keeps its roll whatever other settings change, so a slider
// only alters the blocks it actually affects (a shared random stream would reshuffle the whole wall)
export function roll(seed, i, salt) {
  let h = (seed ^ Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(salt + 1, 0x85EBCA77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7FEB352D); h = Math.imul(h ^ (h >>> 15), 0x846CA68B);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
