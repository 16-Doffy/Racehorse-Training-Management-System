import { ROLES } from '../../constants/roles';

/**
 * Where a notification takes its reader: the page of their own role where the thing it is about
 * can be dealt with, opened on that thing (a horse filter, a session, a stock item). The bell
 * opens it on click, and the sidebar puts a red count on that page's menu entry until it is read.
 * Null when the reader has nothing to open for it.
 */
const idOf = (ref) => (ref ? String(ref._id || ref) : '');

const TRAINER_CARE = { meal_missed: 'tasks', task_assigned: 'tasks', care_order: 'tasks', incident_report: 'incidents', incident_update: 'incidents', low_stock: 'rations', ration_review: 'rations' };
const TRAINER_TRAINING = ['session_completed', 'session_scheduled', 'fitness_alert', 'readiness_override', 'injury_lock', 'training_restricted', 'training_unlocked'];
const RACES = ['race_review', 'race_decision', 'race_result'];
const VET_CARE = ['vaccination_due', 'deworming_due', 'farrier_due', 'exam_due'];

export function notificationTarget(n, role) {
  const horse = idOf(n.horse);
  const session = idOf(n.trainingSession);
  const item = idOf(n.inventoryItem);
  const withHorse = (path, extra = '') => `${path}${horse ? `${path.includes('?') ? '&' : '?'}horse=${horse}` : ''}${extra}`;

  if (role === ROLES.HEAD_TRAINER) {
    if (TRAINER_CARE[n.type]) return withHorse(`/stable/tasks?tab=${TRAINER_CARE[n.type]}`);
    if (TRAINER_TRAINING.includes(n.type)) return horse ? withHorse('/training/sessions', session ? `&session=${session}` : '') : '/training/sessions';
    if (RACES.includes(n.type)) return withHorse('/races');
    return horse ? `/horses/${horse}` : null;
  }
  if (role === ROLES.MANAGER) {
    if (n.type === 'low_stock') return item ? `/inventory?item=${item}` : '/inventory';
    if (n.type === 'restock_request') return item ? `/inventory?tab=requests&item=${item}` : '/inventory?tab=requests';
    return horse ? `/horses/${horse}` : null;
  }
  if (role === ROLES.VETERINARIAN) {
    if (n.type === 'exam_request' || n.type === 'incident_report' || n.type === 'incident_update') return '/veterinarian';
    if (n.type === 'care_order') return '/veterinarian/treatments';
    if (VET_CARE.includes(n.type)) return '/veterinarian/schedules';
    return horse ? `/veterinarian/horses/${horse}` : null;
  }
  if (role === ROLES.OWNER) {
    if (RACES.includes(n.type)) return '/owner/races';
    if (['injury_lock', 'training_restricted', 'training_unlocked', 'exam_request'].includes(n.type)) return '/owner/health';
    if (n.type.startsWith('session_') || n.type === 'fitness_alert') return '/owner/training';
    return horse ? `/horses/${horse}` : null;
  }
  return null;
}

/** The menu entry a target belongs to: the one whose path is the longest start of the target's path. */
export function menuKeyFor(target, menu) {
  if (!target) return null;
  const pathname = target.split('?')[0];
  let best = null;
  for (const m of menu) {
    const hit = m.path === '/' ? pathname === '/' : pathname === m.path || pathname.startsWith(`${m.path}/`);
    if (hit && (!best || m.path.length > best.path.length)) best = m;
  }
  return best?.key || null;
}
