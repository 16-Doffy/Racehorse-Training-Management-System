import * as THREE from 'three';

/**
 * The people of the club on the training track, one for each role, small and big-headed (chibi), each at
 * their work: the head trainer timing at the finish post, the vet listening to a horse, the groom brushing
 * one, the owner waving from the stands, the manager checking the stables on a tablet. Built in code from a
 * few shapes; each `update(t)` moves an arm or nods, nothing more.
 */

const SKIN = '#f2c9a5';
const HAIR = ['#2b1d14', '#4a2f1d', '#1c1a19'];

const material = (() => {
  const cache = new Map();
  return (color) => {
    if (!cache.has(color)) cache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
    return cache.get(color);
  };
})();

function mesh(geometry, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material(color));
  m.position.set(x, y, z);
  return m;
}

/** An arm hanging from the shoulder (pivot at the shoulder, so it swings), the hand at its end. */
function arm(side, sleeve) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.2, 0.52, 0);
  pivot.add(mesh(new THREE.CapsuleGeometry(0.05, 0.16, 4, 8), sleeve, 0, -0.13, 0));
  const hand = mesh(new THREE.SphereGeometry(0.055, 10, 8), SKIN, 0, -0.26, 0);
  pivot.add(hand);
  pivot.rotation.z = side * 0.18;
  return { pivot, hand };
}

/**
 * One person about a metre tall before scaling, facing +z: legs, a round body in the role's colours, two
 * arms, a big head with hair and eyes. Returns the parts the role dresses and moves.
 */
function body({ outfit, trousers, hair }) {
  const group = new THREE.Group();
  const legs = new THREE.CylinderGeometry(0.065, 0.07, 0.24, 8);
  group.add(mesh(legs, trousers, -0.08, 0.12, 0), mesh(legs, trousers, 0.08, 0.12, 0));
  const torso = mesh(new THREE.CapsuleGeometry(0.17, 0.16, 4, 12), outfit, 0, 0.4, 0);
  const left = arm(-1, outfit);
  const right = arm(1, outfit);
  const head = new THREE.Group();
  head.position.y = 0.8;
  head.add(mesh(new THREE.SphereGeometry(0.27, 20, 16), SKIN));
  const cap = mesh(new THREE.SphereGeometry(0.285, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 0.03, -0.01);
  cap.rotation.x = -0.25;
  head.add(cap);
  const eye = new THREE.SphereGeometry(0.03, 8, 6);
  head.add(mesh(eye, '#1b1b1b', -0.09, -0.01, 0.25), mesh(eye, '#1b1b1b', 0.09, -0.01, 0.25));
  const cheek = new THREE.CircleGeometry(0.035, 12);
  for (const side of [-1, 1]) {
    const c = mesh(cheek, '#f39a8f', side * 0.15, -0.07, 0.235);
    c.rotation.y = side * 0.35;
    head.add(c);
  }
  group.add(torso, left.pivot, right.pivot, head);
  return { group, torso, left, right, head };
}

/** A peaked cap, a straw hat or a top hat, set on the head. */
function hat(kind, color, band) {
  const g = new THREE.Group();
  if (kind === 'cap') {
    g.add(mesh(new THREE.SphereGeometry(0.29, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), color, 0, 0.06, 0));
    const peak = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), band, 0, 0.1, 0.17);
    peak.rotation.x = 0.15;
    g.add(peak);
  } else if (kind === 'straw') {
    g.add(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 24), color, 0, 0.16, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 20), color, 0, 0.26, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.05, 20), band, 0, 0.19, 0));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 24), color, 0, 0.2, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.36, 20), color, 0, 0.38, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.212, 0.212, 0.06, 20), band, 0, 0.24, 0));
  }
  return g;
}

/** Each role: its colours, hat, what it holds and how it moves. `t` is in seconds. */
const ROLES = {
  trainer: {
    caption: 'Huấn luyện viên · bấm giờ',
    dress: { outfit: '#1f2937', trousers: '#334155', hair: HAIR[0] },
    build(p) {
      p.head.add(hat('cap', '#eab308', '#111827'));
      const watch = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 16), '#e5e7eb', 0, -0.3, 0.02);
      watch.rotation.x = Math.PI / 2;
      p.right.pivot.add(watch);
      p.right.pivot.rotation.x = -1.9; // the stopwatch up before the face
    },
    move(p, t) {
      p.right.pivot.rotation.x = -1.9 + Math.sin(t * 1.3) * 0.08;
      p.head.rotation.y = Math.sin(t * 0.5) * 0.35; // follows the horses along the straight
    },
  },
  vet: {
    caption: 'Bác sĩ thú y · khám ngựa',
    dress: { outfit: '#f8fafc', trousers: '#0f766e', hair: HAIR[1] },
    build(p) {
      const tube = mesh(new THREE.TorusGeometry(0.15, 0.018, 8, 24, Math.PI * 1.3), '#1f2937', 0, 0.55, 0.06);
      tube.rotation.set(Math.PI / 2 + 0.3, 0, Math.PI * 0.85);
      p.group.add(tube);
      const bag = mesh(new THREE.BoxGeometry(0.22, 0.15, 0.1), '#b91c1c', 0, -0.36, 0);
      bag.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.105), '#ffffff'), mesh(new THREE.BoxGeometry(0.02, 0.06, 0.105), '#ffffff'));
      p.left.pivot.add(bag);
      p.right.pivot.rotation.x = -1.2; // the stethoscope to the horse's side
    },
    move(p, t) {
      p.right.pivot.rotation.x = -1.2 + Math.sin(t * 0.8) * 0.12;
      p.head.rotation.z = Math.sin(t * 0.8) * 0.08;
    },
  },
  groom: {
    caption: 'Nhân viên chăm sóc · chải lông',
    dress: { outfit: '#15803d', trousers: '#3f3f46', hair: HAIR[2] },
    build(p) {
      p.head.add(hat('straw', '#e9c46a', '#b45309'));
      p.right.pivot.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.1), '#7c4a24', 0, -0.3, 0.04));
    },
    move(p, t) {
      p.right.pivot.rotation.x = -1.1 + Math.sin(t * 4) * 0.45; // the brush along the coat
      p.torso.rotation.z = Math.sin(t * 4) * 0.04;
    },
  },
  owner: {
    caption: 'Chủ ngựa · cổ vũ',
    dress: { outfit: '#7f1d1d', trousers: '#1f2937', hair: HAIR[0] },
    build(p) {
      p.head.add(hat('top', '#111827', '#eab308'));
    },
    move(p, t) {
      p.right.pivot.rotation.x = 0;
      p.right.pivot.rotation.z = 2.5 + Math.sin(t * 5) * 0.35; // waving
      p.group.position.y = p.baseY + Math.abs(Math.sin(t * 2.5)) * 0.06;
    },
  },
  manager: {
    caption: 'Quản lý · kiểm tra chuồng',
    dress: { outfit: '#334155', trousers: '#1e293b', hair: HAIR[1] },
    build(p) {
      p.group.add(mesh(new THREE.BoxGeometry(0.05, 0.2, 0.02), '#eab308', 0, 0.42, 0.17)); // the tie
      const tablet = mesh(new THREE.BoxGeometry(0.26, 0.18, 0.02), '#111827', 0, 0.44, 0.27);
      tablet.rotation.x = -0.6;
      tablet.add(mesh(new THREE.PlaneGeometry(0.22, 0.14), '#7dd3fc', 0, 0, 0.011));
      p.group.add(tablet);
      p.left.pivot.rotation.x = -1.0;
      p.right.pivot.rotation.x = -1.0;
    },
    move(p, t) {
      p.head.rotation.x = 0.25 + Math.sin(t * 0.7) * 0.06; // reading
      p.head.rotation.y = Math.sin(t * 0.35) * 0.25;
    },
  },
};

/**
 * The cast: one person per role at the place given ({ role, x, z, turn }), `scale` metres tall. Returns
 * them with their captions, and `update(t)` to move them.
 */
export function makeCast(scene, places, scale) {
  const people = places.map(({ role, x, z, turn = 0 }, i) => {
    const r = ROLES[role];
    const p = body(r.dress);
    r.build(p);
    p.group.scale.setScalar(scale);
    p.group.position.set(x, 0, z);
    p.group.rotation.y = turn;
    p.baseY = 0;
    p.phase = i * 1.7;
    scene.add(p.group);
    return { role, caption: r.caption, group: p.group, height: scale * 1.15, move: (t) => r.move(p, t + p.phase) };
  });
  return {
    people,
    update(t) {
      for (const person of people) person.move(t);
    },
  };
}
