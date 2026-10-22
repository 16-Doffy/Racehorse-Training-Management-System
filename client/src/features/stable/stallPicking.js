import { groupZones } from './stall3d/stallStatus';

/**
 * Choosing a stall and a groom for a horse, from the stable map (GET /stable/stalls). Shared by the
 * stable page's "Xếp chuồng" dialog and the new-horse form.
 */

const idOf = (ref) => String(ref?._id || ref || '');

/** The id of the groom who looks after a stall (Stall.caretaker), when they still can; else null. */
export function stallGroom(stall) {
  return stall?.caretaker?._id && !stall.caretaker.inactive ? String(stall.caretaker._id) : null;
}

/** A stall the horse can go into: in use, not under maintenance, empty — or the one it stands in now. */
export function isPickable(stall, horseId) {
  if (!stall || stall.status === 'maintenance' || stall.isActive === false) return false;
  return !stall.occupied || (Boolean(horseId) && idOf(stall.occupant?.horse) === String(horseId));
}

/** The zones in map order, each with how many of its stalls the horse could go into. */
export function zonesWithRoom(stalls, horseId) {
  return groupZones(stalls).map((zone) => ({ ...zone, free: zone.stalls.filter((s) => isPickable(s, horseId)).length }));
}

/**
 * What each groom looks after now: { [groomId]: { stalls, count, zones: Set } } — the stalls given to
 * them (empty ones too), the horses in their care, and the zones. `exceptHorseId` leaves out the horse
 * being placed, so moving it does not count it twice.
 */
export function caretakerLoad(stalls = [], unplaced = [], exceptHorseId) {
  const load = {};
  const entry = (id) => (load[id] ||= { stalls: 0, count: 0, zones: new Set() });
  stalls.forEach((s) => {
    const groom = idOf(s.caretaker);
    if (groom) {
      entry(groom).stalls += 1;
      entry(groom).zones.add(s.zone);
    }
    const horse = s.occupant?.horse;
    const horseGroom = idOf(s.occupant?.caretaker);
    if (horse && horseGroom && !(exceptHorseId && idOf(horse) === String(exceptHorseId))) entry(horseGroom).count += 1;
  });
  unplaced.forEach((u) => {
    const groom = idOf(u.caretaker);
    if (groom && !(exceptHorseId && idOf(u.horse) === String(exceptHorseId))) entry(groom).count += 1;
  });
  return load;
}

/** The groom who looks after most horses in a zone — the natural one for a new horse there — or null. */
export function zoneCaretaker(stalls = [], zone, exceptHorseId) {
  if (!zone) return null;
  const counts = new Map();
  stalls
    .filter((s) => s.zone === zone && s.occupant?.caretaker && idOf(s.occupant.horse) !== String(exceptHorseId || ''))
    .forEach((s) => {
      const c = s.occupant.caretaker;
      const entry = counts.get(idOf(c)) || { _id: idOf(c), name: c.name, count: 0 };
      entry.count += 1;
      counts.set(idOf(c), entry);
    });
  return [...counts.values()].sort((a, b) => b.count - a.count)[0] || null;
}

/** Codes a new zone of `count` stalls gets, and which of them already exist (the server skips those). */
export function zonePreview(stalls = [], zone, count) {
  const key = String(zone || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,4}$/.test(key) || !Number.isInteger(count) || count < 1) return { key, codes: [], existing: [], fresh: [] };
  const have = new Set(stalls.map((s) => s.code));
  const codes = Array.from({ length: count }, (_, i) => `${key}-${String(i + 1).padStart(2, '0')}`);
  return { key, codes, existing: codes.filter((c) => have.has(c)), fresh: codes.filter((c) => !have.has(c)) };
}
