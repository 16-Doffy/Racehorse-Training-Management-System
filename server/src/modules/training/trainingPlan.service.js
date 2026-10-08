const TrainingSession = require('../../models/TrainingSession');
const TrainingPlan = require('../../models/TrainingPlan');
const { logAction } = require('../audit/audit.service');
const { getMedicalBlock } = require('./readiness.service');
const { getTrainingClearance, allows } = require('../health/trainingClearance');
const { notifyCaretaker } = require('../alerts/notification.service');
const { buildFromKind } = require('./trainingSession.service');
const { PHASE_LABELS, SESSION_KINDS, KIND_BY_INTENSITY, slotTimeProblem } = require('../../constants/training');

const { phasesOf, currentPhaseIndex } = TrainingPlan;

const DAY_MS = 24 * 60 * 60 * 1000;
// A race is prepared by a timed run over its distance about a week before.
const TRIAL_DAYS_BEFORE_RACE = 8;

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const pad = (n) => String(n).padStart(2, '0');
const ddmm = (d) => {
  const x = new Date(d);
  return `${pad(x.getDate())}/${pad(x.getMonth() + 1)}`;
};
// A session before noon belongs to the morning slot, the rest to the afternoon.
const slotOf = (date) => (new Date(date).getHours() < 12 ? 'morning' : 'afternoon');
const SLOT_LABEL = { morning: 'sáng', afternoon: 'chiều' };

/** Monday 00:00 of the week containing the given date. */
function mondayOf(d) {
  const x = startOfDay(d);
  const back = (x.getDay() + 6) % 7;
  return new Date(x.getTime() - back * DAY_MS);
}

/**
 * Books a plan's normal week (next week by default) as scheduled sessions at the plan's session
 * time. The plan must have horse (name) and targetRace populated.
 *
 * - Each day takes the template of the phase it falls in; days without one are rest days.
 * - About a week before the plan's race, that day becomes a timed trial over the race distance.
 * - Days already booked, already past, outside the plan or on race day are skipped.
 * - The vet's word is final: a locked or injured horse gets nothing, a recovering horse gets lighter
 *   work in place of what its clearance doesn't allow.
 * - The advisory gates (meals, exam age) are not judged here — nobody knows today when the horse
 *   will be fed next Thursday. They are checked when the trainer presses "Bắt đầu".
 *
 * Returns { weekStart, created, skipped } or { error }. `notify: false` skips the groom's message (seed).
 */
async function generatePlanWeek({ plan, weekStart: requestedWeek, actor, notify = true }) {
  const timeProblem = slotTimeProblem(plan.sessionTime, plan.afternoonTime);
  if (timeProblem) return { error: timeProblem };
  if (requestedWeek && !Number.isFinite(new Date(requestedWeek).getTime())) {
    return { error: 'Ngày bắt đầu tuần không hợp lệ.' };
  }
  const horseId = plan.horse._id;
  const blocked = await getMedicalBlock(horseId);
  if (blocked) return { error: `Không sinh lịch tập: ${blocked}` };
  const clearance = await getTrainingClearance(horseId);

  const weekStart = mondayOf(requestedWeek || new Date(Date.now() + 7 * DAY_MS));
  const phases = phasesOf(plan);
  const planStart = phases[0].startDate;
  const planEnd = phases[phases.length - 1].endDate;
  const race = plan.targetRace && plan.targetRace.status !== 'withdrawn' ? plan.targetRace : null;
  const raceDay = race ? startOfDay(race.raceDate).getTime() : null;
  const trialDay = race ? raceDay - TRIAL_DAYS_BEFORE_RACE * DAY_MS : null;
  const clockOf = { morning: plan.sessionTime || '07:30', afternoon: plan.afternoonTime || '16:00' };

  const booked = await TrainingSession.find({
    // A manual session or another plan's booking occupies the horse's slot too.
    horse: horseId,
    status: { $ne: 'cancelled' },
    scheduledAt: { $gte: weekStart, $lt: new Date(weekStart.getTime() + 7 * DAY_MS) },
  }).select('scheduledAt');
  const bookedSlots = new Set(booked.map((s) => `${startOfDay(s.scheduledAt).getTime()}|${slotOf(s.scheduledAt)}`));

  const createdSessions = [];
  const skipped = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart.getTime() + i * DAY_MS);
    const t = day.getTime();
    const label = day.toLocaleDateString('vi-VN', { weekday: 'short' }) + ' ' + ddmm(day);
    if (day < planStart || day > planEnd) continue; // outside the cycle: not this plan's day
    if (t === raceDay) {
      skipped.push({ date: day, reason: `${label}: ngày đua ${race.raceName}.` });
      continue;
    }
    const phase = phases[currentPhaseIndex(phases, day)];
    let entries = (phase.week || []).filter((d) => d.day === day.getDay());
    // About a week before the race: a timed trial over its distance in the morning, nothing else.
    if (t === trialDay) entries = [{ day: day.getDay(), slot: 'morning', kind: 'trial', distanceM: race.distance || plan.distanceTarget }];

    for (const template of entries) {
      const slot = template.slot || 'morning';
      const where = `${label} (${SLOT_LABEL[slot]})`;
      const [hh, mm] = clockOf[slot].split(':').map(Number);
      const scheduledAt = new Date(day);
      scheduledAt.setHours(hh, mm, 0, 0);
      if (scheduledAt < new Date()) {
        skipped.push({ date: day, reason: `${where}: đã qua giờ tập.` });
        continue;
      }
      if (bookedSlots.has(`${t}|${slot}`)) {
        skipped.push({ date: day, reason: `${where}: đã có buổi tập.` });
        continue;
      }

      let kind = template.kind;
      let note = '';
      if (!allows(clearance, SESSION_KINDS[kind].intensity)) {
        if (clearance.level === 'none') {
          skipped.push({ date: day, reason: `${where}: bác sĩ đang khóa huấn luyện.` });
          continue;
        }
        kind = KIND_BY_INTENSITY[clearance.level];
        note = ` Đổi từ "${SESSION_KINDS[template.kind].label}" vì bác sĩ chỉ cho ${clearance.label}.`;
      }
      const content = buildFromKind(kind, kind === template.kind ? template : {});
      // eslint-disable-next-line no-await-in-loop
      const session = await TrainingSession.create({
        ...content,
        trainingPlan: plan._id,
        horse: horseId,
        scheduledAt,
        status: 'scheduled',
        generated: true,
        coachNote: `${PHASE_LABELS[phase.key]} — ${SESSION_KINDS[kind].label.toLowerCase()} buổi ${SLOT_LABEL[slot]}.${note}`.trim(),
      });
      bookedSlots.add(`${t}|${slot}`);
      createdSessions.push(session);
    }
  }

  if (createdSessions.length > 0) {
    await logAction({
      actorId: actor._id,
      action: 'trainingPlan.generate_week',
      targetModel: 'TrainingPlan',
      targetId: plan._id,
      metadata: { weekStart, created: createdSessions.length, skipped: skipped.length },
    });
    const list = createdSessions
      .map((s) => `${new Date(s.scheduledAt).toLocaleDateString('vi-VN', { weekday: 'short' })} ${SLOT_LABEL[slotOf(s.scheduledAt)]} ${SESSION_KINDS[s.kind].label.toLowerCase()}`)
      .join(', ');
    if (notify) await notifyCaretaker({
      horse: horseId,
      type: 'session_scheduled',
      severity: 'info',
      message: `🏇 Lịch tập tuần ${ddmm(weekStart)} của ${plan.horse.name}: ${createdSessions.length} buổi — sáng ${clockOf.morning}${createdSessions.some((s) => slotOf(s.scheduledAt) === 'afternoon') ? `, chiều ${clockOf.afternoon}` : ''} (${list}). Cho ăn sáng xong trước giờ tập ít nhất 1,5 tiếng.`,
    });
  }
  return { weekStart, created: createdSessions, skipped };
}

module.exports = { generatePlanWeek, mondayOf, startOfDay, ddmm, DAY_MS };
