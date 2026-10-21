import { useMemo } from 'react';
import { CheckCircleOutlined, ClockCircleOutlined, CoffeeOutlined, StopOutlined, UnorderedListOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import HorseStallCard from '../stable/HorseStallCard';
import { MEAL_CONFIG, MEAL_ORDER, TASK_CONFIG, TASK_STATUS_CONFIG, getFeedTypeLabel } from '../stable/groomConfig';
import { Card, EmptyNote, Pill, Row } from './kit';
import { fmtTime, idOf } from './ownerFormat';
import { useDailyTasks, useFeedings } from './useOwnerData';

const APPETITE = { full: 'ăn hết', partial: 'ăn một phần', refused: 'bỏ ăn' };
const MANURE = { normal: 'phân bình thường', dry: 'phân khô', loose: 'phân lỏng', none: 'không đi phân' };
const WATER = { normal: 'uống nước bình thường', high: 'uống nhiều nước', low: 'uống ít nước' };
const STATUS_TONES = { pending: 'neutral', completed: 'good', skipped: 'watch' };

/** What the groom saw while doing the task, only the parts filled in. */
const observationText = (o) =>
  o ? [APPETITE[o.appetite], o.amountEatenPercent != null && `${o.amountEatenPercent}% khẩu phần`, MANURE[o.manure], WATER[o.waterIntake], o.behaviourNote].filter(Boolean).join(' · ') : '';

/**
 * Where one horse lives and how it is looked after today: its stall in 3D with its groom, today's care
 * work and its rations. Read-only: placing horses is the Manager's, the work is the groom's.
 * `showStall={false}` leaves the stall out, for a page that shows the barn itself.
 */
export default function StableDetail({ horse, showStall = true }) {
  const id = idOf(horse);
  const { tasks, isLoading } = useDailyTasks();
  const { feedings } = useFeedings();
  const today = useMemo(
    () =>
      tasks
        .filter((t) => idOf(t.horse) === id && dayjs(t.scheduledDate).isSame(dayjs(), 'day'))
        .sort((a, b) => (a.dueTime || '99').localeCompare(b.dueTime || '99')),
    [tasks, id],
  );
  const rations = feedings.filter((f) => idOf(f.horse) === id);
  const doneCount = today.filter((t) => t.status === 'completed').length;

  return (
    <div className="flex flex-col gap-4">
      {/* The stall in 3D, its code, zone and groom: the stable map, as the Manager keeps it. */}
      {showStall && <HorseStallCard horseId={id} canManage={false} />}

      <Card
        title="Việc chăm sóc hôm nay"
        icon={<UnorderedListOutlined />}
        flush
        extra={<span className="own-faint text-xs">{today.length ? `${doneCount}/${today.length} việc xong · ` : ''}{dayjs().format('DD/MM/YYYY')}</span>}
      >
        {today.length === 0 ? (
          <EmptyNote>{isLoading ? 'Đang tải…' : 'Hôm nay chưa có việc chăm sóc nào cho ngựa này.'}</EmptyNote>
        ) : (
          <ul className="own-list">
            {today.map((t) => {
              const kind = TASK_CONFIG[t.taskType] || { label: t.taskType };
              const status = TASK_STATUS_CONFIG[t.status] || { label: t.status };
              const tone = STATUS_TONES[t.status] || 'neutral';
              const seen = t.status === 'completed' ? observationText(t.observation) : '';
              return (
                <li key={t._id}>
                  <Row
                    lead={<span className={`own-icon is-${tone === 'neutral' ? 'brass' : tone}`}>{t.status === 'completed' ? <CheckCircleOutlined /> : t.status === 'skipped' ? <StopOutlined /> : <ClockCircleOutlined />}</span>}
                    title={kind.label}
                    sub={[t.dueTime && `lúc ${t.dueTime}`, t.assignedTo?.name && `NV ${t.assignedTo.name}`, t.status === 'completed' && t.completedAt && `xong ${fmtTime(t.completedAt)}`].filter(Boolean).join(' · ') || null}
                    side={<Pill tone={tone}>{status.label}</Pill>}
                  >
                    {t.note && <div className="own-row-sub">{t.note}</div>}
                    {seen && <div className="own-row-sub">Ghi nhận: {seen}</div>}
                    {t.status === 'skipped' && t.skipReason && <div className="own-row-sub own-watch">Lý do bỏ qua: {t.skipReason}</div>}
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Khẩu phần ăn" icon={<CoffeeOutlined />}>
        <div className="own-meals">
          {MEAL_ORDER.map((slot) => {
            const meal = MEAL_CONFIG[slot];
            const plans = rations.filter((f) => f.mealTime === slot);
            return (
              <div className="own-meal" key={slot}>
                <div className="own-meal-head">
                  <span>{meal.label}</span>
                  <span className="own-faint own-num text-xs">{meal.time}</span>
                </div>
                {plans.length === 0 ? (
                  <div className="own-faint text-sm">Chưa thiết lập khẩu phần</div>
                ) : (
                  plans.map((p) => (
                    <div key={p._id}>
                      {(p.items || []).map((item, i) => (
                        <div className="own-meal-item" key={`${item.type}-${i}`}>
                          <span className="own-muted">{getFeedTypeLabel(item.type).label}</span>
                          <b className="own-num">{item.quantity}</b>
                        </div>
                      ))}
                      <div className="mt-2">
                        <Pill tone={p.approvedBy ? 'good' : 'watch'}>{p.approvedBy ? `Đã duyệt${p.approvedBy.name ? ` · ${p.approvedBy.name}` : ''}` : 'Chờ duyệt'}</Pill>
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
