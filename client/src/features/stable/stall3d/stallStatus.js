/**
 * What a stall on the map shows: free, under maintenance, or the state of the horse in it. Shared by the
 * 3D stalls (the lamp beside the nameplate) and the 2D stable map (the dot on each stall).
 */
export const STALL_STATES = {
  ok: { label: 'Sẵn sàng tập', color: '#2E7D4F', lamp: 0x2ecc71, tag: 'success' },
  watch: { label: 'Theo dõi', color: '#B7791F', lamp: 0xf5b301, tag: 'warning' },
  bad: { label: 'Chấn thương · khóa tập', color: '#B3261E', lamp: 0xe5483b, tag: 'error' },
  taken: { label: 'Có ngựa', color: '#5B6B62', lamp: 0x8fa39a, tag: 'default' },
  empty: { label: 'Trống', color: '#8A8578', lamp: 0x6b7280, tag: 'default' },
  maint: { label: 'Bảo trì', color: '#8A6512', lamp: 0xf5b301, tag: 'warning' },
};

export const STALL_TYPE_LABELS = { standard: 'Chuồng thường', isolation: 'Cách ly', recovery: 'Hồi phục' };

/** The state key of a stall from GET /stable/stalls (or /by-horse). */
export function stallState(stall) {
  if (!stall) return 'empty';
  if (stall.status === 'maintenance') return 'maint';
  if (!stall.occupied) return 'empty';
  const health = stall.occupant?.horse?.healthStatus;
  if (!health) return 'taken'; // a horse the viewer may not see: only that the stall is taken
  if (health === 'injured' || health === 'quarantined') return 'bad';
  if (health === 'monitoring') return 'watch';
  return 'ok';
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
  if (!stall.occupied) return 'TRỐNG';
  return stall.occupant?.horse?.name || 'CÓ NGỰA';
}
