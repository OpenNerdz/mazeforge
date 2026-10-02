// The current settings (P), their undo history and persistence.
import { DEFAULTS } from '../core/settings.js';
import { SCHEMA } from './schema.js';
import { LS } from './dom.js';

/** @type {{k: string, type: string, min?: number, max?: number, options?: Record<string, string>}[]} */
const controls = [];
for (const section of SCHEMA) controls.push(...section.items || []);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const block = v => typeof v === 'string' && v.length <= 128 && /^[A-Za-z0-9_:./-]+(?:\|[a-z]+)?$/.test(v);

// a complete set of settings from a partial one (saved state, preset, share code)
export function withDefaults(src = {}) {
  const P = structuredClone(DEFAULTS);
  if (!object(src)) return P;
  for (const [k, initial] of Object.entries(DEFAULTS)) {
    const v = src[k];
    if (typeof initial === 'number' && typeof v === 'number' && Number.isFinite(v)) P[k] = k === 'seed' ? v | 0 : Math.max(-1e6, Math.min(1e6, v));
    else if (typeof initial === 'boolean' && typeof v === 'boolean') P[k] = v;
    else if (typeof initial === 'string' && typeof v === 'string') P[k] = v.slice(0, 128);
  }
  for (const it of controls) {
    if (it.type === 'range') P[it.k] = Math.max(it.min, Math.min(it.max, P[it.k]));
    if (it.type === 'select' && !Object.hasOwn(it.options, P[it.k])) P[it.k] = DEFAULTS[it.k];
  }
  P.numberText = P.numberText.slice(0, 6);
  if (object(src.palette)) for (const k of Object.keys(P.palette)) {
    if (k === 'bands' && Array.isArray(src.palette.bands)) {
      P.palette.bands = P.palette.bands.map((band, i) => {
        const items = src.palette.bands[i];
        const valid = Array.isArray(items) ? items.filter(block).slice(0, 16) : [];
        return valid.length ? valid : band;
      });
    } else if (block(src.palette[k])) P.palette[k] = src.palette[k];
  }
  if (Array.isArray(src.autoBlocks)) P.autoBlocks = src.autoBlocks.filter(block).slice(0, 256);
  if (object(src.roleLock)) for (const k of Object.keys(P.palette)) if (block(src.roleLock[k])) P.roleLock[k] = src.roleLock[k];
  if (object(src.faceOverrides)) for (const [k, v] of Object.entries(src.faceOverrides).slice(0, 256)) {
    if (!/^\d{1,4}$/.test(k) || !object(v)) continue;
    const override = {};
    if (Object.hasOwn(controls.find(it => it.k === 'layout').options, v.layout)) override.layout = v.layout;
    if (typeof v.seed === 'number' && Number.isFinite(v.seed)) override.seed = v.seed | 0;
    P.faceOverrides[k] = override;
  }
  return P;
}

export function adaptPalette(P, library) {
  const present = k => library[k?.split('|')[0]];
  const fallback = k => present(k) ? k : 'stone';
  P.palette.bands = P.palette.bands.map((band, i) => {
    const valid = band.filter(present);
    return valid.length ? valid : DEFAULTS.palette.bands[i].map(fallback);
  });
  for (const k of Object.keys(P.palette)) if (k !== 'bands' && !present(P.palette[k])) P.palette[k] = fallback(DEFAULTS.palette[k]);
  P.autoBlocks = P.autoBlocks.filter(present);
  if (!P.autoBlocks.length) P.autoBlocks = DEFAULTS.autoBlocks.filter(present);
  if (!present(P.ivyLeafBlock)) P.ivyLeafBlock = 'oak_leaves';
  for (const k of Object.keys(P.roleLock)) if (!present(P.roleLock[k])) delete P.roleLock[k];
  return P;
}

export class Store {
  constructor(onHistory) {
    this.P = withDefaults(LS.get('current', {}));
    this.hist = [JSON.stringify(this.P)]; this.pos = 0; this.onHistory = onHistory;
  }
  // record the current settings as an undo step (no-op if nothing changed)
  commit() {
    const s = JSON.stringify(this.P);
    if (s === this.hist[this.pos]) return;
    this.hist = this.hist.slice(0, this.pos + 1); this.hist.push(s);
    if (this.hist.length > 150) this.hist.shift();
    this.pos = this.hist.length - 1;
    LS.set('current', this.P); this.onHistory();
  }
  replace(P) { this.P = P; this.commit(); }
  undo(d) {
    const n = this.pos + d; if (n < 0 || n >= this.hist.length) return false;
    this.pos = n; this.P = withDefaults(JSON.parse(this.hist[n]));
    LS.set('current', this.P); this.onHistory();
    return true;
  }
  get canUndo() { return this.pos > 0; }
  get canRedo() { return this.pos < this.hist.length - 1; }
}
