import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MOVING_HORSE } from './horseMotion';
import {
  LEGS,
  HOLD,
  NECK,
  loadModel,
  makeTrot,
  skinnedBox,
  boneNamed,
  pastureSkyAt,
  vietnamHour,
  cloudTexture,
} from './horseStage';
import {
  SURFACE_PRESETS,
  createSurfaceMaps,
  createInfieldTexture,
  createTreelineBackdrop,
  createHoofParticles,
} from './trackSurfacePbr';

const TRACK_LENGTH = 76;
const TRACK_WIDTH = 10.6;
const TILE_M = 4.2;
const POST_EVERY = 3.2;
const FPS = 30;

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.46)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeSkyTexture(top, horizon) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, top);
  grad.addColorStop(0.6, horizon);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Shared single-WebGL-context panoramic racetrack displaying ALL concurrent running horses
 * side-by-side in parallel lanes (using SkeletonUtils.clone), with upgraded PBR surfaces,
 * hoof kickback dust, smooth multi-gait deceleration, and 4-stage injury choreography.
 */
export function createMultiTrackStage(canvas, { onProject } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color('#bcd7e6');
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, 18, 52);

  const fill = new THREE.HemisphereLight('#e8f2ff', '#5b4a35', 1.35);
  scene.add(fill);
  const sun = new THREE.DirectionalLight('#fff4de', 2.25);
  sun.position.set(5, 11, 8);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(27, 16 / 5, 0.1, 120);
  const target = new THREE.Vector3(0, 0.9, 0);
  camera.position.set(0, 2.75, 11.2);
  camera.lookAt(target);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.72;
  controls.maxPolarAngle = 1.48;
  controls.minAzimuthAngle = -0.6;
  controls.maxAzimuthAngle = 0.6;

  const world = new THREE.Group();
  scene.add(world);

  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
  let surfaceKind = null;
  let surfaceMaps = null;

  const track = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_LENGTH, TRACK_WIDTH),
    new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02, bumpScale: 0.07 }),
  );
  track.rotation.x = -Math.PI / 2;
  world.add(track);

  // Subtle dashed white lane dividers so each concurrent horse reads cleanly in its own lane.
  const laneLines = new THREE.Group();
  world.add(laneLines);
  const laneMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.2, depthWrite: false });
  const laneGeo = new THREE.PlaneGeometry(TRACK_LENGTH, 0.06);

  // Far inner rail, curb, and soft rail ground shadow.
  const railZ = -TRACK_WIDTH / 2 + 0.12;
  const curb = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_LENGTH, 0.09, 0.15),
    new THREE.MeshStandardMaterial({ color: '#ece9e2', roughness: 0.78 }),
  );
  curb.position.set(0, 0.04, railZ - 0.12);
  world.add(curb);

  const railShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_LENGTH, 0.75),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.14, depthWrite: false }),
  );
  railShadow.rotation.x = -Math.PI / 2;
  railShadow.position.set(0, 0.008, railZ + 0.25);
  world.add(railShadow);

  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.58 });
  const postCount = Math.ceil(TRACK_LENGTH / POST_EVERY);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.085, 1.08, 0.085), white, postCount);
  world.add(posts);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(TRACK_LENGTH, 0.075, 0.075), white);
  rail.position.set(0, 1.02, railZ);
  world.add(rail);

  const placePosts = (travelled) => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < postCount; i += 1) {
      const x = ((((i * POST_EVERY - travelled) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH) - TRACK_LENGTH / 2;
      m.makeTranslation(x, 0.54, railZ);
      posts.setMatrixAt(i, m);
    }
    posts.instanceMatrix.needsUpdate = true;
  };
  placePosts(0);

  // Textured green infield behind the rail + distant rolling treeline silhouette.
  const infieldTex = createInfieldTexture(maxAniso);
  infieldTex.repeat.set(TRACK_LENGTH / 6, 46 / 6);
  const infield = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_LENGTH, 46),
    new THREE.MeshStandardMaterial({ map: infieldTex, roughness: 0.96 }),
  );
  infield.rotation.x = -Math.PI / 2;
  infield.position.set(0, -0.012, -TRACK_WIDTH / 2 - 22.8);
  world.add(infield);

  const treeline = createTreelineBackdrop(TRACK_LENGTH + 40);
  treeline.group.position.z = -4;
  scene.add(treeline.group);

  // Soft sky clouds.
  const puffTex = cloudTexture();
  const clouds = new THREE.Group();
  for (let i = 0; i < 8; i += 1) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, fog: false }));
    c.position.set(-28 + i * 9, 8.5 + (i % 3) * 1.4, -30 - (i % 2) * 5);
    c.scale.set(9.5 + (i % 3) * 2, 4.2 + (i % 2), 1);
    clouds.add(c);
  }
  scene.add(clouds);

  const hoofParticles = createHoofParticles(150);
  world.add(hoofParticles.points);

  const shadowTexture = makeShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(2.5, 0.9);
  const markerGeo = new THREE.RingGeometry(0.12, 0.18, 28);
  const haloGeo = new THREE.RingGeometry(0.24, 0.36, 28);

  let gltfAsset = null;
  let trotClip = null;
  let disposed = false;
  let fixedHour = null;
  let skyKey = null;

  const applySky = () => {
    const s = pastureSkyAt(fixedHour ?? vietnamHour());
    if (s.key === skyKey) return;
    skyKey = s.key;
    const day = (s.hour - 6) / 12;
    if (day > 0 && day < 1) sun.position.set(-10 * Math.cos(day * Math.PI), 3 + 9 * Math.sin(day * Math.PI), 8);
    else sun.position.set(5, 11, 8);
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = makeSkyTexture(s.sky, s.horizon);
    scene.fog.color.set(s.horizon);
    sun.color.set(s.sun[0]);
    sun.intensity = s.sun[1];
    fill.color.set(s.fill[0]);
    fill.intensity = s.fill[1];
    for (const c of clouds.children) c.material.color.set(s.clouds);
  };
  applySky();

  // Map<id, HorseEntry>
  const entries = new Map();
  let pendingSpecs = [];

  const lateral = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  const invTmp = new THREE.Matrix4();
  const swing = (bone, angle) => {
    if (!bone || !bone.parent) return;
    lateral.set(0, 0, 1);
    invTmp.copy(bone.parent.matrixWorld).invert();
    const axis = lateral.transformDirection(invTmp);
    const sign = bone.parent.matrixWorld.determinant() < 0 ? -1 : 1;
    bone.quaternion.premultiply(qTmp.setFromAxisAngle(axis, angle * sign));
  };

  const paintHorse = (mesh, coat) => {
    if (!mesh || !coat) return;
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.material.name === MOVING_HORSE.coatMaterials.body) {
        o.material.color.setRGB(...coat.body);
        if (coat.roughness) o.material.roughness = coat.roughness;
      } else if (o.material.name === MOVING_HORSE.coatMaterials.hair) {
        o.material.color.setRGB(...coat.hair);
      }
    });
  };

  const switchEntryClip = (entry, clipName, timeScale = 1, fade = 0.35) => {
    const name = clipName && entry.actions[clipName] ? clipName : 'Idle';
    const next = entry.actions[name];
    if (!next) return;
    next.timeScale = timeScale || 1;
    if (entry.current === next) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    if (entry.current) entry.current.crossFadeTo(next, fade, false);
    entry.current = next;
  };

  const createEntry = (spec) => {
    const stand = new THREE.Group();
    const blob = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    stand.add(blob);

    const mesh = cloneSkinned(gltfAsset.scene);
    mesh.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.material = o.material.clone();
      }
    });
    const size = skinnedBox(mesh).getSize(new THREE.Vector3());
    mesh.scale.setScalar(1.62 / size.y);
    const head = boneNamed(mesh, 'BN_Head');
    mesh.updateMatrixWorld(true);
    if (head) {
      const c = skinnedBox(mesh).getCenter(new THREE.Vector3());
      const h = head.getWorldPosition(new THREE.Vector3()).sub(c);
      mesh.rotation.y = Math.PI / 2 - Math.atan2(h.x, h.z);
    }
    const b2 = skinnedBox(mesh);
    const c2 = b2.getCenter(new THREE.Vector3());
    mesh.position.set(-c2.x, -b2.min.y, -c2.z);
    const baseY = mesh.position.y;
    stand.add(mesh);

    const bones = {};
    const rest = new Map();
    for (const [leg, def] of Object.entries(LEGS)) {
      bones[leg] = {};
      for (const key of ['upper', 'stifle', 'knee', 'fetlock', 'hoof']) if (def[key]) bones[leg][key] = boneNamed(mesh, def[key]);
      for (const key of ['upper', 'stifle', 'knee', 'fetlock']) if (bones[leg][key]) rest.set(bones[leg][key], bones[leg][key].quaternion.clone());
    }
    bones.neck = boneNamed(mesh, NECK);
    if (bones.neck) rest.set(bones.neck, bones.neck.quaternion.clone());

    const mixer = new THREE.AnimationMixer(mesh);
    const actions = {};
    for (const clip of gltfAsset.animations) actions[clip.name] = mixer.clipAction(clip);
    if (trotClip) actions.Trot = mixer.clipAction(trotClip);

    const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.92, depthTest: false }));
    marker.visible = false;
    marker.renderOrder = 10;
    scene.add(marker);

    const groundHalo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthWrite: false }));
    groundHalo.rotation.x = -Math.PI / 2;
    groundHalo.position.y = 0.022;
    groundHalo.visible = false;
    world.add(groundHalo);

    world.add(stand);

    const entry = {
      id: spec.id,
      stand,
      blob,
      mesh,
      baseY,
      bones,
      rest,
      mixer,
      actions,
      current: null,
      marker,
      groundHalo,
      coatKey: null,
      motion: spec.motion || { clip: 'Idle', kmh: 0 },
      actualKmh: Number(spec.motion?.kmh) || 0,
      holdBlend: spec.motion?.hold && !(Number(spec.motion?.kmh) > 0) ? 1 : 0,
      stumbleTimer: 0,
      prevInjuryPhase: null,
      targetX: 0,
      targetZ: 0,
      phaseOffset: Math.random() * 0.6,
    };

    paintHorse(mesh, spec.coat);
    entry.coatKey = spec.coat?.key;
    switchEntryClip(entry, entry.motion.clip, entry.motion.timeScale || 1, 0.15);
    if (entry.current) entry.current.time = entry.phaseOffset;
    return entry;
  };

  const disposeEntry = (entry) => {
    entry.mixer.stopAllAction();
    world.remove(entry.stand);
    world.remove(entry.groundHalo);
    scene.remove(entry.marker);
    entry.blob.material.dispose();
    entry.marker.material.dispose();
    entry.groundHalo.material.dispose();
    entry.mesh.traverse((o) => {
      if (o.isSkinnedMesh) o.material?.dispose?.();
    });
  };

  const rebuildLaneLines = (count) => {
    while (laneLines.children.length) laneLines.remove(laneLines.children[0]);
    if (count < 2) return;
    const span = Math.min(6.4, count * 2.0);
    const step = span / count;
    const startZ = -span / 2;
    for (let i = 1; i < count; i += 1) {
      const line = new THREE.Mesh(laneGeo, laneMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.01, startZ + i * step);
      laneLines.add(line);
    }
  };

  const syncHorses = (specs) => {
    pendingSpecs = specs || [];
    if (!gltfAsset || disposed) return;

    const shown = pendingSpecs.slice(0, 5);
    const keepIds = new Set(shown.map((s) => String(s.id)));

    for (const [id, entry] of entries.entries()) {
      if (!keepIds.has(id)) {
        disposeEntry(entry);
        entries.delete(id);
      }
    }

    const n = shown.length;
    rebuildLaneLines(n);
    const zSpan = n <= 1 ? 0 : Math.min(5.2, (n - 1) * 1.9);
    // Spread horses cleanly left-to-right across the wide panoramic frame so neither horses nor floating pills overlap.
    const xSpan = n <= 1 ? 0 : Math.min(13.2, (n - 1) * 5.4);
    const avgPct = n ? shown.reduce((acc, s) => acc + (Number(s.pct) || 0), 0) / n : 50;

    shown.forEach((spec, idx) => {
      const id = String(spec.id);
      let entry = entries.get(id);
      const isNew = !entry;
      if (!entry) {
        entry = createEntry(spec);
        entries.set(id, entry);
      }
      if (spec.coat?.key && spec.coat.key !== entry.coatKey) {
        paintHorse(entry.mesh, spec.coat);
        entry.coatKey = spec.coat.key;
      }
      entry.motion = spec.motion || { clip: 'Idle', kmh: 0 };
      const nextPhase = entry.motion.injuryPhase || null;
      if (nextPhase === 'stumble' && entry.prevInjuryPhase !== 'stumble') {
        entry.stumbleTimer = 1.15;
        hoofParticles.burst(entry.stand.position.x + 0.35, entry.stand.position.z, 22);
      }
      entry.prevInjuryPhase = nextPhase;

      // Distinct parallel lane + wide horizontal staging (order left-to-right matches the tiles right underneath!).
      const frac = n <= 1 ? 0.5 : idx / (n - 1);
      entry.targetZ = (0.5 - frac) * zSpan;
      const pctNudge = Math.max(-0.55, Math.min(0.55, ((Number(spec.pct) || 0) - avgPct) * 0.025));
      entry.targetX = (frac - 0.5) * xSpan + pctNudge;

      if (isNew) {
        entry.stand.position.set(entry.targetX, 0, entry.targetZ);
      }
      if (!((Number(entry.motion.kmh) || 0) === 0 && entry.actualKmh > 0.5)) {
        switchEntryClip(entry, entry.motion.clip, entry.motion.timeScale || 1, 0.32);
      }
    });

    // Pull camera back gently when 4–5 horses run concurrently so all lanes fit with headroom.
    const camZ = n >= 4 ? 13.0 : n === 3 ? 11.4 : 10.6;
    const camY = n >= 4 ? 3.2 : 2.75;
    camera.position.set(camera.position.x, camY, camZ);
  };

  const ready = loadModel().then((gltf) => {
    if (disposed) return;
    gltfAsset = gltf;
    const walk = gltf.animations.find((c) => c.name === 'Walk');
    if (walk) trotClip = makeTrot(walk);
    syncHorses(pendingSpecs);
  });

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let travelled = 0;
  let last = performance.now();
  let raf = 0;
  let visible = true;
  let width = 1;
  let height = 1;
  const projVec = new THREE.Vector3();

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

    // Determine shared ground scroll speed from the fastest active horse (smooth pack pace).
    let packKmh = 0;
    for (const entry of entries.values()) {
      const targetKmh = Number(entry.motion.kmh) || 0;
      if (reduceMotion) {
        entry.actualKmh = targetKmh;
      } else if (targetKmh < entry.actualKmh) {
        const decel = entry.motion.injuryPhase ? Math.max(4.5, entry.actualKmh * 0.55) : Math.max(3.6, entry.actualKmh * 0.52);
        entry.actualKmh = Math.max(targetKmh, entry.actualKmh - decel * dt);
        if (targetKmh === 0 && entry.actualKmh < 0.35) entry.actualKmh = 0;
      } else if (targetKmh > entry.actualKmh) {
        const accel = Math.max(8, (targetKmh - entry.actualKmh) * 1.4);
        entry.actualKmh = Math.min(targetKmh, entry.actualKmh + accel * dt);
      }
      if (entry.actualKmh > packKmh) packKmh = entry.actualKmh;
    }

    const packMps = packKmh / 3.6;
    if (!reduceMotion) {
      travelled += packMps * dt;
      if (surfaceMaps) surfaceMaps.setOffsetX((travelled / TILE_M) % 1);
      infieldTex.offset.x = (travelled / 6) % 1;
      treeline.setOffsetX(((travelled * 0.01) % 1 + 1) % 1);
      placePosts(travelled);
      for (const c of clouds.children) c.position.x = ((c.position.x + dt * 0.32 + 38) % 76) - 38;
    }

    const projected = {};
    for (const entry of entries.values()) {
      const targetKmh = Number(entry.motion.kmh) || 0;
      const braking = targetKmh === 0 && entry.actualKmh > 0.35;
      if (entry.stumbleTimer > 0) entry.stumbleTimer = Math.max(0, entry.stumbleTimer - dt);

      // Smoothly ease each horse's lane position (x stagger & z lane)
      entry.stand.position.x += (entry.targetX - entry.stand.position.x) * Math.min(1, dt * 1.8);
      entry.stand.position.z += (entry.targetZ - entry.stand.position.z) * Math.min(1, dt * 2.5);

      if (braking) {
        if (entry.motion.injuryPhase || entry.motion.limp) {
          switchEntryClip(entry, 'Walk', Math.min(1.15, Math.max(0.45, entry.actualKmh / 9)), 0.3);
        } else if (entry.actualKmh > 22) {
          switchEntryClip(entry, 'Gallop', Math.min(1.15, Math.max(0.54, entry.actualKmh / 48)), 0.3);
        } else if (entry.actualKmh > 9.5) {
          switchEntryClip(entry, 'Trot', Math.min(1.45, Math.max(0.72, entry.actualKmh / 13)), 0.35);
        } else if (entry.actualKmh > 0.6) {
          switchEntryClip(entry, 'Walk', Math.min(1.25, Math.max(0.52, entry.actualKmh / 6.5)), 0.35);
        }
      } else if (targetKmh === 0 && entry.actualKmh <= 0.35 && entry.current !== entry.actions[entry.motion.clip || 'Idle']) {
        switchEntryClip(entry, entry.motion.clip || 'Idle', entry.motion.timeScale || 1, 0.45);
      }

      if (!reduceMotion && entry.actualKmh > 5) {
        hoofParticles.emitForHorse(entry.stand.position.x, entry.stand.position.z, entry.actualKmh, dt);
      }

      for (const [bone, quaternion] of entry.rest) bone.quaternion.copy(quaternion);
      entry.mixer.update(dt);
      entry.mesh.updateMatrixWorld(true);

      const phase = entry.current ? (entry.current.time / entry.current.getClip().duration) % 1 : 0;
      const leg = LEGS[entry.motion.leg] ? entry.motion.leg : 'RF';
      const fore = leg.endsWith('F');
      const rightSide = leg.startsWith('R');
      const sore = entry.bones[leg] || {};

      let targetRoll = 0;
      let targetPitch = 0;
      if (entry.stumbleTimer > 0) {
        const k = Math.sin((entry.stumbleTimer / 1.15) * Math.PI);
        targetRoll = (rightSide ? -0.09 : 0.09) * k;
        targetPitch = (fore ? -0.08 : 0.06) * k;
        swing(entry.bones.neck, 0.38 * k);
      } else if ((entry.motion.limp || (braking && entry.motion.injuryPhase)) && entry.actualKmh > 0.6) {
        const stepImpact = Math.max(0, Math.sin(phase * Math.PI * 2));
        targetRoll = (rightSide ? -0.055 : 0.055) * stepImpact;
      }
      entry.stand.rotation.x += (targetRoll - entry.stand.rotation.x) * Math.min(1, dt * 8);
      entry.stand.rotation.z += (targetPitch - entry.stand.rotation.z) * Math.min(1, dt * 8);

      if ((entry.motion.limp || (braking && entry.motion.injuryPhase)) && entry.actualKmh > 0.5) {
        for (const key of ['upper', 'stifle', 'knee', 'fetlock']) if (sore[key]) sore[key].quaternion.slerp(entry.rest.get(sore[key]), 0.62);
        swing(entry.bones.neck, (fore ? 0.34 : -0.18) * Math.max(0, Math.sin(phase * Math.PI * 2)));
      }

      const wantHold = Boolean(entry.motion.hold && entry.actualKmh < 1.2);
      entry.holdBlend += ((wantHold ? 1 : 0) - entry.holdBlend) * Math.min(1, dt * (wantHold ? 3.2 : 5));
      if (entry.holdBlend > 0.01) {
        for (const [key, angle] of Object.entries(fore ? HOLD.fore : HOLD.hind)) swing(sore[key], angle * entry.holdBlend);
      }

      if (braking && !entry.motion.injuryPhase && entry.actualKmh > 6) {
        swing(entry.bones.neck, 0.14 * Math.min(1, entry.actualKmh / 35));
      } else if (entry.actualKmh <= 0.5 && entry.current === entry.actions.Idle) {
        const breathRate = entry.motion.hold || entry.motion.injuryPhase ? 2.6 : 1.3;
        const breathAmp = entry.motion.hold || entry.motion.injuryPhase ? 0.045 : 0.02;
        swing(entry.bones.neck, Math.sin((now / 1000) * breathRate) * breathAmp - (entry.motion.hold ? 0.08 : 0));
      }

      entry.mesh.position.y = entry.current === entry.actions.Trot ? entry.baseY + 0.035 * Math.abs(Math.sin(phase * Math.PI * 2)) : entry.baseY;
      if (entry.motion.tired) swing(entry.bones.neck, -(0.45 + 0.1 * Math.sin(phase * Math.PI * 4)));

      const spot = sore.hoof;
      entry.marker.visible = Boolean(entry.motion.marker && spot);
      entry.groundHalo.visible = entry.marker.visible;
      if (entry.marker.visible) {
        entry.mesh.updateMatrixWorld(true);
        spot.getWorldPosition(entry.marker.position);
        entry.marker.quaternion.copy(camera.quaternion);
        entry.marker.scale.setScalar(1 + 0.28 * Math.sin(now / (entry.stumbleTimer > 0 ? 110 : 180)));
        entry.marker.material.color.set(entry.stumbleTimer > 0 ? '#f97316' : '#ef4444');
        entry.groundHalo.position.set(entry.marker.position.x, 0.022, entry.marker.position.z);
        entry.groundHalo.scale.setScalar(0.95 + 0.25 * Math.sin(now / 220));
        entry.groundHalo.material.color.set(entry.stumbleTimer > 0 ? '#f97316' : '#ef4444');
      }

      // Project floating label anchor just above the horse's neck/withers.
      projVec.set(entry.stand.position.x + 0.25, 2.02, entry.stand.position.z);
      projVec.project(camera);
      projected[entry.id] = {
        x: (projVec.x * 0.5 + 0.5) * width,
        y: (-projVec.y * 0.5 + 0.5) * height,
        visible: projVec.z < 1,
      };
    }

    if (!reduceMotion) hoofParticles.update(dt, packMps);
    renderer.render(scene, camera);
    onProject?.(projected);
  };
  raf = requestAnimationFrame(frame);

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(canvas);

  return {
    ready,
    setHorses: syncHorses,
    setHour(hour) {
      fixedHour = Number.isFinite(hour) ? hour : null;
      skyKey = null;
      applySky();
    },
    setSurface(kind) {
      const next = SURFACE_PRESETS[kind] ? kind : 'dirt';
      if (next === surfaceKind) return;
      surfaceKind = next;
      surfaceMaps?.dispose();
      surfaceMaps = createSurfaceMaps(next, maxAniso);
      surfaceMaps.setRepeat(TRACK_LENGTH / TILE_M, TRACK_WIDTH / TILE_M);
      track.material.map = surfaceMaps.map;
      track.material.bumpMap = surfaceMaps.bumpMap;
      track.material.bumpScale = surfaceMaps.preset.bumpScale;
      track.material.roughnessMap = surfaceMaps.roughnessMap;
      track.material.roughness = surfaceMaps.preset.roughness;
      track.material.needsUpdate = true;
      hoofParticles.setSurface(next);
    },
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      controls.dispose();
      for (const entry of entries.values()) disposeEntry(entry);
      entries.clear();
      surfaceMaps?.dispose();
      infieldTex.dispose();
      treeline.dispose();
      hoofParticles.dispose();
      shadowTexture.dispose();
      shadowGeo.dispose();
      markerGeo.dispose();
      haloGeo.dispose();
      laneGeo.dispose();
      laneMat.dispose();
      puffTex.dispose();
      if (scene.background?.isTexture) scene.background.dispose();
      scene.traverse((o) => {
        if (o.isSkinnedMesh) return;
        o.geometry?.dispose?.();
        if (o.material) o.material.dispose?.();
      });
      renderer.dispose();
    },
  };
}
