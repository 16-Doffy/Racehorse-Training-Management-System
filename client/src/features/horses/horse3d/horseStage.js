import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MOVING_HORSE } from './horseMotion';

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
// The long grass of the pasture: one patch of blades repeated along the field, so it can stream back
// with the horse's walk by shifting the whole field less than a patch.
const GRASS_PATCH = 4; // metres along the field
const GRASS_PATCHES = 9;
const GRASS_PER_PATCH = 1900;
// From near the camera to the far rail; the grass is cut short towards the camera (from `mown` on), where
// long blades would stand taller than the horse.
const GRASS_DEPTH = { near: 3.2, far: -3.3, mown: 1.0 };
// The bones bent by hand, by the start of their names (the exporter adds numbers). The rig names them
// after a human arm and leg, one joint off (heights measured standing): a foreleg's UpperArm turns at
// the elbow (0.8 m), Forearm at the knee (0.45 m), Hand at the fetlock (0.15 m); a hind leg's Thing at
// the hip (1.15 m), Calf at the stifle (0.82 m), HorseLink at the hock (0.5 m), Foot at the fetlock.
// RF/LF/RH/LH: right/left fore/hind; the camera sees the right side.
const LEGS = {
  RF: { upper: 'BN_R_UpperArm', knee: 'BN_R_Forearm', fetlock: 'BN_R_Hand', hoof: 'BN_R_Toe_047', chain: ['BN_R_Clavicle', 'BN_R_UpperArm', 'BN_R_Forearm', 'BN_R_Hand', 'BN_R_Toe_047'] },
  LF: { upper: 'BN_L_UpperArm', knee: 'BN_l_Forearm', fetlock: 'BN_L_Hand', hoof: 'BN_L_Toe_042', chain: ['BN_L_Clavicle', 'BN_L_UpperArm', 'BN_l_Forearm', 'BN_L_Hand', 'BN_L_Toe_042'] },
  RH: { upper: 'BN_R_Thing', stifle: 'BN_R_Calf', knee: 'BN_R_HorseLink', fetlock: 'BN_R_Foot', hoof: 'BN_R_Toe_2_059', chain: ['BN_R_Thing', 'BN_R_Calf', 'BN_R_HorseLink', 'BN_R_Foot', 'BN_R_Toe_2_059'] },
  LH: { upper: 'BN_L_Thing', stifle: 'BN_L_Calf', knee: 'BN_L_HorseLink', fetlock: 'BN_L_Foot', hoof: 'BN_L_Toe_2_055', chain: ['BN_L_Thing', 'BN_L_Calf', 'BN_L_HorseLink', 'BN_L_Foot', 'BN_L_Toe_2_055'] },
};
// A sore leg held off the ground (radians, positive anticlockwise seen from the camera): a foreleg
// folds at the knee and fetlock, a hind leg draws up at the hip and hock and rests on its toe.
const HOLD = {
  fore: { upper: 0.25, knee: -1.5, fetlock: -0.6 },
  hind: { upper: 0.35, stifle: -0.5, knee: 1.3, fetlock: -0.8 },
};
// Where a mark goes for an injury that is not in a leg (vet's body regions, horseMotion.js markAt).
const MARK_BONES = { head: 'BN_Head_00', neck: 'BN_Neck_02', back: 'BN_Spine_02', shoulder: 'BN_R_Clavicle', croup: 'BN_Pelvis', chest: 'BN_Spine_00', belly: 'BN_Stomach' };
const NECK = 'BN_Neck_00';
// A trot made from the walk: each leg's swing moved in the cycle so the diagonal pairs (left fore with
// right hind, right fore with left hind) step together, half a cycle apart. The walk's swing peaks are
// at LF 0, RH 0.175, RF 0.425, LH 0.75 of its cycle (measured).
const TROT_SHIFT = { LF: 0, RH: -0.24, RF: 0.075, LH: -0.325 };

// The pasture's tree and house, loaded with the pasture only (credits: PASTURE_CREDIT, horseMotion.js).
// The maple: "Maple tree" by atrodler, its 2,071 pieces merged into a trunk and a crown of leaves. The
// house: "Farm House" by BoredPain666, its 4096 px texture brought down to 1024. Both Sketchfab, CC BY 4.0.
const MAPLE_TREE = `${import.meta.env.BASE_URL}models/maple-tree.glb`;
const FARM_HOUSE = `${import.meta.env.BASE_URL}models/farm-house.glb`;
const TREE_HEIGHT = 5.8; // metres, against a 1.6 m horse
const HOUSE_WIDTH = 9;
const HOUSE_TURN = Math.PI - 0.5; // which side of the house faces the camera
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
 * The pasture's blades: thin tapered strips, a few hundred per square metre, each its own height, lean
 * and green. The wind is in the vertex shader (the tip moves most, the root not at all), so waving costs
 * nothing on the CPU. `time` is the uniform the stage moves on each frame.
 */
function grassParts(time) {
  const SEGMENTS = 4;
  const positions = [];
  const colors = [];
  const indices = [];
  const root = new THREE.Color('#24451a');
  const tip = new THREE.Color('#9ccc5a');
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

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = `uniform float uTime;
${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
      // Gusts roll along the field: the same wind for every blade, a little out of step with its neighbours.
      float sway = position.y * position.y;
      float gust = sin(uTime * 1.6 - mvPosition.x * 0.7 + mvPosition.z * 0.3) * 0.65 + sin(uTime * 3.1 + mvPosition.x * 2.3 + mvPosition.z * 1.7) * 0.2;
      mvPosition.x += (0.06 + gust * 0.09) * sway;
      mvPosition.z += sin(uTime * 2.2 + mvPosition.x * 1.3) * 0.025 * sway;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  return { blade, material };
}

/** The field's grass: a strip along the track, one patch repeated, streaming back as the horse walks. */
function makeGrass(time) {
  const { blade, material } = grassParts(time);
  const count = GRASS_PER_PATCH * GRASS_PATCHES;
  const grass = new THREE.InstancedMesh(blade, material, count);
  grass.frustumCulled = false;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // One patch, then the same patch side by side: the field repeats every GRASS_PATCH metres.
  const patch = Array.from({ length: GRASS_PER_PATCH }, () => {
    const z = GRASS_DEPTH.far + rnd() * (GRASS_DEPTH.near - GRASS_DEPTH.far);
    const mown = z > GRASS_DEPTH.mown ? 1 - 0.7 * ((z - GRASS_DEPTH.mown) / (GRASS_DEPTH.near - GRASS_DEPTH.mown)) : 1;
    return {
      x: rnd() * GRASS_PATCH,
      z,
      turn: rnd() * Math.PI * 2,
      height: (0.12 + rnd() * 0.18) * mown,
      width: 0.035 + rnd() * 0.03,
      shade: 0.8 + rnd() * 0.35,
    };
  });
  const m = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let i = 0;
  for (let k = 0; k < GRASS_PATCHES; k += 1) {
    const start = (k - Math.floor(GRASS_PATCHES / 2)) * GRASS_PATCH;
    for (const b of patch) {
      rotation.setFromAxisAngle(up, b.turn);
      m.compose(new THREE.Vector3(start + b.x, 0, b.z), rotation, new THREE.Vector3(b.width, b.height, b.width));
      grass.setMatrixAt(i, m);
      grass.setColorAt(i, color.setScalar(b.shade));
      i += 1;
    }
  }
  grass.instanceMatrix.needsUpdate = true;
  return grass;
}

// The round paddock of a horse at rest: looked at from any side it is the same field, fenced all round.
const PADDOCK = { radius: 8.5, posts: 30, inner: 4.5, walk: 4.2 };

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
      const gateWood = new THREE.MeshStandardMaterial({ color: '#9a7048', roughness: 0.8 });
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

  // Hills: a low, overlapping ridge all round, green, behind the trees.
  const hillMaterial = new THREE.MeshStandardMaterial({ color: '#3d6a30', roughness: 1 });
  const dome = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.2;
    const r = 27 + rnd() * 7;
    const hill = new THREE.Mesh(dome, hillMaterial);
    hill.scale.set(9 + rnd() * 8, 2 + rnd() * 2.5, 6 + rnd() * 4);
    hill.position.set(Math.cos(a) * r, -0.4, Math.sin(a) * r);
    hill.rotation.y = -a;
    farm.add(hill);
  }

  // A treeline: dark conifers in loose clumps, leaving the view to the house open.
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshStandardMaterial({ color: '#2c5427', roughness: 1 }), 80);
  const treeColor = new THREE.Color();
  let n = 0;
  while (n < 80) {
    const a = rnd() * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - houseAngle), Math.cos(a - houseAngle))) < 0.35) continue;
    const r = 17 + rnd() * 7;
    const h = 2.6 + rnd() * 2.4;
    m.compose(new THREE.Vector3(Math.cos(a) * r, h / 2 - 0.1, Math.sin(a) * r), q.identity(), new THREE.Vector3(0.8 + rnd() * 0.5, h, 0.8 + rnd() * 0.5));
    trees.setMatrixAt(n, m);
    trees.setColorAt(n, treeColor.setScalar(0.8 + rnd() * 0.4));
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
  farm.add(path);

  // Round hay bales beside the house, two on the ground and one on top.
  const straw = new THREE.MeshStandardMaterial({ color: '#c9a45a', roughness: 0.95 });
  const bale = new THREE.CylinderGeometry(0.62, 0.62, 1.1, 20);
  const along = new THREE.Vector3(-toHouse.z, 0, toHouse.x); // along the house's front
  const baleBase = door.clone().addScaledVector(along, 3.2);
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
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6.5, 24), new THREE.MeshStandardMaterial({ color: '#b8b1a4', roughness: 0.6, metalness: 0.2 }));
  drum.position.y = 3.25;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.55, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8b8f93', roughness: 0.5, metalness: 0.3 }));
  cap.position.y = 6.5;
  silo.add(drum, cap);
  silo.position.copy(door).addScaledVector(along, -6.5).addScaledVector(toHouse, 2);
  farm.add(silo);

  // A water trough inside the fence, round from the gate.
  const trough = new THREE.Group();
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.62), new THREE.MeshStandardMaterial({ color: '#7d8a8f', roughness: 0.4, metalness: 0.4 }));
  tub.position.y = 0.25;
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

// The pasture's sky through the day in Vietnam, blended minute by minute between these moments: night,
// dawn, morning, noon, afternoon, the golden hour, dusk, night again. sky = top of the sky, horizon =
// the haze at the horizon (and the fog), sun = the key light (the moon at night), fill = the sky's light.
// A moonlit night, light enough that a dark coat still shows against the grass.
const NIGHT = { sky: '#1a2c4e', horizon: '#4a5e86', sun: ['#c8d6ff', 2.1], fill: ['#b4c6ea', 1.65], clouds: '#6f7d98' };
const PASTURE_SKIES = [
  { at: 0, ...NIGHT },
  { at: 5, ...NIGHT },
  { at: 6, sky: '#9db8d9', horizon: '#f3d9b8', sun: ['#ffd9a8', 1.8], fill: ['#f4ead8', 1.15], clouds: '#fff0e0' },
  { at: 8, sky: '#7fb2df', horizon: '#d3e6f0', sun: ['#fff3dd', 2.4], fill: ['#e8f2ff', 1.4], clouds: '#ffffff' },
  { at: 12, sky: '#6aa6dc', horizon: '#d4e8f4', sun: ['#ffffff', 2.7], fill: ['#eef5ff', 1.5], clouds: '#ffffff' },
  { at: 15.5, sky: '#78acd9', horizon: '#e9dfcb', sun: ['#fff0d6', 2.5], fill: ['#f3ecdf', 1.4], clouds: '#fffaf0' },
  { at: 17.3, sky: '#7c9bcb', horizon: '#f4c590', sun: ['#ffc580', 2.3], fill: ['#f6e4d0', 1.3], clouds: '#ffe2c4' },
  { at: 18.3, sky: '#3e5185', horizon: '#e59f70', sun: ['#ffa36b', 1.6], fill: ['#cdbcc9', 1.1], clouds: '#cf9f8e' },
  { at: 19.2, ...NIGHT },
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
 */
export function createHorseStage(canvas, { view = 'side' } = {}) {
  // Light on purpose: several cards can run at once. No real-time shadows (they draw the skinned horse
  // a second time), at most 1.5x the screen's pixels, at most FPS frames a second.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const sky = new THREE.Color('#bcd7e6');
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 14, 42);
  const fill = new THREE.HemisphereLight('#e8f2ff', '#5b4a35', 1.3);
  scene.add(fill);
  const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
  sun.position.set(4, 9, 6);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.1, 100);
  const target = new THREE.Vector3(0.1, 0.95, 0);
  camera.position.set(view === 'turntable' ? 4.2 : 0.4, 1.35, view === 'turntable' ? 5 : 7.6);
  camera.lookAt(target);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.9;
  controls.maxPolarAngle = 1.55;
  controls.autoRotate = view === 'turntable';
  controls.autoRotateSpeed = 1.2;

  // The world tilts on a slope (uphill work); the track and rails scroll inside it.
  const world = new THREE.Group();
  scene.add(world);
  let surfaceKind = null;
  let trackTexture = null;
  const track = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_LENGTH, 7), new THREE.MeshStandardMaterial({ roughness: 0.95 }));
  track.rotation.x = -Math.PI / 2;
  world.add(track);
  // A soft shadow under the horse, painted once.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sg = shadowCanvas.getContext('2d');
  const gradient = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0,0,0,0.45)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = gradient;
  sg.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  // The horse and its shadow stand together: in the paddock a walking horse takes them round it.
  const stand = new THREE.Group();
  world.add(stand);
  stand.add(blob);
  // Where a walking horse is on its round of the paddock: it starts on the far side, walking to the right.
  let lap = -Math.PI / 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const infield = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_LENGTH, 40), new THREE.MeshStandardMaterial({ color: '#4a7a3a', roughness: 1 }));
  infield.rotation.x = -Math.PI / 2;
  infield.position.set(0, -0.01, 0);
  world.add(infield);
  // A white rail on the far side: posts and a top rail; only the posts move, the rail is endless.
  const postGeo = new THREE.BoxGeometry(0.08, 1.05, 0.08);
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.6 });
  const postCount = Math.ceil(TRACK_LENGTH / POST_EVERY);
  const posts = new THREE.InstancedMesh(postGeo, white, postCount);
  world.add(posts);
  // Only the far rail: one on the camera's side would stand in front of the horse.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(TRACK_LENGTH, 0.07, 0.07), white);
  rail.position.set(0, 1.0, -3.4);
  world.add(rail);
  const placePosts = (travelled) => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < postCount; i += 1) {
      const x = ((((i * POST_EVERY - travelled) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH) - TRACK_LENGTH / 2;
      m.makeTranslation(x, 0.52, -3.4);
      posts.setMatrixAt(i, m);
    }
    posts.instanceMatrix.needsUpdate = true;
  };
  placePosts(0);
  // A trial: red race poles along the far rail every MARK_EVERY metres, and the finish post with its line
  // across the track once the sensors say the end is near (motion.course.remaining).
  // About one always in view (the camera sees some 10 m of the far rail); it divides TRACK_LENGTH, so the
  // poles stay evenly spaced where the track wraps round.
  const MARK_EVERY = 10;
  const markCount = Math.ceil(TRACK_LENGTH / MARK_EVERY);
  const raceMarks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8), new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.6 }), markCount);
  raceMarks.visible = false;
  world.add(raceMarks);
  const placeMarks = (travelled) => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < markCount; i += 1) {
      const x = ((((i * MARK_EVERY - travelled) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH) - TRACK_LENGTH / 2;
      raceMarks.setMatrixAt(i, m.makeTranslation(x, 0.85, -3.15));
    }
    raceMarks.instanceMatrix.needsUpdate = true;
  };
  placeMarks(0);
  const checker = checkerTexture();
  const finish = new THREE.Group();
  const finishPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.6 }));
  finishPole.position.set(0, 1.3, -3.2);
  const finishBoard = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: checker }));
  finishBoard.position.set(0, 2.5, -3.14);
  const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 7), new THREE.MeshBasicMaterial({ color: '#f4f2ec' }));
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.y = 0.015;
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
  // The pasture's long grass: made the first time the pasture is shown, then only hidden or shown.
  let grass = null;
  const grassTime = { value: 0 };
  // The rest of the pasture, made with the grass: a wooden fence (the posts and rail in wood, a second
  // rail lower down), the stable block far off, clouds drifting, and the sky of the hour in Vietnam.
  // Elsewhere the rail is white and the sky plain.
  const WOOD = '#7a5636';
  const lowerRail = new THREE.Mesh(new THREE.BoxGeometry(TRACK_LENGTH, 0.07, 0.07), white);
  lowerRail.position.set(0, 0.55, -3.4);
  lowerRail.visible = false;
  world.add(lowerRail);
  let barn = null;
  let tree = null;
  let disposed = false;
  let clouds = null;
  let pastureSky = null;
  let skyCheckedAt = -Infinity;
  const BARN_X = -5.5;
  const TREE_X = 4.2;
  const BARN_LOOP = 40; // walking, the barn comes round again every 40 m
  // The hour the sky shows: a session's own (setHour), else the clock in Vietnam (the pasture).
  let fixedHour = null;
  const showSky = (now) => {
    const s = pastureSkyAt(fixedHour ?? vietnamHour());
    skyCheckedAt = now;
    if (s.key === pastureSky?.key) return;
    pastureSky = s;
    // The sun crosses the sky from the east at six to the west at six; at night the moon stands high.
    const day = (s.hour - 6) / 12;
    if (day > 0 && day < 1) sun.position.set(-9 * Math.cos(day * Math.PI), 2 + 9 * Math.sin(day * Math.PI), 6);
    else sun.position.set(3, 9, 6);
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = skyTexture(s.sky, s.horizon);
    scene.fog.color.set(s.horizon);
    sun.color.set(s.sun[0]);
    sun.intensity = s.sun[1];
    fill.color.set(s.fill[0]);
    fill.intensity = s.fill[1];
    for (const c of clouds?.children || []) c.material.color.set(s.clouds);
  };
  // The track's sky when no hour is given: plain and bright.
  const plainSky = () => {
    if (!pastureSky) return;
    pastureSky = null;
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = sky;
    scene.fog.color.copy(sky);
    sun.color.set('#fff3dd');
    sun.intensity = 2.2;
    sun.position.set(4, 9, 6);
    fill.color.set('#e8f2ff');
    fill.intensity = 1.3;
  };
  const ensureClouds = () => {
    if (clouds) return;
    clouds = new THREE.Group();
    const puff = cloudTexture();
    // All round the sky, so the paddock has clouds whichever way it is turned.
    for (let i = 0; i < 12; i += 1) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, fog: false }));
      const a = (i / 12) * Math.PI * 2 + 0.2;
      const r = 32 + (i % 3) * 4;
      cloud.position.set(Math.cos(a) * r, 7.5 + (i % 3) * 1.6, Math.sin(a) * r);
      cloud.scale.set(9 + (i % 3) * 2, 4 + (i % 2), 1);
      clouds.add(cloud);
    }
    scene.add(clouds);
    if (pastureSky) for (const c of clouds.children) c.material.color.set(pastureSky.clouds);
  };
  const setPasture = (on) => {
    inPasture = on;
    dress();
    if (on && !barn) {
      // The farm house far across the pasture (the drawn barn if it won't load).
      barn = new THREE.Group();
      barn.position.set(BARN_X, 0, -18);
      barn.rotation.y = 0.1;
      world.add(barn);
      loadScenery(FARM_HOUSE)
        .then((gltf) => {
          if (disposed) return;
          const house = sized(gltf, 'x', HOUSE_WIDTH);
          house.rotation.y = HOUSE_TURN;
          barn.add(house);
        })
        .catch(() => {
          if (disposed) return;
          const drawn = makeBarn();
          drawn.scale.setScalar(0.75);
          barn.add(drawn);
        });
      // A maple on the right, nearer than the barn, just behind the fence (the drawn tree if it won't load).
      tree = new THREE.Group();
      tree.position.set(TREE_X, 0, -15);
      world.add(tree);
      loadScenery(MAPLE_TREE)
        .then((gltf) => !disposed && tree.add(sized(gltf, 'y', TREE_HEIGHT)))
        .catch(() => !disposed && tree.add(makeTree().tree));
      world.add(barn);
    }
    if (on) ensureClouds();
    white.color.set(on ? WOOD : '#f4f2ec');
    white.roughness = on ? 0.85 : 0.6;
    lowerRail.visible = on;
    if (barn) barn.visible = on;
    if (tree) tree.visible = on;
    if (clouds) clouds.visible = on || fixedHour != null;
    if (on || fixedHour != null) showSky(performance.now());
    else plainSky();
    applyScene();
  };

  // A horse at rest in the pasture stands in a round paddock that holds from every side (the view can be
  // dragged all round it): the fenced field, the grass round the horse, the farm house and maples outside,
  // hills on the horizon. A horse on the move keeps the strip of track streaming by, seen from its side.
  let paddock = null;
  let paddockTexture = null;
  let pathTexture = null;
  let inPaddock = false;
  const ensurePaddock = () => {
    if (paddock) return;
    paddock = new THREE.Group();
    paddockTexture = surfaceTexture('pasture');
    paddockTexture.repeat.set(36, 36);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshStandardMaterial({ map: paddockTexture, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    // Turned to face the paddock from (x, z): the model's front is +z.
    const facing = (x, z) => Math.atan2(-x, -z);
    const HOUSE_AT = [-6, -17]; // a little left of the first view, so even a narrow frame shows it
    const props = makeFarmProps(HOUSE_AT);
    pathTexture = props.pathTexture;
    paddock.add(ground, makePaddockGrass(grassTime), makePaddockFence(new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 }), Math.atan2(HOUSE_AT[1], HOUSE_AT[0])), props.farm);
    const house = new THREE.Group();
    house.position.set(HOUSE_AT[0], 0, HOUSE_AT[1]);
    paddock.add(house);
    loadScenery(FARM_HOUSE)
      .then((gltf) => {
        if (disposed) return;
        const model = sized(gltf, 'x', HOUSE_WIDTH);
        model.rotation.y = HOUSE_TURN + facing(...HOUSE_AT);
        house.add(model);
      })
      .catch(() => {
        if (disposed) return;
        const drawn = makeBarn();
        drawn.scale.setScalar(0.75);
        drawn.rotation.y = facing(...HOUSE_AT);
        house.add(drawn);
      });
    const TREES = [[12, -12, 1], [-16, 8, 0.85], [10, 15, 1.1]];
    loadScenery(MAPLE_TREE)
      .then((gltf) => {
        if (disposed) return;
        for (const [x, z, s] of TREES) {
          const maple = sized(gltf, 'y', TREE_HEIGHT * s);
          maple.position.set(x, 0, z);
          maple.rotation.y = x * 0.37;
          paddock.add(maple);
        }
      })
      .catch(() => {
        if (disposed) return;
        for (const [x, z] of TREES) {
          const drawn = makeTree().tree;
          drawn.position.set(x, 0, z);
          paddock.add(drawn);
        }
      });
    paddock.visible = false;
    scene.add(paddock);
  };
  // Which scene the horse is in, after any change to the surface or the motion.
  const applyScene = () => {
    const want = inPasture && view === 'side';
    // Standing or grazing, the horse is in the middle; walking, it goes round (see the frame loop).
    if ((!want || !((motion?.kmh || 0) > 0.5)) && stand.position.lengthSq() > 0) {
      stand.position.set(0, 0, 0);
      stand.rotation.y = 0;
      lap = -Math.PI / 2;
      controls.target.copy(target);
      camera.position.set(0.4, 1.35, 7.6);
    }
    if (want) ensurePaddock();
    inPaddock = want;
    if (paddock) paddock.visible = want;
    for (const o of [track, infield, posts, rail]) o.visible = !want;
    lowerRail.visible = inPasture && !want;
    if (grass) grass.visible = Boolean(SURFACES[surfaceKind]?.grass) && !want;
    if (barn) barn.visible = inPasture && !want;
    if (tree) tree.visible = inPasture && !want;
    // All round the horse in the paddock; on the track only from its side, where the strip has no edge in view.
    const strip = view === 'side' && !want;
    controls.minAzimuthAngle = strip ? -0.7 : -Infinity;
    controls.maxAzimuthAngle = strip ? 0.7 : Infinity;
  };

  // The sore leg: a pulsing red ring at its hoof.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.16, 32), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.9, depthTest: false }));
  marker.visible = false;
  marker.renderOrder = 10;
  scene.add(marker);

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

  const paint = () => {
    if (!horse || !coat) return;
    horse.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.material.name === MOVING_HORSE.coatMaterials.body) {
        o.material.color.setRGB(...coat.body);
        if (coat.roughness) o.material.roughness = coat.roughness;
      } else if (o.material.name === MOVING_HORSE.coatMaterials.hair) o.material.color.setRGB(...coat.hair);
    });
  };

  const play = () => {
    if (!mixer) return;
    const name = motion.clip && actions[motion.clip] ? motion.clip : 'Idle';
    const next = actions[name];
    next.timeScale = motion.timeScale || 1;
    if (current === next) return;
    next.reset();
    if (motion.then && name === motion.clip) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    if (current) current.crossFadeTo(next, 0.35, false);
    current = next;
  };

  const ready = loadModel().then((gltf) => {
    horse = cloneSkinned(gltf.scene);
    horse.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
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
    stand.add(horse);
    for (const [leg, def] of Object.entries(LEGS)) {
      bones[leg] = {};
      for (const key of ['upper', 'stifle', 'knee', 'fetlock', 'hoof']) if (def[key]) bones[leg][key] = boneNamed(horse, def[key]);
      for (const key of ['upper', 'stifle', 'knee', 'fetlock']) if (bones[leg][key]) rest.set(bones[leg][key], bones[leg][key].quaternion.clone());
    }
    bones.neck = boneNamed(horse, NECK);
    if (bones.neck) rest.set(bones.neck, bones.neck.quaternion.clone());
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
    // The ground streams back at the horse's speed.
    if (inPaddock) {
      // In the paddock a walking horse goes round it, facing its way, instead of the ground streaming under it.
      if ((motion.kmh || 0) > 0.5 && !reduceMotion) {
        const from = stand.position.clone();
        const yaw = stand.rotation.y;
        lap += ((motion.kmh || 0) / 3.6 / PADDOCK.walk) * dt;
        stand.position.set(Math.cos(lap) * PADDOCK.walk, 0, Math.sin(lap) * PADDOCK.walk);
        stand.rotation.y = -lap - Math.PI / 2;
        // The camera goes with it and turns as it turns: the walking horse stays in view, seen from inside the paddock.
        const move = stand.position.clone().sub(from);
        controls.target.add(move);
        camera.position.add(move);
        const offset = camera.position.clone().sub(controls.target).applyAxisAngle(UP, stand.rotation.y - yaw);
        camera.position.copy(controls.target).add(offset);
      }
    } else if (!reduceMotion && view === 'side') {
      travelled += ((motion.kmh || 0) / 3.6) * dt;
      if (trackTexture) trackTexture.offset.x = (travelled / TILE_M) % 1;
      placePosts(travelled);
      if (raceMarks.visible) placeMarks(travelled);
      if (grass) grass.position.x = -(travelled % GRASS_PATCH);
      // Walking, the barn and the tree go by and come round again every BARN_LOOP metres.
      const loop = (x) => ((((x - travelled) % BARN_LOOP) + BARN_LOOP * 1.5) % BARN_LOOP) - BARN_LOOP / 2;
      if (barn) barn.position.x = loop(BARN_X);
      if (tree) tree.position.x = loop(TREE_X);
    }
    // A trial's finish post comes in from the right as the end nears; the hills show on a slope.
    if (finishAt != null) {
      const x = finishAt - travelled;
      finish.visible = x > -TRACK_LENGTH / 2 && x < TRACK_LENGTH / 2;
      finish.position.x = x;
    }
    hills.visible = tilt.now > 0.02;
    if ((grass?.visible || inPaddock) && !reduceMotion) grassTime.value = now / 1000;
    // The tree leans with the same gusts as the grass, a little, from its foot.
    if (tree?.visible && !reduceMotion) {
      const t = now / 1000;
      tree.rotation.z = -0.006 - 0.008 * Math.sin(t * 1.6 - TREE_X * 0.7);
      tree.rotation.x = 0.004 * Math.sin(t * 2.2);
    }
    // Clouds drift slowly to the right, round and round; the sky follows the clock, checked each minute.
    if (clouds?.visible) {
      if (!reduceMotion) for (const c of clouds.children) c.position.x = ((c.position.x + dt * 0.35 + 40) % 80) - 40;
      if (now - skyCheckedAt > 60000) showSky(now);
    }
    if (mixer) {
      // Bones a clip doesn't drive keep what they were given last frame: start each frame from rest,
      // so the bends below are applied once, not added up frame after frame.
      for (const [bone, quaternion] of rest) bone.quaternion.copy(quaternion);
      mixer.update(dt);
      horse.updateMatrixWorld(true);
      const phase = current ? (current.time / current.getClip().duration) % 1 : 0;
      const leg = LEGS[motion.leg] ? motion.leg : 'RF';
      const fore = leg.endsWith('F');
      const sore = bones[leg] || {};
      // A lame leg: stiff (held near its rest pose). Lame in front, the head nods up as the sore leg
      // lands; lame behind, it dips instead.
      if (motion.limp) {
        for (const key of ['upper', 'stifle', 'knee', 'fetlock']) if (sore[key]) sore[key].quaternion.slerp(rest.get(sore[key]), 0.55);
        swing(bones.neck, (fore ? 0.3 : -0.15) * Math.max(0, Math.sin(phase * Math.PI * 2)));
      }
      // The sore leg held off the ground.
      if (motion.hold) for (const [key, angle] of Object.entries(fore ? HOLD.fore : HOLD.hind)) swing(sore[key], angle);
      // The trot's spring: the body rises twice a stride, as each diagonal pair pushes off.
      horse.position.y = current === actions.Trot ? baseY + 0.035 * Math.abs(Math.sin(phase * Math.PI * 2)) : baseY;
      // A tired horse carries its head low and nods heavily with each stride.
      if (motion.tired) swing(bones.neck, -(0.45 + 0.1 * Math.sin(phase * Math.PI * 4)));
      // The mark: on the sore leg's hoof, or on the part of the body the vet named (motion.markAt).
      const spot = motion.markAt ? markBones[motion.markAt] : sore.hoof;
      marker.visible = Boolean(motion.marker && spot);
      if (marker.visible) {
        horse.updateMatrixWorld(true);
        spot.getWorldPosition(marker.position);
        marker.quaternion.copy(camera.quaternion);
        marker.scale.setScalar(1 + 0.25 * Math.sin(now / 180));
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
    setCoat(next) {
      coat = next;
      paint();
    },
    setMotion(next) {
      motion = next || { clip: 'Idle' };
      // A trial: race poles; once the next reading ends the run, the finish post, reached a little before
      // that reading so the horse is seen crossing it (the readings' metres are not the stage's: the
      // simulated sensors compress the run).
      raceMarks.visible = Boolean(motion.course);
      if (motion.course?.finishIn == null) finishAt = null;
      else if (finishAt == null) finishAt = travelled + ((motion.kmh || 0) / 3.6) * Math.max(Math.min(0.4, motion.course.finishIn), motion.course.finishIn - 2);
      if (finishAt == null) finish.visible = false;
      applyScene();
      play();
    },
    /** The sky of an hour of the day (a session's), or null: the clock in Vietnam in the pasture, a plain sky on the track. */
    setHour(hour) {
      fixedHour = Number.isFinite(hour) ? hour : null;
      if (fixedHour != null) ensureClouds();
      if (clouds) clouds.visible = inPasture || fixedHour != null;
      if (inPasture || fixedHour != null) {
        pastureSky = null;
        showSky(performance.now());
      } else plainSky();
    },
    setSurface(kind) {
      const next = SURFACES[kind] ? kind : 'dirt';
      if (next === surfaceKind) return;
      surfaceKind = next;
      trackTexture?.dispose();
      trackTexture = surfaceTexture(next);
      trackTexture.repeat.set(TRACK_LENGTH / TILE_M, 7 / TILE_M);
      track.material.map = trackTexture;
      track.material.needsUpdate = true;
      if (SURFACES[next].grass && !grass) {
        grass = makeGrass(grassTime);
        world.add(grass);
      }
      if (grass) grass.visible = Boolean(SURFACES[next].grass);
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
      trackTexture?.dispose();
      shadowTexture.dispose();
      paddockTexture?.dispose();
      pathTexture?.dispose();
      checker.dispose();
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
