import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MOVING_HORSE } from './horseMotion';
import {
  createSkyEnvironment,
  createCurvedTrackRig,
  createHoofParticles,
} from './trackSurfacePbr';

/**
 * The stage of the moving horse (MovingHorse3D): the horse on the surface its plan trains on, the
 * track and its rails streaming back at its speed, uphill on a slope. On top of the clips, the bones
 * are bent each frame for what the clips do not have: a lame leg (short stiff stride, head nodding up
 * as the sore leg lands), a sore leg held off the ground, a tired horse's low, heavy head.
 *
 * World: metres, the horse runs towards +x, the camera looks from +z.
 *
 * The model, the sky, the surfaces and the scenery are exported for the training oval on the trainer's
 * home page (dashboard/track3d/trackStage.js), so both scenes look alike and the model loads once.
 */

// The track surfaces a plan trains on (trainingVocab SURFACE_LABELS), drawn on a canvas.
const SURFACES = {
  turf: { base: '#3f7a35', light: '#4f8f41', dark: '#2f6328', stripes: true },
  dirt: { base: '#8a6646', light: '#9c7652', dark: '#6f4f35', harrow: true },
  sand: { base: '#d2bb8d', light: '#e0cca1', dark: '#b89f72', ripples: true },
  synthetic: { base: '#6a4a40', light: '#7d5a4e', dark: '#553a32', fibre: true },
  // Not a track: a field of long grass waving in the wind, for a horse at rest (the owner's horse page).
  pasture: { base: '#35672b', light: '#447d37', dark: '#29521f', grass: true },
};
const TILE_M = 4; // one texture tile along the track, in metres
const POST_EVERY = 3; // rail posts, in metres
const TRACK_LENGTH = 60;
// The bones bent by hand, by the start of their names (the exporter adds numbers). The rig names them
// after a human arm and leg, one joint off (heights measured standing): a foreleg's UpperArm turns at
// the elbow (0.8 m), Forearm at the knee (0.45 m), Hand at the fetlock (0.15 m); a hind leg's Thing at
// the hip (1.15 m), Calf at the stifle (0.82 m), HorseLink at the hock (0.5 m), Foot at the fetlock.
// RF/LF/RH/LH: right/left fore/hind; the camera sees the right side.
export const LEGS = {
  RF: { upper: 'BN_R_UpperArm', knee: 'BN_R_Forearm', fetlock: 'BN_R_Hand', hoof: 'BN_R_Toe_047', chain: ['BN_R_Clavicle', 'BN_R_UpperArm', 'BN_R_Forearm', 'BN_R_Hand', 'BN_R_Toe_047'] },
  LF: { upper: 'BN_L_UpperArm', knee: 'BN_l_Forearm', fetlock: 'BN_L_Hand', hoof: 'BN_L_Toe_042', chain: ['BN_L_Clavicle', 'BN_L_UpperArm', 'BN_l_Forearm', 'BN_L_Hand', 'BN_L_Toe_042'] },
  RH: { upper: 'BN_R_Thing', stifle: 'BN_R_Calf', knee: 'BN_R_HorseLink', fetlock: 'BN_R_Foot', hoof: 'BN_R_Toe_2_059', chain: ['BN_R_Thing', 'BN_R_Calf', 'BN_R_HorseLink', 'BN_R_Foot', 'BN_R_Toe_2_059'] },
  LH: { upper: 'BN_L_Thing', stifle: 'BN_L_Calf', knee: 'BN_L_HorseLink', fetlock: 'BN_L_Foot', hoof: 'BN_L_Toe_2_055', chain: ['BN_L_Thing', 'BN_L_Calf', 'BN_L_HorseLink', 'BN_L_Foot', 'BN_L_Toe_2_055'] },
};
// A sore leg held off the ground (radians, positive anticlockwise seen from the camera): a foreleg
// folds at the knee and fetlock, a hind leg draws up at the hip and hock and rests on its toe.
export const HOLD = {
  fore: { upper: 0.25, knee: -1.5, fetlock: -0.6 },
  hind: { upper: 0.35, stifle: -0.5, knee: 1.3, fetlock: -0.8 },
};
// Rearing (rear()): the horse gathers itself, goes up onto its hind legs about its hips, paws the air
// with its forelegs folded and neighs, head tossing, then comes down and settles. The model has no such
// clip, so it is made from the standing one: the body tipped up, the bones bent each frame.
export const REAR = { seconds: 3.6, pitch: 1.06, drop: 0.13, lift: 0.32 };
const ease = (t, from, to) => THREE.MathUtils.smoothstep(t, from, to);
/** How far into each part of a rear the horse is, `t` seconds after it began (each 0 to 1). */
function rearPose(t) {
  return {
    // Its hind legs bend to push off, stay bent under it while it is up, and bounce as it lands.
    crouch: ease(t, 0, 0.55) * (1 - ease(t, 2.75, 3.35)) + 0.35 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 2.85) / 0.6))),
    rise: ease(t, 0.3, 1.2) * (1 - ease(t, 2.35, 3.15)),
    fold: ease(t, 0.35, 0.9) * (1 - ease(t, 2.45, 3.05)),
    paw: ease(t, 0.9, 1.3) * (1 - ease(t, 2.1, 2.5)),
    neigh: ease(t, 1.1, 1.35) * (1 - ease(t, 2.0, 2.35)),
  };
}
// Where a mark goes for an injury that is not in a leg (vet's body regions, horseMotion.js markAt).
export const MARK_BONES = { head: 'BN_Head_00', neck: 'BN_Neck_02', back: 'BN_Spine_02', shoulder: 'BN_R_Clavicle', croup: 'BN_Pelvis', chest: 'BN_Spine_00', belly: 'BN_Stomach' };
export const NECK = 'BN_Neck_00';
// A trot made from the walk: each leg's swing moved in the cycle so the diagonal pairs (left fore with
// right hind, right fore with left hind) step together, half a cycle apart. The walk's swing peaks are
// at LF 0, RH 0.175, RF 0.425, LH 0.75 of its cycle (measured).
const TROT_SHIFT = { LF: 0, RH: -0.24, RF: 0.075, LH: -0.325 };

// The racecourse's and the pasture's maples, and the pasture's farm house (credits: PASTURE_CREDIT,
// horseMotion.js). The maple: "Maple tree" by atrodler; the house: "Farm House" by BoredPain666, its
// 4096 px texture brought down to 1024. Both Sketchfab, CC BY 4.0.
const MAPLE_TREE = `${import.meta.env.BASE_URL}models/maple-tree.glb`;
const FARM_HOUSE = `${import.meta.env.BASE_URL}models/farm-house.glb`;
const TREE_HEIGHT = 5.8; // metres, against a 1.6 m horse
const HOUSE_WIDTH = 9;
const HOUSE_TURN = Math.PI - 0.5; // which side of the house faces the paddock
const scenery = new Map();
/** A model of the pasture, loaded once for every stage. */
function loadScenery(src) {
  if (!scenery.has(src)) {
    scenery.set(
      src,
      new GLTFLoader().loadAsync(src).catch((error) => {
        scenery.delete(src);
        throw error;
      }),
    );
  }
  return scenery.get(src);
}
/** A copy of a loaded model, scaled so that one side of it (x: width, y: height) measures `metres`. */
function sized(gltf, axis, metres) {
  const copy = gltf.scene.clone();
  copy.scale.setScalar(metres / new THREE.Box3().setFromObject(copy).getSize(new THREE.Vector3())[axis]);
  return copy;
}

let model = null;
export function loadModel() {
  if (!model) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    model = loader.loadAsync(MOVING_HORSE.src).catch((error) => {
      model = null;
      throw error;
    });
  }
  return model;
}

export function surfaceTexture(kind) {
  const s = SURFACES[kind] || SURFACES.dirt;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = s.base;
  g.fillRect(0, 0, size, size);
  // Grain: a few thousand specks, lighter and darker.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i += 1) {
    g.fillStyle = rnd() > 0.5 ? s.light : s.dark;
    g.globalAlpha = 0.25 + rnd() * 0.35;
    const r = s.fibre ? 0.6 : 1 + rnd() * 1.6;
    g.fillRect(rnd() * size, rnd() * size, s.fibre ? 4 + rnd() * 6 : r, r);
  }
  g.globalAlpha = 1;
  // Mown stripes across the track (turf), harrow lines along it (dirt), wind ripples (sand).
  if (s.stripes) {
    g.fillStyle = s.light;
    g.globalAlpha = 0.35;
    g.fillRect(0, 0, size / 2, size);
  }
  if (s.harrow) {
    g.strokeStyle = s.dark;
    g.globalAlpha = 0.35;
    for (let y = 8; y < size; y += 22) {
      g.beginPath();
      g.moveTo(0, y + rnd() * 3);
      g.lineTo(size, y + rnd() * 3);
      g.lineWidth = 2;
      g.stroke();
    }
  }
  if (s.ripples) {
    g.strokeStyle = s.dark;
    g.globalAlpha = 0.25;
    for (let x = 0; x < size; x += 18) {
      g.beginPath();
      for (let y = 0; y <= size; y += 16) g.lineTo(x + Math.sin(y / 30) * 5, y);
      g.lineWidth = 2;
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The wind of the pasture, in the vertex shader: gusts roll along the field, the same for every blade and
 * flower, a little out of step with their neighbours. `sway` is how much a vertex moves (0 at the root).
 * Costs nothing on the CPU: the stage only moves `time` each frame.
 */
function windy(material, time, sway) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `uniform float uTime;
${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
      float sway = ${sway};
      float gust = sin(uTime * 1.6 - mvPosition.x * 0.7 + mvPosition.z * 0.3) * 0.65 + sin(uTime * 3.1 + mvPosition.x * 2.3 + mvPosition.z * 1.7) * 0.2;
      mvPosition.x += (0.06 + gust * 0.09) * sway;
      mvPosition.z += sin(uTime * 2.2 + mvPosition.x * 1.3) * 0.025 * sway;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  return material;
}

/** The pasture's blades: thin tapered strips, each its own height, lean and green, waving in the wind. */
function grassParts(time) {
  const SEGMENTS = 4;
  const positions = [];
  const colors = [];
  const indices = [];
  const root = new THREE.Color('#24451a');
  const tip = new THREE.Color('#a4d364');
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const h = i / SEGMENTS; // 0 at the root, 1 at the tip
    const half = 0.5 * (1 - h) ** 0.8;
    const bend = 0.18 * h * h; // a natural droop forward
    positions.push(-half, h, bend, half, h, bend);
    const c = root.clone().lerp(tip, h);
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < SEGMENTS) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  blade.setIndex(indices);
  blade.computeVertexNormals();
  const material = windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), time, 'position.y * position.y');
  return { blade, material };
}

// The round paddock of a horse at rest: looked at from any side it is the same field, fenced all round.
const PADDOCK = { radius: 8.5, posts: 30, inner: 4.5, walk: 4.2 };
// Where the farm house stands, [x, z]: a little left of the first view, so even a narrow frame shows it.
const HOUSE_AT = [-9, -16];
// The first view of the paddock: the horse three-quarters on, from inside the fence.
const PADDOCK_VIEW = { target: [0.15, 0.95, 0], camera: [2.3, 1.48, 7.3] };

/** The paddock's grass: long round the horse, shorter towards the fence. */
function makePaddockGrass(time) {
  const { blade, material } = grassParts(time);
  const near = 6500;
  const far = 7500;
  const grass = new THREE.InstancedMesh(blade, material, near + far);
  grass.frustumCulled = false;
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  for (let i = 0; i < near + far; i += 1) {
    const inner = i < near;
    const r = inner ? PADDOCK.inner * Math.sqrt(rnd()) : Math.sqrt(PADDOCK.inner ** 2 + rnd() * ((PADDOCK.radius - 0.2) ** 2 - PADDOCK.inner ** 2));
    const a = rnd() * Math.PI * 2;
    const toFence = inner ? 0 : (r - PADDOCK.inner) / (PADDOCK.radius - PADDOCK.inner);
    const height = inner ? 0.14 + rnd() * 0.18 : (0.07 + rnd() * 0.13) * (1 - 0.4 * toFence);
    const width = 0.035 + rnd() * 0.03;
    rotation.setFromAxisAngle(up, rnd() * Math.PI * 2);
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), rotation, new THREE.Vector3(width, height, width));
    grass.setMatrixAt(i, m);
    grass.setColorAt(i, color.setScalar(0.8 + rnd() * 0.35));
  }
  grass.instanceMatrix.needsUpdate = true;
  return grass;
}

/** Wild flowers dotted through the grass (white daisies, buttercups, a little pink and lilac), nodding with it. */
function makeWildflowers(time) {
  const COUNT = 900;
  // A small flat head on top of a stem that is all wind: the head sits at y = 1, where the grass tips are.
  const head = new THREE.SphereGeometry(0.5, 8, 5);
  head.scale(1, 0.12, 1);
  head.translate(0, 1, 0);
  const flowers = new THREE.InstancedMesh(head, windy(new THREE.MeshLambertMaterial({ color: '#ffffff' }), time, '1.0'), COUNT);
  flowers.frustumCulled = false;
  const PALETTE = ['#ffffff', '#ffffff', '#fff7d6', '#fde047', '#facc15', '#f9a8d4', '#c4b5fd', '#fdba74'];
  let seed = 61;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let i = 0; i < COUNT; i += 1) {
    // In clumps: most flowers gather round a few spots, the rest scattered.
    const clump = i % 3 !== 0;
    const ca = (Math.floor(i / 60) * 2.4) % (Math.PI * 2);
    const cr = 2.5 + (Math.floor(i / 60) % 4) * 1.4;
    const a = clump ? ca + (rnd() - 0.5) * 0.9 : rnd() * Math.PI * 2;
    const r = clump ? cr + (rnd() - 0.5) * 1.6 : 1.2 + rnd() * (PADDOCK.radius - 1.6);
    const size = 0.035 + rnd() * 0.03;
    const height = 0.12 + rnd() * 0.16;
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q.identity(), new THREE.Vector3(size, height, size));
    flowers.setMatrixAt(i, m);
    flowers.setColorAt(i, color.set(PALETTE[Math.floor(rnd() * PALETTE.length)]));
  }
  flowers.instanceMatrix.needsUpdate = true;
  return flowers;
}

/**
 * A post-and-rail fence round the paddock: posts every couple of metres, two rails between them, and a
 * braced gate in the bay nearest `gateAngle` (radians round the paddock, towards the farm house).
 */
function makePaddockFence(material, gateAngle) {
  const { radius, posts: n } = PADDOCK;
  const fence = new THREE.Group();
  const bay = ((Math.round((gateAngle / (Math.PI * 2)) * n - 0.5) % n) + n) % n;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 1.15, 0.11), material, n);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.08, 0.05), material, n * 2);
  posts.castShadow = true;
  rails.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * radius, 0.575, Math.sin(a) * radius);
    const next = new THREE.Vector3(Math.cos(b) * radius, 0, Math.sin(b) * radius);
    posts.setMatrixAt(i, m.compose(p, q.identity(), new THREE.Vector3(1, 1, 1)));
    const length = Math.hypot(next.x - p.x, next.z - p.z);
    q.setFromAxisAngle(up, -Math.atan2(next.z - p.z, next.x - p.x));
    if (i === bay) {
      // The gate: three bars and a brace, in lighter wood, across the bay.
      const gate = new THREE.Group();
      const gateWood = new THREE.MeshStandardMaterial({ color: '#a07850', roughness: 0.8 });
      for (const y of [0.35, 0.68, 1.0]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(length - 0.16, 0.07, 0.05), gateWood);
        bar.position.y = y;
        gate.add(bar);
      }
      const brace = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(length - 0.2, 0.65), 0.06, 0.05), gateWood);
      brace.position.y = 0.68;
      brace.rotation.z = Math.atan2(0.65, length - 0.2);
      gate.add(brace);
      gate.position.set((p.x + next.x) / 2, 0, (p.z + next.z) / 2);
      gate.quaternion.copy(q);
      fence.add(gate);
    }
    for (const [k, y] of [[0, 0.55], [1, 1.02]]) {
      const scale = i === bay ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(length + 0.06, 1, 1);
      rails.setMatrixAt(i * 2 + k, m.compose(new THREE.Vector3((p.x + next.x) / 2, y, (p.z + next.z) / 2), q, scale));
    }
  }
  posts.instanceMatrix.needsUpdate = true;
  rails.instanceMatrix.needsUpdate = true;
  fence.add(posts, rails);
  return fence;
}

/**
 * What surrounds the paddock, so every side of it has something to look at: a low ridge of hills and
 * a treeline on the horizon, the dirt track from the gate to the farm house, round hay bales and a
 * grain silo by the house, a water trough inside the fence. `house` is [x, z] of the farm house.
 */
function makeFarmProps(house) {
  const farm = new THREE.Group();
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const houseAngle = Math.atan2(house[1], house[0]);

  // Hills: two overlapping ridges all round, the far one bluer in the haze, behind the trees.
  const dome = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const [count, from, spread, color, height] of [[18, 40, 8, '#5d8a63', 4.2], [16, 27, 7, '#4a7a3a', 2.4]]) {
    const hillMaterial = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.2;
      const r = from + rnd() * spread;
      const hill = new THREE.Mesh(dome, hillMaterial);
      hill.scale.set(9 + rnd() * 9, height + rnd() * height, 6 + rnd() * 4);
      hill.position.set(Math.cos(a) * r, -0.4, Math.sin(a) * r);
      hill.rotation.y = -a;
      farm.add(hill);
    }
  }

  // A treeline: conifers in loose clumps, two greens, leaving the view to the house open.
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), 96);
  const treeColor = new THREE.Color();
  const greens = [new THREE.Color('#2c5427'), new THREE.Color('#3b6b2f'), new THREE.Color('#24461f')];
  let n = 0;
  while (n < 96) {
    const a = rnd() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - houseAngle), Math.cos(a - houseAngle))) < 0.35) continue;
    const r = 17 + rnd() * 7;
    const h = 2.6 + rnd() * 2.6;
    m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 0.1, Math.sin(a) * r), q.identity(), new THREE.Vector3(0.8 + rnd() * 0.5, h, 0.8 + rnd() * 0.5));
    trees.setMatrixAt(n, m);
    trees.setColorAt(n, treeColor.copy(greens[n % 3]).multiplyScalar(0.85 + rnd() * 0.3));
    n += 1;
  }
  trees.instanceMatrix.needsUpdate = true;
  farm.add(trees);

  // The dirt track from the gate to the house.
  const toHouse = new THREE.Vector3(Math.cos(houseAngle), 0, Math.sin(houseAngle));
  const gate = toHouse.clone().multiplyScalar(PADDOCK.radius);
  const door = new THREE.Vector3(house[0] * 0.78, 0, house[1] * 0.78);
  const pathTexture = surfaceTexture('dirt');
  pathTexture.repeat.set(4, 0.5);
  const length = gate.distanceTo(door);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(length, 1.7), new THREE.MeshStandardMaterial({ map: pathTexture, roughness: 1 }));
  path.rotation.x = -Math.PI / 2;
  path.rotation.z = -Math.atan2(door.z - gate.z, door.x - gate.x);
  path.position.set((gate.x + door.x) / 2, 0.004, (gate.z + door.z) / 2);
  path.receiveShadow = true;
  farm.add(path);

  // Round hay bales beside the house, two on the ground and one on top, clear of the horse in the first view.
  const straw = new THREE.MeshStandardMaterial({ color: '#d1ab5f', roughness: 0.95 });
  const bale = new THREE.CylinderGeometry(0.62, 0.62, 1.1, 20);
  const along = new THREE.Vector3(-toHouse.z, 0, toHouse.x); // along the house's front
  const baleBase = door.clone().addScaledVector(along, -5);
  for (const [dx, y] of [[0, 0.62], [1.35, 0.62], [0.68, 1.75]]) {
    const b = new THREE.Mesh(bale, straw);
    b.position.copy(baleBase).addScaledVector(along, dx);
    b.position.y = y;
    b.rotation.order = 'YZX';
    b.rotation.y = -houseAngle;
    b.rotation.z = Math.PI / 2;
    farm.add(b);
  }

  // A grain silo on the house's other side: a tall drum with a grey cap.
  const silo = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6.5, 24), new THREE.MeshStandardMaterial({ color: '#c4bcae', roughness: 0.6, metalness: 0.2 }));
  drum.position.y = 3.25;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.55, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8b8f93', roughness: 0.5, metalness: 0.3 }));
  cap.position.y = 6.5;
  silo.add(drum, cap);
  silo.position.copy(door).addScaledVector(along, -10.5).addScaledVector(toHouse, 2.5);
  farm.add(silo);

  // A water trough inside the fence, round from the gate.
  const trough = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.62), new THREE.MeshStandardMaterial({ color: '#7d8a8f', roughness: 0.4, metalness: 0.4 }));
  tub.position.y = 0.25;
  tub.castShadow = true;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.48), new THREE.MeshStandardMaterial({ color: '#4c7e9b', roughness: 0.15, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.46;
  trough.add(tub, water);
  const troughAngle = houseAngle + Math.PI * 0.62;
  trough.position.set(Math.cos(troughAngle) * (PADDOCK.radius - 1.1), 0, Math.sin(troughAngle) * (PADDOCK.radius - 1.1));
  trough.rotation.y = -troughAngle + Math.PI / 2;
  farm.add(trough);
  return { farm, pathTexture };
}

/**
 * The pasture's small life, moved by the stage each frame: butterflies fluttering over the grass and a
 * few birds wheeling high up by day, fireflies blinking round the paddock at night.
 */
function makePastureLife() {
  const life = new THREE.Group();
  let seed = 83;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // A pair of wings on a hinge along the body (the body's forward is +x): `span` from tip to tip.
  const wings = (span, chord, material) => {
    const left = new THREE.PlaneGeometry(chord, span / 2);
    left.rotateX(-Math.PI / 2);
    left.translate(0, 0, span / 4);
    const right = left.clone();
    right.translate(0, 0, -span / 2);
    const body = new THREE.Group();
    const l = new THREE.Mesh(left, material);
    const r = new THREE.Mesh(right, material);
    body.add(l, r);
    return { body, l, r };
  };

  const butterflies = ['#fde047', '#ffffff', '#fb923c', '#fef08a', '#c7d2fe', '#ffffff'].map((color) => {
    const material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 });
    const b = wings(0.2, 0.13, material);
    life.add(b.body);
    return { ...b, cx: (rnd() - 0.5) * 7, cz: (rnd() - 0.5) * 7, rx: 1.2 + rnd() * 1.8, rz: 1 + rnd() * 1.6, h: 0.45 + rnd() * 0.7, speed: 0.35 + rnd() * 0.3, phase: rnd() * 10 };
  });

  const birdMaterial = new THREE.MeshBasicMaterial({ color: '#2b3038', side: THREE.DoubleSide });
  const birds = Array.from({ length: 7 }, (_, i) => {
    const b = wings(1.15, 0.32, birdMaterial);
    life.add(b.body);
    return { ...b, lag: i * 0.07 + rnd() * 0.04, dr: (rnd() - 0.5) * 4, dy: (rnd() - 0.5) * 1.6, phase: rnd() * 10 };
  });

  // Fireflies: soft glowing points, each blinking on its own beat.
  const FIREFLIES = 54;
  const glow = document.createElement('canvas');
  glow.width = 64;
  glow.height = 64;
  const gg = glow.getContext('2d');
  const halo = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  gg.fillStyle = halo;
  gg.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glow);
  const fly = new THREE.BufferGeometry();
  fly.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(FIREFLIES * 3), 3));
  fly.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(FIREFLIES * 3), 3));
  const fireflies = new THREE.Points(
    fly,
    new THREE.PointsMaterial({ size: 0.24, map: glowTexture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  fireflies.frustumCulled = false;
  life.add(fireflies);
  const flies = Array.from({ length: FIREFLIES }, () => ({ a: rnd() * Math.PI * 2, r: 1.4 + rnd() * 6.6, h: 0.25 + rnd() * 1.2, speed: 0.05 + rnd() * 0.12, beat: 0.6 + rnd() * 1.4, phase: rnd() * 10 }));
  const glowColor = new THREE.Color('#e4ff9a');

  // The night sky: stars on a dome far off, twinkling, and the moon rising over the farm in the first view.
  const STARS = 420;
  const starAt = new Float32Array(STARS * 3);
  const starLight = Array.from({ length: STARS }, (_, i) => {
    const a = rnd() * Math.PI * 2;
    const up = Math.asin(0.07 + rnd() * 0.9); // from just over the hills to high up
    starAt.set([Math.cos(a) * Math.cos(up) * 120, Math.sin(up) * 120, Math.sin(a) * Math.cos(up) * 120], i * 3);
    return { base: 0.35 + rnd() ** 2 * 0.65, beat: 0.8 + rnd() * 2.5, phase: rnd() * 10 };
  });
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starAt, 3));
  starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(STARS * 3), 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, map: glowTexture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  stars.frustumCulled = false;
  life.add(stars);
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = 128;
  moonCanvas.height = 128;
  const mg = moonCanvas.getContext('2d');
  const moonGlow = mg.createRadialGradient(64, 64, 10, 64, 64, 64);
  moonGlow.addColorStop(0, 'rgba(255,248,225,0.55)');
  moonGlow.addColorStop(0.35, 'rgba(220,230,255,0.16)');
  moonGlow.addColorStop(1, 'rgba(220,230,255,0)');
  mg.fillStyle = moonGlow;
  mg.fillRect(0, 0, 128, 128);
  mg.fillStyle = '#fbf6e6';
  mg.beginPath();
  mg.arc(64, 64, 17, 0, Math.PI * 2);
  mg.fill();
  // A few grey seas on its face.
  mg.fillStyle = 'rgba(190,186,170,0.55)';
  for (const [x, y, r] of [[58, 58, 5], [70, 66, 4], [62, 72, 3]]) {
    mg.beginPath();
    mg.arc(x, y, r, 0, Math.PI * 2);
    mg.fill();
  }
  const moonTexture = new THREE.CanvasTexture(moonCanvas);
  moonTexture.colorSpace = THREE.SRGBColorSpace;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture, transparent: true, depthWrite: false, fog: false }));
  moon.position.set(-14, 12, -70);
  moon.scale.setScalar(13);
  life.add(moon);
  const night = { on: false };

  return {
    life,
    setNight(next) {
      night.on = next;
      for (const b of [...butterflies, ...birds]) b.body.visible = !next;
      fireflies.visible = next;
      stars.visible = next;
      moon.visible = next;
    },
    update(t) {
      if (!night.on) {
        for (const b of butterflies) {
          const s = t * b.speed + b.phase;
          const x = b.cx + b.rx * Math.sin(s);
          const z = b.cz + b.rz * Math.sin(s * 1.37 + 1.1);
          b.body.position.set(x, b.h + 0.22 * Math.sin(s * 3.1) + 0.06 * Math.sin(t * 9 + b.phase), z);
          // Facing the way it flies; the wings beat fast, now and then held up for a short glide.
          b.body.rotation.y = -Math.atan2(b.rz * 1.37 * Math.cos(s * 1.37 + 1.1), b.rx * Math.cos(s));
          const flap = 0.25 + 1.05 * Math.abs(Math.sin(t * 17 + b.phase));
          b.l.rotation.x = -flap;
          b.r.rotation.x = flap;
        }
        // The flock wheels slowly round the farm, high over the hills, each bird a little behind the last.
        for (const b of birds) {
          const a = t * 0.045 - b.lag + 0.6;
          const r = 34 + b.dr;
          b.body.position.set(Math.cos(a) * r, 6.8 + b.dy + Math.sin(t * 0.4 + b.phase) * 0.6, Math.sin(a) * r);
          b.body.rotation.y = -a - Math.PI / 2;
          // Beat, beat, glide.
          const beat = Math.sin(t * 6.5 + b.phase);
          const flap = (t * 0.6 + b.phase) % 3 < 1.2 ? 0.15 : 0.12 + 0.55 * beat;
          b.l.rotation.x = -flap;
          b.r.rotation.x = flap;
        }
      } else {
        const pos = fly.attributes.position;
        const col = fly.attributes.color;
        flies.forEach((f, i) => {
          const a = f.a + t * f.speed;
          pos.setXYZ(i, Math.cos(a) * f.r + 0.4 * Math.sin(t * 0.7 + f.phase), f.h + 0.25 * Math.sin(t * 0.9 + f.phase), Math.sin(a) * f.r + 0.4 * Math.cos(t * 0.6 + f.phase));
          const k = 0.12 + 0.88 * Math.max(0, Math.sin(t * f.beat + f.phase)) ** 2;
          col.setXYZ(i, glowColor.r * k, glowColor.g * k, glowColor.b * k);
        });
        pos.needsUpdate = true;
        col.needsUpdate = true;
        const shine = starGeometry.attributes.color;
        starLight.forEach((s, i) => {
          const k = s.base * (0.75 + 0.25 * Math.sin(t * s.beat + s.phase));
          shine.setXYZ(i, k, k, k * 1.05);
        });
        shine.needsUpdate = true;
      }
    },
    dispose() {
      glowTexture.dispose();
      moonTexture.dispose();
    },
  };
}

// The pasture's sky through the day in Vietnam, blended minute by minute between these moments: night,
// dawn, morning, noon, afternoon, the golden hour, dusk, night again. sky = top of the sky, horizon =
// the haze at the horizon (and the fog), sun = the key light (the moon at night), fill = the sky's light.
// A moonlit night, light enough that a dark coat still shows against the grass.
const NIGHT = { sky: '#1a2c4e', horizon: '#4a5e86', sun: ['#c8d6ff', 2.1], fill: ['#b4c6ea', 1.65], clouds: '#6f7d98' };
const PASTURE_SKIES = [
  { at: 0, ...NIGHT },
  { at: 5, ...NIGHT },
  { at: 6, sky: '#7aaede', horizon: '#dbeaf6', sun: ['#ffe4b8', 2.2], fill: ['#eef5ff', 1.25], clouds: '#fff6ea' },
  { at: 8, sky: '#65a3df', horizon: '#cfe6f7', sun: ['#fff5e0', 2.6], fill: ['#e8f2ff', 1.35], clouds: '#ffffff' },
  { at: 12, sky: '#5c9cdc', horizon: '#cbe4f6', sun: ['#ffffff', 2.8], fill: ['#eef5ff', 1.4], clouds: '#ffffff' },
  { at: 15.5, sky: '#63a0dd', horizon: '#cfe5f6', sun: ['#fff3dc', 2.65], fill: ['#ebf3fc', 1.35], clouds: '#ffffff' },
  { at: 17.3, sky: '#6c9cd4', horizon: '#dfeaf4', sun: ['#ffd9a0', 2.45], fill: ['#f2ece4', 1.25], clouds: '#fff2de' },
  { at: 18.5, sky: '#435b92', horizon: '#dfa87c', sun: ['#ffad75', 1.85], fill: ['#d2c4d0', 1.15], clouds: '#d9ad9c' },
  { at: 19.4, ...NIGHT },
  { at: 24, ...NIGHT },
];
const mix = (a, b, t) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
/** The pasture sky at an hour of the day (0–24, Vietnam time), blended between the two moments around it. */
export function pastureSkyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  const i = Math.max(0, PASTURE_SKIES.findIndex((k) => k.at > h) - 1);
  const a = PASTURE_SKIES[i];
  const b = PASTURE_SKIES[i + 1] || a;
  const t = b.at > a.at ? (h - a.at) / (b.at - a.at) : 0;
  return {
    key: Math.round(h * 60), // to the minute: the sky is repainted only when it changes
    hour: h,
    sky: mix(a.sky, b.sky, t),
    horizon: mix(a.horizon, b.horizon, t),
    sun: [mix(a.sun[0], b.sun[0], t), a.sun[1] + (b.sun[1] - a.sun[1]) * t],
    fill: [mix(a.fill[0], b.fill[0], t), a.fill[1] + (b.fill[1] - a.fill[1]) * t],
    clouds: mix(a.clouds, b.clouds, t),
  };
}
/** The hour of the day in Vietnam (UTC+7, no summer time), whatever the viewer's clock is set to. */
export const vietnamHour = (now = Date.now()) => {
  const d = new Date(now + 7 * 3600 * 1000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

/** A sky painted top to horizon, as the scene's background. */
export function skyTexture(top, horizon) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.75, horizon);
  gradient.addColorStop(1, horizon);
  g.fillStyle = gradient;
  g.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One soft cloud, a few overlapping puffs, painted once and shared by every cloud. */
export function cloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  for (const [x, y, r] of [[70, 80, 38], [115, 62, 48], [165, 74, 40], [200, 86, 28], [45, 90, 24]]) {
    const puff = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    puff.addColorStop(0, 'rgba(255,255,255,0.95)');
    puff.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = puff;
    g.fillRect(0, 0, 256, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

/** A gable: a triangle `width` wide and `height` high, extruded `length` along x, centred, its base at y 0. */
function gable(width, height, length, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, height);
  shape.lineTo(width / 2, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

/**
 * A barn drawn in code, for when the farm house cannot be loaded: red board walls on a stone
 * footing, white trim at the corners and eaves, a charcoal gable roof with an overhang, a row of stall
 * doors with white cross braces, and a small cupola on the ridge. Its long side faces the camera (+z).
 * Plain boxes and prisms, so it costs next to nothing.
 */
export function makeBarn() {
  const barn = new THREE.Group();
  const L = 10; // along the barn
  const D = 4; // front to back
  const H = 2.4; // walls
  const RISE = 1.5; // roof, eaves to ridge
  const mat = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });
  const red = mat('#a2372b');
  const trim = mat('#f3efe6', 0.6);
  const add = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    barn.add(mesh);
    return mesh;
  };

  add(new THREE.Mesh(new THREE.BoxGeometry(L + 0.2, 0.4, D + 0.2), mat('#8d877c', 1)), 0, 0.2, 0); // stone footing
  add(new THREE.Mesh(new THREE.BoxGeometry(L, H, D), red), 0, 0.4 + H / 2, 0);
  // The gable ends in the walls' red, under a roof that overhangs them.
  add(gable(D, RISE - 0.05, L, red), 0, 0.4 + H, 0);
  add(gable(D + 0.8, RISE + 0.2, L + 0.7, mat('#3b3f45', 0.7)), 0, 0.4 + H - 0.12, 0);
  // White trim: the corners and a band under the eaves.
  for (const x of [-L / 2, L / 2]) for (const z of [-D / 2, D / 2]) add(new THREE.Mesh(new THREE.BoxGeometry(0.16, H, 0.16), trim), x, 0.4 + H / 2, z);
  add(new THREE.Mesh(new THREE.BoxGeometry(L + 0.1, 0.14, 0.08), trim), 0, 0.4 + H - 0.07, D / 2 + 0.03);

  // Stall doors along the front, each framed in white with an X brace.
  const DOORS = 6;
  const doorW = 1.0;
  const doorH = 1.7;
  const gap = L / DOORS;
  const doors = new THREE.InstancedMesh(new THREE.BoxGeometry(doorW, doorH, 0.05), mat('#5a3a26', 0.9), DOORS);
  const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(doorW + 0.14, doorH + 0.14, 0.03), trim, DOORS);
  const braces = new THREE.InstancedMesh(new THREE.BoxGeometry(Math.hypot(doorW, doorH) - 0.1, 0.07, 0.03), trim, DOORS * 2);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const angle = Math.atan2(doorH, doorW);
  for (let i = 0; i < DOORS; i += 1) {
    const x = -L / 2 + gap * (i + 0.5);
    const at = new THREE.Vector3(x, 0.4 + doorH / 2, D / 2 + 0.02);
    frames.setMatrixAt(i, m.makeTranslation(at.x, at.y, at.z - 0.01));
    doors.setMatrixAt(i, m.makeTranslation(at.x, at.y, at.z + 0.01));
    for (const [k, a] of [[0, angle], [1, -angle]]) {
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
      braces.setMatrixAt(i * 2 + k, m.compose(new THREE.Vector3(at.x, at.y, at.z + 0.045), q, one));
    }
  }
  barn.add(frames, doors, braces);

  // A small cupola on the ridge: a white box under its own little pyramid roof.
  const ridge = 0.4 + H + RISE;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), trim), 0, ridge + 0.1, 0);
  const cap = add(new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 4), mat('#3b3f45', 0.7)), 0, ridge + 0.75, 0);
  cap.rotation.y = Math.PI / 4;
  return barn;
}

/**
 * A round-crowned shade tree: a trunk and a crown of a few lumpy green balls (flat-shaded, so it
 * reads as a tree from afar), drawn when the maple cannot be loaded. `crown` is returned too.
 */
export function makeTree() {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 1 }));
  trunk.position.y = 1.2;
  tree.add(trunk);
  const crown = new THREE.Group();
  crown.position.y = 2.2; // swings from the top of the trunk
  for (const [x, y, z, r, color] of [
    [0, 1.3, 0, 1.45, '#3f7d34'],
    [0.95, 0.9, 0.35, 1.05, '#4a8f3c'],
    [-0.95, 0.95, -0.2, 1.1, '#356b2c'],
    [0.25, 2.0, -0.15, 1.0, '#4f9640'],
    [-0.3, 0.8, 0.8, 0.9, '#3a7530'],
  ]) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
    ball.position.set(x, y, z);
    crown.add(ball);
  }
  tree.add(crown);
  return { tree, crown };
}

/** The trot (TROT_SHIFT): the walk resampled, each leg's tracks moved along the cycle; the rest kept. */
export function makeTrot(walk) {
  const d = walk.duration;
  const shiftOf = (trackName) => {
    const node = trackName.split('.')[0];
    const leg = Object.keys(LEGS).find((key) => LEGS[key].chain.some((prefix) => node.startsWith(prefix)));
    return leg ? TROT_SHIFT[leg] : 0;
  };
  const SAMPLES = 25;
  const tracks = walk.tracks.map((track) => {
    const shift = shiftOf(track.name);
    if (!shift) return track.clone();
    const interpolant = track.createInterpolant();
    const times = [];
    const values = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const t = (i / (SAMPLES - 1)) * d;
      times.push(t);
      values.push(...interpolant.evaluate((((t - shift * d) % d) + d) % d));
    }
    return new track.constructor(track.name, times, values);
  });
  return new THREE.AnimationClip('Trot', d, tracks);
}

/** A board of black and white squares, for the finish post of a trial. */
export function checkerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f4f2ec';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The bounds of a skinned model as posed (Box3 alone ignores the bones), from a sample of its vertices. */
export function skinnedBox(root) {
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

/** The bone whose name starts with `prefix` (the exporter adds numbers after the names). */
export const boneNamed = (root, prefix) => {
  let found = null;
  root.traverse((o) => {
    if (!found && o.isBone && o.name.startsWith(prefix)) found = o;
  });
  return found;
};

/**
 * Builds the stage on a canvas. Returns { ready (a promise), setCoat, setMotion, setSurface, resize,
 * dispose }. `view`: 'side' (side on, drag to look around) or 'turntable' (turns by itself).
 * `recordable`: each frame stays readable after it is shown, so it can be copied into a video (SessionVideo).
 */
export function createHorseStage(canvas, { view = 'side', recordable = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: recordable });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const skyEnv = createSkyEnvironment(renderer);
  scene.environment = skyEnv.texture;
  const sky = new THREE.Color('#b6d6ec');
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 50, 155);
  const fill = new THREE.HemisphereLight('#dcedff', '#6a5a42', 0.78);
  scene.add(fill);
  // Subtle front-right bounce fill so the camera-facing side of dark-bay/black coats shows sculpted muscle highlights.
  const frontFill = new THREE.DirectionalLight('#fff8eb', 0.82);
  frontFill.position.set(6.5, 5.5, 9.0);
  scene.add(frontFill);
  const sun = new THREE.DirectionalLight('#fff2d6', 2.85);
  sun.position.set(-9.5, 11.2, -3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 42;
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(view === 'turntable' ? 30 : 32, 16 / 10, 0.1, 165);
  const trackTarget = new THREE.Vector3(-0.65, 0.88, -0.35);
  const trackCamPos = new THREE.Vector3(3.85, 1.85, 5.85);
  const target = view === 'turntable' ? new THREE.Vector3(0.1, 0.95, 0) : trackTarget.clone();
  camera.position.set(view === 'turntable' ? 4.2 : trackCamPos.x, view === 'turntable' ? 1.35 : trackCamPos.y, view === 'turntable' ? 5 : trackCamPos.z);
  camera.lookAt(target);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.72;
  controls.maxPolarAngle = 1.5;
  controls.autoRotate = view === 'turntable';
  controls.autoRotateSpeed = 1.2;

  // The world tilts on a slope (uphill work); the closed-oval broadcast track & rails scroll inside it.
  const world = new THREE.Group();
  scene.add(world);
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 8;
  let surfaceKind = null;
  const curvedTrack = createCurvedTrackRig({
    width: 8.6,
    straightLen: 54,
    straightJoin: -1.8,
    bendRadius: 21,
    tileM: TILE_M,
    postEvery: POST_EVERY,
    laneCount: 1,
    maxAnisotropy: maxAniso,
  });
  world.add(curvedTrack.group);

  // Subtle ambient contact shadow right under hooves (complements the real directional shadowMap).
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sg = shadowCanvas.getContext('2d');
  const gradient = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = gradient;
  sg.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.85), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.012;
  // The horse and its shadow stand together: in the paddock a walking horse takes them round it.
  const stand = new THREE.Group();
  world.add(stand);
  stand.add(blob);
  // Two-layer volumetric billowing dust plumes + ballistic clods behind hooves.
  const hoofParticles = createHoofParticles(100, 32);
  world.add(hoofParticles.points);
  const checker = checkerTexture();
  const finish = new THREE.Group();
  const finishPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.6 }));
  finishPole.position.set(0, 1.3, -4.1);
  finishPole.castShadow = true;
  const finishBoard = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: checker }));
  finishBoard.position.set(0, 2.5, -4.04);
  const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 8.4), new THREE.MeshBasicMaterial({ color: '#f4f2ec' }));
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.y = 0.016;
  finish.add(finishPole, finishBoard, finishLine);
  finish.visible = false;
  world.add(finish);
  let finishAt = null;
  // Uphill work: rolling hills far off, level, so the tilted track reads as a hillside.
  const hills = new THREE.Group();
  const hillMat = new THREE.MeshStandardMaterial({ color: '#4f7f3f', roughness: 1 });
  for (const [x, z, r, h] of [[-28, -34, 16, 6], [-6, -40, 20, 8], [17, -35, 15, 7], [36, -42, 18, 9]]) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.set(r, h, r * 0.6);
    hill.position.set(x, -0.5, z);
    hills.add(hill);
  }
  hills.visible = false;
  scene.add(hills);
  let disposed = false;
  let clouds = null;
  let pastureSky = null;
  let skyCheckedAt = -Infinity;
  // The hour the sky shows: a session's own (setHour), else the clock in Vietnam (the pasture).
  let fixedHour = null;
  const showSky = (now) => {
    const s = pastureSkyAt(fixedHour ?? vietnamHour());
    skyCheckedAt = now;
    if (s.key === pastureSky?.key) return;
    pastureSky = s;
    const day = (s.hour - 6) / 12;
    const daytime = day > 0 && day < 1;
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = skyTexture(s.sky, s.horizon);
    scene.fog.color.set(s.horizon);
    sun.color.set(s.sun[0]);
    fill.color.set(s.fill[0]);
    for (const c of clouds?.children || []) c.material.color.set(s.clouds);
    if (inPasture) {
      // The pasture: the sun crosses the sky from the east at six to the west at six, lighting the horse
      // from the front; at night the moon stands high, and the fireflies come out.
      if (daytime) sun.position.set(-9 * Math.cos(day * Math.PI), 2 + 9 * Math.sin(day * Math.PI), 6);
      else sun.position.set(3, 9, 6);
      // By night the moonlight is dimmer and bluer, and the sky's reflections (the environment) fade.
      const dark = nightAt(s.hour);
      sun.intensity = s.sun[1] * (dark ? 0.62 : 1);
      fill.intensity = s.fill[1] * (dark ? 0.5 : 1);
      frontFill.intensity = dark ? 0.22 : 0.45;
      scene.environmentIntensity = dark ? 0.3 : 1;
      pastureLife?.setNight(dark);
      return;
    }
    // Keep the key sun at a crisp raking broadcast angle so both horse and white rail posts cast visible
    // shadows across the textured track while gently reflecting the session's time-of-day warmth.
    if (daytime) sun.position.set(-10.5 + 3.5 * day, 8.8 + 3.4 * Math.sin(day * Math.PI), -3.2);
    else sun.position.set(-7.5, 10.5, -2.8);
    sun.intensity = Math.max(2.15, s.sun[1] * 1.25);
    fill.intensity = Math.max(0.65, s.fill[1] * 0.62);
    frontFill.intensity = daytime ? 0.82 : 0.58;
    scene.environmentIntensity = 1;
  };
  // The track's sky when no hour is given: plain and bright.
  const plainSky = () => {
    if (!pastureSky) return;
    pastureSky = null;
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = sky;
    scene.fog.color.copy(sky);
    sun.color.set('#fff2d6');
    sun.intensity = 2.7;
    sun.position.set(-9.5, 11.2, -3.2);
    fill.color.set('#dcedff');
    fill.intensity = 0.95;
    frontFill.intensity = 0.85;
    scene.environmentIntensity = 1;
  };
  const ensureClouds = () => {
    if (clouds) return;
    clouds = new THREE.Group();
    const puff = cloudTexture();
    // Subtle high cirrus clouds well above the woodland horizon (the pasture lowers them and fills them out).
    for (let i = 0; i < 14; i += 1) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0.42, depthWrite: false, fog: false }));
      const a = (i / 14) * Math.PI * 2 + 0.35;
      const r = 42 + (i % 3) * 5;
      cloud.position.set(Math.cos(a) * r, 11.5 + (i % 3) * 1.6, Math.sin(a) * r);
      cloud.scale.set(11 + (i % 3) * 2.5, 3.6 + (i % 2) * 0.8, 1);
      cloud.userData.home = { at: cloud.position.clone(), size: cloud.scale.clone() };
      clouds.add(cloud);
    }
    scene.add(clouds);
    if (pastureSky) for (const c of clouds.children) c.material.color.set(pastureSky.clouds);
  };
  let racecourseTrees = null;
  // Positioned strictly inside the green infield of the oval (x >= 1.5, z <= -8.5) so trees never cross the left turn track.
  const TREE_ANCHORS = [
    [2.2, -9.2, 1.05],
    [9.5, -11.5, 1.15],
    [17.5, -10.4, 0.98],
    [25.5, -12.0, 1.12],
    [5.8, -16.5, 1.08],
  ];
  const ensureRacecourseTrees = () => {
    if (racecourseTrees) return;
    racecourseTrees = new THREE.Group();
    loadScenery(MAPLE_TREE)
      .then((gltf) => {
        if (disposed) return;
        for (const [x, z, s] of TREE_ANCHORS) {
          const maple = sized(gltf, 'y', TREE_HEIGHT * s);
          maple.position.set(x, 0, z);
          maple.userData.anchorX = x;
          maple.rotation.y = (x * 0.43 + z * 0.29) % (Math.PI * 2);
          maple.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          racecourseTrees.add(maple);
        }
      })
      .catch(() => {});
    world.add(racecourseTrees);
  };
  ensureRacecourseTrees();

  // A horse at rest in the pasture stands in a round paddock that holds from every side (the view can be
  // dragged all round it): waving grass and wild flowers round the horse, a wooden fence, the farm house,
  // maples and conifers outside, hills on the horizon; butterflies and a wheeling flock of birds by day,
  // fireflies at night, all under the sky of the hour in Vietnam. A horse on the move keeps the track.
  let paddock = null;
  let paddockTexture = null;
  let pathTexture = null;
  let pastureLife = null;
  let paddockCameraSet = false;
  const paddockMaples = [];
  const grassTime = { value: 0 };
  const nightAt = (hour) => hour < 5.6 || hour >= 18.6;
  // Where a walking horse is on its round of the paddock: it starts on the far side, walking to the right.
  let lap = -Math.PI / 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const placePaddockCamera = () => {
    if (view === 'turntable') return;
    controls.target.set(...PADDOCK_VIEW.target);
    camera.position.set(...PADDOCK_VIEW.camera);
    rearLift = 0;
  };
  const ensurePaddock = () => {
    if (paddock) return;
    paddock = new THREE.Group();
    paddockTexture = surfaceTexture('pasture');
    paddockTexture.repeat.set(36, 36);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshStandardMaterial({ map: paddockTexture, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    // Turned to face the paddock from (x, z): the model's front is +z.
    const facing = (x, z) => Math.atan2(-x, -z);
    const props = makeFarmProps(HOUSE_AT);
    pathTexture = props.pathTexture;
    pastureLife = makePastureLife();
    pastureLife.setNight(nightAt(pastureSky?.hour ?? vietnamHour()));
    const fenceWood = new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 0.85 });
    paddock.add(ground, makePaddockGrass(grassTime), makeWildflowers(grassTime), makePaddockFence(fenceWood, Math.atan2(HOUSE_AT[1], HOUSE_AT[0])), props.farm, pastureLife.life);
    const house = new THREE.Group();
    house.position.set(HOUSE_AT[0], 0, HOUSE_AT[1]);
    paddock.add(house);
    loadScenery(FARM_HOUSE)
      .then((gltf) => {
        if (disposed) return;
        const farmHouse = sized(gltf, 'x', HOUSE_WIDTH);
        farmHouse.rotation.y = HOUSE_TURN + facing(...HOUSE_AT);
        house.add(farmHouse);
      })
      .catch(() => {
        if (disposed) return;
        const drawn = makeBarn();
        drawn.scale.setScalar(0.75);
        drawn.rotation.y = facing(...HOUSE_AT);
        house.add(drawn);
      });
    // Maples round the paddock: one in the first view, behind the fence on the right; the rest all round.
    const TREES = [[3.2, -14.5, 1.05], [14, -8, 0.95], [-17, 4, 0.9], [9, 15, 1.1], [-7, 16, 0.95]];
    const plant = (make) => {
      for (const [x, z, s] of TREES) {
        const maple = make(s);
        maple.position.set(x, 0, z);
        maple.rotation.y = x * 0.37;
        paddockMaples.push(maple);
        paddock.add(maple);
      }
    };
    loadScenery(MAPLE_TREE)
      .then((gltf) => !disposed && plant((s) => sized(gltf, 'y', TREE_HEIGHT * s)))
      .catch(() => !disposed && plant(() => makeTree().tree));
    paddock.visible = false;
    world.add(paddock);
  };

  const setPasture = (on) => {
    inPasture = on;
    dress();
    // The pasture's haze is further off, its clouds lower and fuller, sitting over the hills.
    scene.fog.near = on ? 26 : 50;
    scene.fog.far = on ? 95 : 155;
    if (on || fixedHour != null) ensureClouds();
    if (clouds) {
      clouds.visible = on || fixedHour != null;
      for (const c of clouds.children) {
        const { at, size } = c.userData.home;
        c.position.set(at.x * (on ? 1.4 : 1), at.y - (on ? 3.4 : 0), at.z * (on ? 1.4 : 1));
        c.scale.set(size.x * (on ? 1.45 : 1), size.y * (on ? 1.45 : 1), 1);
        c.material.opacity = on ? 0.92 : 0.42;
      }
    }
    if (on || fixedHour != null) {
      pastureSky = null;
      showSky(performance.now());
    } else plainSky();
    applyScene();
  };

  // Which scene the horse is in, after any change to the surface or the motion.
  const applyScene = () => {
    // Standing or grazing, the horse is in the middle of the paddock; walking, it goes round (the frame loop).
    const walking = inPasture && (motion?.kmh || 0) > 0.5;
    if (!walking && stand.position.lengthSq() > 0) {
      stand.position.set(0, 0, 0);
      stand.rotation.y = 0;
      lap = -Math.PI / 2;
      if (inPasture) placePaddockCamera();
    }
    if (inPasture) {
      ensurePaddock();
      if (!paddockCameraSet) {
        placePaddockCamera();
        paddockCameraSet = true;
      }
    } else if (view === 'side') {
      paddockCameraSet = false;
      controls.target.copy(trackTarget);
      camera.position.copy(trackCamPos);
      rearLift = 0;
    }
    if (paddock) paddock.visible = inPasture;
    if (racecourseTrees) racecourseTrees.visible = !inPasture;
    curvedTrack.group.visible = !inPasture;
    hoofParticles.points.visible = !inPasture;
    // All round the horse in the paddock; on the track only from its side, where the strip has no edge in view.
    const strip = view === 'side' && !inPasture;
    controls.minAzimuthAngle = strip ? -0.35 : -Infinity;
    controls.maxAzimuthAngle = strip ? 1.15 : Infinity;
  };

  // The sore leg: a pulsing red/orange ring at its hoof + soft ground halo underneath.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.165, 32), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.92, depthTest: false }));
  marker.visible = false;
  marker.renderOrder = 10;
  scene.add(marker);
  const groundHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.24, 0.36, 32),
    new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  groundHalo.rotation.x = -Math.PI / 2;
  groundHalo.position.y = 0.02;
  groundHalo.visible = false;
  world.add(groundHalo);

  let horse = null;
  // Turned out in the pasture a horse wears no saddle or bridle (one material in the model); on the track it does.
  let inPasture = false;
  const dress = () => {
    horse?.traverse((o) => {
      if (o.isMesh && o.material?.name === 'Saddle') o.visible = !inPasture;
    });
  };
  let mixer = null;
  const actions = {};
  let current = null;
  let motion = { clip: 'Idle' };
  let coat = null;
  const bones = {};
  const markBones = {};
  const rest = new Map();
  let baseY = 0;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // The horse stands in a rig, which tips it up onto its hind legs when it rears (rear()).
  const rig = new THREE.Group();
  stand.add(rig);
  const hip = new THREE.Vector2(-0.6, 1.1);
  let rearAt = null;
  // How far the view has been raised to keep a rearing horse's head in the frame.
  let rearLift = 0;

  const paint = () => {
    if (!horse || !coat) return;
    horse.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material.envMapIntensity = 1.25;
      if (o.material.name === MOVING_HORSE.coatMaterials.body) {
        // Gentle sheen & dark-coat lift so Bay/Dark Bay thoroughbreds show sculpted muscles under sunlight.
        o.material.color.setRGB(
          Math.min(1, coat.body[0] * 1.45 + 0.02),
          Math.min(1, coat.body[1] * 1.4 + 0.01),
          Math.min(1, coat.body[2] * 1.35 + 0.005),
        );
        o.material.roughness = Math.min(0.62, coat.roughness || 0.62);
      } else if (o.material.name === MOVING_HORSE.coatMaterials.hair) {
        o.material.color.setRGB(...coat.hair);
        o.material.roughness = 0.78;
      }
    });
  };

  // Physical velocity & injury choreography state: gives smooth Gallop -> Trot -> Walk -> Idle pull-ups
  // and natural 4-phase injury transitions (stumble -> limp -> careful halt -> guarded leg hold).
  let actualKmh = 0;
  let speedInitialized = false;
  let holdBlend = 0;
  let stumbleTimer = 0;
  let prevInjuryPhase = null;

  const switchClip = (clipName, timeScale = 1, fade = 0.35, onceThen = null) => {
    if (!mixer) return;
    const name = clipName && actions[clipName] ? clipName : 'Idle';
    const next = actions[name];
    next.timeScale = timeScale || 1;
    if (current === next) return;
    next.reset();
    if (onceThen && name === clipName) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    if (current) current.crossFadeTo(next, fade, false);
    current = next;
  };

  const play = () => {
    if (!mixer) return;
    switchClip(motion.clip, motion.timeScale || 1, 0.35, motion.then);
  };

  const ready = loadModel().then((gltf) => {
    horse = cloneSkinned(gltf.scene);
    horse.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = o.material.clone();
      }
    });
    // 1.6 m at the withers-ish: scale by the skinned height, feet on the ground, head towards +x.
    const size = skinnedBox(horse).getSize(new THREE.Vector3());
    horse.scale.setScalar(1.6 / size.y);
    const head = boneNamed(horse, 'BN_Head');
    horse.updateMatrixWorld(true);
    if (head) {
      const c = skinnedBox(horse).getCenter(new THREE.Vector3());
      const h = head.getWorldPosition(new THREE.Vector3()).sub(c);
      horse.rotation.y = Math.PI / 2 - Math.atan2(h.x, h.z);
    }
    const b2 = skinnedBox(horse);
    const c2 = b2.getCenter(new THREE.Vector3());
    horse.position.set(-c2.x, -b2.min.y, -c2.z);
    baseY = horse.position.y;
    rig.add(horse);
    for (const [leg, def] of Object.entries(LEGS)) {
      bones[leg] = {};
      for (const key of ['upper', 'stifle', 'knee', 'fetlock', 'hoof']) if (def[key]) bones[leg][key] = boneNamed(horse, def[key]);
      for (const key of ['upper', 'stifle', 'knee', 'fetlock']) if (bones[leg][key]) rest.set(bones[leg][key], bones[leg][key].quaternion.clone());
    }
    bones.neck = boneNamed(horse, NECK);
    // Rearing also moves the head, the jaw (the neigh) and the tail.
    bones.head = boneNamed(horse, 'BN_Head_00');
    bones.jaw = boneNamed(horse, 'BN_Jaw');
    bones.tail = [boneNamed(horse, 'BN_Tail_00'), boneNamed(horse, 'BN_Tail_01'), boneNamed(horse, 'BN_Tail_02')];
    for (const bone of [bones.neck, bones.head, bones.jaw, ...bones.tail]) if (bone) rest.set(bone, bone.quaternion.clone());
    // The horse rears about its hips: where the hind legs meet the body, in the rig's space.
    rig.updateMatrixWorld(true);
    const hips = [bones.RH.upper, bones.LH.upper].filter(Boolean).map((bone) => rig.worldToLocal(bone.getWorldPosition(new THREE.Vector3())));
    if (hips.length) hip.set(hips.reduce((x, p) => x + p.x, 0) / hips.length, hips.reduce((y, p) => y + p.y, 0) / hips.length);
    for (const [region, prefix] of Object.entries(MARK_BONES)) markBones[region] = boneNamed(horse, prefix);
    mixer = new THREE.AnimationMixer(horse);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    if (actions.Walk) actions.Trot = mixer.clipAction(makeTrot(actions.Walk.getClip()));
    mixer.addEventListener('finished', (e) => {
      if (e.action === current && motion.then && actions[motion.then]) {
        const next = actions[motion.then];
        next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
        current.crossFadeTo(next, 0.4, false);
        current = next;
      }
    });
    paint();
    dress();
    play();
  });

  // Turns a bone about the horse's side-to-side axis, seen from the camera: positive is anticlockwise
// (a leg swings forward, the head goes up), negative clockwise.
  const lateral = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const inv = new THREE.Matrix4();
  const swing = (bone, angle) => {
    if (!bone || !bone.parent) return;
    lateral.set(0, 0, 1).applyQuaternion(world.quaternion);
    inv.copy(bone.parent.matrixWorld).invert();
    const axis = lateral.transformDirection(inv);
    // The exported rig is mirrored (a negative determinant): a turn there goes the other way.
    const sign = bone.parent.matrixWorld.determinant() < 0 ? -1 : 1;
    bone.quaternion.premultiply(q.setFromAxisAngle(axis, angle * sign));
  };

  const FPS = 30;
  let travelled = 0;
  let last = performance.now();
  let raf = 0;
  let visible = true;
  const tilt = { now: 0 };
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    if (now - last < 1000 / FPS - 2) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    controls.update();
    // Ease into a slope.
    tilt.now += ((motion.tilt || 0) * (Math.PI / 180) - tilt.now) * Math.min(1, dt * 3);
    world.rotation.z = tilt.now;

    // Smooth physical speed easing so stopping / pulling up decelerates naturally (~3.8–4.2s)
    // through Gallop -> Trot -> Walk -> Idle instead of snapping instantaneously to 0 km/h.
    const targetKmh = Number(motion.kmh) || 0;
    if (!speedInitialized) {
      actualKmh = targetKmh;
      speedInitialized = true;
    } else if (reduceMotion) {
      actualKmh = targetKmh;
    } else if (targetKmh < actualKmh) {
      // Natural racehorse braking curve: firm initial check, then gentle cooling walk-down.
      const decel = motion.injuryPhase ? Math.max(4.5, actualKmh * 0.55) : Math.max(3.6, actualKmh * 0.52);
      actualKmh = Math.max(targetKmh, actualKmh - decel * dt);
      if (targetKmh === 0 && actualKmh < 0.35) actualKmh = 0;
    } else if (targetKmh > actualKmh) {
      const accel = Math.max(8, (targetKmh - actualKmh) * 1.4);
      actualKmh = Math.min(targetKmh, actualKmh + accel * dt);
    }
    const braking = targetKmh === 0 && actualKmh > 0.35;
    if (stumbleTimer > 0) stumbleTimer = Math.max(0, stumbleTimer - dt);

    // Derive natural gait & playback speed while decelerating to rest.
    if (mixer && braking) {
      if (motion.injuryPhase || motion.limp) {
        switchClip('Walk', Math.min(1.15, Math.max(0.45, actualKmh / 9)), 0.3);
      } else if (actualKmh > 22) {
        switchClip('Gallop', Math.min(1.15, Math.max(0.54, actualKmh / 48)), 0.3);
      } else if (actualKmh > 9.5) {
        switchClip('Trot', Math.min(1.45, Math.max(0.72, actualKmh / 13)), 0.35);
      } else if (actualKmh > 0.6) {
        switchClip('Walk', Math.min(1.25, Math.max(0.52, actualKmh / 6.5)), 0.35);
      }
    } else if (mixer && rearAt == null && targetKmh === 0 && actualKmh <= 0.35 && current !== actions[motion.clip || 'Idle']) {
      switchClip(motion.clip || 'Idle', motion.timeScale || 1, 0.45, motion.then);
    }

    // Rearing: the rig tips the horse up about its hips, which sink a little as the hind legs bend.
    let pose = null;
    let rt = 0;
    if (rearAt != null) {
      rt = (now - rearAt) / 1000;
      if (rt >= REAR.seconds) {
        rearAt = null;
        play();
      } else pose = rearPose(rt);
    }
    const pitch = pose ? REAR.pitch * pose.rise : 0;
    if (pose || rig.rotation.z !== 0) {
      const c = Math.cos(pitch);
      const s = Math.sin(pitch);
      rig.rotation.z = pitch;
      rig.position.set(hip.x - (c * hip.x - s * hip.y), hip.y - (s * hip.x + c * hip.y) - (pose ? REAR.drop * pose.crouch : 0), 0);
    }
    // The view rises with the head and comes back down with it.
    const lift = (pose ? REAR.lift * pose.rise : 0) - rearLift;
    if (lift !== 0) {
      controls.target.y += lift;
      camera.position.y += lift;
      rearLift += lift;
    }

    // The ground streams back at the horse's actual smooth speed.
    const mps = actualKmh / 3.6;
    if (inPasture) {
      // In the paddock a walking horse goes round it, facing its way, instead of the ground streaming under it.
      if (actualKmh > 0.5 && !reduceMotion) {
        const from = stand.position.clone();
        const yaw = stand.rotation.y;
        lap += (mps / PADDOCK.walk) * dt;
        stand.position.set(Math.cos(lap) * PADDOCK.walk, 0, Math.sin(lap) * PADDOCK.walk);
        stand.rotation.y = -lap - Math.PI / 2;
        // The camera goes with it and turns as it turns: the walking horse stays in view, seen from inside the paddock.
        const move = stand.position.clone().sub(from);
        controls.target.add(move);
        camera.position.add(move);
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(UP, stand.rotation.y - yaw);
        camera.position.copy(controls.target).add(offset);
      }
    } else if (!reduceMotion) {
      travelled += mps * dt;
      curvedTrack.scroll(travelled);
      if (hoofParticles.points.visible) {
        hoofParticles.emitForHorse(0, 0, actualKmh, dt);
        hoofParticles.update(dt, mps);
      }
    }
    // A trial's finish post comes in from the right as the end nears; the hills show on a slope.
    if (finishAt != null) {
      const x = finishAt - travelled;
      finish.visible = x > -TRACK_LENGTH / 2 && x < TRACK_LENGTH / 2;
      finish.position.x = x;
    }
    hills.visible = tilt.now > 0.02;
    // Clouds drift slowly round the sky; the sky follows the clock, checked each minute.
    if (clouds?.visible) {
      if (!reduceMotion) clouds.rotation.y += dt * 0.008;
      if (now - skyCheckedAt > 60000) showSky(now);
    }
    // The paddock's grass and flowers wave, the maples lean a little with the same gusts, and the
    // butterflies, birds or fireflies go about their business.
    if (paddock?.visible && !reduceMotion) {
      const t = now / 1000;
      grassTime.value = t;
      for (const maple of paddockMaples) {
        maple.rotation.z = -0.006 - 0.008 * Math.sin(t * 1.6 - maple.position.x * 0.7);
        maple.rotation.x = 0.004 * Math.sin(t * 2.2 + maple.position.z);
      }
      pastureLife?.update(t);
    }
    if (mixer) {
      // Bones a clip doesn't drive keep what they were given last frame: start each frame from rest,
      // so the bends below are applied once, not added up frame after frame.
      for (const [bone, quaternion] of rest) bone.quaternion.copy(quaternion);
      mixer.update(dt);
      rig.updateMatrixWorld(true);
      if (pose) {
        // The hind legs stay upright under the tipped body (turned back by as much as it tips), bent at
        // the stifle and hock; the forelegs fold up and paw the air, one after the other.
        for (const leg of [bones.RH, bones.LH]) {
          swing(leg.upper, -pitch + 0.3 * pose.crouch);
          swing(leg.stifle, -0.5 * pose.crouch);
          swing(leg.knee, 0.42 * pose.crouch);
          swing(leg.fetlock, -0.12 * pose.crouch);
        }
        for (const [leg, offset] of [[bones.RF, 0], [bones.LF, 1.9]]) {
          const beat = Math.sin(rt * 7.5 + offset);
          swing(leg.upper, (0.42 + 0.3 * beat * pose.paw) * pose.fold);
          swing(leg.knee, (-1.55 - 0.3 * Math.sin(rt * 7.5 + offset + 0.7) * pose.paw) * pose.fold);
          swing(leg.fetlock, -0.45 * pose.fold);
        }
        // The neck comes down against the climb so the head stays in front; neighing, it tosses its head
        // and opens its mouth. The tail hangs from the croup and swishes.
        swing(bones.neck, -0.42 * pose.rise + pose.neigh * (0.16 + 0.1 * Math.sin(rt * 15)));
        swing(bones.head, -0.22 * pose.rise + 0.12 * pose.neigh);
        swing(bones.jaw, -0.32 * pose.neigh * (0.75 + 0.25 * Math.sin(rt * 22)));
        const swish = Math.sin(rt * 4.5) * 0.18 * pose.rise;
        swing(bones.tail[0], -0.8 * pitch + swish);
        swing(bones.tail[1], 0.6 * swish);
      }
      const phase = current ? (current.time / current.getClip().duration) % 1 : 0;
      const leg = LEGS[motion.leg] ? motion.leg : 'RF';
      const fore = leg.endsWith('F');
      const rightSide = leg.startsWith('R');
      const sore = bones[leg] || {};

      // Subtle body lean away from the sore leg during stumble / limp, eased back to upright at rest.
      let targetRoll = 0;
      let targetPitch = 0;
      if (stumbleTimer > 0) {
        const k = Math.sin((stumbleTimer / 1.15) * Math.PI);
        targetRoll = (rightSide ? -0.09 : 0.09) * k;
        targetPitch = (fore ? -0.08 : 0.06) * k;
        swing(bones.neck, 0.38 * k);
      } else if ((motion.limp || (braking && motion.injuryPhase)) && actualKmh > 0.6) {
        const stepImpact = Math.max(0, Math.sin(phase * Math.PI * 2));
        targetRoll = (rightSide ? -0.055 : 0.055) * stepImpact;
      }
      stand.rotation.x += (targetRoll - stand.rotation.x) * Math.min(1, dt * 8);
      stand.rotation.z += (targetPitch - stand.rotation.z) * Math.min(1, dt * 8);

      // A lame leg: stiff (held near its rest pose). Lame in front, the head nods up as the sore leg
      // lands; lame behind, it dips instead.
      if ((motion.limp || (braking && motion.injuryPhase)) && actualKmh > 0.5) {
        for (const key of ['upper', 'stifle', 'knee', 'fetlock']) if (sore[key]) sore[key].quaternion.slerp(rest.get(sore[key]), 0.62);
        swing(bones.neck, (fore ? 0.34 : -0.18) * Math.max(0, Math.sin(phase * Math.PI * 2)));
      }

      // Smoothly lift & fold the sore leg once the horse has slowed down (over ~0.9s, never snapping in 1 frame).
      const wantHold = Boolean(motion.hold && actualKmh < 1.2);
      holdBlend += ((wantHold ? 1 : 0) - holdBlend) * Math.min(1, dt * (wantHold ? 3.2 : 5));
      if (holdBlend > 0.01) {
        for (const [key, angle] of Object.entries(fore ? HOLD.fore : HOLD.hind)) swing(sore[key], angle * holdBlend);
      }

      // Natural rein-check neck lift during normal deceleration, and gentle breathing cadence when standing.
      if (braking && !motion.injuryPhase && actualKmh > 6) {
        swing(bones.neck, 0.14 * Math.min(1, actualKmh / 35));
      } else if (actualKmh <= 0.5 && current === actions.Idle) {
        const breathRate = motion.hold || motion.injuryPhase ? 2.6 : 1.3;
        const breathAmp = motion.hold || motion.injuryPhase ? 0.045 : 0.02;
        swing(bones.neck, Math.sin((now / 1000) * breathRate) * breathAmp - (motion.hold ? 0.08 : 0));
      }

      // The trot's spring: the body rises twice a stride, as each diagonal pair pushes off.
      horse.position.y = current === actions.Trot ? baseY + 0.035 * Math.abs(Math.sin(phase * Math.PI * 2)) : baseY;
      // A tired horse carries its head low and nods heavily with each stride.
      if (motion.tired) swing(bones.neck, -(0.45 + 0.1 * Math.sin(phase * Math.PI * 4)));
      // The mark: on the sore leg's hoof, or on the part of the body the vet named (motion.markAt).
      const spot = motion.markAt ? markBones[motion.markAt] : sore.hoof;
      marker.visible = Boolean(motion.marker && spot);
      groundHalo.visible = Boolean(motion.marker && !motion.markAt && spot);
      if (marker.visible) {
        horse.updateMatrixWorld(true);
        spot.getWorldPosition(marker.position);
        marker.quaternion.copy(camera.quaternion);
        const pulse = 1 + 0.28 * Math.sin(now / (stumbleTimer > 0 ? 110 : 180));
        marker.scale.setScalar(pulse);
        marker.material.color.set(stumbleTimer > 0 ? '#f97316' : '#ef4444');
        if (groundHalo.visible) {
          groundHalo.position.set(marker.position.x, 0.022, marker.position.z);
          groundHalo.scale.setScalar(0.95 + 0.25 * Math.sin(now / 220));
          groundHalo.material.color.set(stumbleTimer > 0 ? '#f97316' : '#ef4444');
        }
      }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  // Not drawn while scrolled out of view.
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(canvas);

  return {
    ready,
    /**
     * The horse rears up on its hind legs and neighs (REAR.seconds), then goes back to what it was doing.
     * Only a horse standing sound and still: not one that is moving, lame, injured, held back or lying
     * down. Returns whether it reared.
     */
    rear() {
      const sound = !(motion.hold || motion.limp || motion.injuryPhase || motion.tired || motion.tone === 'alert' || motion.clip === 'Sleep');
      if (!mixer || rearAt != null || actualKmh > 0.5 || (motion.kmh || 0) > 0.5 || !sound) return false;
      rearAt = performance.now();
      switchClip('Idle', 1, 0.3);
      return true;
    },
    setCoat(next) {
      coat = next;
      paint();
    },
    setMotion(next) {
      motion = next || { clip: 'Idle' };
      const nextPhase = motion.injuryPhase || null;
      // Trigger dramatic stumble dip + dust burst right when injury starts.
      if (nextPhase === 'stumble' && prevInjuryPhase !== 'stumble') {
        stumbleTimer = 1.15;
        if (hoofParticles.points.visible) hoofParticles.burst(0.35, 0, 18);
      }
      prevInjuryPhase = nextPhase;
      // If a fresh static card mounts already stopped/resting, keep its speed at 0 without sliding.
      if (!speedInitialized) {
        actualKmh = Number(motion.kmh) || 0;
        if (motion.hold && actualKmh === 0 && !motion.stopping) holdBlend = 1;
        speedInitialized = true;
      }
      // A trial: race poles; once the next reading ends the run, the finish post, reached a little before
      // that reading so the horse is seen crossing it (the readings' metres are not the stage's: the
      // simulated sensors compress the run).
      curvedTrack.setShowPoles(Boolean(motion.course));
      if (motion.course?.finishIn == null) finishAt = null;
      else if (finishAt == null) finishAt = travelled + ((motion.kmh || 0) / 3.6) * Math.max(Math.min(0.4, motion.course.finishIn), motion.course.finishIn - 2);
      if (finishAt == null) finish.visible = false;
      applyScene();
      // Only immediately switch clips when not mid-braking (braking steps smoothly through Gallop -> Trot -> Walk -> Idle).
      if (!((Number(motion.kmh) || 0) === 0 && actualKmh > 0.5)) play();
    },
    /** The sky of an hour of the day (a session's), or null: the clock in Vietnam in the pasture, a plain sky on the track. */
    setHour(hour) {
      fixedHour = Number.isFinite(hour) ? hour : null;
      const skyOfHour = inPasture || fixedHour != null;
      if (skyOfHour) ensureClouds();
      if (clouds) clouds.visible = skyOfHour;
      if (skyOfHour) {
        pastureSky = null;
        showSky(performance.now());
      } else plainSky();
    },
    setSurface(kind) {
      const next = SURFACES[kind] ? kind : 'dirt';
      if (next === surfaceKind) return;
      surfaceKind = next;
      const trackSurface = next === 'pasture' ? 'turf' : next;
      curvedTrack.setSurface(trackSurface);
      hoofParticles.setSurface(trackSurface);
      setPasture(Boolean(SURFACES[next].grass));
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      controls.dispose();
      mixer?.stopAllAction();
      skyEnv.dispose();
      curvedTrack.dispose();
      hoofParticles.dispose();
      shadowTexture.dispose();
      checker.dispose();
      paddockTexture?.dispose();
      pathTexture?.dispose();
      pastureLife?.dispose();
      if (scene.background?.isTexture) scene.background.dispose();
      clouds?.children[0]?.material.map?.dispose();
      scene.traverse((o) => {
        if (o.isSkinnedMesh) {
          o.material?.dispose?.();
          return;
        }
        o.geometry?.dispose?.();
        if (o.material) o.material.dispose();
      });
      renderer.dispose();
    },
  };
}
