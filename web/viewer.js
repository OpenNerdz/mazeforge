import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BAR_BOX = { h: [0, 0, 0.4375, 1, 1, 0.5625], z: [0.4375, 0, 0, 0.5625, 1, 1], v: [0.4375, 0, 0.4375, 0.5625, 1, 0.5625] };
// vines hug the face they are attached to (letter = direction of the wall block)
const VINE_BOX = { n: [0, 0, 0.001, 1, 1, 0.045], s: [0, 0, 0.955, 1, 1, 0.999], e: [0.955, 0, 0, 0.999, 1, 1], w: [0.001, 0, 0, 0.045, 1, 1] };
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class Viewer {
  constructor(canvas, library) {
    this.library = library;
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = this.skyTexture();
    this.scene.fog = new THREE.Fog(0xb9c7cf, 260, 900);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 3000);
    this.camera.position.set(-60, 55, 110);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.dirty = true);

    this.hemi = new THREE.HemisphereLight(0xdfeaf2, 0x8a7a62, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.35;
    this.scene.add(this.sun, this.sun.target);
    this.sunAz = 320; this.sunEl = 40;

    const gmat = new THREE.MeshLambertMaterial({ color: 0xb8a988 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), gmat);
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.grid = new THREE.GridHelper(400, 400, 0x5c5446, 0x7d735f);
    this.grid.position.y = 0.02; this.grid.material.transparent = true; this.grid.material.opacity = 0.35;
    this.grid.visible = false; this.scene.add(this.grid);

    // paste guide: where to stand (the block the player is on) and which way to face for //paste -a
    this.marker = new THREE.Group();
    const mm = new THREE.MeshLambertMaterial({ color: 0xf0a73a, emissive: 0x6a3a00 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), mm); body.position.set(0.5, 0.9, 0.5);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 12), mm); arrow.rotation.x = -Math.PI / 2; arrow.position.set(0.5, 2.5, -0.1);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf0a73a, transparent: true, opacity: 0.55 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0.5, 0.03, 0.5);
    this.marker.add(body, arrow, pad); this.marker.visible = false; this.scene.add(this.marker);
    this.showMarker = true;

    this.group = new THREE.Group(); this.scene.add(this.group);
    this.texCache = new Map(); this.matCache = new Map();
    this.bounds = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 70, 10));
    this.autoRotate = false; this.tween = null; this.dirty = true;

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    const loop = t => {
      requestAnimationFrame(loop);
      if (this.tween) {
        const k = Math.min(1, (t - this.tween.t0) / this.tween.dur), e = ease(k);
        this.camera.position.lerpVectors(this.tween.p0, this.tween.p1, e);
        this.controls.target.lerpVectors(this.tween.q0, this.tween.q1, e);
        if (k >= 1) this.tween = null;
        this.dirty = true;
      }
      if (this.autoRotate && !this.tween) {
        const c = this.controls.target, p = this.camera.position.clone().sub(c);
        p.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0025); this.camera.position.copy(c).add(p); this.dirty = true;
      }
      if (this.controls.update() || this.dirty) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
    };
    requestAnimationFrame(loop);
  }
  skyTexture() {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#6f97b8'); gr.addColorStop(0.55, '#b7cad6'); gr.addColorStop(1, '#d9d6c8');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  resize() {
    const el = this.canvas.parentElement, w = el.clientWidth, h = el.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  isPartial(key) {
    if (key.includes('|')) return true;
    const e = this.library[key]; return e ? !e.full : false;
  }
  texture(file) {
    if (this.texCache.has(file)) return this.texCache.get(file);
    const t = new THREE.TextureLoader().load(`textures/${file}`, () => this.dirty = true);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.texCache.set(file, t); return t;
  }
  material(key) {
    if (this.matCache.has(key)) return this.matCache.get(key);
    const base = key.split('|')[0], e = this.library[base];
    let m;
    if (e) {
      const mk = file => {
        const mat = new THREE.MeshLambertMaterial({ map: this.texture(file) });
        if (e.alpha === 'cut' || key.includes('|') || e.shape === 'cross') { mat.alphaTest = 0.5; mat.side = THREE.DoubleSide; }
        if (e.alpha === 'blend') { mat.transparent = true; mat.depthWrite = false; }
        return mat;
      };
      m = e.faces && e.shape !== 'cross' && base !== 'vine' ? e.faces.map(mk) : mk(e.icon);
    } else {
      let h = 0; for (const ch of base) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      m = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL((h % 360) / 360, 0.35, 0.5) });
    }
    this.matCache.set(key, m); return m;
  }
  geometry(key) {
    this.geoCache ??= new Map();
    if (this.geoCache.has(key)) return this.geoCache.get(key);
    const [base, variant] = key.split('|'), e = this.library[base];
    let g;
    if (base === 'vine') g = boxGeometry(VINE_BOX[(variant || 'n')[0]] || VINE_BOX.n);
    else if (variant && BAR_BOX[variant]) g = boxGeometry(BAR_BOX[variant]);
    else if (e?.shape === 'cross') g = crossGeometry();
    else if (e?.shape === 'box') g = boxGeometry(e.box);
    else g = boxGeometry([0, 0, 0, 1, 1, 1]);
    this.geoCache.set(key, g); return g;
  }
  // grids: array of {W,H,D,data,keys}; laid out side by side along +x
  // marker: [x, z] of the paste block in the first grid's coordinates (null = no guide)
  show(grids, { keepCamera = true, marker = null } = {}) {
    for (const c of [...this.group.children]) { this.group.remove(c); c.dispose?.(); }
    const perKey = new Map();
    let ox = 0, maxH = 0, maxD = 0;
    const totalW = grids.reduce((a, g) => a + g.W, 0);
    for (const g of grids) {
      const { W, H, D, data, keys } = g;
      const partial = keys.map(k => k !== 'air' && this.isPartial(k));
      const at = (x, y, z) => (y * D + z) * W + x;
      const open = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D || data[at(x, y, z)] === 0 || partial[data[at(x, y, z)]];
      for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
        const v = data[at(x, y, z)]; if (!v) continue;
        if (!partial[v] && !(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1) || open(x, y, z - 1))) continue;
        const k = keys[v]; let arr = perKey.get(k); if (!arr) perKey.set(k, arr = []);
        arr.push(ox + x - totalW / 2, y, z - D / 2);
      }
      ox += W; maxH = Math.max(maxH, H); maxD = Math.max(maxD, D);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let count = 0;
    for (const [k, arr] of perKey) {
      const n = arr.length / 3;
      const mesh = new THREE.InstancedMesh(this.geometry(k), this.material(k), n);
      s.set(1, 1, 1);
      for (let i = 0; i < n; i++) { p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]); m4.compose(p, q, s); mesh.setMatrixAt(i, m4); }
      if (this.library[k.split('|')[0]]?.alpha === 'blend') mesh.renderOrder = 1;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.block = k.split('|')[0];
      this.group.add(mesh); count += n;
    }
    this.bounds.set(new THREE.Vector3(-totalW / 2, 0, -maxD / 2), new THREE.Vector3(totalW / 2, maxH, maxD / 2));
    this.markerAt = marker && [marker[0] - totalW / 2, marker[1] - grids[0].D / 2];
    if (this.markerAt) this.marker.position.set(this.markerAt[0], 0, this.markerAt[1]);
    this.marker.visible = !!this.markerAt && this.showMarker;
    this.fitShadow(); this.isolate(this.isolated);
    if (!keepCamera) this.view('iso', 0);
    this.dirty = true;
    return count;
  }
  fitShadow() {
    const b = this.bounds, c = b.getCenter(new THREE.Vector3()), r = b.getSize(new THREE.Vector3()).length() * 0.62 + 10;
    const az = THREE.MathUtils.degToRad(this.sunAz), el = THREE.MathUtils.degToRad(this.sunEl);
    this.sun.position.set(c.x + Math.sin(az) * Math.cos(el) * r * 2, Math.sin(el) * r * 2, c.z + Math.cos(az) * Math.cos(el) * r * 2);
    this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera; cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = r * 5;
    cam.updateProjectionMatrix(); this.sun.shadow.needsUpdate = true; this.dirty = true;
  }
  setSun(az, el) { this.sunAz = az; this.sunEl = el; this.fitShadow(); }
  setShadows(on) { this.renderer.shadowMap.enabled = on; this.sun.castShadow = on; this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); this.dirty = true; }
  setGrid(on) { this.grid.visible = on; this.dirty = true; }
  // show only one block type (null = everything)
  isolate(block) {
    this.isolated = block || null;
    for (const m of this.group.children) m.visible = !this.isolated || m.userData.block === this.isolated;
    this.dirty = true;
  }
  setMarker(on) { this.showMarker = on; this.marker.visible = on && !!this.markerAt; this.dirty = true; }
  view(name, dur = 700) {
    const b = this.bounds, c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z * (name === 'top' || name === 'iso' ? 1 : 0), size.y * 1.1, 20), dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.15;
    const tgt = new THREE.Vector3(c.x, size.y * 0.45, c.z);
    const dirs = { front: [0, 0.12, 1], back: [0, 0.12, -1], left: [-1, 0.12, 0], right: [1, 0.12, 0], top: [0.001, 1, 0.02], iso: this.isoDir || [-0.62, 0.42, 1] };
    const d = new THREE.Vector3(...(dirs[name] || dirs.iso)).normalize();
    const pull = name === 'top' ? 1.45 : name === 'iso' ? 1.2 : 1;
    const p1 = tgt.clone().add(d.multiplyScalar(name === 'left' || name === 'right' ? Math.max(dist * 0.55, size.z * 3) : dist * pull));
    if (!dur) { this.camera.position.copy(p1); this.controls.target.copy(tgt); this.dirty = true; return; }
    this.tween = { t0: performance.now(), dur, p0: this.camera.position.clone(), p1, q0: this.controls.target.clone(), q1: tgt };
  }
  screenshot() { this.renderer.render(this.scene, this.camera); return this.canvas.toDataURL('image/png'); }
}

// box in block space [x0,y0,z0,x1,y1,z1] with Minecraft-style UVs (texture not stretched on slabs etc.)
function boxGeometry(b) {
  const [x0, y0, z0, x1, y1, z1] = b;
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    if (Math.abs(nx) > 0.5) uv.setXY(i, nx > 0 ? 1 - z : z, y);
    else if (Math.abs(ny) > 0.5) uv.setXY(i, x, ny > 0 ? 1 - z : z);
    else uv.setXY(i, nz > 0 ? x : 1 - x, y);
  }
  uv.needsUpdate = true;
  return g;
}
// two crossed planes, like flowers, saplings and torches
function crossGeometry() {
  const a = 0.5 - 0.5 * Math.SQRT1_2 * 1.0, c = 1 - a;
  const P = [a, 0, a, c, 0, c, c, 1, c, a, 1, a, a, 0, c, c, 0, a, c, 1, a, a, 1, c];
  const U = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}
