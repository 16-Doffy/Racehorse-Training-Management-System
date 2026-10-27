import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  boneNamed,
  checkerTexture,
  cloudTexture,
  loadModel,
  makeBarn,
  makeTree,
  makeTrot,
  pastureSkyAt,
  skinnedBox,
  skyTexture,
  surfaceTexture,
  vietnamHour,
} from '../../horses/horse3d/horseStage';
import { MOVING_HORSE, gaitAt } from '../../horses/horse3d/horseMotion';

/**
 * The training oval on the Head Trainer's home page (Track3D.jsx). Every horse out on a session runs
 * round it in its own coat, at the share of its course the sensors say it has run (one lap for any
 * course, as the drawn oval before it did) and in the gait of its speed; the horses booked today and not
 * out wait in the infield by the finish post. The model, sky, surfaces and scenery are the moving
 * horse's (horseStage.js), so the two scenes look alike and the model loads once.
 *
 * World: metres, the oval's middle at the origin, its straights along x. The home straight with the
 * finish post is on +z, towards the stands the camera looks from; horses run anticlockwise seen from
 * above. A diorama, not a real track: a real oval is ten times longer and its horses would be specks.
 */

const STRAIGHT = 30; // each straight
const RADIUS = 13; // the bends, to the middle of the track
const WIDTH = 7;
const HALF = STRAIGHT / 2;
const FINISH_X = HALF - 5; // on the home straight, a little before the first bend
const BEND = Math.PI * RADIUS;
const LAP = 2 * STRAIGHT + 2 * BEND;
const RAIL_GAP = 0.3; // the rails stand this far off the track's edges
const HORSE_SCALE = 2.8; // larger than life, so a horse reads from the stands
const LANE = 2; // between horses side by side
// Horses waiting: in rows in the infield, along the home straight from the finish post back, far enough
// apart that their names do not run into each other.
const PARKED = { cols: 3, step: 8, rows: [RADIUS - WIDTH / 2 - 3.4, RADIUS - WIDTH / 2 - 9.8, RADIUS - WIDTH / 2 - 16.2] };
const MAX_PARKED = PARKED.cols * PARKED.rows.length;
// A reading comes every 5 s: a horse covers the way to the latest one in a little less, so it keeps moving.
const READING_SEC = 4.5;
const FPS = 30;
const IDLE_CLIPS = ['Idle', 'Idle_Look', 'Eat'];
// The far side: the stable block, and trees round the back and the ends (none between the stands and the track).
const BARNS = [[-16, -RADIUS - WIDTH / 2 - 14], [0, -RADIUS - WIDTH / 2 - 14]];
const TREES = [[-42, -4], [-38, -16], [-30, -26], [-24, -38], [12, -34], [20, -28], [30, -24], [38, -14], [42, -2], [-46, 8], [46, 10], [4, -42]];
const LABEL_STYLE =
  'display:none;position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;font:600 11px/1.3 Inter,system-ui,sans-serif;color:#FAF8F5;' +
  'background:rgba(1,17,12,.74);border:1px solid rgba(255,255,255,.16);border-radius:4px;padding:2px 6px;text-align:center';

/** The middle of the track at a share of the lap (0 = 1 = the finish line), and the way it runs there (tx, tz). */
function pointAt(share) {
  let d = (((share % 1) + 1) % 1) * LAP;
  if (d < HALF - FINISH_X) return { x: FINISH_X + d, z: RADIUS, tx: 1, tz: 0 };
  d -= HALF - FINISH_X;
  if (d < BEND) {
    const a = Math.PI / 2 - d / RADIUS;
    return { x: HALF + RADIUS * Math.cos(a), z: RADIUS * Math.sin(a), tx: Math.sin(a), tz: -Math.cos(a) };
  }
  d -= BEND;
  if (d < STRAIGHT) return { x: HALF - d, z: -RADIUS, tx: -1, tz: 0 };
  d -= STRAIGHT;
  if (d < BEND) {
    const a = -Math.PI / 2 - d / RADIUS;
    return { x: -HALF + RADIUS * Math.cos(a), z: RADIUS * Math.sin(a), tx: Math.sin(a), tz: -Math.cos(a) };
  }
  d -= BEND;
  return { x: -HALF + d, z: RADIUS, tx: 1, tz: 0 };
}

/** The point `offset` metres out from the middle of the track at a share of the lap (negative: towards the infield). */
function offsetAt(share, offset) {
  const p = pointAt(share);
  return new THREE.Vector3(p.x - p.tz * offset, 0, p.z + p.tx * offset);
}

/** The track: a flat ring from `inner` to `outer` metres off its middle, its texture running along it. */
function ringGeometry(inner, outer, tile) {
  const samples = 240;
  const position = [];
  const uv = [];
  const index = [];
  for (let i = 0; i <= samples; i += 1) {
    const a = offsetAt(i / samples, inner);
    const b = offsetAt(i / samples, outer);
    position.push(a.x, 0, a.z, b.x, 0, b.z);
    const u = ((i / samples) * LAP) / tile;
    uv.push(u, 0, u, (outer - inner) / tile);
    if (i < samples) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** The infield: everything inside the track's inner edge (`edge` metres off its middle), a fan from the centre. */
function infieldGeometry(edge, tile) {
  const samples = 120;
  const position = [0, 0, 0];
  const uv = [0, 0];
  const index = [];
  for (let i = 0; i <= samples; i += 1) {
    const p = offsetAt(i / samples, edge);
    position.push(p.x, 0, p.z);
    uv.push(p.x / tile, p.z / tile);
    if (i < samples) index.push(0, i + 1, i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A white running rail `offset` metres off the track's middle: the top rail all the way round, posts every 3 m. */
function makeRail(offset, material) {
  const rail = new THREE.Group();
  const points = [];
  for (let i = 0; i < 160; i += 1) points.push(offsetAt(i / 160, offset).setY(1.05));
  rail.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 320, 0.07, 6, true), material));
  const count = Math.round(LAP / 3);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i += 1) {
    const p = offsetAt(i / count, offset);
    posts.setMatrixAt(i, m.makeTranslation(p.x, 0.55, p.z));
  }
  rail.add(posts);
  return rail;
}

/**
 * Builds the oval on a canvas, its horses' names in `labelLayer` (an element over the canvas). Returns
 * { ready (a promise), setRunners, setFocus, resize, dispose }.
 */
export function createTrackStage(canvas, labelLayer) {
  // Light, as the moving horse's stage: no real-time shadows, at most 1.5x the screen's pixels, FPS frames a second.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const frameSize = { width: 1, height: 1 };

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#d4e8f4', 130, 340);
  const fill = new THREE.HemisphereLight('#e8f2ff', '#5b4a35', 1.3);
  const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
  scene.add(fill, sun);

  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 1, 700);
  const target = new THREE.Vector3(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.rotateSpeed = 0.6;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.3;
  // On a touch screen a drag scrolls the page, as everywhere else on it; turning the oval is for a mouse.
  if (window.matchMedia?.('(pointer: coarse)').matches) {
    controls.enabled = false;
    canvas.style.touchAction = 'auto';
  }

  // The ground, the infield in turf, the track in dirt, the rails, the finish post.
  const textures = [];
  const dirt = surfaceTexture('dirt');
  const turf = surfaceTexture('turf');
  const checker = checkerTexture();
  textures.push(dirt, turf, checker);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: '#467536', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  const innerEdge = -WIDTH / 2;
  const track = new THREE.Mesh(ringGeometry(innerEdge, WIDTH / 2, 4), new THREE.MeshStandardMaterial({ map: dirt, roughness: 0.95 }));
  const infield = new THREE.Mesh(infieldGeometry(innerEdge, 6), new THREE.MeshStandardMaterial({ map: turf, roughness: 1 }));
  infield.position.y = -0.01;
  const white = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.6 });
  const inside = innerEdge - RAIL_GAP;
  scene.add(ground, track, infield, makeRail(inside, white), makeRail(WIDTH / 2 + RAIL_GAP, white));

  const finish = new THREE.Group();
  const postZ = RADIUS + inside - 0.4;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4, 8), white);
  pole.position.set(FINISH_X, 2, postZ);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: checker, side: THREE.DoubleSide }));
  board.position.set(FINISH_X, 3.9, postZ + 0.1);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.35, WIDTH), new THREE.MeshBasicMaterial({ color: '#f4f2ec' }));
  line.rotation.x = -Math.PI / 2;
  line.position.set(FINISH_X, 0.015, RADIUS);
  finish.add(pole, board, line);
  // The quarter poles, red, on the inner rail: how far round a horse is at a glance.
  const red = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.6 });
  for (const share of [0.25, 0.5, 0.75]) {
    const p = offsetAt(share, inside - 0.4);
    const quarter = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8), red);
    quarter.position.set(p.x, 1.1, p.z);
    finish.add(quarter);
  }
  scene.add(finish);

  // The stable block across the track, trees round it, clouds; the sky of the hour in Vietnam.
  for (const [x, z] of BARNS) {
    const barn = makeBarn();
    barn.scale.setScalar(1.4);
    barn.position.set(x, 0, z);
    scene.add(barn);
  }
  TREES.forEach(([x, z], i) => {
    const { tree } = makeTree();
    tree.scale.setScalar(1.5 + (i % 3) * 0.25);
    tree.position.set(x, 0, z);
    scene.add(tree);
  });
  const puff = cloudTexture();
  textures.push(puff);
  const cloudMaterial = new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, fog: false });
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Sprite(cloudMaterial);
    const a = (i / 10) * Math.PI * 2 + 0.3;
    cloud.position.set(Math.cos(a) * 150, 45 + (i % 3) * 8, Math.sin(a) * 150);
    cloud.scale.set(46 + (i % 3) * 8, 20, 1);
    scene.add(cloud);
  }
  let skyKey = null;
  let skyCheckedAt = -Infinity;
  const showSky = () => {
    const s = pastureSkyAt(vietnamHour());
    if (s.key === skyKey) return;
    skyKey = s.key;
    // The sun crosses from the east at six to the west at six; at night the moon stands high.
    const day = (s.hour - 6) / 12;
    if (day > 0 && day < 1) sun.position.set(-70 * Math.cos(day * Math.PI), 15 + 70 * Math.sin(day * Math.PI), 40);
    else sun.position.set(20, 70, 40);
    if (scene.background?.isTexture) scene.background.dispose();
    scene.background = skyTexture(s.sky, s.horizon);
    scene.fog.color.set(s.horizon);
    sun.color.set(s.sun[0]);
    sun.intensity = s.sun[1];
    fill.color.set(s.fill[0]);
    fill.intensity = s.fill[1];
    cloudMaterial.color.set(s.clouds);
  };

  // The camera stands back just far enough to take in the whole oval and a horse's height: from the stands
  // on a wide frame, from the corner by the finish on a narrow one (a phone), where the oval runs away from it.
  const rim = [];
  for (let i = 0; i < 36; i += 1) {
    const p = offsetAt(i / 36, WIDTH / 2 + RAIL_GAP);
    rim.push(p, p.clone().setY(HORSE_SCALE * 1.8));
  }
  const fit = () => {
    const wide = camera.aspect >= 1.45;
    const azimuth = wide ? 0 : 0.75;
    const elevation = wide ? 0.6 : 0.7;
    const dir = new THREE.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
    const v = new THREE.Vector3();
    let near = 10;
    let far = 500;
    for (let i = 0; i < 22; i += 1) {
      const d = (near + far) / 2;
      camera.position.copy(dir).multiplyScalar(d).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      const fits = rim.every((p) => {
        v.copy(p).project(camera);
        // Room left at the sides for the name of a horse in a bend.
        return Math.abs(v.x) <= 0.86 && Math.abs(v.y) <= 0.9 && v.z < 1;
      });
      if (fits) far = d;
      else near = d;
    }
    camera.position.copy(dir).multiplyScalar(far).add(target);
    controls.target.copy(target);
    controls.update();
  };

  // A soft shadow under each horse, painted once.
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
  textures.push(shadowTexture);
  const blobGeometry = new THREE.PlaneGeometry(2.6, 0.9);
  const blobMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });

  // The horses: one clone of the model each, its own coat, its own clips; its name over it.
  const runners = new Map();
  let wanted = [];
  let focus = null;
  let gltf = null;
  let trot = null;
  let standing = null; // how the model is scaled and turned to stand head to +x, worked out on the first horse
  let disposed = false;
  // A narrow frame (a phone): the waiting horses stand too close on screen for their names; only the running ones are named.
  let narrow = false;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const standUp = (horse) => {
    if (!standing) {
      horse.scale.setScalar(1.6 / skinnedBox(horse).getSize(new THREE.Vector3()).y);
      const head = boneNamed(horse, 'BN_Head');
      horse.updateMatrixWorld(true);
      if (head) {
        const c = skinnedBox(horse).getCenter(new THREE.Vector3());
        const h = head.getWorldPosition(new THREE.Vector3()).sub(c);
        horse.rotation.y = Math.PI / 2 - Math.atan2(h.x, h.z);
      }
      const box = skinnedBox(horse);
      const c = box.getCenter(new THREE.Vector3());
      standing = { scale: horse.scale.x, turn: horse.rotation.y, at: new THREE.Vector3(-c.x, -box.min.y, -c.z) };
    }
    horse.scale.setScalar(standing.scale);
    horse.rotation.y = standing.turn;
    horse.position.copy(standing.at);
  };

  const addRunner = (id) => {
    const horse = cloneSkinned(gltf.scene);
    horse.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        o.material = o.material.clone();
      }
    });
    standUp(horse);
    const holder = new THREE.Group();
    holder.scale.setScalar(HORSE_SCALE);
    const shadow = new THREE.Mesh(blobGeometry, blobMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    // The name over the horse's head; the label's text is set with textContent (a horse's name is typed by people).
    const el = document.createElement('div');
    el.style.cssText = LABEL_STYLE;
    const name = document.createElement('div');
    const note = document.createElement('div');
    note.style.cssText = 'font-weight:400;font-size:10.5px;color:#C9DACF;font-variant-numeric:tabular-nums';
    el.append(name, note);
    labelLayer.append(el);
    holder.add(shadow, horse);
    scene.add(holder);
    const mixer = new THREE.AnimationMixer(horse);
    const actions = {};
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
    if (trot) actions.Trot = mixer.clipAction(trot);
    const runner = { id, holder, horse, mixer, actions, current: null, tag: { el, name, note, visible: true, width: 0 }, coatKey: null, item: null, shown: null, target: null, rate: 0, lane: 0, phase: Math.random() };
    runners.set(id, runner);
    return runner;
  };

  const removeRunner = (runner) => {
    runner.mixer.stopAllAction();
    runner.mixer.uncacheRoot(runner.horse);
    scene.remove(runner.holder);
    runner.tag.el.remove();
    // The geometry is the loaded model's, shared by every clone; only the materials are this horse's own.
    runner.horse.traverse((o) => {
      if (o.isMesh) o.material.dispose();
    });
    runners.delete(runner.id);
  };

  const paint = (runner, coat) => {
    if (!coat || runner.coatKey === coat.key) return;
    runner.coatKey = coat.key;
    runner.horse.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.material.name === MOVING_HORSE.coatMaterials.body) {
        o.material.color.setRGB(...coat.body);
        if (coat.roughness) o.material.roughness = coat.roughness;
      } else if (o.material.name === MOVING_HORSE.coatMaterials.hair) o.material.color.setRGB(...coat.hair);
    });
  };

  const styleLabel = (runner) => {
    const { item, tag } = runner;
    tag.visible = item?.share != null || !narrow || focus === runner.id;
    tag.el.style.borderColor = item?.over ? '#fca5a5' : focus === runner.id ? '#D4AF37' : 'rgba(255,255,255,.16)';
    tag.el.style.background = focus === runner.id ? 'rgba(1,17,12,.92)' : 'rgba(1,17,12,.74)';
  };

  const show = (runner, item) => {
    runner.item = item;
    paint(runner, item.coat);
    runner.tag.name.textContent = item.name || 'Ngựa';
    runner.tag.note.textContent = item.note || '';
    runner.tag.note.style.display = item.note ? '' : 'none';
    runner.tag.width = 0; // measured again where it is next placed
    styleLabel(runner);
  };

  const play = (runner, clip, timeScale = 1) => {
    const next = runner.actions[clip] || runner.actions.Idle;
    if (!next) return;
    next.timeScale = timeScale;
    if (runner.current === next) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    // Horses side by side do not step in time.
    next.time = runner.phase * next.getClip().duration;
    if (runner.current) runner.current.crossFadeTo(next, 0.35, false);
    runner.current = next;
  };

  const placeOnTrack = (runner) => {
    const p = pointAt(runner.shown);
    runner.holder.position.set(p.x - p.tz * runner.lane, 0, p.z + p.tx * runner.lane);
    runner.holder.rotation.y = Math.atan2(-p.tz, p.tx);
  };

  const apply = () => {
    if (!gltf) return;
    const out = wanted.filter((w) => w.share != null);
    const parked = wanted.filter((w) => w.share == null).slice(0, MAX_PARKED);
    const kept = new Set([...out, ...parked].map((w) => w.id));
    for (const r of [...runners.values()]) if (!kept.has(r.id)) removeRunner(r);
    // Side by side across the track, in the order given.
    const step = out.length > 1 ? Math.min(LANE, (WIDTH - 2) / (out.length - 1)) : 0;
    out.forEach((item, i) => {
      const r = runners.get(item.id) || addRunner(item.id);
      show(r, item);
      r.lane = (i - (out.length - 1) / 2) * step;
      const goal = Math.min(0.9999, Math.max(0, item.share));
      // Just out, or a course begun again: straight there. Else it runs there by the time the next reading comes.
      if (r.target == null || goal < r.shown - 0.02) {
        r.shown = goal;
        r.rate = 0;
      } else r.rate = Math.max(0, (goal - r.shown) / READING_SEC);
      r.target = goal;
      const gait = gaitAt(item.kmh);
      play(r, gait.clip, gait.timeScale);
      placeOnTrack(r);
    });
    parked.forEach((item, i) => {
      const r = runners.get(item.id) || addRunner(item.id);
      show(r, item);
      r.target = null;
      r.shown = null;
      const row = Math.floor(i / PARKED.cols);
      r.holder.position.set(FINISH_X - 4 - (i % PARKED.cols) * PARKED.step - row * 3, 0, PARKED.rows[row]);
      // A little turned to the stands.
      r.holder.rotation.y = -0.3;
      play(r, IDLE_CLIPS[i % IDLE_CLIPS.length]);
    });
  };

  const ready = loadModel().then((loaded) => {
    if (disposed) return;
    gltf = loaded;
    const walk = gltf.animations.find((c) => c.name === 'Walk');
    trot = walk ? makeTrot(walk) : null;
    apply();
  });

  // Each name over its horse's head, kept inside the frame (a horse in a bend is near its edge), the
  // nearer horses' names on top.
  const anchor = new THREE.Vector3();
  const placeLabels = () => {
    for (const r of runners.values()) {
      const { el } = r.tag;
      anchor.set(0, 2.05, 0);
      r.holder.localToWorld(anchor).project(camera);
      if (!r.tag.visible || anchor.z > 1) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      if (!r.tag.width) r.tag.width = el.offsetWidth;
      const half = r.tag.width / 2 + 4;
      const x = Math.min(frameSize.width - half, Math.max(half, ((anchor.x + 1) / 2) * frameSize.width));
      const y = ((1 - anchor.y) / 2) * frameSize.height;
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.zIndex = String(Math.round((1 - anchor.z) * 100000));
    }
  };

  let last = performance.now();
  let raf = 0;
  let visible = true;
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
    if (now - skyCheckedAt > 60000) {
      skyCheckedAt = now;
      showSky();
    }
    for (const r of runners.values()) {
      // Gliding on to the latest reading; straight there when the system asks for less motion.
      if (r.target != null && r.shown < r.target) {
        r.shown = reduceMotion ? r.target : Math.min(r.target, r.shown + r.rate * dt);
        placeOnTrack(r);
      }
      r.mixer.update(dt);
    }
    renderer.render(scene, camera);
    placeLabels();
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
     * The horses to show: [{ id, name, coat, note, over, share, kmh }]. `share` (0–1) of its course run
     * puts a horse on the track; without one it waits in the infield (the first MAX_PARKED of them).
     */
    setRunners(list) {
      wanted = list || [];
      apply();
    },
    /** Picks out one horse's name (a row hovered in the list beside), or none. */
    setFocus(id) {
      focus = id;
      for (const r of runners.values()) styleLabel(r);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      frameSize.width = width;
      frameSize.height = height;
      narrow = width < 480;
      for (const r of runners.values()) styleLabel(r);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      fit();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      controls.dispose();
      for (const r of [...runners.values()]) removeRunner(r);
      blobGeometry.dispose();
      blobMaterial.dispose();
      for (const t of textures) t.dispose();
      if (scene.background?.isTexture) scene.background.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) o.material.dispose();
      });
      renderer.dispose();
    },
  };
}
