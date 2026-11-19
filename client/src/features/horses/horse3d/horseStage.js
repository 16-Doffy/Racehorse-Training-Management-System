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
// Where a mark goes for an injury that is not in a leg (vet's body regions, horseMotion.js markAt).
export const MARK_BONES = { head: 'BN_Head_00', neck: 'BN_Neck_02', back: 'BN_Spine_02', shoulder: 'BN_R_Clavicle', croup: 'BN_Pelvis', chest: 'BN_Spine_00', belly: 'BN_Stomach' };
export const NECK = 'BN_Neck_00';
// A trot made from the walk: each leg's swing moved in the cycle so the diagonal pairs (left fore with
// right hind, right fore with left hind) step together, half a cycle apart. The walk's swing peaks are
// at LF 0, RH 0.175, RF 0.425, LH 0.75 of its cycle (measured).
const TROT_SHIFT = { LF: 0, RH: -0.24, RF: 0.075, LH: -0.325 };

// Maple tree model along the racecourse infield ("Maple tree" by atrodler, Sketchfab CC BY 4.0).
const MAPLE_TREE = `${import.meta.env.BASE_URL}models/maple-tree.glb`;
const TREE_HEIGHT = 5.8; // metres, against a 1.6 m horse
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
 * Deep emerald-and-obsidian 3D Studio backdrop texture (matches Horse3D & HorseInjuryViewer studio aesthetic).
 */
function makeStudioBackdropTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, 1024);
  bg.addColorStop(0, '#02120d');
  bg.addColorStop(0.52, '#06271d');
  bg.addColorStop(1, '#020e0a');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 1024);

  const glow = g.createRadialGradient(512, 430, 30, 512, 430, 480);
  glow.addColorStop(0, 'rgba(20, 130, 92, 0.42)');
  glow.addColorStop(0.5, 'rgba(10, 72, 52, 0.16)');
  glow.addColorStop(1, 'rgba(2, 14, 10, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1024, 1024);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * High-precision 3D Studio Turntable & Biomechanics Calibration Dial floor texture.
 */
function makeStudioDialTexture(maxAniso = 8) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  const cx = 512;
  const cy = 512;

  // Radial spotlight glow on the studio floor
  const spot = g.createRadialGradient(cx, cy, 20, cx, cy, 480);
  spot.addColorStop(0, 'rgba(212, 175, 55, 0.22)');
  spot.addColorStop(0.32, 'rgba(16, 120, 86, 0.20)');
  spot.addColorStop(0.7, 'rgba(6, 42, 31, 0.08)');
  spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = spot;
  g.fillRect(0, 0, 1024, 1024);

  // Subtle concentric calibration rings
  const rings = [
    { r: 190, width: 1.5, color: 'rgba(212, 175, 55, 0.32)' },
    { r: 310, width: 2.5, color: 'rgba(212, 175, 55, 0.52)' },
    { r: 332, width: 1.2, color: 'rgba(52, 211, 153, 0.28)' },
    { r: 445, width: 1.5, color: 'rgba(212, 175, 55, 0.22)' },
  ];
  for (const ring of rings) {
    g.beginPath();
    g.arc(cx, cy, ring.r, 0, Math.PI * 2);
    g.strokeStyle = ring.color;
    g.lineWidth = ring.width;
    g.stroke();
  }

  // Precision degree tick marks around the main 310px ring
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const major = deg % 30 === 0;
    const mid = deg % 15 === 0;
    const r0 = 310;
    const r1 = major ? 330 : mid ? 323 : 317;
    g.beginPath();
    g.moveTo(cx + Math.cos(rad) * r0, cy + Math.sin(rad) * r0);
    g.lineTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
    g.strokeStyle = major ? 'rgba(250, 204, 21, 0.65)' : 'rgba(212, 175, 55, 0.28)';
    g.lineWidth = major ? 2.5 : 1.2;
    g.stroke();
  }

  // Subtle cross-hair biomechanics alignment axes
  g.strokeStyle = 'rgba(52, 211, 153, 0.16)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(cx - 440, cy);
  g.lineTo(cx + 440, cy);
  g.moveTo(cx, cy - 440);
  g.lineTo(cx, cy + 440);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * Streaming subtle grid strips under the turntable when the horse walks/trots in studio mode.
 */
function makeStudioMotionGridTexture(maxAniso = 8) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(52, 211, 153, 0.14)';
  g.lineWidth = 2;
  for (let x = 0; x < 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 40);
    g.lineTo(x, 472);
    g.stroke();
  }
  for (let y = 64; y <= 448; y += 128) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * Sleek 3D Equine Studio Showroom & Biomechanics Podium for HorseDetailPage (/horses/:id).
 * Matches the dark-emerald & gold studio aesthetic of Horse3D.jsx and HorseInjuryViewer.jsx
 * with zero cartoon buildings, fences, or roads.
 */
function createStudioBiomechanicsPodium(maxAniso) {
  const group = new THREE.Group();

  // Subtle physical podium base cylinder under the horse (no infinite horizon plane -> zero horizon line!)
  const plinthGeo = new THREE.CylinderGeometry(2.75, 2.95, 0.04, 64);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: '#041f16',
    roughness: 0.5,
    metalness: 0.2,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = -0.022;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Thin gold rim ring around the podium edge
  const rimGeo = new THREE.RingGeometry(2.72, 2.76, 64);
  const rimMat = new THREE.MeshBasicMaterial({
    color: '#d4af37',
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.002;
  group.add(rim);

  // Studio calibration dial disc
  const dialTex = makeStudioDialTexture(maxAniso);
  const dialGeo = new THREE.PlaneGeometry(5.5, 5.5);
  const dialMat = new THREE.MeshBasicMaterial({
    map: dialTex,
    transparent: true,
    depthWrite: false,
  });
  const dial = new THREE.Mesh(dialGeo, dialMat);
  dial.rotation.x = -Math.PI / 2;
  dial.position.y = 0.003;
  group.add(dial);

  // Streaming biomechanics treadmill grid inside the podium when the horse walks/trots
  const gridTex = makeStudioMotionGridTexture(maxAniso);
  gridTex.repeat.set(3, 1);
  const gridGeo = new THREE.PlaneGeometry(3.8, 1.8);
  const gridMat = new THREE.MeshBasicMaterial({
    map: gridTex,
    transparent: true,
    depthWrite: false,
  });
  const grid = new THREE.Mesh(gridGeo, gridMat);
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = 0.004;
  group.add(grid);

  const backdropTex = makeStudioBackdropTexture();

  return {
    group,
    backdropTex,
    scroll(travelled) {
      gridTex.offset.x = (travelled / 1.4) % 1;
    },
    dispose() {
      plinthGeo.dispose();
      plinthMat.dispose();
      rimGeo.dispose();
      rimMat.dispose();
      dialGeo.dispose();
      dialMat.dispose();
      dialTex.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      gridTex.dispose();
      backdropTex.dispose();
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
    // Keep the key sun at a crisp raking broadcast angle so both horse and white rail posts cast visible
    // shadows across the textured track while gently reflecting the session's time-of-day warmth.
    const day = (s.hour - 6) / 12;
    if (day > 0 && day < 1) {
      const arcX = -10.5 + 3.5 * day;
      const arcY = 8.8 + 3.4 * Math.sin(day * Math.PI);
      sun.position.set(arcX, arcY, -3.2);
    } else {
      sun.position.set(-7.5, 10.5, -2.8);
    }
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = skyTexture(s.sky, s.horizon);
    scene.fog.color.set(s.horizon);
    sun.color.set(s.sun[0]);
    sun.intensity = Math.max(2.15, s.sun[1] * 1.25);
    fill.color.set(s.fill[0]);
    fill.intensity = Math.max(0.65, s.fill[1] * 0.62);
    frontFill.intensity = day > 0 && day < 1 ? 0.82 : 0.58;
    for (const c of clouds?.children || []) c.material.color.set(s.clouds);
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
  };
  const ensureClouds = () => {
    if (clouds) return;
    clouds = new THREE.Group();
    const puff = cloudTexture();
    // Subtle high cirrus clouds well above the woodland horizon.
    for (let i = 0; i < 10; i += 1) {
      const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0.42, depthWrite: false, fog: false }));
      const a = (i / 10) * Math.PI * 2 + 0.35;
      const r = 42 + (i % 3) * 5;
      cloud.position.set(Math.cos(a) * r, 11.5 + (i % 3) * 1.6, Math.sin(a) * r);
      cloud.scale.set(11 + (i % 3) * 2.5, 3.6 + (i % 2) * 0.8, 1);
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

  let clubCourtyard = null;
  let courtyardCameraSet = false;
  const ensureClubCourtyard = () => {
    if (clubCourtyard) return;
    clubCourtyard = createStudioBiomechanicsPodium(maxAniso);
    world.add(clubCourtyard.group);
  };

  const applyStudioLighting = () => {
    if (!clubCourtyard) ensureClubCourtyard();
    if (scene.background && scene.background !== clubCourtyard.backdropTex && scene.background.isTexture) {
      scene.background.dispose();
    }
    scene.background = clubCourtyard.backdropTex;
    scene.fog.color.set('#02120d');
    sun.color.set('#fff6e5');
    sun.intensity = 2.9;
    sun.position.set(-4.5, 9.2, 4.5);
    fill.color.set('#a7f3d0');
    fill.intensity = 1.08;
    frontFill.intensity = 0.95;
  };

  const setPasture = (on) => {
    inPasture = on;
    dress();
    if (on) {
      ensureClubCourtyard();
      if (clouds) clouds.visible = false;
      applyStudioLighting();
    } else {
      if (fixedHour != null) ensureClouds();
      if (clouds) clouds.visible = fixedHour != null;
      if (fixedHour != null) showSky(performance.now());
      else plainSky();
    }
    applyScene();
  };

  const applyScene = () => {
    if (stand.position.lengthSq() > 0) {
      stand.position.set(0, 0, 0);
      stand.rotation.y = 0;
    }
    if (inPasture) {
      if (!courtyardCameraSet && view === 'free') {
        controls.target.set(0.0, 0.92, 0.0);
        camera.position.set(0.28, 1.38, 4.35);
        courtyardCameraSet = true;
      }
    } else if (view === 'side') {
      controls.target.copy(trackTarget);
      camera.position.copy(trackCamPos);
    }
    if (clubCourtyard) clubCourtyard.group.visible = inPasture;
    if (racecourseTrees) racecourseTrees.visible = !inPasture;
    curvedTrack.group.visible = !inPasture;
    hoofParticles.points.visible = !inPasture;
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
    } else if (mixer && targetKmh === 0 && actualKmh <= 0.35 && current !== actions[motion.clip || 'Idle']) {
      switchClip(motion.clip || 'Idle', motion.timeScale || 1, 0.45, motion.then);
    }

    // The ground streams back at the horse's actual smooth speed.
    const mps = actualKmh / 3.6;
    if (!reduceMotion) {
      travelled += mps * dt;
      if (inPasture && clubCourtyard) {
        clubCourtyard.scroll(travelled);
      } else {
        curvedTrack.scroll(travelled);
      }
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
      if (inPasture) {
        if (clouds) clouds.visible = false;
        applyStudioLighting();
        return;
      }
      if (fixedHour != null) ensureClouds();
      if (clouds) clouds.visible = fixedHour != null;
      if (fixedHour != null) {
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
      clubCourtyard?.dispose();
      hoofParticles.dispose();
      shadowTexture.dispose();
      checker.dispose();
      if (scene.background?.isTexture && scene.background !== clubCourtyard?.backdropTex) scene.background.dispose();
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
