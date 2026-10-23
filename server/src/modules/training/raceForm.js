const clubPolicy = require('../../config/clubPolicy');
const { SESSION_DONE_STATUSES } = require('../../constants/training');
const { startOfDay, ddmm, DAY_MS, TRIAL_DAYS_BEFORE_RACE } = require('./trainingPlan.service');

const percent = (share) => `${Math.round(share * 100)}%`;

/**
 * Whether a horse is on form for its race, from its plan so far (start to today, or the whole cycle
 * once it is over): the share of the sessions that came due that were run, the share of those that
 * met their targets, the trial for the race, and the vet. A guide for the trainer: the decision is
 * still theirs on the race page, where the server checks the vet again.
 *
 * - stats: the plan's sessions that were not called off, [{ at, status, met }]. A session still
 *   waiting to start is not counted yet: it becomes "missed" when its window closes.
 * - trials: the race's trial runs that were run ({ at, met }), newest first (raceDecision.service).
 * - raceBlock: why the vet keeps the horse from racing now (readiness getRaceBlock), or null.
 *
 * Returns { status: blocked | pending | not_ready | on_track | ready, label, done, due, met, rated,
 * trial: null | ahead | missing | failed | ran | passed, trialDay, reasons }.
 */
function raceForm({ stats = [], trials = [], race = null, raceBlock = null, now = new Date() }) {
  const past = stats.filter((s) => new Date(s.at) < now);
  const doneList = past.filter((s) => SESSION_DONE_STATUSES.includes(s.status));
  const due = doneList.length + past.filter((s) => ['missed', 'aborted'].includes(s.status)).length;
  const rated = doneList.filter((s) => s.met === true || s.met === false);
  const met = rated.filter((s) => s.met === true).length;

  const raceOn = race && !['withdrawn', 'completed'].includes(race.status) ? race : null;
  const trialDay = raceOn ? new Date(startOfDay(raceOn.raceDate).getTime() - TRIAL_DAYS_BEFORE_RACE * DAY_MS) : null;
  let trial = null;
  if (raceOn) {
    const run = trials[0];
    if (run) trial = run.met === false ? 'failed' : run.met === true ? 'passed' : 'ran';
    else trial = trialDay >= startOfDay(now) ? 'ahead' : 'missing';
  }
  const result = (status, label, reasons) => ({ status, label, done: doneList.length, due, met, rated: rated.length, trial, trialDay, reasons });

  if (raceBlock) return result('blocked', 'Không đủ điều kiện', [raceBlock]);
  const reasons = [];
  if (due && doneList.length / due < clubPolicy.raceFormMinDone) {
    reasons.push(`Mới tập ${doneList.length}/${due} buổi đến hạn (cần từ ${percent(clubPolicy.raceFormMinDone)}).`);
  }
  if (rated.length && met / rated.length < clubPolicy.raceFormMinMet) {
    reasons.push(`Đạt chỉ tiêu ${met}/${rated.length} buổi đã tập (cần từ ${percent(clubPolicy.raceFormMinMet)}).`);
  }
  if (trial === 'failed') reasons.push('Chạy thử cho giải chưa đạt chỉ tiêu.');
  if (trial === 'missing') reasons.push(`Chưa chạy thử cho giải (lịch chạy thử ${ddmm(trialDay)} đã qua).`);
  if (reasons.length) return result('not_ready', 'Chưa đạt', reasons);
  if (!due) return result('pending', 'Chưa đủ dữ liệu', ['Chưa có buổi tập nào đến hạn.']);
  if (trial === 'ahead') return result('on_track', 'Đúng tiến độ', [`Còn buổi chạy thử ${ddmm(trialDay)} trước khi quyết định dự giải.`]);
  return result('ready', raceOn ? 'Đủ điều kiện dự giải' : 'Phong độ tốt', []);
}

module.exports = { raceForm };
