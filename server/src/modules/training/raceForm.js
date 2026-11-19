const clubPolicy = require('../../config/clubPolicy');
const { SESSION_DONE_STATUSES, PHASE_LABELS } = require('../../constants/training');
const { startOfDay, ddmm, DAY_MS, TRIAL_DAYS_BEFORE_RACE } = require('./trainingPlan.service');
const { phaseCompletion } = require('./planProgress');

const PHASE_STATE_WORDS = {
  current: (p) => `Đang tập (tới ${ddmm(p.endDate)})`,
  ahead: (p) => `Từ ${ddmm(p.startDate)}`,
  unfinished: () => 'Chưa được đánh giá hoàn thành',
};

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
 * - phases, checkpoints: the plan's phases (with startDate/endDate) and its checkpoints. Given, the horse
 *   is judged by its phases: each build-up phase before the taper must have been judged done by the
 *   trainer (planProgress.js phaseCompletion) — the session figures are what that judgement weighed, so
 *   they are shown, not checked again.
 *
 * Returns { status: blocked | pending | not_ready | on_track | ready, label, done, due, met, rated,
 * trial: null | ahead | missing | failed | ran | passed, trialDay, phases, reasons }.
 */
function raceForm({ stats = [], trials = [], race = null, raceBlock = null, now = new Date(), phases = null, checkpoints = [] }) {
  const past = stats.filter((s) => new Date(s.at) < now);
  const doneList = past.filter((s) => SESSION_DONE_STATUSES.includes(s.status));
  const due = doneList.length + past.filter((s) => ['missed', 'aborted'].includes(s.status)).length;
  const rated = doneList.filter((s) => s.met === true || s.met === false);
  const met = rated.filter((s) => s.met === true).length;
  const ratingValues = doneList.map((s) => Number(s.rating)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 10);
  const ratedRatingCount = ratingValues.length;
  const avgRating = ratedRatingCount ? Math.round((ratingValues.reduce((a, b) => a + b, 0) / ratedRatingCount) * 10) / 10 : null;

  const raceOn = race && !['withdrawn', 'completed'].includes(race.status) ? race : null;
  const trialDay = raceOn ? new Date(startOfDay(raceOn.raceDate).getTime() - TRIAL_DAYS_BEFORE_RACE * DAY_MS) : null;
  let trial = null;
  if (raceOn) {
    const run = trials[0];
    if (run) trial = run.met === false ? 'failed' : run.met === true ? 'passed' : 'ran';
    else trial = trialDay >= startOfDay(now) ? 'ahead' : 'missing';
  }

  const doneOk = !due || doneList.length / due >= clubPolicy.raceFormMinDone;
  const metOk = !rated.length || met / rated.length >= clubPolicy.raceFormMinMet;
  const ratingOk = !ratedRatingCount || avgRating >= clubPolicy.raceFormMinAvgRating;
  const trialOk = !raceOn || trial === 'passed' || trial === 'ran';
  // By its phases: each build-up phase before the taper judged done by the trainer.
  const stages = phases?.length ? phaseCompletion(phases, checkpoints, now) : null;

  const checks = [
    { key: 'vet', label: 'Y tế bác sĩ', ok: !raceBlock, detail: raceBlock || 'Đủ điều kiện tập' },
    ...(stages
      ? stages.map((s) => ({
          key: `phase-${s.index}`,
          label: PHASE_LABELS[s.key] || s.key,
          ok: s.state === 'passed' ? true : s.state === 'unfinished' ? false : null,
          detail: s.state === 'passed' ? `HLV đánh giá hoàn thành${s.at ? ` ${ddmm(s.at)}` : ''}` : PHASE_STATE_WORDS[s.state](s),
        }))
      : [
          {
            key: 'attendance',
            label: `Chuyên cần ≥ ${percent(clubPolicy.raceFormMinDone)}`,
            ok: due ? doneOk : null,
            detail: due ? `${doneList.length}/${due} buổi` : 'Chưa có buổi đến hạn',
          },
          {
            key: 'targetRate',
            label: `Đạt chỉ tiêu ≥ ${percent(clubPolicy.raceFormMinMet)}`,
            ok: rated.length ? metOk : null,
            detail: rated.length ? `${met}/${rated.length} buổi` : 'Chưa có buổi có chỉ tiêu',
          },
          {
            key: 'trainerRating',
            label: `Điểm HLV ≥ ${clubPolicy.raceFormMinAvgRating}/10`,
            ok: ratedRatingCount ? ratingOk : null,
            detail: ratedRatingCount ? `${avgRating}/10 (${ratedRatingCount} buổi)` : 'Chưa chấm điểm',
          },
        ]),
    ...(raceOn
      ? [
          {
            key: 'trial',
            label: 'Chạy thử giải',
            ok: trial === 'ahead' ? null : trialOk,
            detail:
              trial === 'passed'
                ? 'Đã đạt'
                : trial === 'ran'
                  ? 'Đã chạy thử'
                  : trial === 'ahead'
                    ? `Lịch ${ddmm(trialDay)}`
                    : trial === 'failed'
                      ? 'Chưa đạt'
                      : `Quá hạn ${ddmm(trialDay)}`,
          },
        ]
      : []),
  ];

  const result = (status, label, reasons) => ({
    status,
    label,
    done: doneList.length,
    due,
    met,
    rated: rated.length,
    avgRating,
    ratedRatingCount,
    trial,
    trialDay,
    phases: stages,
    checks,
    reasons,
  });

  if (raceBlock) return result('blocked', 'Không đủ điều kiện', [raceBlock]);
  const reasons = [];
  if (stages) {
    const unfinished = stages.filter((s) => s.state === 'unfinished');
    if (unfinished.length) reasons.push(`Chưa hoàn thành giai đoạn ${unfinished.map((s) => PHASE_LABELS[s.key]).join(', ')} — HLV chưa đánh giá đạt.`);
    if (trial === 'failed') reasons.push('Chạy thử cho giải chưa đạt chỉ tiêu.');
    if (trial === 'missing') reasons.push(`Chưa chạy thử cho giải (lịch chạy thử ${ddmm(trialDay)} đã qua).`);
    if (reasons.length) return result('not_ready', 'Chưa đạt', reasons);
    const left = stages.filter((s) => s.state !== 'passed');
    if (left.length) {
      const inPhase = left.find((s) => s.state === 'current');
      return result('on_track', 'Đang chuẩn bị', [
        `${inPhase ? `Đang ở giai đoạn ${PHASE_LABELS[inPhase.key]}. ` : ''}Cần HLV đánh giá hoàn thành ${left.map((s) => PHASE_LABELS[s.key]).join(', ')} trước khi dự giải.`,
      ]);
    }
    if (trial === 'ahead') return result('on_track', 'Đúng tiến độ', [`Đã hoàn thành các giai đoạn; còn buổi chạy thử ${ddmm(trialDay)} trước khi quyết định dự giải.`]);
    return result('ready', raceOn ? 'Đủ điều kiện dự giải' : 'Hoàn thành các giai đoạn', []);
  }
  if (due && !doneOk) {
    reasons.push(`Mới tập ${doneList.length}/${due} buổi đến hạn (cần từ ${percent(clubPolicy.raceFormMinDone)}).`);
  }
  if (rated.length && !metOk) {
    reasons.push(`Đạt chỉ tiêu ${met}/${rated.length} buổi đã tập (cần từ ${percent(clubPolicy.raceFormMinMet)}).`);
  }
  if (ratedRatingCount && !ratingOk) {
    reasons.push(`Điểm phong độ TB ${avgRating}/10 (cần từ ${clubPolicy.raceFormMinAvgRating}/10).`);
  }
  if (trial === 'failed') reasons.push('Chạy thử cho giải chưa đạt chỉ tiêu.');
  if (trial === 'missing') reasons.push(`Chưa chạy thử cho giải (lịch chạy thử ${ddmm(trialDay)} đã qua).`);
  if (reasons.length) return result('not_ready', 'Chưa đạt', reasons);
  if (!due) return result('pending', 'Chưa đủ dữ liệu', ['Chưa có buổi tập nào đến hạn.']);
  if (trial === 'ahead') return result('on_track', 'Đúng tiến độ', [`Còn buổi chạy thử ${ddmm(trialDay)} trước khi quyết định dự giải.`]);
  return result('ready', raceOn ? 'Đủ điều kiện dự giải' : 'Phong độ tốt', []);
}

module.exports = { raceForm };
