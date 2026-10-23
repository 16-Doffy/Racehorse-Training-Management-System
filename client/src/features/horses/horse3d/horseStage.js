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
// after a human arm, one joint off: on the right foreleg UpperArm turns at the elbow (0.9 m up),
// Forearm at the knee (0.48 m), Hand at the fetlock (0.22 m), Toe_047_0 is the hoof.
const LEG = { elbow: 'BN_R_UpperArm', knee: 'BN_R_Forearm', fetlock: 'BN_R_Hand', hoof: 'BN_R_Toe_047_0' };
const NECK = 'BN_Neck_00';

let model = null;
function loadModel() {
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

function surfaceTexture(kind) {
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
function makeGrass(time) {
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

/** The bounds of a skinned model as posed (Box3 alone ignores the bones), from a sample of its vertices. */
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

/** The bone whose name starts with `prefix` (the exporter adds numbers after the names). */
const boneNamed = (root, prefix) => {
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
  scene.add(new THREE.HemisphereLight('#e8f2ff', '#5b4a35', 1.3));
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
  world.add(blob);
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
  // The pasture's long grass: made the first time the pasture is shown, then only hidden or shown.
  let grass = null;
  const grassTime = { value: 0 };

  // The sore leg: a pulsing red ring at its hoof.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.16, 32), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.9, depthTest: false }));
  marker.visible = false;
  marker.renderOrder = 10;
  scene.add(marker);

  let horse = null;
  let mixer = null;
  const actions = {};
  let current = null;
  let motion = { clip: 'Idle' };
  let coat = null;
  const bones = {};
  const rest = new Map();
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
    world.add(horse);
    for (const [key, prefix] of Object.entries(LEG)) bones[key] = boneNamed(horse, prefix);
    bones.neck = boneNamed(horse, NECK);
    for (const bone of Object.values(bones)) if (bone) rest.set(bone, bone.quaternion.clone());
    mixer = new THREE.AnimationMixer(horse);
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    mixer.addEventListener('finished', (e) => {
      if (e.action === current && motion.then && actions[motion.then]) {
        const next = actions[motion.then];
        next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
        current.crossFadeTo(next, 0.4, false);
        current = next;
      }
    });
    paint();
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
    if (!reduceMotion && view === 'side') {
      travelled += ((motion.kmh || 0) / 3.6) * dt;
      if (trackTexture) trackTexture.offset.x = (travelled / TILE_M) % 1;
      placePosts(travelled);
      if (grass) grass.position.x = -(travelled % GRASS_PATCH);
    }
    if (grass?.visible && !reduceMotion) grassTime.value = now / 1000;
    if (mixer) {
      // Bones a clip doesn't drive keep what they were given last frame: start each frame from rest,
      // so the bends below are applied once, not added up frame after frame.
      for (const [bone, quaternion] of rest) bone.quaternion.copy(quaternion);
      mixer.update(dt);
      horse.updateMatrixWorld(true);
      const phase = current ? (current.time / current.getClip().duration) % 1 : 0;
      // A lame foreleg: stiff (held near its rest pose), the head nodding up as it lands.
      if (motion.limp) {
        for (const key of ['elbow', 'knee', 'fetlock']) if (bones[key]) bones[key].quaternion.slerp(rest.get(bones[key]), 0.55);
        swing(bones.neck, 0.3 * Math.max(0, Math.sin(phase * Math.PI * 2)));
      }
      // The sore leg held off the ground, the knee folded.
      if (motion.hold) {
        swing(bones.elbow, 0.25);
        swing(bones.knee, -1.5);
        swing(bones.fetlock, -0.6);
      }
      // A tired horse carries its head low and nods heavily with each stride.
      if (motion.tired) swing(bones.neck, -(0.45 + 0.1 * Math.sin(phase * Math.PI * 4)));
      const hoof = bones.hoof || bones.knee;
      marker.visible = Boolean(motion.marker && hoof);
      if (marker.visible) {
        horse.updateMatrixWorld(true);
        hoof.getWorldPosition(marker.position);
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
      play();
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
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      controls.dispose();
      mixer?.stopAllAction();
      trackTexture?.dispose();
      shadowTexture.dispose();
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
