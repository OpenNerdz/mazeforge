// Text as a block mask: the film-style 7×7 stencil digits, or any font rendered on a canvas.

const FONT7 = {
  '0': ['0111110','1100011','1100111','1101011','1110011','1100011','0111110'],
  '1': ['0011000','0111000','0011000','0011000','0011000','0011000','0111100'],
  '2': ['0111110','1100011','0000011','0001110','0111000','1100000','1111111'],
  '3': ['1111110','0000011','0000011','0111110','0000011','0000011','1111110'],
  '4': ['0000110','0001110','0011110','0110110','1111111','0000110','0000110'],
  '5': ['1111111','1100000','1111110','0000011','0000011','1100011','0111110'],
  '6': ['0011110','0110000','1100000','1111110','1100011','1100011','0111110'],
  '7': ['1111111','0000011','0000110','0001100','0011000','0011000','0011000'],
  '8': ['0111110','1100011','1100011','0111110','1100011','1100011','0111110'],
  '9': ['0111110','1100011','1100011','0111111','0000011','0000110','0111100'],
};
const glyphCache = new Map();
export function textMask(text, font, height, widthScale) {
  const key = [text, font, height, widthScale].join('|');
  if (glyphCache.has(key)) return glyphCache.get(key);
  let res;
  const blockOk = font === 'Maze Block' && [...text].every(c => FONT7[c]);
  if (blockOk) {
    const cw = Math.max(3, Math.round(height * 0.5 * widthScale)), gap = Math.max(1, Math.round(height * 0.08));
    const W = text.length * cw + (text.length - 1) * gap, H = height;
    const m = new Uint8Array(W * H);
    [...text].forEach((ch, i) => {
      const rows = FONT7[ch];
      for (let x = 0; x < cw; x++) for (let y = 0; y < H; y++) {
        const c = Math.min(6, Math.floor(x / cw * 7)), r = Math.min(6, Math.floor((H - 1 - y) / H * 7));
        if (rows[r][c] === '1') m[(i * (cw + gap) + x) * H + y] = 1;
      }
    });
    res = { w: W, h: H, m };
  } else {
    const ss = 6, fam = font === 'Maze Block' ? 'Arial Black' : font;
    const cv = new OffscreenCanvas(8, 8);                                     // runs in the worker
    let ctx = cv.getContext('2d', { willReadFrequently: true });
    const px = height * ss * 1.45;
    ctx.font = `900 ${px}px "${fam}", sans-serif`;
    const tw = Math.ceil(ctx.measureText(text).width) + ss * 4;
    cv.width = tw; cv.height = Math.ceil(px * 1.5);
    ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.font = `900 ${px}px "${fam}", sans-serif`;
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, ss * 2, cv.height / 2);
    const img = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, x1 = 0, y0 = cv.height, y1 = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (img[(y * cv.width + x) * 4 + 3] > 100) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0) { res = { w: 0, h: 0, m: new Uint8Array(0) }; }
    else {
      const bh = y1 - y0 + 1, bw = x1 - x0 + 1;
      const H = height, W = Math.max(1, Math.round(bw / bh * height * widthScale));
      const m = new Uint8Array(W * H);
      for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
        const sx0 = x0 + Math.floor(x / W * bw), sx1 = x0 + Math.floor((x + 1) / W * bw);
        const sy0 = y0 + Math.floor((H - 1 - y) / H * bh), sy1 = y0 + Math.floor((H - y) / H * bh);
        let on = 0, tot = 0;
        for (let yy = sy0; yy <= Math.max(sy0, sy1 - 1); yy++) for (let xx = sx0; xx <= Math.max(sx0, sx1 - 1); xx++) {
          tot++; if (img[(yy * cv.width + xx) * 4 + 3] > 127) on++;
        }
        if (on / tot >= 0.5) m[x * H + y] = 1;
      }
      res = { w: W, h: H, m };
    }
  }
  glyphCache.set(key, res);
  return res;
}
