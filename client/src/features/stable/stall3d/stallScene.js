import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { coatFor } from '../../horses/horse3d/horseBreeds';
import { STALL_STATES, stallState, plateName } from './stallStatus';

/**
 * A zone of the club's stable in 3D, as a barn on the farm: two rows of wooden box stalls on a brick
 * aisle, lanterns on the aisle posts, a paddock fence, grass and the team's banner outside, and two
 * staff (a groom and a vet, chibi figures built in code) walking the aisle to look in on the horses.
 * Each stall has a Dutch door (the lower half shut, braced in the club's forest green, the upper half
 * open), a brass nameplate with its code and the horse's name, a lamp in the stall's state, straw, a
 * hay rack and a bucket; an occupied stall has the club's horse model in it, in that horse's coat,
 * looking out over the door. Everything is drawn in code: no barn model to license or download.
 *
 * Loaded on demand by Stall3D.jsx, so three.js stays out of the main bundle.
 */
const S = 3.6; // stall width and depth
const WALL = 1.4; // solid lower walls and the lower door
const TOP = 2.5; // top of the partitions
const T = 0.08;
const AISLE = 4;
const HORSE_URL = `${import.meta.env.BASE_URL}models/horse-bare.glb`;
const COLORS = { forest: 0x1f4a38, brass: 0xc9a24a, timber: 0x6b4423 };

const rand = (a, b) => a + Math.random() * (b - a);

// The horse without tack, shared by every scene on the page. Its vertices are quantized and its real
// size lives in the skeleton, so it is measured through its bones, not from the raw geometry. It is
// turned to look out of the stall (+z) and stands a little back from the door.
let horseModel = null;
function skinnedBox(root) {
  root.updateMatrixWorld(true);
  const out = new THREE.Box3();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 4000));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i);
        o.applyBoneTransform(i, v);
        out.expandByPoint(v.applyMatrix4(o.matrixWorld));
      }
    } else if (o.isMesh) out.expandByObject(o);
  });
  return out;
}
function loadHorse() {
  if (!horseModel) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    horseModel = loader.loadAsync(HORSE_URL).then((gltf) => {
      const template = gltf.scene;
      const size = skinnedBox(template).getSize(new THREE.Vector3());
      template.scale.setScalar(2.1 / size.y);
      let head = null;
      template.traverse((o) => { if (!head && o.isBone && /^head/i.test(o.name)) head = o; });
      template.updateMatrixWorld(true);
      const center = skinnedBox(template).getCenter(new THREE.Vector3());
      if (head) {
        const h = head.getWorldPosition(new THREE.Vector3()).sub(center);
        template.rotation.y = -Math.atan2(h.x, h.z) + 0.35; // head towards the door, a little turned
      }
      const box = skinnedBox(template);
      const c = box.getCenter(new THREE.Vector3());
      template.position.set(-c.x, -box.min.y, -c.z - 0.35);
      const clip = gltf.animations.find((a) => /idle/i.test(a.name)) || gltf.animations[0] || null;
      return { template, clip };
    });
    horseModel.catch(() => { horseModel = null; });
  }
  return horseModel;
}

function canvasTexture(w, h, paint, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** The stalls of a zone in two rows, doors on a central aisle; two stalls or fewer in one row. */
function layout(stalls) {
  const perRow = stalls.length > 2 ? Math.ceil(stalls.length / 2) : stalls.length;
  const rows = stalls.length > 2 ? 2 : 1;
  const places = stalls.map((stall, i) => {
    const row = rows === 2 && i >= perRow ? 1 : 0;
    const col = row ? i - perRow : i;
    return { stall, x: (col - (perRow - 1) / 2) * S, z: row ? AISLE / 2 + S / 2 : -(AISLE / 2 + S / 2), face: row ? -1 : 1 };
  });
  return { places, perRow, rows, length: perRow * S };
}

export function createStallScene(canvas, { onSelect } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 10, 0.1, 160);
  camera.position.set(12, 11, 20);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 38;
  controls.maxPolarAngle = 1.45;
  controls.autoRotateSpeed = 0.5;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Late-afternoon light: warm sun, a pale sky above, warm bounce from the ground.
  scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x6b5a3a, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
  sun.position.set(-9, 13, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
  scene.add(sun);

  const textures = [];
  const keep = (t) => { textures.push(t); return t; };
  // Vertical boards in honey-coloured wood, a darker gap between them and a little grain.
  const woodTex = keep(canvasTexture(512, 512, (g, w, h) => {
    for (let x = 0; x < w; x += 64) {
      g.fillStyle = `hsl(${rand(26, 32)}, ${rand(42, 52)}%, ${rand(36, 44)}%)`;
      g.fillRect(x, 0, 64, h);
      g.fillStyle = 'rgba(40, 20, 8, 0.55)';
      g.fillRect(x, 0, 3, h);
      for (let i = 0; i < 22; i++) {
        g.strokeStyle = `rgba(60, 30, 10, ${rand(0.06, 0.18)})`;
        g.lineWidth = rand(0.6, 1.4);
        const gx = x + rand(6, 60);
        g.beginPath(); g.moveTo(gx, 0); g.bezierCurveTo(gx + rand(-5, 5), h / 3, gx + rand(-5, 5), (2 * h) / 3, gx + rand(-3, 3), h); g.stroke();
      }
    }
  }));
  const strawTex = keep(canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#d4ae5c';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      g.strokeStyle = ['#bb913e', '#ead07f', '#a98035', '#f2dc9a'][i % 4];
      g.lineWidth = rand(0.8, 2);
      const x = rand(0, w); const y = rand(0, h); const a = rand(0, Math.PI); const l = rand(8, 26);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, [2, 2]));
  // Herringbone brick for the aisle.
  const brickTex = keep(canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#6a4434';
    g.fillRect(0, 0, w, h);
    const bw = 64; const bh = 32;
    for (let y = -bw; y < h + bw; y += bh) {
      for (let x = -bw; x < w + bw; x += bw) {
        const horizontal = ((x + y) / bh) % 4 < 2;
        g.save();
        g.translate(x + ((y / bh) % 2) * bh, y);
        g.rotate(horizontal ? Math.PI / 4 : -Math.PI / 4);
        g.fillStyle = `hsl(${rand(10, 20)}, ${rand(38, 52)}%, ${rand(34, 44)}%)`;
        g.fillRect(1, 1, bw - 3, bh - 3);
        g.restore();
      }
    }
  }, [3, 3]));
  const grassTex = keep(canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#5f7d3a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = ['#557334', '#6b8a42', '#4d6a2f', '#78964c'][i % 4];
      g.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(2, 6));
    }
  }, [16, 16]));
  const mats = {
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 }),
    timber: new THREE.MeshStandardMaterial({ color: COLORS.timber, roughness: 0.85 }),
    forest: new THREE.MeshStandardMaterial({ color: COLORS.forest, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.8, roughness: 0.3 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5, roughness: 0.5 }),
    straw: new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1 }),
    brick: new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.9 }),
    bucket: new THREE.MeshStandardMaterial({ color: 0x2c4a3e, roughness: 0.55 }),
    water: new THREE.MeshStandardMaterial({ color: 0x4f7f95, roughness: 0.15, metalness: 0.2 }),
    tape: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.6, side: THREE.DoubleSide }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f6b35, roughness: 0.9 }),
    lantern: new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb54d, emissiveIntensity: 2 }),
  };
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const add = (parent, geo, mat, x, y, z, { rx = 0, ry = 0, rz = 0, shadow = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const board = (parent, w, h, d, x, y, z, mat, opts) => add(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);

  // A braced panel: a frame in forest green with an X of boards, the barn-door look.
  function bracedPanel(parent, width, x, z) {
    const h = WALL;
    board(parent, width, h, T, x, h / 2, z, mats.wood);
    const f = 0.07;
    board(parent, width, f, T + 0.02, x, h - f / 2, z, mats.forest);
    board(parent, width, f, T + 0.02, x, f / 2, z, mats.forest);
    board(parent, f, h, T + 0.02, x - width / 2 + f / 2, h / 2, z, mats.forest);
    board(parent, f, h, T + 0.02, x + width / 2 - f / 2, h / 2, z, mats.forest);
    const diag = Math.hypot(width - 2 * f, h - 2 * f);
    const angle = Math.atan2(h - 2 * f, width - 2 * f);
    board(parent, diag, f, T + 0.03, x, h / 2, z, mats.forest, { rz: angle });
    board(parent, diag, f, T + 0.03, x, h / 2, z, mats.forest, { rz: -angle });
  }

  // One box stall at the origin, its door facing +z. Partitions between stalls are drawn by the zone.
  function makeStall(stall) {
    const g = new THREE.Group();
    g.userData.code = stall.code;
    const bed = add(g, new THREE.PlaneGeometry(S - T, S - T), mats.straw, 0, 0.015, 0, { rx: -Math.PI / 2, shadow: false });
    bed.receiveShadow = true;
    board(g, S, TOP, T, 0, TOP / 2, -S / 2, mats.wood); // back wall
    const front = S / 2;
    // Front: a braced fixed panel on the left, the Dutch door on the right with its upper half open.
    bracedPanel(g, S / 2, -S / 4, front);
    bracedPanel(g, S / 2 - 0.06, S / 4, front + 0.02);
    const upper = new THREE.Group();
    upper.position.set(S / 2 - 0.05, WALL, front + 0.07);
    upper.rotation.y = -0.18; // folded back against the front, past the hinge
    board(upper, S / 2 - 0.1, TOP - WALL - 0.08, 0.06, (S / 2 - 0.1) / 2, (TOP - WALL) / 2, 0, mats.wood);
    board(upper, S / 2 - 0.1, 0.06, 0.08, (S / 2 - 0.1) / 2, TOP - WALL - 0.08, 0, mats.forest);
    g.add(upper);
    const latch = add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), mats.iron, 0.18, 1.05, front + 0.1, { rz: Math.PI / 2 });
    latch.castShadow = false;
    // Hay rack and bucket on the back wall.
    board(g, 0.9, 0.42, 0.42, -1.05, 1.5, -S / 2 + 0.26, mats.straw);
    board(g, 0.94, 0.05, 0.46, -1.05, 1.27, -S / 2 + 0.26, mats.timber);
    add(g, new THREE.CylinderGeometry(0.19, 0.15, 0.32, 20), mats.bucket, 1.2, 0.95, -S / 2 + 0.24);
    add(g, new THREE.CircleGeometry(0.17, 20), mats.water, 1.2, 1.1, -S / 2 + 0.24, { rx: -Math.PI / 2, shadow: false });
    // Brass nameplate and the state lamp on the fixed panel, facing the aisle.
    const plateTex = keep(canvasTexture(512, 240, (pg) => {
      const grad = pg.createLinearGradient(0, 0, 512, 240);
      grad.addColorStop(0, '#b8902f'); grad.addColorStop(0.5, '#ecd27e'); grad.addColorStop(1, '#a8801f');
      pg.fillStyle = grad;
      pg.fillRect(0, 0, 512, 240);
      pg.strokeStyle = '#6e5310';
      pg.lineWidth = 10;
      pg.strokeRect(10, 10, 492, 220);
      pg.fillStyle = '#3d2c06';
      pg.textAlign = 'center';
      pg.font = '700 108px Lora, Georgia, serif';
      pg.fillText(stall.code, 256, 126);
      pg.font = '600 40px Inter, Arial, sans-serif';
      pg.fillText(plateName(stall).slice(0, 22), 256, 190);
    }));
    add(g, new THREE.PlaneGeometry(0.62, 0.29), new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.5, roughness: 0.35 }), -S / 4, 1.0, front + T / 2 + 0.03, { shadow: false });
    const color = STALL_STATES[stallState(stall)].lamp;
    add(g, new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.8 }), -S / 4 + 0.42, 1.0, front + T / 2 + 0.05, { shadow: false });
    if (stall.status === 'maintenance') {
      board(g, S / 2 + 0.3, 0.1, 0.02, S / 4, 1.7, front + 0.12, mats.tape, { rz: -0.12 });
      board(g, S / 2 + 0.3, 0.1, 0.02, S / 4, 1.95, front + 0.12, mats.tape, { rz: 0.1 });
    }
    return g;
  }

  // The partitions of a row: solid wood below, three horizontal rails above (no bars).
  function partitions(parent, xs, zCenter) {
    for (const x of xs) {
      board(parent, T, WALL, S, x, WALL / 2, zCenter, mats.wood);
      for (const y of [1.72, 2.02, 2.32]) board(parent, 0.06, 0.12, S, x, y, zCenter, mats.wood);
      board(parent, 0.14, TOP, 0.14, x, TOP / 2, zCenter + S / 2, mats.timber); // post on the aisle
      board(parent, 0.14, TOP, 0.14, x, TOP / 2, zCenter - S / 2, mats.timber);
    }
  }

  // The barn floor and fittings: brick aisle, lanterns on the aisle posts, hay bales, a sign at the entrance.
  function barn(parent, { rows, length, zoneLabel }) {
    const half = length / 2;
    const depth = rows === 2 ? 2 * S + AISLE : S + AISLE;
    add(parent, new THREE.PlaneGeometry(length + 3, AISLE), mats.brick, 0, 0.01, 0, { rx: -Math.PI / 2, shadow: false });
    // A lantern on every other post along the aisle; two warm lights for the whole zone.
    for (let i = 0; i <= length / S; i += 2) {
      const x = -half + i * S;
      for (const side of rows === 2 ? [-1, 1] : [-1]) {
        add(parent, new THREE.BoxGeometry(0.05, 0.05, 0.22), mats.iron, x, 2.28, side * (AISLE / 2 - 0.1), { shadow: false });
        add(parent, new THREE.BoxGeometry(0.16, 0.24, 0.16), mats.lantern, x, 2.12, side * (AISLE / 2 - 0.22), { shadow: false });
      }
    }
    for (const x of rows === 2 ? [-half / 2, half / 2] : [0]) {
      const light = new THREE.PointLight(0xffc27a, 6, 9, 2);
      light.position.set(x, 2.3, 0);
      parent.add(light);
    }
    // Hay bales stacked at the far end of the aisle.
    for (const [dx, dy, dz] of [[0, 0.25, -0.6], [0, 0.25, 0.6], [0, 0.75, 0]]) board(parent, 1.0, 0.5, 1.1, -half - 0.9 + dx, dy, dz, mats.straw);
    // The zone's sign at the entrance: forest green board, brass letters.
    const signTex = keep(canvasTexture(768, 256, (sg) => {
      sg.fillStyle = '#1f4a38';
      sg.fillRect(0, 0, 768, 256);
      sg.strokeStyle = '#c9a24a';
      sg.lineWidth = 12;
      sg.strokeRect(14, 14, 740, 228);
      sg.fillStyle = '#e6c873';
      sg.textAlign = 'center';
      sg.font = '700 96px Lora, Georgia, serif';
      sg.fillText(zoneLabel.title, 384, 122);
      sg.font = '500 40px Inter, Arial, sans-serif';
      sg.fillText(zoneLabel.subtitle.slice(0, 34), 384, 196);
    }));
    const sx = half + 1.6;
    for (const dz of [-0.9, 0.9]) board(parent, 0.12, 2.0, 0.12, sx, 1.0, dz, mats.timber);
    add(parent, new THREE.PlaneGeometry(1.8, 0.6), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }), sx, 1.75, 0, { ry: Math.PI / 2, shadow: false });
    add(parent, new THREE.PlaneGeometry(1.8, 0.6), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }), sx - 0.01, 1.75, 0, { ry: -Math.PI / 2, shadow: false });
    return { depth, half };
  }

  // Outside: a post-and-rail paddock fence and a few trees.
  function farm(parent, { half, depth }) {
    const fx = half + 6;
    const fz = depth / 2 + 5;
    const rail = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const ry = -Math.atan2(z2 - z1, x2 - x1);
      for (const y of [0.55, 1.0]) board(parent, len, 0.1, 0.06, (x1 + x2) / 2, y, (z1 + z2) / 2, mats.wood, { ry });
      const n = Math.max(1, Math.round(len / 2.5));
      for (let i = 0; i <= n; i++) board(parent, 0.12, 1.2, 0.12, x1 + ((x2 - x1) * i) / n, 0.6, z1 + ((z2 - z1) * i) / n, mats.timber);
    };
    rail(-fx, -fz, fx, -fz);
    rail(-fx, fz, fx, fz);
    rail(-fx, -fz, -fx, fz);
    rail(fx, -fz, fx, -2.4); // a gate gap in front of the entrance
    rail(fx, 2.4, fx, fz);
    for (const [x, z, s] of [[-fx - 4, -fz + 3, 1.2], [-fx - 3, fz - 2, 1], [fx + 4, -fz - 2, 1.3], [fx + 5, fz + 1, 0.9], [half + 2, -fz - 6, 1.1], [-half, fz + 5, 1]]) {
      add(parent, new THREE.CylinderGeometry(0.14 * s, 0.2 * s, 1.6 * s, 8), mats.timber, x, 0.8 * s, z);
      add(parent, new THREE.ConeGeometry(1.3 * s, 3.2 * s, 10), mats.leaf, x, 2.9 * s, z);
    }
  }

  // The team's banner out past the fence, readable against the sky (no fog, a little self-lit).
  function banner(parent, half, depth) {
    const bannerTex = keep(canvasTexture(1024, 256, (g) => {
      g.fillStyle = '#123a2c';
      g.fillRect(0, 0, 1024, 256);
      g.strokeStyle = '#c9a24a';
      g.lineWidth = 10;
      g.strokeRect(12, 12, 1000, 232);
      g.textAlign = 'center';
      g.fillStyle = '#e6c873';
      g.font = '700 110px Lora, Georgia, serif';
      g.fillText('WDP301 · TEAM 8', 512, 135);
      g.fillStyle = '#d9e4dc';
      g.font = '500 38px Inter, Arial, sans-serif';
      g.fillText('Racehorse Training Management System', 512, 205);
    }));
    const w = 12;
    const h = 3;
    const sign = new THREE.Group();
    sign.position.set(-half * 0.2, 0, -(depth / 2 + 9));
    sign.rotation.y = 0.45;
    for (const px of [-w / 2 + 0.3, w / 2 - 0.3]) board(sign, 0.22, 6.2, 0.22, px, 3.1, -0.1, mats.timber);
    board(sign, w + 0.2, h + 0.2, 0.08, 0, 4.6, -0.07, mats.timber);
    const face = add(sign, new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: bannerTex, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.35, roughness: 0.6 }), 0, 4.6, 0, { shadow: false });
    face.material.fog = false;
    parent.add(sign);
  }

  // Staff on their rounds, chibi style: big head, cap, clipboard. Each walks the lane in front of one
  // row and stops at its occupied stalls (all its stalls when none is occupied) to look in.
  const walkers = [];
  function makeChibi(look) {
    const mat = (hex, roughness = 0.7) => new THREE.MeshStandardMaterial({ color: hex, roughness });
    const skin = mat(0xf2c7a5, 0.6);
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const limb = (r, len, m, x, y) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m);
      mesh.position.y = -(len / 2 + r * 0.6);
      mesh.castShadow = true;
      pivot.add(mesh);
      body.add(pivot);
      return pivot;
    };
    const cloth = look.coat ? 0xf4f4f0 : look.shirt;
    const legL = limb(0.075, 0.26, mat(look.pants), -0.09, 0.44);
    const legR = limb(0.075, 0.26, mat(look.pants), 0.09, 0.44);
    for (const leg of [legL, legR]) add(leg, new THREE.BoxGeometry(0.13, 0.08, 0.2), mat(0x3a2a1e), 0, -0.42, 0.03);
    add(body, new THREE.CapsuleGeometry(0.18, 0.22, 4, 12), mat(cloth), 0, 0.72, 0);
    if (look.coat) add(body, new THREE.CylinderGeometry(0.19, 0.25, 0.32, 16), mat(cloth), 0, 0.52, 0);
    const armL = limb(0.055, 0.26, mat(cloth), -0.24, 0.9);
    const armR = limb(0.055, 0.26, mat(cloth), 0.24, 0.9);
    for (const arm of [armL, armR]) add(arm, new THREE.SphereGeometry(0.06, 12, 10), skin, 0, -0.42, 0);
    add(armR, new THREE.BoxGeometry(0.17, 0.23, 0.02), mat(0x8a5a2b), 0, -0.38, 0.09); // clipboard
    add(armR, new THREE.BoxGeometry(0.13, 0.16, 0.005), mat(0xffffff), 0, -0.37, 0.1, { shadow: false });
    const head = new THREE.Group();
    head.position.set(0, 1.2, 0);
    body.add(head);
    add(head, new THREE.SphereGeometry(0.28, 24, 18), skin, 0, 0, 0);
    for (const sx of [-1, 1]) {
      add(head, new THREE.SphereGeometry(0.035, 10, 8), mat(0x1b1b1b, 0.3), sx * 0.09, 0.02, 0.25, { shadow: false });
      add(head, new THREE.SphereGeometry(0.045, 10, 8), mat(0xf29a9a, 0.8), sx * 0.15, -0.06, 0.22, { shadow: false });
    }
    if (look.cap) {
      add(head, new THREE.SphereGeometry(0.29, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.cap), 0, 0.03, 0);
      add(head, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), mat(look.cap), 0, 0.05, 0.22, { shadow: false });
    } else {
      add(head, new THREE.SphereGeometry(0.29, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.3), mat(look.hair), 0, 0.02, -0.02);
    }
    return { group: g, body, legL, legR, armL, armR, head };
  }
  function staffRounds(parent, places, rows) {
    const looks = [{ shirt: 0x2f6b4f, pants: 0x3b3b46, cap: 0x1f4a38 }, { coat: true, pants: 0x34404c, hair: 0x2b211c }];
    (rows === 2 ? [-1, 1] : [-1]).forEach((side, i) => {
      const row = places.filter((p) => Math.sign(p.z) === side).sort((a, b) => a.x - b.x);
      const occupied = row.filter((p) => p.busy);
      const stops = (occupied.length ? occupied : row).map((p) => p.x);
      if (!stops.length) return;
      const chibi = makeChibi(looks[i % looks.length]);
      const lane = side * (AISLE / 2 - 0.55); // right at the doors
      chibi.group.position.set(stops[0], 0, lane);
      parent.add(chibi.group);
      walkers.push({ ...chibi, stops, side, index: 0, step: 1, mode: 'look', timer: rand(0.5, 2.5), phase: rand(0, 6) });
    });
  }
  const turn = (from, to, k) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * k;
  function walk(w, dt) {
    const x = w.group.position.x;
    if (w.mode === 'walk') {
      const dx = w.stops[w.index] - x;
      if (Math.abs(dx) < 0.04) { w.mode = 'look'; w.timer = rand(1.8, 3.2); return; }
      w.group.position.x += Math.sign(dx) * Math.min(Math.abs(dx), 0.9 * dt);
      w.group.rotation.y = turn(w.group.rotation.y, dx > 0 ? Math.PI / 2 : -Math.PI / 2, Math.min(1, dt * 8));
      w.phase += dt * 9;
      const swing = Math.sin(w.phase);
      w.legL.rotation.x = swing * 0.6;
      w.legR.rotation.x = -swing * 0.6;
      w.armL.rotation.x = -swing * 0.5;
      w.armR.rotation.x = swing * 0.5;
      w.body.position.y = Math.abs(swing) * 0.04;
      w.head.rotation.x = 0;
      return;
    }
    // Facing the stall, the clipboard up, a small nod.
    w.group.rotation.y = turn(w.group.rotation.y, w.side < 0 ? Math.PI : 0, Math.min(1, dt * 6));
    const ease = Math.min(1, dt * 6);
    w.legL.rotation.x -= w.legL.rotation.x * ease;
    w.legR.rotation.x -= w.legR.rotation.x * ease;
    w.armL.rotation.x -= w.armL.rotation.x * ease;
    w.armR.rotation.x += (-1.1 - w.armR.rotation.x) * ease;
    w.body.position.y -= w.body.position.y * ease;
    w.phase += dt * 2;
    w.head.rotation.x = Math.sin(w.phase) * 0.12;
    w.timer -= dt;
    if (w.timer > 0) return;
    if (w.stops.length < 2) { w.timer = rand(1.8, 3.2); return; }
    if (w.index + w.step < 0 || w.index + w.step >= w.stops.length) w.step = -w.step;
    w.index += w.step;
    w.mode = 'walk';
  }

  let model = null;
  const mixers = [];
  function placeHorse(group, stall) {
    const horse = cloneSkinned(model.template);
    const coat = coatFor({ breed: stall.occupant?.horse?.breed, color: stall.occupant?.horse?.color });
    horse.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // the quantized bounds are tiny: never cull the horse while the camera moves
      o.material = o.material.clone();
      const name = o.material.name || '';
      if (/body/i.test(name)) { o.material.color.setRGB(...coat.body); o.material.roughness = coat.roughness ?? o.material.roughness; }
      else if (/hair/i.test(name)) o.material.color.setRGB(...coat.hair);
    });
    group.add(horse);
    if (model.clip) {
      const mixer = new THREE.AnimationMixer(horse);
      const action = mixer.clipAction(model.clip);
      action.time = Math.random() * model.clip.duration;
      action.timeScale = rand(0.85, 1.1);
      action.play();
      mixers.push(mixer);
    }
  }

  let zone = null;
  let stalls = [];
  let signature = '';
  let extent = { rows: 2, length: 4 * S };
  const centers = new Map();
  function disposeZone() {
    if (!zone) return;
    scene.remove(zone);
    zone.traverse((o) => {
      if (o.isSkinnedMesh) { o.material?.dispose?.(); return; } // horse clones share the model's geometry
      o.geometry?.dispose?.();
      if (o.material && !Object.values(mats).includes(o.material)) { o.material.map?.dispose?.(); o.material.dispose(); }
    });
    zone = null;
  }
  function build() {
    disposeZone();
    mixers.length = 0;
    walkers.length = 0;
    centers.clear();
    zone = new THREE.Group();
    const busy = [];
    const { places, perRow, rows, length } = layout(stalls);
    extent = { rows, length };
    for (const { stall, x, z, face } of places) {
      const g = makeStall(stall);
      g.position.set(x, 0, z);
      if (face < 0) g.rotation.y = Math.PI;
      if (model && stall.occupied && stall.status !== 'maintenance') placeHorse(g, stall);
      zone.add(g);
      centers.set(stall.code, { x, z, face });
      busy.push({ x, z, busy: stall.occupied && stall.status !== 'maintenance' });
    }
    const xs = Array.from({ length: perRow + 1 }, (_, i) => -length / 2 + i * S);
    partitions(zone, xs, -(AISLE / 2 + S / 2));
    if (rows === 2) partitions(zone, xs, AISLE / 2 + S / 2);
    const first = stalls[0];
    const label = first ? { title: (first.zoneName || `Khu ${first.zone}`).toUpperCase(), subtitle: first.zonePurpose || 'Câu lạc bộ đua ngựa' } : { title: 'CHUỒNG', subtitle: '' };
    const size = barn(zone, { rows, length, zoneLabel: label });
    farm(zone, size);
    banner(zone, size.half, size.depth);
    staffRounds(zone, busy, rows);
    scene.add(zone);
  }

  let fly = null;
  const flyTo = (pos, target) => { fly = { p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: target, t: 0 }; };
  function focus(code) {
    const c = centers.get(code);
    if (!c) return;
    // From across the aisle, to the side and above head height, looking over the door into the stall
    // (over the staff checking it, who stand right at the door).
    flyTo(new THREE.Vector3(c.x + 1.6 * c.face, 3.5, c.z + (S / 2 + AISLE / 2 + 1.0) * c.face), new THREE.Vector3(c.x, 0.95, c.z));
  }
  function overview() {
    const d = extent.rows === 2 ? Math.max(18, extent.length * 1.2) : 11;
    flyTo(new THREE.Vector3(d * 0.62, d * 0.55, d * 0.95), new THREE.Vector3(0, 1.2, 0));
  }

  // A click on a stall selects it; a drag only turns the camera.
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  const onDown = (e) => { down = [e.clientX, e.clientY]; };
  const onUp = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || !zone) return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    for (const hit of ray.intersectObjects(zone.children, true)) {
      let o = hit.object;
      while (o && !o.userData.code) o = o.parent;
      if (o) { onSelect?.(o.userData.code); return; }
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  let focused = null;
  const horseReady = loadHorse().then((m) => {
    model = m;
    if (stalls.length) { build(); if (focused) focus(focused); }
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    for (const m of mixers) m.update(dt);
    for (const w of walkers) walk(w, dt);
    if (fly) {
      fly.t = Math.min(1, fly.t + dt * (reduceMotion ? 10 : 1.4));
      const k = 1 - (1 - fly.t) ** 3;
      camera.position.lerpVectors(fly.p0, fly.p1, k);
      controls.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.t >= 1) fly = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    horseReady,
    /** The stalls to show (one zone, or a single stall), and the one to look at. */
    setStalls(next, focusCode) {
      const sig = JSON.stringify(next.map((s) => [s.code, stallState(s), plateName(s), s.occupant?.horse?.breed, s.occupant?.horse?.color, s.zoneName, s.zonePurpose]));
      if (sig !== signature) { stalls = next; signature = sig; build(); }
      focused = focusCode || null;
      if (focusCode && centers.has(focusCode)) focus(focusCode); else overview();
    },
    focus(code) { focused = code; focus(code); },
    overview,
    setAutoRotate(on) { controls.autoRotate = Boolean(on); },
    /** The sky colour (follows the light/dark canvas). */
    setBackground(color) { renderer.setClearColor(color); scene.fog = new THREE.Fog(color, 30, 70); },
    resize(width, height) { renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); },
    dispose() {
      renderer.setAnimationLoop(null);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      disposeZone();
      controls.dispose();
      for (const t of textures) t.dispose();
      for (const m of Object.values(mats)) m.dispose();
      grass.geometry.dispose();
      grass.material.dispose();
      renderer.dispose();
    },
  };
}
