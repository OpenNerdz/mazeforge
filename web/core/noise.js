// Smooth value noise over a W×H grid (column-major: index x*h + y).

export function vnoise(w, h, scale, rng) {
  scale = Math.max(0.5, scale);
  const gw = Math.floor(w / scale) + 3, gh = Math.floor(h / scale) + 3;
  const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = rng.f();
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    const xs = x / scale, x0 = Math.floor(xs); let fx = xs - x0; fx = fx * fx * (3 - 2 * fx);
    for (let y = 0; y < h; y++) {
      const ys = y / scale, y0 = Math.floor(ys); let fy = ys - y0; fy = fy * fy * (3 - 2 * fy);
      const a = g[x0 * gh + y0], b = g[(x0 + 1) * gh + y0], c = g[x0 * gh + y0 + 1], d = g[(x0 + 1) * gh + y0 + 1];
      out[x * h + y] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return out;
}

// value noise stretched vertically (sy >> sx): used for rain striations
export function streakNoise(w, h, R) {
  const ch = Math.ceil(h / 7) + 2, cols = vnoise(w, ch, 1.3, R), fine = vnoise(w, h, 1.1, R), out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const t = y / 7, y0 = Math.floor(t), f = t - y0;
    out[x * h + y] = 0.8 * (cols[x * ch + y0] * (1 - f) + cols[x * ch + y0 + 1] * f) + 0.2 * fine[x * h + y];
  }
  return out;
}
