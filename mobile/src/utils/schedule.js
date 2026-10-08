import { SESSION_STATUS, TASK_STATUS, describeTask, formatTime, isSameDay, refId } from './groom';
import { colors } from '../theme';

const SESSION_HIDDEN = ['cancelled'];
const SESSION_OVER = ['completed', 'evaluated', 'aborted', 'missed'];
const TASK_OVER = ['completed', 'skipped'];
const LATE = { label: 'Trễ giờ', color: colors.orange, bg: colors.orangeSoft };

/** The tab where a kind of task is worked on. */
const TAB_OF = { feeding: 'Cho ăn', medication: 'Thuốc', monitoring: 'Thuốc' };

export const clockOf = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * Today as one ordered list: the groom's care jobs and the training sessions of the horses they
 * look after. The same job at the same time for several horses becomes one line ("Vệ sinh chuồng ·
 * 4 ngựa"). Done work is split off so what is left stays in view.
 *
 * Shared by the day plan and by the "next up" card, so both always agree on what comes next.
 */
export function buildSchedule({ tasks, sessions, feedings, myHorseIds, horseById, now = new Date() }) {
  const clock = clockOf(now);
  const schedulesOf = (horseId) => feedings.filter((f) => refId(f.horse) === horseId);
  const horseName = (horseId, fallback) => horseById.get(horseId)?.name || fallback?.name || '';

  const groups = new Map();
  tasks.forEach((t) => {
    const horseId = refId(t.horse);
    const info = describeTask(t, schedulesOf(horseId));
    const done = TASK_OVER.includes(t.status);
    const key = `${info.time || ''}|${t.taskType}|${t.taskType === 'other' ? t._id : ''}|${done}`;
    if (!groups.has(key)) groups.set(key, { key, time: info.time, info, taskType: t.taskType, done, horses: [], tasks: [] });
    const g = groups.get(key);
    g.horses.push({ id: horseId, name: horseName(horseId, t.horse) });
    g.tasks.push(t);
  });

  const taskRows = [...groups.values()].map((g) => {
    const count = g.tasks.length;
    const late = !g.done && !!g.time && g.time < clock;
    const status = count === 1 ? TASK_STATUS[g.tasks[0].status] || TASK_STATUS.pending : null;
    return {
      key: `task-${g.key}`,
      kind: 'task',
      time: g.time,
      done: g.done,
      late,
      live: false,
      icon: g.info.icon,
      color: g.info.color || colors.green,
      title: count === 1 ? g.info.label : `${g.info.label} · ${count} ngựa`,
      subtitle: g.horses.map((h) => h.name).filter(Boolean).join(', '),
      badge: late ? LATE : g.done ? TASK_STATUS.completed : status && g.tasks[0].status !== 'pending' ? status : null,
      count,
      horseId: g.horses[0].id,
      horseName: g.horses[0].name,
      tab: TAB_OF[g.taskType] || 'Việc',
    };
  });

  const sessionRows = sessions
    .filter((s) => myHorseIds.has(refId(s.horse)) && isSameDay(s.scheduledAt, now) && !SESSION_HIDDEN.includes(s.status))
    .map((s) => {
      const horseId = refId(s.horse);
      const name = horseName(horseId, s.horse);
      return {
        key: `session-${s._id}`,
        kind: 'session',
        time: formatTime(s.scheduledAt),
        done: SESSION_OVER.includes(s.status),
        late: false,
        live: s.status === 'in_progress',
        icon: 'session',
        color: colors.blue,
        title: s.sessionType === 'trial_run' ? 'Chạy thử' : 'Buổi tập',
        subtitle: name,
        badge: s.status === 'scheduled' ? null : SESSION_STATUS[s.status] || null,
        count: 1,
        horseId,
        horseName: name,
        tab: null,
      };
    });

  const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
  const all = [...taskRows, ...sessionRows].sort(byTime);
  const open = all.filter((r) => !r.done);
  const done = all.filter((r) => r.done);

  // What to do next: a session running now first, then the soonest one still ahead, and only then
  // whatever is already late (the oldest first).
  const next = open.find((r) => r.live) || open.find((r) => !r.late && (r.time || '99:99') >= clock) || open[0] || null;
  const nowIndex = open.findIndex((r) => !r.live && (r.time || '99:99') >= clock);

  return { all, open, done, next, nowIndex, clock };
}
