import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Segmented } from 'antd';
import { AimOutlined, CalendarOutlined, CommentOutlined, FlagOutlined, HistoryOutlined, LineChartOutlined, ScheduleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PLAN_STATUS_LABELS } from '../training/trainingVocab';
import LiveSessionMonitor from '../training/LiveSessionMonitor';
import PlanTimeline from '../training/PlanTimeline';
import { raceLine, whereNow } from '../training/PlanFocusPanel';
import { trainingChartRows, trainingChartTotals } from '../horses/trainingChart';
import { Card, DateChip, EmptyNote, HorseAvatar, MoreButton, Pill, Row, Stats, Tiles } from './kit';
import { RatingLine, TrainingBars } from './charts';
import Timetable from './Timetable';
import SessionDetail from './SessionDetail';
import { hasVideo, mondayOf, startOf } from './trainingLook';
import {
  DONE_SESSION,
  INTENSITY_LABELS,
  OPEN_SESSION,
  PHASE_LABELS,
  SURFACE_LABELS,
  fmtDate,
  fmtDateTime,
  fmtShort,
  idOf,
  ratingTone,
  relDay,
  sessionKind,
  weekday,
} from './ownerFormat';
import { horseName } from './ownerInsights';
import { usePlans, useSessions, useTabParam, useTrainingChart } from './useOwnerData';

const VIEWS = ['sessions', 'plans', 'reviews'];
const PLAN_TONES = { draft: 'neutral', active: 'good', completed: 'info', cancelled: 'neutral' };
const metricsText = (m) => (m ? [m.distance && `${m.distance} m`, m.maxSpeed && `${m.maxSpeed} km/h`, m.avgHeartRate && `${m.avgHeartRate} bpm`].filter(Boolean).join(' · ') : '');

/** A running plan in a few lines: the phases with today on them, where the horse is, its race. */
function PlanSummary({ plan, horse, showHorse }) {
  const race = raceLine(plan);
  return (
    <div className="own-plan">
      <div className="own-plan-head">
        {showHorse && <HorseAvatar horse={horse || plan.horse} size={30} />}
        <div className="min-w-0">
          <div className="own-plan-title">{showHorse ? `${plan.horse?.name || horse?.name || 'Ngựa'} · ` : ''}{PHASE_LABELS[plan.phase] || plan.phase}</div>
          <div className="own-plan-sub">{whereNow(plan)}</div>
        </div>
        <div className="own-plan-side">
          {plan.pause?.since ? <Pill tone="bad">Tạm nghỉ vì sức khỏe</Pill> : <Pill tone={plan.intensity === 'high' ? 'watch' : 'neutral'}>Cường độ {(INTENSITY_LABELS[plan.intensity] || '').toLowerCase()}</Pill>}
        </div>
      </div>
      {plan.phases?.length > 0 && <PlanTimeline phases={plan.phases} raceDate={plan.targetRace?.status === 'withdrawn' ? null : plan.targetRace?.raceDate} compact />}
      <div className="own-plan-foot">
        {race ? (
          <span>
            <FlagOutlined /> {race}
          </span>
        ) : (
          <span className="own-faint">Không nhắm giải cụ thể</span>
        )}
        {plan.goal && <span className="own-faint">Mục tiêu: {plan.goal}</span>}
      </div>
    </div>
  );
}

/**
 * The training of one horse (horseId) or of all the owner's horses, read-only: a run going on now, live;
 * the figures; the plan; then three tabs — the week's timetable (a click on a session opens it, with its
 * video), the plans the trainer follows, the trainer's ratings and comments. A notification of a finished
 * run opens here on that session (?session=).
 */
export default function TrainingDetail({ horses, horseId = null }) {
  const { sessions } = useSessions();
  const { plans } = usePlans();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useTabParam(VIEWS, 'view');
  const [week, setWeek] = useState(() => mondayOf(dayjs()));
  const [reviewsShown, setReviewsShown] = useState(8);
  const [open, setOpen] = useState(null);
  const { chart } = useTrainingChart({ months: 6, horse: horseId || undefined });

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const plansById = useMemo(() => new Map(plans.map((p) => [idOf(p), p])), [plans]);
  const ids = useMemo(() => new Set(horseId ? [String(horseId)] : horsesById.keys()), [horseId, horsesById]);
  const multi = !horseId && horses.length > 1;
  const horseOf = (s) => horsesById.get(idOf(s.horse));
  const planOf = (s) => plansById.get(idOf(s.trainingPlan));

  const mine = useMemo(() => sessions.filter((s) => ids.has(idOf(s.horse))), [sessions, ids]);
  const now = dayjs();
  const running = mine.filter((s) => s.status === 'in_progress');
  const upcoming = mine.filter((s) => OPEN_SESSION.includes(s.status) && s.status !== 'in_progress' && dayjs(s.scheduledAt).isAfter(now)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const past = mine.filter((s) => !upcoming.includes(s) && s.status !== 'in_progress').sort((a, b) => new Date(startOf(b)) - new Date(startOf(a)));
  const done = past.filter((s) => DONE_SESSION.includes(s.status));
  const judged = done.filter((s) => s.outcome?.met === true || s.outcome?.met === false);
  const rated = done.filter((s) => s.performanceRating);
  const reviews = past.filter((s) => s.performanceRating || s.trainerComment);
  const videos = past.filter(hasVideo);
  const myPlans = useMemo(
    () => plans.filter((p) => ids.has(idOf(p.horse))).sort((a, b) => (b.status === 'active') - (a.status === 'active') || new Date(b.startDate) - new Date(a.startDate)),
    [plans, ids],
  );
  const active = myPlans.filter((p) => p.status === 'active');
  const others = myPlans.filter((p) => p.status !== 'active');
  const chartRows = useMemo(() => trainingChartRows(chart), [chart]);
  const chartTotals = trainingChartTotals(chartRows);
  const ratingPoints = rated
    .slice(0, 30)
    .reverse()
    .map((s) => ({ key: s._id, label: fmtShort(s.scheduledAt), full: fmtDateTime(s.scheduledAt), rating: s.performanceRating, sub: `${sessionKind(s)}${multi ? ` · ${horseName(s.horse, horsesById)}` : ''}` }));
  const who = (s) => (multi ? `${horseName(s.horse, horsesById)} · ` : '');

  // A notification of a finished run lands here with ?session=<id>: that session opens, its week shown.
  const wanted = params.get('session');
  useEffect(() => {
    if (!wanted || !sessions.length) return;
    const found = sessions.find((s) => idOf(s) === wanted);
    if (!found) return;
    setView('sessions');
    setWeek(mondayOf(startOf(found)));
    setOpen(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, sessions]);
  const close = () => {
    setOpen(null);
    if (wanted) {
      const next = new URLSearchParams(params);
      next.delete('session');
      setParams(next, { replace: true });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {running.length > 0 && (
        <Card title="Đang tập trực tiếp" icon={<span className="own-live-dot" aria-hidden="true" />} extra={<span className="own-faint text-xs">Số đo cập nhật mỗi 5 giây</span>} className="own-live">
          <LiveSessionMonitor readOnly sessions={running} horses={horses} plans={plans} />
        </Card>
      )}

      <Stats
        items={[
          { label: 'Sắp diễn ra', icon: <CalendarOutlined />, value: upcoming.length, sub: upcoming[0] ? `Gần nhất ${fmtDateTime(upcoming[0].scheduledAt)}` : 'Chưa có buổi nào được xếp' },
          { label: 'Đã hoàn thành', icon: <HistoryOutlined />, value: done.length, sub: `${videos.length} buổi có video xem lại` },
          {
            label: 'Đạt chỉ tiêu',
            icon: <AimOutlined />,
            value: judged.length ? `${Math.round((judged.filter((s) => s.outcome.met).length / judged.length) * 100)}%` : '—',
            sub: judged.length ? `${judged.filter((s) => s.outcome.met).length}/${judged.length} buổi có đánh giá chỉ tiêu` : 'Chưa có buổi nào được đối chiếu',
          },
          {
            label: 'Điểm HLV trung bình',
            icon: <CommentOutlined />,
            value: rated.length ? `${(rated.reduce((t, s) => t + s.performanceRating, 0) / rated.length).toFixed(1)}/10` : '—',
            sub: rated.length ? `Trên ${rated.length} buổi được chấm` : 'HLV chưa chấm buổi nào',
          },
        ]}
      />

      {!multi && active.length > 0 && (
        <Card title="Kế hoạch đang áp dụng" icon={<ScheduleOutlined />}>
          {active.map((p) => (
            <PlanSummary key={p._id} plan={p} horse={horsesById.get(idOf(p.horse))} />
          ))}
        </Card>
      )}

      <div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'sessions', label: 'Lịch tập' },
            { value: 'plans', label: `Kế hoạch (${myPlans.length})` },
            { value: 'reviews', label: `Nhận xét HLV (${reviews.length})` },
          ]}
        />
      </div>

      {view === 'sessions' && (
        <>
          <Card title="Lịch tập" icon={<CalendarOutlined />} extra={<span className="own-faint text-xs">Bấm vào một buổi để xem chi tiết và video</span>}>
            <Timetable sessions={mine} weekStart={week} onWeek={setWeek} onOpen={setOpen} horseOf={multi ? (s) => horsesById.get(idOf(s.horse)) || (s.horse?.name ? s.horse : null) : null} />
          </Card>
          <Card title="Số buổi hoàn thành 6 tháng qua" icon={<LineChartOutlined />}>
            {chartTotals.sessions === 0 ? <EmptyNote>Chưa có buổi tập nào hoàn thành trong 6 tháng qua.</EmptyNote> : <TrainingBars rows={chartRows} height={180} />}
          </Card>
        </>
      )}

      {view === 'plans' && (
        <>
          {active.length === 0 && others.length === 0 && (
            <Card>
              <EmptyNote>HLV chưa lập kế hoạch huấn luyện nào.</EmptyNote>
            </Card>
          )}
          {active.length > 0 && (
            <Card title={`Đang áp dụng (${active.length})`} icon={<ScheduleOutlined />}>
              {multi ? (
                <div className="own-grid-2">
                  {active.map((p) => (
                    <PlanSummary key={p._id} plan={p} horse={horsesById.get(idOf(p.horse))} showHorse />
                  ))}
                </div>
              ) : (
                active.map((p) => (
                  <div key={p._id} className="flex flex-col gap-3">
                    <PlanSummary plan={p} horse={horsesById.get(idOf(p.horse))} />
                    <Tiles
                      items={[
                        { label: 'Cự ly mục tiêu', value: p.distanceTarget ? `${p.distanceTarget} m` : '—', sub: SURFACE_LABELS[p.surface] },
                        { label: 'Khối lượng / tuần', value: p.weeklyVolumeKm ? `${p.weeklyVolumeKm} km` : '—', sub: `Cường độ ${(INTENSITY_LABELS[p.intensity] || '').toLowerCase()}` },
                        { label: 'Thời gian', value: `${fmtShort(p.startDate)} – ${p.endDate ? fmtShort(p.endDate) : '…'}`, sub: p.endDate ? `Kết thúc ${relDay(p.endDate)}` : 'Chưa định ngày kết thúc' },
                      ]}
                    />
                    {p.notes && <div className="own-quote">{p.notes}</div>}
                  </div>
                ))
              )}
            </Card>
          )}
          {others.length > 0 && (
            <Card title={`Đã xong và đã hủy (${others.length})`} icon={<HistoryOutlined />} flush>
              <ul className="own-list">
                {others.map((p) => (
                  <li key={p._id}>
                    <Row
                      lead={multi ? <HorseAvatar horse={horsesById.get(idOf(p.horse)) || p.horse} size={32} /> : <span className="own-icon is-brass"><ScheduleOutlined /></span>}
                      title={`${multi ? `${horseName(p.horse, horsesById)} · ` : ''}${PHASE_LABELS[p.phase] || p.phase}`}
                      sub={[`${fmtDate(p.startDate)} – ${p.endDate ? fmtDate(p.endDate) : 'chưa định'}`, p.distanceTarget && `cự ly ${p.distanceTarget} m`, p.goal].filter(Boolean).join(' · ')}
                      side={<Pill tone={PLAN_TONES[p.status]}>{PLAN_STATUS_LABELS[p.status] || p.status}</Pill>}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {view === 'reviews' && (
        <>
          {ratingPoints.length >= 2 && (
            <Card title="Điểm HLV qua các buổi" icon={<LineChartOutlined />}>
              <RatingLine points={ratingPoints} />
            </Card>
          )}
          <Card title="Nhận xét của HLV" icon={<CommentOutlined />} flush>
            {reviews.length === 0 ? (
              <EmptyNote>HLV chưa nhận xét buổi tập nào.</EmptyNote>
            ) : (
              <>
                <ul className="own-list">
                  {reviews.slice(0, reviewsShown).map((s) => (
                    <li key={s._id}>
                      <button type="button" className="own-row" onClick={() => setOpen(s)}>
                        <DateChip date={startOf(s)} sub={weekday(startOf(s))} />
                        <div className="own-row-main">
                          <div className="own-row-title">
                            {who(s)}
                            {sessionKind(s)}
                            {hasVideo(s) && <VideoCameraOutlined className="own-row-video" aria-label="Có video" />}
                          </div>
                          <div className="own-row-sub">{[fmtDateTime(startOf(s)), metricsText(s.metrics)].filter(Boolean).join(' · ')}</div>
                          {s.trainerComment && <div className="own-quote">{s.trainerComment}</div>}
                        </div>
                        {s.performanceRating ? (
                          <div className="own-row-side">
                            <Pill tone={ratingTone(s.performanceRating)} dot={false}>
                              {s.performanceRating}/10
                            </Pill>
                          </div>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
                <MoreButton shown={reviewsShown} total={reviews.length} onMore={() => setReviewsShown((n) => n + 10)} />
              </>
            )}
          </Card>
        </>
      )}

      <SessionDetail session={open} horse={open && horseOf(open)} plan={open && planOf(open)} onClose={close} />
    </div>
  );
}
