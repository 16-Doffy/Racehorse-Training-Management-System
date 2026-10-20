import { groupZones } from './stall3d/stallStatus';

/**
 * Choosing a stall and a groom for a horse, from the stable map (GET /stable/stalls). Shared by the
 * stable page's "Xếp chuồng" dialog and the new-horse form.
 */

const idOf = (ref) => String(ref?._id || ref || '');

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
 * How many horses each groom looks after now, and in which zones: { [groomId]: { count, zones: Set } }.
 * `exceptHorseId` leaves out the horse being placed, so moving it does not count it twice.
 */
export function caretakerLoad(stalls = [], unplaced = [], exceptHorseId) {
  const load = {};
  const add = (caretaker, horse, zone) => {
    const id = idOf(caretaker);
    if (!id || (exceptHorseId && idOf(horse) === String(exceptHorseId))) return;
    load[id] ||= { count: 0, zones: new Set() };
    load[id].count += 1;
    if (zone) load[id].zones.add(zone);
  };
  stalls.forEach((s) => s.occupant?.caretaker && add(s.occupant.caretaker, s.occupant.horse, s.zone));
  unplaced.forEach((u) => u.caretaker && add(u.caretaker, u.horse, null));
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
