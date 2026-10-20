/**
 * Where on the horse a point of the 3D model is, in the words a vet writes on an exam: the part of
 * the body and, for a limb or a flank, which side.
 *
 * Points are in the model's own units (metres) — client/public/models/horse.glb and its tack-free copy
 * horse-bare.glb share them. The horse stands with its head along +z, up +y, its left side towards +x.
 * A point is described by how far along the body it is (0 = nose, 1 = tail), how high (0 = ground,
 * 1 = top of the head) and how far from the midline — measured on the box of horse.glb, the same box the
 * groom's app measures (mobile/src/three/horse360Html.js place()), so a mark lands in the same place
 * on both.
 */
export const HORSE_BOX = {
  center: { x: -0.007, y: 1.1092, z: 1.8096 },
  size: { x: 0.9049, y: 2.2278, z: 2.6397 },
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** { along, height, lateral } of a model point; lateral > 0 is the horse's left side. */
export function bodyFrame(p) {
  const { center, size } = HORSE_BOX;
  return {
    along: clamp01(0.5 - (p.z - center.z) / size.z),
    height: clamp01((p.y - (center.y - size.y / 2)) / size.y),
    lateral: p.x - center.x,
  };
}

/** The model point for along/height on the midline — where a mark made before the 3D map goes. */
export function pointOnMidline(along, height) {
  const { center, size } = HORSE_BOX;
  return { x: center.x, y: center.y - size.y / 2 + clamp01(height) * size.y, z: center.z + (0.5 - clamp01(along)) * size.z };
}

/**
 * Organs and deep structures, for injuries inside the body. The model is only the horse's skin, so
 * each sits at its usual place in a horse (approximate): how far along the body and how high, and how
 * far to the left (+) or right (−) of the spine in metres.
 */
const INSIDE = [
  ['brain', 'Não', 'Đầu & cổ', 0.085, 0.925, 0],
  ['larynx', 'Họng & thanh quản', 'Đầu & cổ', 0.155, 0.8, 0],
  ['trachea', 'Khí quản & thực quản', 'Đầu & cổ', 0.25, 0.78, 0],
  ['heart', 'Tim', 'Ngực', 0.37, 0.56, 0.04],
  ['lung-left', 'Phổi trái', 'Ngực', 0.45, 0.67, 0.12],
  ['lung-right', 'Phổi phải', 'Ngực', 0.45, 0.67, -0.12],
  ['stomach', 'Dạ dày', 'Bụng', 0.5, 0.635, 0.09],
  ['liver', 'Gan', 'Bụng', 0.5, 0.6, -0.1],
  ['spleen', 'Lách', 'Bụng', 0.55, 0.58, 0.17],
  ['small-intestine', 'Ruột non', 'Bụng', 0.58, 0.61, 0.05],
  ['colon', 'Ruột già (kết tràng)', 'Bụng', 0.53, 0.52, 0],
  ['cecum', 'Manh tràng', 'Bụng', 0.64, 0.58, -0.12],
  ['kidney-left', 'Thận trái', 'Bụng', 0.64, 0.71, 0.08],
  ['kidney-right', 'Thận phải', 'Bụng', 0.62, 0.71, -0.08],
  ['bladder', 'Bàng quang', 'Bụng', 0.8, 0.58, 0],
  ['cervical-spine', 'Cột sống cổ', 'Cột sống & chậu', 0.25, 0.87, 0],
  ['thoracic-spine', 'Cột sống ngực', 'Cột sống & chậu', 0.47, 0.755, 0],
  ['lumbar-spine', 'Cột sống thắt lưng', 'Cột sống & chậu', 0.66, 0.75, 0],
  ['sacroiliac', 'Khớp cùng chậu', 'Cột sống & chậu', 0.78, 0.755, 0],
];

export const INTERNAL_PARTS = INSIDE.map(([key, label, group, along, height, lateral]) => {
  const mid = pointOnMidline(along, height);
  return { key, label, group, along, height, position: { x: Math.round((mid.x + lateral) * 10000) / 10000, y: Math.round(mid.y * 10000) / 10000, z: Math.round(mid.z * 10000) / 10000 } };
});

// InjuryMarker.coordinates is { x, y } on the side picture the vet used before (nose at x 0, tail at
// 0.97; ears at y 0, hooves at 0.95 — mobile/src/three/injuryHotspots.js). Kept for the groom's app.
export const coordinatesFor = ({ along, height }) => ({ x: Math.round(along * 0.97 * 1000) / 1000, y: Math.round((1 - height) * 0.95 * 1000) / 1000 });
export const frameFromCoordinates = ({ x = 0.5, y = 0.5 } = {}) => ({ along: clamp01(x / 0.97), height: clamp01(1 - y / 0.95) });

const MIDLINE = 0.05; // metres either side of the spine that count as neither side

const FORELEG = [
  [0.045, 'Móng trước'],
  [0.1, 'Khớp cổ chân trước'],
  [0.2, 'Ống chân trước'],
  [0.275, 'Khớp gối trước'],
  [1, 'Cẳng tay trước'],
];
const HINDLEG = [
  [0.045, 'Móng sau'],
  [0.1, 'Khớp cổ chân sau'],
  [0.235, 'Ống chân sau'],
  [0.355, 'Khớp khuỷu sau'],
  [1, 'Bắp chân sau'],
];
const limbPart = (table, height) => table.find(([top]) => height < top)[1];

/**
 * The name of the body part at a model point. `material` is the model's material there: the mane and
 * the tail are hair (M_Hair), the eye its own (M_Eye).
 */
export function regionAt(point, material) {
  const { along: a, height: h, lateral } = bodyFrame(point);
  const side = lateral > MIDLINE ? 'trái' : lateral < -MIDLINE ? 'phải' : '';
  const sided = (name) => (side ? `${name} ${side}` : name);

  if (material === 'M_Hair') return a > 0.75 ? 'Đuôi' : 'Bờm';
  if (material === 'M_Eye') return sided('Mắt');

  // Legs: below the belly line, the forelegs in front of the middle of the body.
  if (h < 0.47 && a < 0.58) return sided(limbPart(FORELEG, h));
  if (h < 0.47 && a >= 0.58) return a > 0.94 && !side ? 'Đuôi' : sided(limbPart(HINDLEG, h));

  // Head and neck.
  if (a < 0.2 && h >= 0.84) return sided('Đầu');
  if (a < 0.12 && h >= 0.7) return 'Mõm & hàm';
  if (a < 0.2 && h >= 0.7) return sided('Má & hàm');
  if (a < 0.4 && h >= 0.69 && h - 0.69 > (a - 0.2) * 0.45) return sided('Cổ');

  // Trunk, front to back.
  if (a < 0.33) return 'Ngực';
  if (a < 0.46) return h >= 0.74 ? 'U vai' : sided('Vai');
  if (a < 0.66) {
    if (h >= 0.72) return 'Lưng';
    if (h >= 0.55) return sided('Sườn');
    return 'Bụng';
  }
  if (a < 0.74) {
    if (h >= 0.7) return 'Thăn';
    if (h >= 0.55) return sided('Hông');
    return sided('Khớp gối sau');
  }
  if (h >= 0.63) return sided('Mông');
  return sided('Đùi sau');
}
