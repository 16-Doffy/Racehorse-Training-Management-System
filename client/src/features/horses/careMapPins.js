import dayjs from 'dayjs';
import { pointOnMidline } from '../../components/veterinarian/horseRegions';
import { CARE_EVENT_META, CARE_ROUTES, FARRIER_WORK, HOOF_CONDITIONS, HOOF_LIMBS, SHOT_TYPES, VACCINE_TARGETS } from '../../constants/care';

/**
 * Where routine care sits on the horse, for the 3D care map: the hooves a farrier worked on (one pin per
 * foot), the place a vaccine went in (the site the vet picked, else by route) and the mouth/nose for a
 * dewormer or a nasal vaccine. Points use the model's own frame (components/veterinarian/horseRegions.js);
 * the places are approximate, like the organs of the inside view.
 */

const at = (along, height, lateral = 0) => {
  const p = pointOnMidline(along, height);
  return { x: Math.round((p.x + lateral) * 10000) / 10000, y: Math.round(p.y * 10000) / 10000, z: Math.round(p.z * 10000) / 10000 };
};
// The horse's left is +x. A pin on a flank faces sideways, so it hides when that side is turned away.
const LEFT = { x: 1, y: 0, z: 0 };
const RIGHT = { x: -1, y: 0, z: 0 };
const FRONT = { x: 0, y: 0, z: 1 }; // the chest faces forward (+z)
const FRONT_LEFT = { x: 0.6, y: 0, z: 0.8 }; // the muzzle, read from the front and from the left side

export const KIND_COLOR = { vaccination: '#38bdf8', deworming: '#a78bfa', farrier: '#f59e0b' };
const PROBLEM_COLOR = '#ef4444';

const HOOVES = {
  fore_left: { position: at(0.37, 0.025, 0.1), normal: LEFT },
  fore_right: { position: at(0.37, 0.025, -0.1), normal: RIGHT },
  hind_left: { position: at(0.78, 0.025, 0.1), normal: LEFT },
  hind_right: { position: at(0.78, 0.025, -0.1), normal: RIGHT },
};
const SITES = {
  'Cổ trái': { position: at(0.24, 0.78, 0.09), normal: LEFT, label: 'Cổ trái' },
  'Cổ phải': { position: at(0.24, 0.78, -0.09), normal: RIGHT, label: 'Cổ phải' },
  'Ngực': { position: at(0.31, 0.6, 0), normal: FRONT, label: 'Ngực' },
  'Mông trái': { position: at(0.86, 0.68, 0.14), normal: LEFT, label: 'Mông trái' },
  'Mông phải': { position: at(0.86, 0.68, -0.14), normal: RIGHT, label: 'Mông phải' },
};
const NOSE = { position: at(0.03, 0.8, 0), normal: FRONT_LEFT, label: 'Mũi' };
const MOUTH = { position: at(0.06, 0.76, 0), normal: FRONT_LEFT, label: 'Miệng' };
// A shot with no site on record: the neck is where an intramuscular shot goes.
const DEFAULT_SITE = SITES['Cổ trái'];

const healthyHoof = (conditions) => !conditions?.length || conditions.every((c) => c === 'good');
const day = (d) => dayjs(d).format('DD/MM/YYYY');
const names = (keys, vocabulary) => (keys || []).map((k) => vocabulary[k]).filter(Boolean).join(', ');

/** Where a vaccine or dewormer went: { position, normal, label }, or null when the route says nothing of a place. */
export function carePlace(event) {
  if (event.kind === 'vaccination') {
    if (event.route === 'intranasal') return NOSE;
    if (event.route === 'oral') return MOUTH;
    return SITES[event.site] || DEFAULT_SITE;
  }
  if (event.kind === 'deworming') return event.route === 'oral' || !event.route ? MOUTH : null;
  return null;
}

/**
 * The pins of a list of care events (GET /horses/:id/care-events, any order). Each foot carries its latest
 * farrier visit; each place carries every shot or dose given there, newest first.
 */
export function buildCarePins(events = []) {
  const newestFirst = [...events].sort((a, b) => new Date(b.date) - new Date(a.date));
  const pins = [];

  const seenFeet = new Set();
  newestFirst
    .filter((e) => e.kind === 'farrier')
    .forEach((e) => {
      (e.limbs || []).forEach((limb) => {
        if (seenFeet.has(limb) || !HOOVES[limb]) return;
        seenFeet.add(limb);
        const problem = !healthyHoof(e.hoofCondition);
        pins.push({
          id: `farrier-${limb}`,
          kind: 'farrier',
          ...HOOVES[limb],
          color: problem ? PROBLEM_COLOR : KIND_COLOR.farrier,
          title: `Móng ${HOOF_LIMBS[limb].toLowerCase()}`,
          lines: [
            `${day(e.date)} · ${names(e.work, FARRIER_WORK) || 'Chăm sóc móng'}`,
            e.hoofCondition?.length ? names(e.hoofCondition, HOOF_CONDITIONS) : null,
            e.nextDue ? `Hẹn lần sau ${day(e.nextDue)}` : null,
          ].filter(Boolean),
        });
      });
    });

  const places = new Map();
  newestFirst
    .filter((e) => e.kind !== 'farrier')
    .forEach((e) => {
      const place = carePlace(e);
      if (!place) return;
      const key = `${e.kind}-${place.label}`;
      if (!places.has(key)) places.set(key, { place, kind: e.kind, events: [] });
      places.get(key).events.push(e);
    });
  places.forEach(({ place, kind, events: list }, key) => {
    const reacted = list.some((e) => e.reaction && e.reaction !== 'none');
    pins.push({
      id: key,
      kind,
      position: place.position,
      normal: place.normal,
      color: reacted ? PROBLEM_COLOR : KIND_COLOR[kind],
      title: `${CARE_EVENT_META[kind]?.label || kind} · ${place.label}`,
      lines: list.slice(0, 4).map((e) => {
        const what = kind === 'vaccination' ? names(e.targets, VACCINE_TARGETS) || e.product : e.product || e.activeIngredient;
        const extra = [SHOT_TYPES[e.shotType], CARE_ROUTES[e.route]].filter(Boolean).join(', ');
        return `${day(e.date)} · ${[what, extra].filter(Boolean).join(' · ')}`;
      }),
      more: Math.max(0, list.length - 4),
    });
  });

  return pins;
}
