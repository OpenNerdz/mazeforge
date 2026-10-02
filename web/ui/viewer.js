// The 3D preview. Draws meshes built by core/mesh.js: every block texture sits in one texture array, and each
// pass (opaque, cut-out, blended) is a single draw call. Frames are only rendered when something changed.
import * as THREE from '../lib/three.js';
import { HUES, UNIT, FACE } from '../core/mesh.js';

const TILE = 16, ATLAS_COLS = 32;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// block shading: the 4th vertex component holds the texture layer and the face (see core/mesh.js), from which the
// vertex shader works out the normal and the texture coordinates (in blocks; the array texture repeats)
const BLOCK_COMMON = `#include <common>
attribute float layer;
varying vec3 vTex;
const vec3 FACE_NORMAL[8] = vec3[8](vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 1, 0), vec3(0, -1, 0), vec3(0, 0, 1), vec3(0, 0, -1),
  vec3(-0.7071, 0, 0.7071), vec3(0.7071, 0, 0.7071));
float blockFace() { return floor(layer / ${FACE}.0); }`;
const BLOCK_UV = `#include <begin_vertex>
{
  float f = blockFace();
  vec3 g = position / ${UNIT}.0;
  vec2 uv = f < 1.5 ? vec2(f < 0.5 ? -g.z : g.z, g.y)
          : f < 3.5 ? vec2(g.x, f < 2.5 ? -g.z : g.z)
          : vec2(f > 4.5 && f < 5.5 ? -g.x : g.x, g.y);
  vTex = vec3(uv, layer - f * ${FACE}.0);
}`;
function blockShader(material, atlas) {
  material.onBeforeCompile = shader => {
    shader.uniforms.atlas = atlas;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', BLOCK_COMMON).replace('#include <begin_vertex>', BLOCK_UV)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = FACE_NORMAL[int(blockFace())];');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform highp sampler2DArray atlas;\nvarying vec3 vTex;')
      .replace('#include <map_fragment>', 'diffuseColor *= texture(atlas, vTex);');
  };
  material.customProgramCacheKey = () => 'block';
  return material;
}

export class Viewer {
  // atlasImage: textures/atlas.png; tiles: how many of its tiles are real textures (the rest of the last row is empty)
  constructor(canvas, atlasImage, tiles) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xb9c7cf, 260, 900);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 3000);
    this.camera.position.set(-60, 55, 110);
    this.controls = new THREE.OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495; this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this.dirty = true; });

    this.scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x8a7a62, 1.35));
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 2.5; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.35;
    this.sun.shadow.autoUpdate = false;                                  // redrawn only when the scene or sun moves
    this.scene.add(this.sun, this.sun.target);
    this.sunAz = 320; this.sunEl = 40;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0xb8a988 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.grid = new THREE.GridHelper(400, 400, 0x5c5446, 0x7d735f);
    this.grid.position.y = 0.02; this.grid.material.transparent = true; this.grid.material.opacity = 0.35; this.grid.visible = false;
    this.scene.add(ground, this.grid);

    // paste guide: where to stand (the block the player is on) and which way to face for //paste -a
    this.marker = new THREE.Group();
    const mm = new THREE.MeshLambertMaterial({ color: 0xf0a73a, emissive: 0x6a3a00 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), mm); body.position.set(0.5, 0.9, 0.5);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 12), mm); arrow.rotation.x = -Math.PI / 2; arrow.position.set(0.5, 2.5, -0.1);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xf0a73a, transparent: true, opacity: 0.55 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(0.5, 0.03, 0.5);
    this.marker.add(body, arrow, pad); this.marker.visible = false; this.showMarker = true;
    this.scene.add(this.marker);

    // block textures: the atlas split into 16×16 tiles (rows flipped for GL), plus plain colours for unknown blocks
    this.tiles = atlasTiles(atlasImage, tiles);
    this.atlas = { value: null };
    const cut = { alphaTest: 0.5, side: THREE.DoubleSide };
    this.materials = [
      blockShader(new THREE.MeshLambertMaterial(), this.atlas),
      blockShader(new THREE.MeshLambertMaterial(cut), this.atlas),
      blockShader(new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false }), this.atlas),
    ];
    const depth = blockShader(new THREE.MeshDepthMaterial(cut), this.atlas);   // leaves and vines cast leafy shadows
    // one mesh per pass, kept for good; show() swaps in new geometry
    this.meshes = this.materials.map((material, pass) => {
      const m = new THREE.Mesh(blockGeometry(new Int16Array(4)), material);
      m.scale.setScalar(1 / UNIT); m.castShadow = m.receiveShadow = true; m.renderOrder = pass === 2 ? 1 : 0;
      if (pass === 1) m.customDepthMaterial = depth;
      this.scene.add(m); return m;
    });
    this.bounds = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 70, 10));
    this.autoRotate = false; this.tween = null; this.dirty = true;
    this.isoDir = null;                                                  // camera direction for the 3D view (null = default)

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize(); this.fitShadow();
    // where the browser can compile shaders in the background, do that first so the page never stalls on them
    this.compiled = !r.extensions.has('KHR_parallel_shader_compile');
    if (!this.compiled) r.compileAsync(this.scene, this.camera).then(() => { this.compiled = true; this.dirty = true; });
    const up = new THREE.Vector3(0, 1, 0);
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
        const c = this.controls.target, p = this.camera.position.clone().sub(c).applyAxisAngle(up, 0.0025);
        this.camera.position.copy(c).add(p); this.dirty = true;
      }
      if (this.compiled && (this.controls.update() || this.dirty)) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
    };
    requestAnimationFrame(loop);
  }
  resize() {
    const el = this.canvas.parentElement, w = el.clientWidth, h = el.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  // mesh: from core/mesh.js; marker: [x, z] of the paste block in the first grid (null = no guide)
  show(mesh, { keepCamera = true, marker = null } = {}) {
    this.atlas.value?.dispose();
    const tex = this.atlas.value = new THREE.DataArrayTexture(this.layers(mesh.tiles), TILE, TILE, mesh.tiles.length);
    Object.assign(tex, {
      colorSpace: THREE.SRGBColorSpace, magFilter: THREE.NearestFilter, minFilter: THREE.NearestMipmapLinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: true,
      anisotropy: this.renderer.capabilities.getMaxAnisotropy(), needsUpdate: true,
    });
    const [ox, , oz] = mesh.offset, [W, H, D] = mesh.size;
    const sphere = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(W, H, D).multiplyScalar(UNIT)).getBoundingSphere(new THREE.Sphere());
    this.meshes.forEach((m, pass) => {
      const verts = mesh.parts[pass];
      m.geometry.dispose(); m.geometry = blockGeometry(verts || new Int16Array(4), sphere);
      m.visible = !!verts; m.position.set(ox, 0, oz);
    });
    this.bounds.set(new THREE.Vector3(ox, 0, oz), new THREE.Vector3(ox + W, H, oz + D));
    this.markerAt = marker && [marker[0] + ox, marker[1] + oz];
    if (this.markerAt) this.marker.position.set(this.markerAt[0], 0, this.markerAt[1]);
    this.marker.visible = !!this.markerAt && this.showMarker;
    this.fitShadow();
    if (!keepCamera) this.view('iso', 0);
    this.dirty = true;
  }
  // texture layers for the tiles a mesh uses
  layers(ids) {
    const out = new Uint8Array(ids.length * TILE * TILE * 4), n = this.tiles.length / 1024;
    ids.forEach((t, l) => {
      if (t < n) out.set(this.tiles.subarray(t * 1024, t * 1024 + 1024), l * 1024);
      else {                                                            // a plain colour for a block the library doesn't know
        const c = new THREE.Color().setHSL((t - n) / HUES, 0.35, 0.5).convertLinearToSRGB();
        for (let p = 0; p < 256; p++) out.set([c.r * 255, c.g * 255, c.b * 255, 255], l * 1024 + p * 4);
      }
    });
    return out;
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
  setShadows(on) {
    this.renderer.shadowMap.enabled = on; this.sun.castShadow = on;
    this.scene.traverse(o => { if (o instanceof THREE.Mesh) o.material.needsUpdate = true; });
    this.sun.shadow.needsUpdate = true; this.dirty = true;
  }
  setGrid(on) { this.grid.visible = on; this.dirty = true; }
  setMarker(on) { this.showMarker = on; this.marker.visible = on && !!this.markerAt; this.dirty = true; }
  view(name, dur = 700) {
    const b = this.bounds, c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z * (name === 'top' || name === 'iso' ? 1 : 0), size.y * 1.1, 20);
    const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) * 1.15;
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

// vertices from core/mesh.js: x, y, z and layer/face as 4 × int16
function blockGeometry(verts, sphere) {
  const buf = new THREE.InterleavedBuffer(verts, 4), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(buf, 3, 0));
  g.setAttribute('layer', new THREE.InterleavedBufferAttribute(buf, 1, 3));
  if (sphere) g.boundingSphere = sphere; else g.setDrawRange(0, 0);
  return g;
}
function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#6f97b8'); gr.addColorStop(0.55, '#b7cad6'); gr.addColorStop(1, '#d9d6c8');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// RGBA pixels of every atlas tile, one after another, each flipped so its bottom row comes first
function atlasTiles(img, n) {
  const cv = new OffscreenCanvas(img.width, img.height), ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height).data;
  const out = new Uint8Array(n * TILE * TILE * 4);
  for (let t = 0; t < n; t++) {
    const tx = (t % ATLAS_COLS) * TILE, ty = Math.floor(t / ATLAS_COLS) * TILE;
    for (let y = 0; y < TILE; y++) out.set(px.subarray(((ty + TILE - 1 - y) * img.width + tx) * 4, ((ty + TILE - 1 - y) * img.width + tx + TILE) * 4), (t * TILE + y) * TILE * 4);
  }
  return out;
}
