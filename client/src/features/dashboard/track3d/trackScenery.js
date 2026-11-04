import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pastureSkyAt } from '../../horses/horse3d/horseStage';

/**
 * The training track's surroundings, built in code so nothing more is downloaded: trees with full crowns,
 * pines and a hazy tree line far off, a stable block with boarded walls and a metal roof, a grandstand,
 * grass with a grain, dirt with harrow lines and hoof marks, the sky of the hour with the login's evening
 * tones, and the sun's glow. The pasture on a horse's page keeps its own (horseStage.js), untouched.
 *
 * Draw calls stay few: every tree, pine and the tree line are merged into one crown mesh and one trunk mesh.
 */

/** A repeatable random series, so the scenery is the same on every load. */
function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
/** Smooth noise in about −1…1: two points with the same position move the same, so a mesh does not tear. */
const wobble = (x, y, z, s) => Math.sin(x * 1.7 + s) * Math.cos(z * 1.3 - s) * 0.55 + Math.sin(y * 2.3 + x * 0.7 + s * 2) * 0.45;

function canvasTexture(size, paint, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  paint(canvas.getContext('2d'), size[0], size[1]);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

/** Grass seen from above: soft lighter and darker patches, then thousands of short blades in three greens. */
export function grassTexture(repeat) {
  return canvasTexture([512, 512], (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#4c7a35';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i += 1) {
      const x = r() * w;
      const y = r() * h;
      const rad = 30 + r() * 90;
      const patch = g.createRadialGradient(x, y, 0, x, y, rad);
      patch.addColorStop(0, r() > 0.5 ? 'rgba(120,160,70,0.1)' : 'rgba(40,70,30,0.1)');
      patch.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = patch;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const blades = ['#3b6629', '#5d8c3e', '#79a64f'];
    for (let i = 0; i < 14000; i += 1) {
      g.strokeStyle = blades[i % 3];
      g.globalAlpha = 0.35 + r() * 0.4;
      const x = r() * w;
      const y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 2, y - 2 - r() * 3);
      g.lineWidth = 1;
      g.stroke();
    }
    g.globalAlpha = 1;
  }, repeat);
}

/**
 * The dirt of the track: along x the way the horses run, across y the track's width (inner rail at the top).
 * Grain, harrow lines along the track, the inner lanes darker where they are run most, hoof marks in them.
 */
export function dirtTexture() {
  return canvasTexture([512, 512], (g, w, h) => {
    const r = rng(23);
    g.fillStyle = '#8f5f3a';
    g.fillRect(0, 0, w, h);
    const worn = g.createLinearGradient(0, 0, 0, h);
    worn.addColorStop(0, 'rgba(70,40,22,0.42)');
    worn.addColorStop(0.45, 'rgba(70,40,22,0.18)');
    worn.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = worn;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 12000; i += 1) {
      g.fillStyle = r() > 0.5 ? '#b07d52' : '#5e3a22';
      g.globalAlpha = 0.18 + r() * 0.35;
      const s = 0.8 + r() * 1.8;
      g.fillRect(r() * w, r() * h, s, s);
    }
    g.globalAlpha = 0.28;
    g.strokeStyle = '#4f3019';
    for (let y = 6; y < h; y += 14) {
      g.beginPath();
      g.moveTo(0, y + r() * 2);
      for (let x = 32; x <= w; x += 32) g.lineTo(x, y + r() * 2);
      g.lineWidth = 1.5;
      g.stroke();
    }
    // Hoof marks: small dark crescents, thick in the inner lanes.
    g.globalAlpha = 0.45;
    g.fillStyle = '#3e2412';
    for (let i = 0; i < 420; i += 1) {
      const y = Math.pow(r(), 1.8) * h;
      const x = r() * w;
      g.beginPath();
      g.ellipse(x, y, 3.2, 2.2, 0, Math.PI * 0.15, Math.PI * 1.85);
      g.fill();
    }
    g.globalAlpha = 1;
  });
}

/**
 * The ground's height: flat where the track, the stables and the stands are (within 62 m), rising close behind
 * them into low rolling hills (about 13 m at most), so the land meets the sky in a near line of hills the fog
 * softens, never in an edge.
 */
export function groundHeight(x, z) {
  const t = THREE.MathUtils.smoothstep(Math.hypot(x, z), 62, 150);
  if (t <= 0) return 0;
  const hills = (wobble(x * 0.024, 0, z * 0.021, 1) * 0.5 + 0.5) * 9 + (wobble(x * 0.05, 0, z * 0.055, 4) * 0.5 + 0.5) * 4;
  return t * hills;
}

/** The ground, 1 km square: the hills, and broad lighter and darker sweeps over the grass so it never reads as a carpet. */
export function groundMesh(grass) {
  const g = new THREE.PlaneGeometry(1000, 1000, 160, 160);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const colors = [];
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const z = p.getZ(i);
    p.setY(i, groundHeight(x, z) - 0.03);
    const v = 0.86 + 0.13 * wobble(x * 0.031, 0, z * 0.027, 7) + 0.07 * wobble(x * 0.11, 0, z * 0.09, 2);
    colors.push(v * 0.97, v, v * 0.9);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  grass.repeat.set(200, 200);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1 }));
}

/** A soft round shadow, for the foot of a tree or a building. */
function shadowTexture() {
  return canvasTexture([128, 128], (g) => {
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.42)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
}

/**
 * One clump of leaves: a lumpy ball, lighter on top where the sun falls, darker beneath and in its hollows
 * (where the surface is pushed in), with a fine speckle of lighter and darker leaves.
 */
function clump(radius, detail, seed, dark, light) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.24 * wobble(x * 2.4, y * 2.4, z * 2.4, seed);
    p.setXYZ(i, x * k, y * k * 0.86, z * k);
    const up = THREE.MathUtils.clamp((y / radius + 1) / 2, 0, 1);
    c.copy(dark).lerp(light, THREE.MathUtils.clamp(up * 0.8 + 0.25 * wobble(x * 9, y * 9, z * 9, seed + 3), 0, 1));
    c.multiplyScalar(THREE.MathUtils.clamp(0.8 + (k - 1) * 1.8, 0.55, 1.12));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function bark(geometry, color) {
  geometry.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** A broadleaf tree at (x, z): a trunk, three branches and a crown of overlapping clumps (`detail` 2 smooth, 1 lighter). */
function oak(x, z, seed, scale, crowns, trunks, detail = 2) {
  const r = rng(seed);
  const shade = r() * 0.12;
  const dark = new THREE.Color('#24401a').offsetHSL(shade * 0.3, 0, 0);
  const light = new THREE.Color('#86ad55').offsetHSL(shade * 0.2, 0, -shade * 0.4);
  const height = (2.4 + r() * 0.8) * scale;
  const trunk = bark(new THREE.CylinderGeometry(0.14 * scale, 0.3 * scale, height, 7), '#4a3424');
  trunk.translate(x, height / 2, z);
  trunks.push(trunk);
  for (let b = 0; b < 3; b += 1) {
    const branch = bark(new THREE.CylinderGeometry(0.05 * scale, 0.11 * scale, 1.4 * scale, 5), '#4a3424');
    branch.translate(0, 0.7 * scale, 0);
    branch.rotateZ(0.7);
    branch.rotateY((b / 3) * Math.PI * 2 + r());
    branch.translate(x, height * 0.72, z);
    trunks.push(branch);
  }
  // The crown starts low on the trunk and is wider or taller from tree to tree, as real crowns are.
  const tall = 0.85 + r() * 0.6;
  const cy = height * 0.82 + 1.1 * scale * tall;
  for (let i = 0; i < 12; i += 1) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 2 * scale;
    const g = clump((0.6 + r() * 0.5) * scale, detail, seed + i, dark, light);
    g.translate(x + Math.cos(a) * d, cy + (r() - 0.4) * 2.1 * scale * tall, z + Math.sin(a) * d);
    crowns.push(g);
  }
}

/** A pine at (x, z): a straight trunk and tiers of drooping, uneven cones, dark at the base. */
function pine(x, z, seed, scale, crowns, trunks) {
  const r = rng(seed);
  const trunk = bark(new THREE.CylinderGeometry(0.1 * scale, 0.2 * scale, 1.6 * scale, 6), '#3d2a1c');
  trunk.translate(x, 0.8 * scale, z);
  trunks.push(trunk);
  const dark = new THREE.Color('#183020');
  const light = new THREE.Color('#41703f');
  for (let k = 0; k < 5; k += 1) {
    let g = new THREE.ConeGeometry((1.7 - k * 0.3) * scale, 1.9 * scale, 10, 2);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const p = g.attributes.position;
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 1) {
      const px = p.getX(i);
      const py = p.getY(i);
      const pz = p.getZ(i);
      const out = Math.hypot(px, pz) > 0.2 * scale ? 1 + 0.18 * wobble(px * 3, py, pz * 3, seed + k) : 1;
      p.setXYZ(i, px * out, py - (out - 1) * 0.6 * scale, pz * out);
      c.copy(dark).lerp(light, THREE.MathUtils.clamp(k / 5 + (py / (1.9 * scale) + 0.5) * 0.35, 0, 1));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    g.translate(x, (1.9 + k * 1.05) * scale, z);
    crowns.push(g);
  }
  return r;
}

/** Boards side by side, for a wall: weathered paint, the joints, and (for the front) the stall doors. */
function boardTexture(base, trim, doors) {
  return canvasTexture([1024, 256], (g, w, h) => {
    const r = rng(base.length * 31 + doors);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 12) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, 0, 1.5, h);
      g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`;
      g.fillRect(x + 2, 0, 9, h);
    }
    for (let i = 0; i < 2500; i += 1) {
      g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 4 + r() * 10);
    }
    for (let d = 0; d < doors; d += 1) {
      const cx = ((d + 0.5) / doors) * w;
      const dw = Math.min(110, (w / doors) * 0.62);
      const top = h * 0.22;
      // A Dutch stall door: the top half open on the dark stall, the bottom closed with a cross brace.
      g.fillStyle = '#1b130e';
      g.fillRect(cx - dw / 2, top, dw, (h - top) * 0.45);
      g.strokeStyle = trim;
      g.lineWidth = 7;
      g.strokeRect(cx - dw / 2, top, dw, h - top);
      const mid = top + (h - top) * 0.45;
      g.beginPath();
      g.moveTo(cx - dw / 2, mid);
      g.lineTo(cx + dw / 2, mid);
      g.moveTo(cx - dw / 2, mid);
      g.lineTo(cx + dw / 2, h);
      g.moveTo(cx + dw / 2, mid);
      g.lineTo(cx - dw / 2, h);
      g.lineWidth = 5;
      g.stroke();
    }
  });
}

/** Standing-seam metal: dark panels with light ribs running down the slope. */
function roofTexture() {
  return canvasTexture([256, 256], (g, w, h) => {
    g.fillStyle = '#2f3439';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 2, 0, 2, h);
    }
  }, 1);
}

/**
 * A stable block `length` m long facing +z, its centre on the ground: boarded walls with stall doors,
 * a pitched metal roof with eaves, gable ends and a small cupola on the ridge.
 */
function stable(length, doors, materials) {
  const depth = 7;
  const wall = 3.2;
  const group = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(length, wall), materials.front(doors));
  front.position.set(0, wall / 2, depth / 2);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(length, wall), materials.back);
  back.position.set(0, wall / 2, -depth / 2);
  back.rotation.y = Math.PI;
  const left = new THREE.Mesh(new THREE.PlaneGeometry(depth, wall), materials.back);
  left.position.set(-length / 2, wall / 2, 0);
  left.rotation.y = -Math.PI / 2;
  const right = left.clone();
  right.position.x = length / 2;
  right.rotation.y = Math.PI / 2;
  // The gable ends, two triangles over the side walls.
  const rise = 2.2;
  const gable = new THREE.Shape([new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, rise)]);
  for (const side of [-1, 1]) {
    const tri = new THREE.Mesh(new THREE.ShapeGeometry(gable), materials.back);
    tri.position.set((side * length) / 2, wall, 0);
    tri.rotation.y = (side * Math.PI) / 2;
    group.add(tri);
  }
  const slope = Math.hypot(depth / 2 + 0.7, rise);
  const tilt = Math.atan2(rise, depth / 2 + 0.7);
  for (const side of [-1, 1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 1.2, 0.14, slope), materials.roof);
    roof.position.set(0, wall + rise / 2 - 0.05, (side * (depth / 2 + 0.7)) / 2);
    roof.rotation.x = side * tilt;
    group.add(roof);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(length + 1.3, 0.16, 0.3), materials.trim);
  ridge.position.set(0, wall + rise + 0.02, 0);
  const cupola = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 1.1), materials.trim);
  cupola.position.set(0, wall + rise + 0.5, 0);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.8, 4), materials.roof);
  cap.position.set(0, wall + rise + 1.4, 0);
  cap.rotation.y = Math.PI / 4;
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(length + 0.3, 0.3, depth + 0.3), materials.stone);
  plinth.position.y = 0.15;
  group.add(front, back, left, right, ridge, cupola, cap, plinth);
  return group;
}

/** The club's sign, gold on charcoal, as on the login page. */
function signTexture() {
  const texture = canvasTexture([1024, 128], (g, w, h) => {
    g.fillStyle = '#16191d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#eab308';
    g.fillRect(0, h - 10, w, 10);
    g.font = '600 64px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Prestige Athletic Club', w / 2, h / 2 - 4);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * A grandstand `length` m long facing +z: tiers of seats rising to the back, side walls, a back wall,
 * and a roof reaching forward over the seats on slim columns, the club's name along its edge.
 */
function grandstand(length, materials, sign) {
  const group = new THREE.Group();
  const tiers = 8;
  const step = { rise: 0.55, run: 1.05 };
  const seats = [];
  const concrete = [];
  for (let i = 0; i < tiers; i += 1) {
    const block = new THREE.BoxGeometry(length, step.rise * (i + 1), step.run);
    block.translate(0, (step.rise * (i + 1)) / 2, -i * step.run);
    concrete.push(block);
    const row = new THREE.BoxGeometry(length - 0.6, 0.32, 0.42);
    row.translate(0, step.rise * (i + 1) + 0.16, -i * step.run - 0.12);
    seats.push(row);
  }
  const deepest = -(tiers - 1) * step.run - step.run / 2;
  const top = step.rise * tiers;
  const wallHeight = top + 3.4;
  const back = new THREE.BoxGeometry(length + 0.4, wallHeight, 0.4);
  back.translate(0, wallHeight / 2, deepest - 0.2);
  concrete.push(back);
  for (const side of [-1, 1]) {
    const end = new THREE.BoxGeometry(0.35, wallHeight, tiers * step.run + 0.4);
    end.translate((side * (length + 0.35)) / 2, wallHeight / 2, deepest / 2 - 0.1);
    concrete.push(end);
  }
  group.add(new THREE.Mesh(mergeGeometries(concrete), materials.stone));
  group.add(new THREE.Mesh(mergeGeometries(seats), materials.seats));
  const reach = tiers * step.run + 2.2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 1.4, 0.22, reach), materials.roof);
  roof.position.set(0, wallHeight + 0.25, deepest + reach / 2 - 0.4);
  roof.rotation.x = -0.06;
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(length + 1.4, 1.1), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
  fascia.position.set(0, wallHeight + 0.05, deepest + reach - 0.38);
  group.add(roof, fascia);
  for (let i = 0; i < 4; i += 1) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, wallHeight - 0.4, 8), materials.trim);
    column.position.set(-length / 2 + 1 + (i * (length - 2)) / 3, (wallHeight - 0.4) / 2 + 0.2, 0.2);
    group.add(column);
  }
  return group;
}

/** A soft shadow plane under something `w` by `d` m at (x, z), turned `turn`. */
function footShadow(w, d, x, z, turn, material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.set(-Math.PI / 2, 0, turn);
  m.position.set(x, 0.02, z);
  return m;
}

/**
 * Adds the surroundings to `scene` and returns what the stage must keep: the textures to dispose and
 * `setSky(sky)` to light the sun's glow for the hour. `clear(x, z)` is false where nothing may stand
 * (the track, its rails and the cameras' lines of sight); the buildings' places are kept free of trees.
 */
export function buildScenery(scene, { stablesAt, standAt, trees, clear, flagsAt = [], flowersAt = [], balesAt = [] }) {
  const textures = [];
  const keep = (t) => {
    textures.push(t);
    return t;
  };
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: keep(shadowTexture()), transparent: true, depthWrite: false });
  const roofMap = keep(roofTexture());
  const materials = {
    front: (doors) => new THREE.MeshStandardMaterial({ map: keep(boardTexture('#7e3523', '#efe6d4', doors)), roughness: 0.9 }),
    back: new THREE.MeshStandardMaterial({ map: keep(boardTexture('#7e3523', '#efe6d4', 0)), roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ map: roofMap, roughness: 0.55, metalness: 0.35 }),
    trim: new THREE.MeshStandardMaterial({ color: '#efe6d4', roughness: 0.7 }),
    stone: new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.95 }),
    seats: new THREE.MeshStandardMaterial({ color: '#2b3442', roughness: 0.6 }),
  };
  const footprints = [];
  for (const { x, z, length, doors, turn = 0 } of stablesAt) {
    const block = stable(length, doors, materials);
    block.position.set(x, 0, z);
    block.rotation.y = turn;
    scene.add(block, footShadow(length + 5, 11, x, z, -turn, shadowMaterial));
    footprints.push({ x, z, r: length / 2 + 3 });
  }
  const stand = grandstand(standAt.length, materials, keep(signTexture()));
  stand.position.set(standAt.x, 0, standAt.z);
  stand.rotation.y = standAt.turn || 0;
  scene.add(stand, footShadow(standAt.length + 6, 14, standAt.x, standAt.z - 3, -(standAt.turn || 0), shadowMaterial));
  footprints.push({ x: standAt.x, z: standAt.z - 3, r: standAt.length / 2 + 3 });
  const free = (x, z) => clear(x, z) && footprints.every((f) => Math.hypot(x - f.x, z - f.z) > f.r);

  // Every tree, near and far, merged: one mesh of crowns and one of trunks.
  const crowns = [];
  const trunks = [];
  // Each place a small grove: the tree, and one or two smaller ones beside it.
  const near = rng(41);
  trees.forEach(([x0, z0], i) => {
    const count = 1 + Math.floor(near() * 3);
    for (let k = 0; k < count; k += 1) {
      const a = near() * Math.PI * 2;
      const x = x0 + (k ? Math.cos(a) * (3 + near() * 3) : 0);
      const z = z0 + (k ? Math.sin(a) * (3 + near() * 3) : 0);
      if (!free(x, z)) continue;
      const scale = (1.2 + (i % 3) * 0.18) * (k ? 0.7 + near() * 0.2 : 1);
      if ((i + k) % 4 === 3) pine(x, z, 100 + i * 7 + k, scale, crowns, trunks);
      else oak(x, z, 100 + i * 7 + k, scale, crowns, trunks, k ? 1 : 2);
      scene.add(footShadow(5.5 * scale, 5.5 * scale, x, z, 0, shadowMaterial));
    }
  });
  // Woods close behind: groves of uneven trees on the first slopes, none before a camera; hazier as they rise.
  const r = rng(77);
  const dark = new THREE.Color('#1c3620');
  const light = new THREE.Color('#4a7438');
  for (let grove = 0; grove < 22; grove += 1) {
    const a = r() * Math.PI * 2;
    const d = 62 + r() * 55;
    const gx = Math.sin(a) * d;
    const gz = Math.cos(a) * d;
    if (!clear(gx, gz)) continue;
    const count = 4 + Math.floor(r() * 6);
    for (let t = 0; t < count; t += 1) {
      const x = gx + (r() - 0.5) * 26;
      const z = gz + (r() - 0.5) * 26;
      if (!clear(x, z)) continue;
      const s = 1.8 + r() * 2.6;
      const base = groundHeight(x, z);
      for (let k = 0; k < 3; k += 1) {
        const g = clump(s * (0.75 + r() * 0.45), 1, 300 + grove * 40 + t * 3 + k, dark, light);
        g.scale(1, 1.2 + r() * 0.5, 1);
        g.translate(x + (r() - 0.5) * s * 1.4, base + s * (1.2 + r() * 0.9), z + (r() - 0.5) * s * 1.4);
        crowns.push(g);
      }
    }
  }
  scene.add(
    new THREE.Mesh(mergeGeometries(crowns), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 })),
    new THREE.Mesh(mergeGeometries(trunks), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })),
  );
  for (const g of [...crowns, ...trunks]) g.dispose();

  // The sun's glow, far off along the light's direction, warm and soft; under the horizon, none.
  const glowMap = keep(canvasTexture([256, 256], (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,248,225,1)');
    gr.addColorStop(0.12, 'rgba(255,236,190,0.85)');
    gr.addColorStop(0.4, 'rgba(255,200,130,0.25)');
    gr.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  scene.add(glow);
  const setSky = (sky, sunDirection) => {
    const up = sunDirection.y > 0.02 && sky.hour > 5.7 && sky.hour < 18.9;
    glow.visible = up;
    if (!up) return;
    glow.position.copy(sunDirection).normalize().multiplyScalar(330);
    const low = 1 - THREE.MathUtils.clamp(sunDirection.normalize().y * 1.6, 0, 1);
    glow.scale.setScalar(70 + low * 70);
    glow.material.color.set(sky.sun[0]);
    glow.material.opacity = 0.55 + low * 0.45;
  };
  // Life and colour behind the horses: the club's flags flying, flower boxes along the far rail, hay by the stables.
  const flagMap = keep(canvasTexture([256, 128], (g, w, h) => {
    g.fillStyle = '#eab308';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16191d';
    g.fillRect(0, h * 0.36, w, h * 0.28);
    g.fillStyle = '#b42318';
    g.fillRect(0, 0, w * 0.18, h);
  }));
  flagMap.wrapS = THREE.ClampToEdgeWrapping;
  const flagMaterial = new THREE.MeshStandardMaterial({ map: flagMap, side: THREE.DoubleSide, roughness: 0.8 });
  const flags = flagsAt.map(([x, z], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7.5, 8), materials.trim);
    pole.position.set(x, 3.75, z);
    const cloth = new THREE.PlaneGeometry(2.6, 1.4, 10, 4);
    cloth.translate(1.3, 0, 0);
    const flag = new THREE.Mesh(cloth, flagMaterial);
    flag.position.set(x + 0.08, 6.6, z);
    scene.add(pole, flag);
    return { cloth, rest: Float32Array.from(cloth.attributes.position.array), phase: i * 1.3 };
  });
  const box = new THREE.BoxGeometry(1.9, 0.5, 0.6);
  const planterMaterial = materials.front(0);
  const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), Math.max(1, flowersAt.length * 9));
  const hues = ['#e63946', '#f4a261', '#ffd166', '#f1f5f9', '#e76fa8'];
  const pr = rng(19);
  const place = new THREE.Object3D();
  const colour = new THREE.Color();
  flowersAt.forEach(([x, z], i) => {
    const planter = new THREE.Mesh(box, planterMaterial);
    planter.position.set(x, 0.25, z);
    scene.add(planter);
    for (let k = 0; k < 9; k += 1) {
      place.position.set(x - 0.75 + (k % 5) * 0.37 + (pr() - 0.5) * 0.1, 0.62 + pr() * 0.12, z + (k < 5 ? -0.13 : 0.13));
      place.updateMatrix();
      petals.setMatrixAt(i * 9 + k, place.matrix);
      petals.setColorAt(i * 9 + k, colour.set(hues[Math.floor(pr() * hues.length)]));
    }
  });
  if (flowersAt.length) scene.add(petals);
  const hay = new THREE.MeshStandardMaterial({ color: '#d6a94a', roughness: 1 });
  for (const [x, z, turn = 0, up = 0] of balesAt) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.25, 14), hay);
    bale.rotation.set(0, turn, Math.PI / 2);
    bale.position.set(x, 0.62 + up * 1.15, z);
    scene.add(bale);
  }
  /** Waves the flags; `t` in seconds. */
  const update = (t) => {
    for (const flag of flags) {
      const pos = flag.cloth.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const x = flag.rest[i * 3];
        pos.setZ(i, Math.sin(x * 2.2 - t * 4 + flag.phase) * 0.14 * x);
      }
      pos.needsUpdate = true;
    }
  };
  return { textures, setSky, update };
}

const LOGIN_EVENING = { sky: '#4B4E53', horizon: '#EBA35A', clouds: '#F2C48D', sun: '#FCD977' };
/**
 * The sky of the hour (pastureSkyAt), with the login's evening laid over late afternoon and dusk: the slate
 * of its clouds high up, its sunset orange at the horizon, its pale gold sun. Mornings and noon are untouched.
 */
export function trackSkyAt(hour) {
  const s = pastureSkyAt(hour);
  const h = s.hour;
  const w = h < 15.8 || h > 19.1 ? 0 : h < 17 ? (h - 15.8) / 1.2 : h < 18.3 ? 1 : (19.1 - h) / 0.8;
  if (w <= 0) return s;
  const mix = (a, b, t) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
  return {
    ...s,
    sky: mix(s.sky, LOGIN_EVENING.sky, w * 0.7),
    horizon: mix(s.horizon, LOGIN_EVENING.horizon, w * 0.8),
    clouds: mix(s.clouds, LOGIN_EVENING.clouds, w * 0.7),
    sun: [mix(s.sun[0], LOGIN_EVENING.sun, w * 0.6), s.sun[1]],
  };
}

/** The sky behind everything: high colour, the horizon's, and a lighter band where the light is low. */
export function skyGradient(top, horizon) {
  const glow = `#${new THREE.Color(horizon).lerp(new THREE.Color('#fff4dc'), 0.35).getHexString()}`;
  const texture = canvasTexture([2, 512], (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top);
    gr.addColorStop(0.55, `#${new THREE.Color(top).lerp(new THREE.Color(horizon), 0.55).getHexString()}`);
    gr.addColorStop(0.8, horizon);
    gr.addColorStop(0.9, glow);
    gr.addColorStop(1, horizon);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}
