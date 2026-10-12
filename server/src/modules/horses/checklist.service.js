const StableAssignment = require('../../models/StableAssignment');
const FeedingSchedule = require('../../models/FeedingSchedule');
const HealthRecord = require('../../models/HealthRecord');
const RaceEntry = require('../../models/RaceEntry');
const TrainingPlan = require('../../models/TrainingPlan');
const TrainingSession = require('../../models/TrainingSession');
const { clearanceMap } = require('../health/trainingClearance');

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLE = { manager: 'Quản lý', trainer: 'HLV', vet: 'Bác sĩ', groom: 'Chăm sóc' };
const CONCLUSION = { eligible: 'đủ điều kiện', monitoring: 'cần theo dõi', injured: 'chấn thương', quarantined: 'cách ly' };
const ddmm = (d) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const group = (rows, key = 'horse') => {
  const map = new Map();
  for (const r of rows) {
    const k = String(r[key]?._id || r[key]);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
};

/**
 * Where each horse stands on the way from arriving at the club to training: who owns, trains, treats and
 * looks after it, its rations, a vet's assessment, the restrictions in force, a target race, a plan and
 * booked sessions. Computed from the records themselves — nothing is stored, so it can't drift out of
 * step. The horse's healthStatus default ("eligible" at creation) is not taken as an assessment: only an
 * exam a vet filed is.
 *
 * Returns, per horse: { horse, items: [{ key, label, done, detail, who, optional? }], nextStep, blocked }.
 */
async function checklistFor(horses) {
  const ids = horses.map((h) => h._id);
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const [assignments, rations, records, entries, plans, sessions, clearances] = await Promise.all([
    StableAssignment.find({ horse: { $in: ids } }).populate('assignedCaretaker', 'name'),
    FeedingSchedule.find({ horse: { $in: ids } }).select('horse mealTime'),
    HealthRecord.find({ horse: { $in: ids } }).populate('examinedBy', 'name').select('horse date createdAt resultStatus examinedBy').sort({ date: -1, createdAt: -1 }),
    RaceEntry.find({ horse: { $in: ids }, status: { $in: ['registered', 'confirmed'] }, raceDate: { $gte: today } }).select('horse raceName raceDate status reviewNeeded').sort({ raceDate: 1 }),
    TrainingPlan.find({ horse: { $in: ids }, status: 'active' }).select('horse goal targetRace'),
    TrainingSession.find({ horse: { $in: ids }, status: { $in: ['scheduled', 'ready', 'blocked', 'in_progress'] }, scheduledAt: { $gte: new Date(now.getTime() - DAY_MS), $lte: new Date(now.getTime() + 7 * DAY_MS) } }).select('horse scheduledAt status'),
    clearanceMap(ids),
  ]);
  const [byAssignment, byRations, byRecords, byEntries, byPlans, bySessions] = [assignments, rations, records, entries, plans, sessions].map((rows) => group(rows));

  return horses.map((h) => {
    const key = String(h._id);
    const stall = byAssignment.get(key)?.[0];
    const exam = byRecords.get(key)?.[0];
    const entry = byEntries.get(key)?.[0];
    const plan = byPlans.get(key)?.[0];
    const booked = bySessions.get(key) || [];
    const meals = byRations.get(key) || [];
    const clearance = clearances.get(key);
    const items = [
      { key: 'owner', label: 'Chủ ngựa', done: Boolean(h.owner), detail: h.owner?.name || 'Chưa gán chủ ngựa', who: ROLE.manager },
      { key: 'trainer', label: 'HLV phụ trách', done: Boolean(h.assignedTrainer), detail: h.assignedTrainer?.name || 'Chưa gán HLV', who: ROLE.manager },
      { key: 'vet', label: 'Bác sĩ phụ trách', done: Boolean(h.assignedVet), detail: h.assignedVet?.name || 'Chưa gán bác sĩ', who: ROLE.manager },
      {
        key: 'stall',
        label: 'Chuồng và người chăm sóc',
        done: Boolean(stall?.assignedCaretaker),
        detail: stall ? `${stall.stableBlock}${stall.assignedCaretaker ? ` · ${stall.assignedCaretaker.name}` : ' · chưa có người chăm sóc'}` : 'Chưa xếp chuồng',
        who: ROLE.manager,
      },
      { key: 'rations', label: 'Khẩu phần ăn', done: meals.length > 0, detail: meals.length ? `${meals.length} bữa/ngày` : 'Chưa có khẩu phần — không có việc cho ăn', who: ROLE.trainer },
      {
        key: 'health',
        label: 'Bác sĩ đánh giá sức khỏe',
        done: Boolean(exam),
        detail: exam ? `${exam.examinedBy?.name || 'Bác sĩ'} · ${ddmm(exam.date || exam.createdAt)} · ${CONCLUSION[exam.resultStatus] || exam.resultStatus}` : 'Chưa có lần khám nào',
        who: ROLE.vet,
      },
      {
        key: 'clearance',
        label: 'Không có hạn chế y tế',
        done: !clearance?.restricted,
        detail: clearance?.restricted ? `${clearance.source === 'awaiting_return' ? 'Chờ bác sĩ đánh giá trở lại tập' : `Bác sĩ chỉ cho ${clearance.label}`}${clearance.reason && clearance.source !== 'awaiting_return' ? ` — ${clearance.reason}` : ''}` : 'Tập bình thường',
        who: ROLE.vet,
      },
      {
        key: 'race',
        label: 'Giải dự kiến',
        done: Boolean(entry),
        optional: true,
        detail: entry ? `${entry.raceName} · ${ddmm(entry.raceDate)}${entry.reviewNeeded ? ' · cần xem lại quyết định' : ''}` : 'Chưa đăng ký giải (không bắt buộc)',
        who: ROLE.trainer,
      },
      { key: 'plan', label: 'Kế hoạch huấn luyện', done: Boolean(plan), detail: plan ? plan.goal || 'Đang áp dụng' : 'Chưa có kế hoạch đang áp dụng', who: ROLE.trainer },
      { key: 'schedule', label: 'Lịch tập 7 ngày tới', done: booked.length > 0, detail: booked.length ? `${booked.length} buổi` : 'Chưa có buổi tập nào được xếp', who: ROLE.trainer },
    ];

    const grounded = clearance?.level === 'none' || ['injured', 'quarantined'].includes(h.healthStatus);
    let blocked = null;
    if (grounded) {
      blocked =
        clearance?.source === 'awaiting_return'
          ? 'Đã kết thúc điều trị — chờ bác sĩ đánh giá cho tập lại'
          : clearance?.level === 'none'
            ? `Bác sĩ khóa tập${clearance.reason ? `: ${clearance.reason}` : ''}`
            : `Sức khỏe: ${CONCLUSION[h.healthStatus]}`;
    }
    const pending = items.find((i) => !i.done && !i.optional && (i.key !== 'clearance' || grounded));
    const step = blocked
      ? { label: clearance?.source === 'awaiting_return' ? 'Bác sĩ đánh giá trở lại tập' : 'Chờ bác sĩ cho tập lại', who: ROLE.vet }
      : pending
        ? { label: { owner: 'Gán chủ ngựa', trainer: 'Gán HLV', vet: 'Gán bác sĩ', stall: 'Xếp chuồng và người chăm sóc', rations: 'Lập khẩu phần ăn', health: 'Bác sĩ khám tiếp nhận', plan: entry ? `Lập kế hoạch hướng tới ${entry.raceName}` : 'Lập kế hoạch huấn luyện', schedule: 'Sinh lịch tuần' }[pending.key], who: pending.who }
        : entry?.reviewNeeded
          ? { label: `Xem lại quyết định dự ${entry.raceName}`, who: ROLE.trainer }
          : { label: 'Đang huấn luyện theo lịch', who: ROLE.trainer, done: true };
    return { horse: { _id: h._id, name: h.name }, items, nextStep: { ...step, blockedReason: blocked }, blocked: Boolean(blocked) };
  });
}

module.exports = { checklistFor };
