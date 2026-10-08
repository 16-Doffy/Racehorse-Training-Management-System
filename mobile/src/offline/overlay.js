/**
 * What the groom has already done but the server has not heard yet, laid over the list the server
 * sent: a completed task shows as completed, with `pendingSync` so the screen can say "chờ gửi".
 * Without this the groom would tick a task offline and see it still open.
 */
export function applyOutbox(tasks, items) {
  if (!items.length) return tasks;
  const byTask = new Map();
  items.forEach((item) => {
    if (!item.taskId) return;
    byTask.set(item.taskId, [...(byTask.get(item.taskId) || []), item]);
  });
  if (!byTask.size) return tasks;

  return tasks.map((task) => {
    const waiting = byTask.get(task._id);
    if (!waiting) return task;
    let next = task;
    for (const item of waiting) {
      if (item.type === 'complete' && next.status === 'pending') {
        next = { ...next, status: 'completed', completedAt: new Date(item.createdAt).toISOString(), pendingSync: true, timing: { ...(next.timing || {}), canComplete: false } };
      } else if (item.type === 'notDone' && next.status === 'pending') {
        next = { ...next, status: 'skipped', skipReason: item.args?.reason, pendingSync: true, timing: { ...(next.timing || {}), canComplete: false } };
      } else if (item.type === 'incident') {
        next = { ...next, pendingSync: true };
      }
    }
    return next;
  });
}
