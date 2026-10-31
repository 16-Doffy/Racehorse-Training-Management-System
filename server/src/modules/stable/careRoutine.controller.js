const CareRoutine = require('../../models/CareRoutine');
const Horse = require('../../models/Horse');
const User = require('../../models/User');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, fail } = require('../../utils/apiResponse');
const { ROLES } = require('../../constants/roles');
const { horseFilter, canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');
const { dayBounds } = require('../../utils/taskTiming');
const { pushNotification } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');
const StableAssignment = require('../../models/StableAssignment');
const { syncRoutineTasks, occurrences } = require('./careRoutine.service');

const TYPES = ['cleaning', 'bathing', 'icing', 'hoof_care', 'other'];
const TYPE_LABELS = { cleaning: 'vệ sinh chuồng', bathing: 'tắm rửa', icing: 'ngâm chân nước đá', hoof_care: 'chăm sóc móng', other: 'việc khác' };
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TIMES = 8;
const MAX_DAYS = 366;
const POPULATE = [
  { path: 'horse', select: 'name' },
  { path: 'assignedTo', select: 'name' },
  { path: 'createdBy', select: 'name' },
  { path: 'stoppedBy', select: 'name' },
];
const ddmm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * The routine as the trainer set it, checked: a job the trainer may hand out, at least one time of
 * day, a length, the weekdays, from today or later to an end on or after it. `current` is the routine
 * being changed. Returns { values } or { error }.
 */
async function readRoutine(body = {}, current = null) {
  const pickOr = (key) => (body[key] !== undefined ? body[key] : current?.[key]);
  const taskType = pickOr('taskType');
  if (!TYPES.includes(taskType)) return { error: 'Chọn loại công việc. Việc dùng thuốc, theo dõi do bác sĩ chỉ định qua phác đồ điều trị.' };
  const title = String(pickOr('title') || '').trim();
  if (taskType === 'other' && !title) return { error: 'Việc "Khác" cần tên việc.' };
  const instructions = String(pickOr('instructions') || '').trim();
  if (!instructions) return { error: 'Ghi cách làm để nhân viên làm đúng.' };
  const times = pickOr('times');
  if (!Array.isArray(times) || !times.length) return { error: 'Chọn ít nhất một giờ làm trong ngày.' };
  if (times.length > MAX_TIMES) return { error: `Tối đa ${MAX_TIMES} lần mỗi ngày.` };
  if (times.some((t) => !CLOCK.test(String(t)))) return { error: 'Giờ làm phải có dạng HH:mm.' };
  if (new Set(times).size !== times.length) return { error: 'Hai lần làm trong ngày trùng giờ.' };
  const durationMinutes = Number(pickOr('durationMinutes'));
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) return { error: 'Mỗi lần làm từ 1 đến 480 phút.' };
  const weekDays = pickOr('weekDays') ?? [0, 1, 2, 3, 4, 5, 6];
  if (!Array.isArray(weekDays) || !weekDays.length || weekDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { error: 'Chọn ít nhất một ngày trong tuần.' };
  const rawStart = pickOr('startDate');
  const start = rawStart ? dayBounds(new Date(rawStart)).start : null;
  if (!start || Number.isNaN(start.getTime())) return { error: 'Chọn ngày bắt đầu.' };
  const today = dayBounds(new Date()).start;
  // A routine already running keeps its first day; a new one (or a new start) is from today on.
  if (start < today && !(current && dayBounds(current.startDate).start.getTime() === start.getTime())) return { error: 'Ngày bắt đầu phải từ hôm nay trở đi.' };
  const rawEnd = pickOr('endDate');
  const end = rawEnd ? dayBounds(new Date(rawEnd)).start : null;
  if (end && Number.isNaN(end.getTime())) return { error: 'Ngày kết thúc không hợp lệ.' };
  if (end && end < start) return { error: 'Ngày kết thúc phải sau ngày bắt đầu.' };
  if (end && end < today) return { error: 'Ngày kết thúc đã qua.' };
  if (end && (end - start) / 86400000 >= MAX_DAYS) return { error: 'Một lần giao tối đa một năm.' };
  const assignedTo = pickOr('assignedTo') || null;
  if (assignedTo && !(await User.exists({ _id: assignedTo, role: ROLES.GROOM, isActive: true }))) return { error: 'Người làm phải là nhân viên chăm sóc đang hoạt động.' };
  return {
    values: { taskType, title: taskType === 'other' ? title : undefined, instructions, times: [...times].sort(), durationMinutes, weekDays: [...new Set(weekDays)].sort(), startDate: start, endDate: end, assignedTo },
  };
}

/** "Ngâm chân nước đá cho Taurus, 2 lần/ngày (07:30, 16:30), mỗi lần 20 phút, từ 01/11 đến 30/11". */
function describe(routine, horseName) {
  const what = routine.taskType === 'other' ? routine.title : TYPE_LABELS[routine.taskType];
  return `${what} cho ${horseName}, ${routine.times.length} lần/ngày (${routine.times.join(', ')}), mỗi lần ${routine.durationMinutes} phút, từ ${ddmm(routine.startDate)}${routine.endDate ? ` đến ${ddmm(routine.endDate)}` : ' (không hẹn ngày kết thúc)'}`;
}

/** The routine's groom (or the stall's) is told what was handed to them, changed or stopped. */
async function tell(routine, message) {
  let to = routine.assignedTo;
  if (!to) to = (await StableAssignment.findOne({ horse: routine.horse }).select('assignedCaretaker'))?.assignedCaretaker;
  if (to) await pushNotification({ recipientUser: to, horse: routine.horse, type: 'task_assigned', severity: 'info', message });
}

const withCount = (r) => ({ ...r.toObject(), occurrences: occurrences(r) });

const listRoutines = asyncHandler(async (req, res) => {
  const filter = {};
  const horse = await horseFilter(req.user, req.query.horse);
  if (horse !== undefined) filter.horse = horse;
  if (['active', 'stopped'].includes(req.query.status)) filter.status = req.query.status;
  if (req.user.role === ROLES.GROOM) filter.status = 'active';
  const routines = await CareRoutine.find(filter).populate(POPULATE).sort({ status: 1, createdAt: -1 });
  return ok(res, routines.map(withCount), 'Care routines fetched.');
});

const createRoutine = asyncHandler(async (req, res) => {
  if (!(await canAccessHorse(req.user, req.body?.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  const horse = await Horse.findById(req.body.horse).select('name isArchived');
  if (!horse || horse.isArchived) return fail(res, 'Ngựa không còn được quản lý.', 409);
  const read = await readRoutine(req.body);
  if (read.error) return fail(res, read.error, 400);
  const routine = await CareRoutine.create({ ...read.values, horse: horse._id, createdBy: req.user._id });
  const today = await syncRoutineTasks(routine);
  await tell(routine, `📋 ${req.user.name} giao việc dài hạn: ${describe(routine, horse.name)}. Xem cách làm trên từng việc.`);
  await logAction({ actorId: req.user._id, action: 'care_routine.create', targetModel: 'CareRoutine', targetId: routine._id, metadata: { horse: horse._id, taskType: routine.taskType, times: routine.times } });
  await routine.populate(POPULATE);
  return created(res, { ...withCount(routine), today }, 'Care routine created.');
});

const updateRoutine = asyncHandler(async (req, res) => {
  const routine = await CareRoutine.findById(req.params.id);
  if (!routine) return fail(res, 'Không tìm thấy việc được giao.', 404);
  if (!(await canAccessHorse(req.user, routine.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (routine.status !== 'active') return fail(res, 'Việc này đã dừng — giao việc mới nếu cần làm tiếp.', 409);
  const read = await readRoutine(req.body, routine);
  if (read.error) return fail(res, read.error, 400);
  Object.assign(routine, read.values);
  await routine.save();
  const today = await syncRoutineTasks(routine);
  const horse = await Horse.findById(routine.horse).select('name');
  await tell(routine, `✏️ ${req.user.name} đã sửa việc dài hạn: ${describe(routine, horse?.name || 'ngựa')}.`);
  await logAction({ actorId: req.user._id, action: 'care_routine.update', targetModel: 'CareRoutine', targetId: routine._id });
  await routine.populate(POPULATE);
  return ok(res, { ...withCount(routine), today }, 'Care routine updated.');
});

/** Stops the routine from today: today's tasks not yet done go; what was done stays on record. */
const stopRoutine = asyncHandler(async (req, res) => {
  const routine = await CareRoutine.findById(req.params.id);
  if (!routine) return fail(res, 'Không tìm thấy việc được giao.', 404);
  if (!(await canAccessHorse(req.user, routine.horse))) return fail(res, FORBIDDEN_HORSE_MESSAGE, 403);
  if (routine.status !== 'active') return fail(res, 'Việc này đã dừng rồi.', 409);
  routine.status = 'stopped';
  routine.stoppedBy = req.user._id;
  routine.stoppedAt = new Date();
  await routine.save();
  const today = await syncRoutineTasks(routine);
  const horse = await Horse.findById(routine.horse).select('name');
  await tell(routine, `🛑 ${req.user.name} đã dừng việc ${routine.taskType === 'other' ? routine.title : TYPE_LABELS[routine.taskType]} của ${horse?.name || 'ngựa'} từ hôm nay.`);
  await logAction({ actorId: req.user._id, action: 'care_routine.stop', targetModel: 'CareRoutine', targetId: routine._id, metadata: { removedToday: today.removed } });
  await routine.populate(POPULATE);
  return ok(res, { ...withCount(routine), today }, 'Care routine stopped.');
});

module.exports = { listRoutines, createRoutine, updateRoutine, stopRoutine };
