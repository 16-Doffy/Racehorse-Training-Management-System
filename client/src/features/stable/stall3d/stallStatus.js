/**
 * What a stall on the map shows: free, under maintenance, or the state of the horse in it. Shared by the
 * 3D stalls (the lamp beside the nameplate) and the 2D stable map (the dot on each stall).
 * The horse's colour is its health status only — not whether a session may start now (meals, caretaker
 * and the session's own checks decide that), so the labels say "sức khỏe", never "sẵn sàng tập".
 */
export const STALL_STATES = {
  ok: { label: 'Sức khỏe đủ điều kiện', color: '#2E7D4F', lamp: 0x2ecc71, tag: 'success' },
  watch: { label: 'Sức khỏe cần theo dõi', color: '#B7791F', lamp: 0xf5b301, tag: 'warning' },
  bad: { label: 'Chấn thương hoặc cách ly', color: '#B3261E', lamp: 0xe5483b, tag: 'error' },
  taken: { label: 'Có ngựa', color: '#5B6B62', lamp: 0x8fa39a, tag: 'default' },
  empty: { label: 'Trống', color: '#8A8578', lamp: 0x6b7280, tag: 'default' },
  // Kept for its horse while the horse is in isolation or recovery: empty, but not free.
  reserved: { label: 'Giữ chỗ', color: '#2F6FA3', lamp: 0x5b8fb9, tag: 'processing' },
  maint: { label: 'Bảo trì', color: '#8A6512', lamp: 0xf5b301, tag: 'warning' },
};

export const STALL_TYPE_LABELS = { standard: 'Chuồng thường', isolation: 'Cách ly', recovery: 'Hồi phục' };

/** The state key of a stall from GET /stable/stalls (or /by-horse). */
export function stallState(stall) {
  if (!stall) return 'empty';
  if (stall.status === 'maintenance') return 'maint';
  if (!stall.occupied) return stall.reservedFor ? 'reserved' : 'empty';
  const health = stall.occupant?.horse?.healthStatus;
  if (!health) return 'taken'; // a horse the viewer may not see: only that the stall is taken
  if (health === 'injured' || health === 'quarantined') return 'bad';
  if (health === 'monitoring') return 'watch';
  return 'ok';
}

// The three parts of the stable, kept apart on the map: ordinary stalls, isolation (a horse that may
// carry an illness, kept away from the others) and recovery (a horse coming back from an injury).
export const ZONE_KINDS = {
  standard: { label: 'Khu chuồng thường', short: 'Thường', hint: 'Ngựa khỏe, đang tập', color: '#2E7D4F' },
  isolation: { label: 'Khu cách ly', short: 'Cách ly', hint: 'Ngựa nghi bệnh, tách riêng khỏi đàn', color: '#B3261E' },
  recovery: { label: 'Khu hồi phục', short: 'Hồi phục', hint: 'Ngựa sau chấn thương, đang điều trị', color: '#2F6FA3' },
};

/** The part of the stable a zone belongs to: the type all its stalls are; a mixed zone counts as ordinary. */
export function zoneKind(zone) {
  const types = new Set(zone.stalls.map((s) => s.type || 'standard'));
  const only = types.size === 1 ? [...types][0] : 'standard';
  return ZONE_KINDS[only] ? only : 'standard';
}

/** The zones in catalogue order, each with its stalls. */
export function groupZones(stalls) {
  const zones = new Map();
  for (const s of stalls) {
    if (!zones.has(s.zone)) zones.set(s.zone, { key: s.zone, name: s.zoneName, purpose: s.zonePurpose, stalls: [] });
    zones.get(s.zone).stalls.push(s);
  }
  return [...zones.values()];
}

/** The name on the nameplate. */
export function plateName(stall) {
  if (stall.status === 'maintenance') return 'BẢO TRÌ';
  if (!stall.occupied) return stall.reservedFor ? 'GIỮ CHỖ' : 'TRỐNG';
  return stall.occupant?.horse?.name || 'CÓ NGỰA';
}
