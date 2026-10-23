import dayjs from 'dayjs';
import { HEALTH_LABELS, OPEN_SESSION, capFirst, careDue, idOf, relDay, sessionKind } from './ownerFormat';

/**
 * What the owner should look at, worked out from the owner summary and the horse records, most
 * serious first: a horse hurt or isolated, a horse held back from training, care that is overdue or
 * due this week, a horse no vet has examined yet, a race waiting for the trainer's decision.
 * Each item: { key, tone: bad | watch | info | neutral, kind, horse, title, sub, to }.
 */
const TONE_ORDER = { bad: 0, watch: 1, info: 2, neutral: 3 };

export function attentionItems(rows, horsesById) {
  const items = [];
  rows.forEach((r) => {
    const id = idOf(r.horse);
    const name = r.horse.name;
    const horse = horsesById.get(id);
    const page = `/horses/${id}`;
    if (!r.health.lastExam) {
      items.push({ key: `exam-${id}`, tone: 'neutral', kind: 'exam', horse: r.horse, title: `${name} chưa được bác sĩ khám`, sub: 'Tình trạng sức khỏe hiện chỉ là mặc định khi nhập ngựa.', to: `${page}?tab=health` });
    } else if (['injured', 'quarantined'].includes(r.health.status)) {
      items.push({ key: `health-${id}`, tone: 'bad', kind: 'health', horse: r.horse, title: `${name}: ${HEALTH_LABELS[r.health.status]}`, sub: [capFirst(r.health.clearance), r.health.reason].filter(Boolean).join(' · '), to: `${page}?tab=health` });
    } else if (r.health.restricted || r.health.status === 'monitoring') {
      items.push({ key: `health-${id}`, tone: 'watch', kind: 'health', horse: r.horse, title: `${name} đang được theo dõi`, sub: [capFirst(r.health.clearance), r.health.reason].filter(Boolean).join(' · '), to: `${page}?tab=health` });
    }
    careDue(horse)
      .filter((c) => c.days <= 7)
      .forEach((c) =>
        items.push({
          key: `care-${id}-${c.key}`,
          tone: c.days < 0 ? 'bad' : 'watch',
          kind: 'care',
          horse: r.horse,
          title: c.days < 0 ? `${c.label} cho ${name} đã quá hạn ${-c.days} ngày` : `${c.label} cho ${name} ${relDay(c.due)}`,
          sub: `Hẹn ngày ${dayjs(c.due).format('DD/MM/YYYY')}`,
          to: `${page}?tab=health`,
        }),
      );
    const race = r.upcomingRace;
    if (race?.reviewNeeded) {
      items.push({ key: `race-${id}`, tone: 'watch', kind: 'race', horse: r.horse, title: `HLV đang xem lại việc ${name} dự ${race.name}`, sub: 'Sức khỏe của ngựa đã thay đổi sau khi được xác nhận tham gia.', to: `${page}?tab=races` });
    } else if (race && race.status === 'registered') {
      items.push({ key: `race-${id}`, tone: 'info', kind: 'race', horse: r.horse, title: `${race.name}: đang chờ HLV quyết định`, sub: `${name} · thi đấu ${dayjs(race.date).format('DD/MM')} (${relDay(race.date)})`, to: `${page}?tab=races` });
    }
  });
  return items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

/**
 * The coming sessions and races of the owner's horses, soonest first (from the start of today).
 * Each item: { key, kind: session | race, at, horse, title, status, to }.
 */
export function agendaItems({ sessions, races, horseIds, limit = 6 }) {
  const today = dayjs().startOf('day');
  const mine = (ref) => horseIds.has(idOf(ref));
  const items = [
    ...sessions
      .filter((s) => mine(s.horse) && OPEN_SESSION.includes(s.status) && dayjs(s.scheduledAt).isAfter(today))
      .map((s) => ({ key: `s-${s._id}`, kind: 'session', at: s.scheduledAt, horse: s.horse, title: sessionKind(s), status: s.status, to: `/horses/${idOf(s.horse)}?tab=training` })),
    ...races
      .filter((r) => mine(r.horse) && ['registered', 'confirmed'].includes(r.status) && !dayjs(r.raceDate).isBefore(today))
      .map((r) => ({ key: `r-${r._id}`, kind: 'race', at: r.raceDate, horse: r.horse, title: r.raceName, status: r.status, venue: r.venue, to: `/horses/${idOf(r.horse)}?tab=races` })),
  ];
  return items.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, limit);
}

/** The horse's name from a populated ref or from the owner's list. */
export const horseName = (ref, horsesById) => ref?.name || horsesById.get(idOf(ref))?.name || '—';
