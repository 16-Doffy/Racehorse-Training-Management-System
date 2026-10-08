const TrainingSession = require('../../models/TrainingSession');
const TrainingPlan = require('../../models/TrainingPlan');
const { logAction } = require('../audit/audit.service');
const { getMedicalBlock } = require('./readiness.service');
const { getTrainingClearance, allows } = require('../health/trainingClearance');
const { notifyCaretaker } = require('../alerts/notification.service');
const { buildFromKind } = require('./trainingSession.service');
const { PHASE_LABELS, SESSION_KINDS, KIND_BY_INTENSITY } = require('../../constants/training');

const { phasesOf, currentPhaseIndex } = TrainingPlan;

const DAY_MS = 24 * 60 * 60 * 1000;
// A race is prepared by a timed run over its distance about a week before.
const TRIAL_DAYS_BEFORE_RACE = 8;

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const ddmm = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

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
  const horseId = plan.horse._id;
  const blocked = await getMedicalBlock(horseId);
  if (blocked) return { error: `Không sinh lịch tập: ${blocked}` };
  const clearance = await getTrainingClearance(horseId);

  const weekStart = mondayOf(requestedWeek || new Date(Date.now() + 7 * DAY_MS));
  const today = startOfDay(new Date());
  const phases = phasesOf(plan);
  const planStart = phases[0].startDate;
  const planEnd = phases[phases.length - 1].endDate;
  const race = plan.targetRace && plan.targetRace.status !== 'withdrawn' ? plan.targetRace : null;
  const raceDay = race ? startOfDay(race.raceDate).getTime() : null;
  const trialDay = race ? raceDay - TRIAL_DAYS_BEFORE_RACE * DAY_MS : null;
  const [hh, mm] = (plan.sessionTime || '07:30').split(':').map(Number);

  const booked = await TrainingSession.find({
    trainingPlan: plan._id,
    status: { $ne: 'cancelled' },
    scheduledAt: { $gte: weekStart, $lt: new Date(weekStart.getTime() + 7 * DAY_MS) },
  }).select('scheduledAt');
  const bookedDays = new Set(booked.map((s) => startOfDay(s.scheduledAt).getTime()));

  const createdSessions = [];
  const skipped = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStart.getTime() + i * DAY_MS);
    const t = day.getTime();
    const label = day.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
    if (day < planStart || day > planEnd) continue; // outside the cycle: not this plan's day
    if (t === raceDay) {
      skipped.push({ date: day, reason: `${label}: ngày đua ${race.raceName}.` });
      continue;
    }
    const phase = phases[currentPhaseIndex(phases, day)];
    let template = (phase.week || []).find((d) => d.day === day.getDay());
    if (t === trialDay) template = { day: day.getDay(), kind: 'trial', distanceM: race.distance || plan.distanceTarget };
    if (!template) continue; // rest day
    const scheduledAt = new Date(day);
    scheduledAt.setHours(hh, mm, 0, 0);
    if (day < today || scheduledAt < new Date()) {
      skipped.push({ date: day, reason: `${label}: đã qua giờ tập.` });
      continue;
    }
    if (bookedDays.has(t)) {
      skipped.push({ date: day, reason: `${label}: đã có buổi tập.` });
      continue;
    }

    let kind = template.kind;
    let note = '';
    if (!allows(clearance, SESSION_KINDS[kind].intensity)) {
      if (clearance.level === 'none') {
        skipped.push({ date: day, reason: `${label}: bác sĩ đang khóa huấn luyện.` });
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
      coachNote: `${PHASE_LABELS[phase.key]} — ${SESSION_KINDS[kind].label.toLowerCase()}.${note}`.trim(),
    });
    createdSessions.push(session);
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
      .map((s) => `${new Date(s.scheduledAt).toLocaleDateString('vi-VN', { weekday: 'short' })} ${SESSION_KINDS[s.kind].label.toLowerCase()}`)
      .join(', ');
    if (notify) await notifyCaretaker({
      horse: horseId,
      type: 'session_scheduled',
      severity: 'info',
      message: `🏇 Lịch tập tuần ${ddmm(weekStart)} của ${plan.horse.name}: ${createdSessions.length} buổi lúc ${plan.sessionTime || '07:30'} (${list}). Cho ăn sáng xong trước giờ tập ít nhất 1,5 tiếng.`,
    });
  }
  return { weekStart, created: createdSessions, skipped };
}

module.exports = { generatePlanWeek, mondayOf, startOfDay, ddmm, DAY_MS };
