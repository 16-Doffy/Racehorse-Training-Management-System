import { useMemo, useState } from 'react';
import { Segmented } from 'antd';
import { AimOutlined, CalendarOutlined, CommentOutlined, HistoryOutlined, LineChartOutlined, PlayCircleOutlined, ScheduleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PLAN_STATUS_LABELS } from '../training/trainingVocab';
import { trainingChartRows, trainingChartTotals } from '../horses/trainingChart';
import { Card, DateChip, EmptyNote, HorseAvatar, MoreButton, Pill, Row, Stats, Tiles } from './kit';
import { RatingLine, TrainingBars } from './charts';
import {
  DONE_SESSION,
  INTENSITY_LABELS,
  OPEN_SESSION,
  PHASE_LABELS,
  SESSION_STATUS_LABELS,
  SESSION_TONES,
  SURFACE_LABELS,
  fmtDate,
  fmtDateTime,
  fmtShort,
  fmtTime,
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
const outcomePill = (s) => {
  if (s.status === 'aborted') return <Pill tone="bad">Dừng giữa chừng</Pill>;
  if (s.outcome?.met === true) return <Pill tone="good">Đạt chỉ tiêu</Pill>;
  if (s.outcome?.met === false) return <Pill tone="watch">Chưa đạt</Pill>;
  return <Pill tone={SESSION_TONES[s.status]}>{SESSION_STATUS_LABELS[s.status] || s.status}</Pill>;
};

/**
 * The training of one horse (horseId) or of all the owner's horses: what is booked, what was done and
 * how it went, the plan the trainer follows and the trainer's ratings and comments. Read-only.
 */
export default function TrainingDetail({ horses, horseId = null }) {
  const { sessions, isLoading } = useSessions();
  const { plans } = usePlans();
  const [view, setView] = useTabParam(VIEWS, 'view');
  const [pastShown, setPastShown] = useState(8);
  const [reviewsShown, setReviewsShown] = useState(8);
  const { chart } = useTrainingChart({ months: 6, horse: horseId || undefined });

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const ids = useMemo(() => new Set(horseId ? [String(horseId)] : horsesById.keys()), [horseId, horsesById]);
  const multi = !horseId && horses.length > 1;
  const today = dayjs().startOf('day');

  const mine = useMemo(() => sessions.filter((s) => ids.has(idOf(s.horse))), [sessions, ids]);
  const upcoming = useMemo(
    () => mine.filter((s) => OPEN_SESSION.includes(s.status) && dayjs(s.scheduledAt).isAfter(today)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
    [mine, today],
  );
  const past = useMemo(() => mine.filter((s) => !upcoming.includes(s)).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)), [mine, upcoming]);
  const done = past.filter((s) => DONE_SESSION.includes(s.status));
  const judged = done.filter((s) => s.outcome?.met === true || s.outcome?.met === false);
  const rated = done.filter((s) => s.performanceRating);
  const reviews = past.filter((s) => s.performanceRating || s.trainerComment);
  const myPlans = useMemo(
    () => plans.filter((p) => ids.has(idOf(p.horse))).sort((a, b) => (b.status === 'active') - (a.status === 'active') || new Date(b.startDate) - new Date(a.startDate)),
    [plans, ids],
  );
  const active = myPlans.filter((p) => p.status === 'active');
  const chartRows = useMemo(() => trainingChartRows(chart), [chart]);
  const chartTotals = trainingChartTotals(chartRows);
  const ratingPoints = rated
    .slice(0, 30)
    .reverse()
    .map((s) => ({ key: s._id, label: fmtShort(s.scheduledAt), full: fmtDateTime(s.scheduledAt), rating: s.performanceRating, sub: `${sessionKind(s)}${multi ? ` · ${horseName(s.horse, horsesById)}` : ''}` }));

  const who = (s) => (multi ? `${horseName(s.horse, horsesById)} · ` : '');

  return (
    <div className="flex flex-col gap-4">
      <Stats
        items={[
          { label: 'Sắp diễn ra', icon: <CalendarOutlined />, value: upcoming.length, sub: upcoming[0] ? `Gần nhất ${fmtDateTime(upcoming[0].scheduledAt)}` : 'Chưa có buổi nào được xếp' },
          { label: 'Đã hoàn thành', icon: <HistoryOutlined />, value: done.length, sub: 'Tổng số buổi đã tập xong' },
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

      {multi && active.length > 0 && (
        // All horses: one line per horse's running plan; picking a horse shows the plan in full.
        <Card title="Kế hoạch đang áp dụng" icon={<ScheduleOutlined />} flush>
          <ul className="own-list">
            {active.map((p) => (
              <li key={p._id}>
                <Row
                  lead={<HorseAvatar horse={horsesById.get(idOf(p.horse)) || p.horse} size={34} />}
                  title={`${horseName(p.horse, horsesById)} · ${PHASE_LABELS[p.phase] || p.phase}`}
                  sub={[
                    p.distanceTarget && `cự ly ${p.distanceTarget} m`,
                    p.weeklyVolumeKm && `${p.weeklyVolumeKm} km/tuần`,
                    `${fmtShort(p.startDate)} – ${p.endDate ? fmtShort(p.endDate) : '…'}`,
                    p.goal,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  side={<Pill tone={p.intensity === 'high' ? 'watch' : 'neutral'}>Cường độ {(INTENSITY_LABELS[p.intensity] || '').toLowerCase()}</Pill>}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!multi && active.map((p) => (
        <Card
          key={p._id}
          title="Kế hoạch đang áp dụng"
          icon={<ScheduleOutlined />}
          extra={<Pill tone="good">{PLAN_STATUS_LABELS.active}</Pill>}
        >
          <div className="flex flex-col gap-3">
            <Tiles
              items={[
                { label: 'Giai đoạn', value: PHASE_LABELS[p.phase] || p.phase },
                { label: 'Cự ly mục tiêu', value: p.distanceTarget ? `${p.distanceTarget} m` : '—', sub: SURFACE_LABELS[p.surface] },
                { label: 'Khối lượng / tuần', value: p.weeklyVolumeKm ? `${p.weeklyVolumeKm} km` : '—', sub: `Cường độ ${(INTENSITY_LABELS[p.intensity] || '').toLowerCase()}` },
                { label: 'Thời gian', value: `${fmtShort(p.startDate)} – ${p.endDate ? fmtShort(p.endDate) : '…'}`, sub: p.endDate ? `Kết thúc ${relDay(p.endDate)}` : 'Chưa định ngày kết thúc' },
              ]}
            />
            {p.goal && (
              <div className="own-muted">
                <b className="own-ink">Mục tiêu:</b> {p.goal}
              </div>
            )}
            {p.notes && <div className="own-quote">{p.notes}</div>}
          </div>
        </Card>
      ))}

      <div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'sessions', label: 'Buổi tập' },
            { value: 'plans', label: `Kế hoạch (${myPlans.length})` },
            { value: 'reviews', label: `Nhận xét HLV (${reviews.length})` },
          ]}
        />
      </div>

      {view === 'sessions' && (
        <>
          <Card title="Buổi tập hoàn thành 6 tháng qua" icon={<LineChartOutlined />}>
            {chartTotals.sessions === 0 ? <EmptyNote>Chưa có buổi tập nào hoàn thành trong 6 tháng qua.</EmptyNote> : <TrainingBars rows={chartRows} height={220} />}
          </Card>
          <div className="own-grid-2">
            <Card title="Sắp tới" icon={<CalendarOutlined />} flush>
              {upcoming.length === 0 ? (
                <EmptyNote>{isLoading ? 'Đang tải…' : 'Chưa có buổi tập nào được xếp.'}</EmptyNote>
              ) : (
                <ul className="own-list">
                  {upcoming.slice(0, 10).map((s) => (
                    <li key={s._id}>
                      <Row
                        lead={<DateChip date={s.scheduledAt} sub={weekday(s.scheduledAt)} />}
                        title={sessionKind(s)}
                        sub={`${who(s)}${fmtTime(s.scheduledAt)} · ${relDay(s.scheduledAt)} · cường độ ${(INTENSITY_LABELS[s.intensity] || '').toLowerCase()}`}
                        side={<Pill tone={SESSION_TONES[s.status]}>{SESSION_STATUS_LABELS[s.status] || s.status}</Pill>}
                      >
                        {s.status === 'blocked' && s.blockedReason && <div className="own-row-sub own-watch">{s.blockedReason}</div>}
                      </Row>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Đã tập" icon={<HistoryOutlined />} flush>
              {past.length === 0 ? (
                <EmptyNote>Chưa có buổi tập nào.</EmptyNote>
              ) : (
                <>
                  <ul className="own-list">
                    {past.slice(0, pastShown).map((s) => (
                      <li key={s._id}>
                        <Row
                          lead={<DateChip date={s.scheduledAt} sub={weekday(s.scheduledAt)} />}
                          title={sessionKind(s)}
                          sub={`${who(s)}${[metricsText(s.metrics), s.status === 'aborted' ? s.abortReason : s.outcome?.summary].filter(Boolean).join(' · ') || fmtDate(s.scheduledAt)}`}
                          side={
                            <>
                              {outcomePill(s)}
                              {s.performanceRating && (
                                <Pill tone={ratingTone(s.performanceRating)} dot={false}>
                                  {s.performanceRating}/10
                                </Pill>
                              )}
                            </>
                          }
                        >
                          {s.videoUrl && (
                            <a href={s.videoUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold inline-flex items-center gap-1 mt-0.5">
                              <PlayCircleOutlined /> Xem video
                            </a>
                          )}
                        </Row>
                      </li>
                    ))}
                  </ul>
                  <MoreButton shown={pastShown} total={past.length} onMore={() => setPastShown((n) => n + 10)} />
                </>
              )}
            </Card>
          </div>
        </>
      )}

      {view === 'plans' && (
        <Card title="Các kế hoạch huấn luyện" icon={<ScheduleOutlined />} flush>
          {myPlans.length === 0 ? (
            <EmptyNote>HLV chưa lập kế hoạch huấn luyện nào.</EmptyNote>
          ) : (
            <ul className="own-list">
              {myPlans.map((p) => (
                <li key={p._id}>
                  <Row
                    lead={<span className={`own-icon is-${p.status === 'active' ? 'good' : 'brass'}`}><ScheduleOutlined /></span>}
                    title={`${multi ? `${horseName(p.horse, horsesById)} · ` : ''}${PHASE_LABELS[p.phase] || p.phase}`}
                    sub={[
                      `${fmtDate(p.startDate)} – ${p.endDate ? fmtDate(p.endDate) : 'chưa định'}`,
                      p.distanceTarget && `cự ly ${p.distanceTarget} m`,
                      p.weeklyVolumeKm && `${p.weeklyVolumeKm} km/tuần`,
                      SURFACE_LABELS[p.surface],
                      `cường độ ${(INTENSITY_LABELS[p.intensity] || '').toLowerCase()}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    side={<Pill tone={PLAN_TONES[p.status]}>{PLAN_STATUS_LABELS[p.status] || p.status}</Pill>}
                  >
                    {p.goal && <div className="own-row-sub">Mục tiêu: {p.goal}</div>}
                  </Row>
                </li>
              ))}
            </ul>
          )}
        </Card>
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
                      <Row
                        lead={<DateChip date={s.scheduledAt} sub={weekday(s.scheduledAt)} />}
                        title={`${who(s)}${sessionKind(s)}`}
                        sub={[fmtDateTime(s.scheduledAt), metricsText(s.metrics)].filter(Boolean).join(' · ')}
                        side={
                          s.performanceRating ? (
                            <Pill tone={ratingTone(s.performanceRating)} dot={false}>
                              {s.performanceRating}/10
                            </Pill>
                          ) : null
                        }
                      >
                        {s.trainerComment && <div className="own-quote">{s.trainerComment}</div>}
                      </Row>
                    </li>
                  ))}
                </ul>
                <MoreButton shown={reviewsShown} total={reviews.length} onMore={() => setReviewsShown((n) => n + 10)} />
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
