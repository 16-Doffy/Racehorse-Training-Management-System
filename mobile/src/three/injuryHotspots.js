/**
 * Where on the 3D horse a vet's injury mark goes.
 *
 * The vet marks an injury on a side view of a horse (web: components/veterinarian/
 * Horse3DAnatomyViewer.jsx, an 861×1024 picture with the head on the left) and the server keeps
 * { x, y } normalised against that picture (InjuryMarker.coordinates). On it the horse runs from
 * the nose at about x 0.00 to the tail at 0.97, and from the ears at y 0.00 to the hooves at 0.95.
 * A mark becomes two numbers any horse model can use: how far along the body (0 = nose, 1 = tail)
 * and how high (0 = ground, 1 = top of the head). Which side of the horse is not recorded, so the
 * point sits in the middle of the body and shows through.
 */
const SILHOUETTE = { nose: 0.0, tail: 0.97, top: 0.0, hooves: 0.95 };

const clamp = (n) => Math.min(1, Math.max(0, n));

export function hotspotFor(marker) {
  const { x = 0.5, y = 0.5 } = marker?.coordinates || {};
  return {
    along: clamp((x - SILHOUETTE.nose) / (SILHOUETTE.tail - SILHOUETTE.nose)),
    height: clamp(1 - (y - SILHOUETTE.top) / (SILHOUETTE.hooves - SILHOUETTE.top)),
  };
}

export const INJURY_SEVERITY = {
  mild: { label: 'Nhẹ', color: '#eab308' },
  moderate: { label: 'Vừa', color: '#f97316' },
  severe: { label: 'Nặng', color: '#ef4444' },
};

export const RECOVERY_STATUS = {
  new: 'Mới phát hiện',
  in_treatment: 'Đang điều trị',
  recovering: 'Đang hồi phục',
  recovered: 'Đã khỏi',
};

/** Injuries still being dealt with, worst first: what the groom has to be careful of. */
export function activeInjuries(markers = []) {
  const rank = { severe: 0, moderate: 1, mild: 2 };
  return markers
    .filter((m) => m.recoveryStatus !== 'recovered')
    .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
}
