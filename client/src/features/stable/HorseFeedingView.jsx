import { useState } from 'react';
import { Alert, Button, Segmented, Spin, Tabs, Tag, Tooltip, Typography } from 'antd';
import './ration.css';
import { CloseOutlined, EditOutlined, PlusOutlined, ProfileOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { feedingApi } from '../feeding/feedingApi';
import { PHASE_LABELS } from '../training/trainingVocab';
import FeedingTimetable from './FeedingTimetable';
import FeedingDaysTable from './FeedingDaysTable';
import FeedingGroupsTable from './FeedingGroupsTable';
import { PhaseStrip, StockNeedList } from './FeedingPlanParts';
import { DIET_KINDS, RAMP_TEXT } from '../../constants/diet';
import { SLOTS, SLOT_LABELS, amountText, dayTotals, idOf, planEnd, stockNeed } from './feedingPlan';

// Whether to say the ration is still a suggestion the trainer has not confirmed: off until the ration flow is settled.
const SHOW_UNCONFIRMED_NOTE = false;

const { Text } = Typography;
const FIRST_DAYS = 14;

function Section({ title, hint, action, children, label }) {
  return (
    <section aria-label={label || title} className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="!m-0 !text-[15px] font-semibold">{title}</h3>
          {hint && (
            <Text type="secondary" className="!text-xs">
              {hint}
            </Text>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Every day from today to the plan's end, as confirmed (or, not yet confirmed, as suggested). */
function PlanDays({ calendar, feedItems }) {
  const [all, setAll] = useState(false);
  const [view, setView] = useState('group');
  const days = calendar.days.filter((d) => !d.past);
  const edited = (date, slot) => Boolean(days.find((d) => d.date === date)?.meals.find((m) => m.slot === slot)?.edited);
  const shown = all ? days : days.slice(0, FIRST_DAYS);
  const need = stockNeed(days.map((d) => ({ ...d, meals: d.meals.filter((m) => !d.locked?.[m.slot]) })), feedItems);
  const short = need.filter((r) => r.short);
  const unconfirmed = days.filter((d) => !d.approved || d.stale).length;
  const sickDiet = calendar.diet === 'sick' ? DIET_KINDS[calendar.sickKind || 'rest'] || DIET_KINDS.rest : null;
  const hasRamp = days.some((d) => d.ramp != null && d.ramp < 1);
  return (
    <div className="flex flex-col gap-2.5">
      <PhaseStrip days={days} />
      {sickDiet && (
        <Alert
          type="warning"
          showIcon
          title={`Đang áp dụng chế độ ăn khi bệnh: ${sickDiet.label}.`}
          description={`${sickDiet.does}${sickDiet.care ? ` ${sickDiet.care}` : ''} Khi bác sĩ kết luận đủ điều kiện, lịch tự tăng dần lại theo kế hoạch tập.`}
        />
      )}
      {!sickDiet && hasRamp && (
        <Alert
          type="info"
          showIcon
          title="Đang trong 7 ngày tập ăn lại sau bệnh."
          description={`Lịch ăn tự giảm nhẹ tinh bột (${RAMP_TEXT}) để hệ tiêu hóa quen lại rồi trở về 100% khẩu phần tập.`}
        />
      )}
      {/* Hidden for now (Duy, 06/11): the ration flow (confirm or apply by itself) is decided after the demo. */}
      {SHOW_UNCONFIRMED_NOTE && unconfirmed > 0 && (
        <Alert
          type="warning"
          showIcon
          title={
            unconfirmed === days.length
              ? 'Đây là khẩu phần gợi ý, chưa xác nhận: nhân viên chưa nhận lịch ăn theo kế hoạch tập.'
              : `${unconfirmed} ngày chưa xác nhận (kế hoạch tập đã đổi hoặc ngày mới thêm): các ngày đó đang là gợi ý.`
          }
        />
      )}
      {short.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={`Kho không đủ cho cả kỳ: ${short.map((r) => `${r.name} thiếu ${amountText(r.needed - r.inStock)} ${r.unit}`).join('; ')}. Quản lý cần nhập thêm.`}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="small"
          value={view}
          onChange={setView}
          options={[
            { value: 'group', label: 'Theo nhóm ngày' },
            { value: 'day', label: 'Từng ngày' },
          ]}
        />
        {view === 'group' && (
          <Text type="secondary" className="!text-xs">
            Mỗi thẻ là các ngày ăn giống nhau; rê chuột vào ô ngày để xem đủ các ngày.
          </Text>
        )}
      </div>
      {view === 'group' ? (
        <FeedingGroupsTable days={days} edited={edited} />
      ) : (
        <FeedingDaysTable days={shown} phases={calendar.phases} edited={edited} />
      )}
      {view === 'day' && days.length > FIRST_DAYS && (
        <Button className="!self-center" onClick={() => setAll(!all)}>
          {all ? `Thu gọn về ${FIRST_DAYS} ngày đầu` : `Xem toàn bộ ${days.length} ngày`}
        </Button>
      )}
      {need.length > 0 && (
        <details className="light-surface-box rounded-xl border border-gray-200 bg-white px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">Lượng thức ăn cả kỳ so với kho</summary>
          <div className="mt-2">
            <StockNeedList rows={need} />
          </div>
        </details>
      )}
    </div>
  );
}

/** The same meals every day, for a horse without a plan: each meal's time, foods and approval. */
function DailyRations({ rations }) {
  const total = dayTotals(rations.map((r) => ({ items: (r.items || []).filter((i) => i.inventoryItem).map((i) => ({ amount: i.amount, unit: i.inventoryItem.unit })) })));
  // On the sick diet the rations keep their healthy items aside, given back once the horse is fit.
  const kept = rations.filter((r) => r.healthyItems?.length);
  return (
    <div className="flex flex-col gap-2">
      {kept.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="Đang áp dụng chế độ ăn khi bệnh."
          description={`Khẩu phần dưới đây là ${SICK_DIET_TEXT}. Khẩu phần lúc khỏe (${kept
            .map((r) => `${SLOT_LABELS[r.mealTime].toLowerCase()}: ${r.healthyItems.map((i) => i.quantity || `${i.amount} ${i.unit || ''}`).join(' + ')}`)
            .join('; ')}) được giữ lại và tự trả về khi bác sĩ kết luận đủ điều kiện.`}
        />
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {SLOTS.map((slot) => {
          const r = rations.find((x) => x.mealTime === slot);
          return (
            <div key={slot} className={`light-surface-box rounded-xl border px-3 py-2.5 ${r ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{SLOT_LABELS[slot]}</span>
                {r && <span className="text-sm font-semibold tabular-nums text-gray-900">{r.timeOfDay}</span>}
              </div>
              {r ? (
                <>
                  <div className="mt-1.5 space-y-0.5">
                    {(r.items || []).map((i, idx) => (
                      <div key={idx} className="flex justify-between gap-2 text-xs text-gray-700">
                        <span>{i.inventoryItem?.name || i.type}</span>
                        <span className="tabular-nums font-medium text-gray-900">{i.inventoryItem ? `${amountText(i.amount)} ${i.inventoryItem.unit}` : i.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.approvedBy && r.items?.length ? (
                      <Tag color="green" className="!m-0">
                        Đã duyệt — {r.approvedBy.name}
                      </Tag>
                    ) : (
                      <Tag color="red" className="!m-0">
                        Chưa duyệt
                      </Tag>
                    )}
                    {(r.items || []).some((i) => !i.inventoryItem) && (
                      <Tag color="orange" className="!m-0">
                        Có món chưa gắn kho
                      </Tag>
                    )}
                    {(r.items || []).some((i) => typeof i.inventoryItem?.quantity === 'number' && i.inventoryItem.quantity < (i.amount || 0)) && (
                      <Tag color="red" className="!m-0">
                        Kho không đủ
                      </Tag>
                    )}
                  </div>
                </>
              ) : (
                <Text type="secondary" className="!mt-1 !block !text-xs">
                  Không có bữa này.
                </Text>
              )}
            </div>
          );
        })}
      </div>
      {total.length > 0 && (
        <Text type="secondary" className="!text-xs">
          Mỗi ngày: {total.map(([unit, n]) => `${amountText(n)} ${unit}`).join(' + ')}.
        </Text>
      )}
    </div>
  );
}

/**
 * One horse on the rations tab: who feeds it and the plan its meals follow, how its week went meal by
 * meal, then what it eats every day from today to the plan's end (or its daily ration without a plan),
 * with the way into the ration planner.
 */
export default function HorseFeedingView({ horseId, horses, plans, rations, assignmentOf, feedItems, onOpenPlanner, onBack, careContent }) {
  const horse = horses.find((h) => String(h._id) === String(horseId));
  const plan = plans.find((p) => p.status === 'active' && idOf(p.horse) === String(horseId));
  const assignment = horse ? assignmentOf(horse) : null;
  const mine = rations.filter((r) => idOf(r.horse) === String(horseId));
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['feeding-calendar', plan?._id],
    queryFn: () => feedingApi.calendar(plan._id),
    enabled: Boolean(plan),
  });
  const calendar = data?.data;
  const ahead = (calendar?.days || []).filter((d) => !d.past);
  const confirmed = ahead.filter((d) => d.approved && !d.stale).length;
  const stale = ahead.filter((d) => d.stale).length;
  const phaseNow = calendar?.days.find((d) => d.date === dayjs().format('YYYY-MM-DD'))?.phase || plan?.phase;
  const hasRations = plan ? confirmed > 0 : mine.length > 0;
  const [part, setPart] = useState('week');

  let status = null;
  if (plan && calendar) {
    if (!ahead.length) status = <Tag className="!m-0">Kế hoạch không còn ngày nào phía trước</Tag>;
    else if (confirmed === ahead.length) status = <Tag color="green" className="!m-0">Lịch ăn đã xác nhận đến {dayjs(ahead.at(-1).date).format('DD/MM/YYYY')}</Tag>;
    else if (stale) status = <Tag color="gold" className="!m-0">Kế hoạch tập đã đổi: {stale} ngày cần xác nhận lại</Tag>;
    else if (confirmed) status = <Tag color="blue" className="!m-0">Đã xác nhận {confirmed}/{ahead.length} ngày</Tag>;
    else status = <Tag color="orange" className="!m-0">Chưa tạo khẩu phần theo kế hoạch tập</Tag>;
  } else if (!plan) {
    status = mine.length ? <Tag color="green" className="!m-0">Khẩu phần hằng ngày</Tag> : <Tag color="orange" className="!m-0">Chưa có khẩu phần</Tag>;
  }

  const planBlock = (
    <div>{plan ? (
        <Section
          label="Lịch ăn theo kế hoạch huấn luyện"
          title="Lịch ăn từ hôm nay đến hết kế hoạch tập"
          hint="Từng bữa của từng ngày theo lịch tập: ngày tập nặng nhiều thức ăn tinh hơn, ngày nghỉ ít hơn. Bữa có chấm vàng là bữa HLV đã chỉnh khác gợi ý."
        >
          {isLoading ? (
            <div className="py-8 text-center">
              <Spin />
            </div>
          ) : isError ? (
            <Alert type="error" showIcon title={`Không tải được lịch ăn: ${error?.message}`} action={<Button onClick={() => refetch()}>Thử lại</Button>} />
          ) : calendar && ahead.length ? (
            <PlanDays calendar={calendar} feedItems={feedItems} />
          ) : (
            <Text type="secondary">Kế hoạch không còn ngày nào từ hôm nay.</Text>
          )}
        </Section>
      ) : (
        <Section
          title="Khẩu phần hằng ngày"
          hint="Ngựa chưa có kế hoạch tập đang áp dụng: các bữa dưới đây lặp lại mỗi ngày."
          action={
            <Link to="/training/plans" className="text-sm">
              Lập kế hoạch huấn luyện
            </Link>
          }
        >
          <DailyRations rations={mine} />
        </Section>
      )}</div>
  );

  return (
    <div className="rp-horse-view flex flex-col gap-4">
      {/* The horse in one compact card: who it is, where its meals stand, its facts as chips, the ways on. */}
      <section className="rp-horse">
        <div className="rp-horse-top">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="rp-horse-name">{horse?.name || 'Ngựa'}</span>
            <Tooltip title="Hồ sơ ngựa">
              <Link to={`/horses/${horseId}`} aria-label={`Hồ sơ ${horse?.name || 'ngựa'}`} className="text-gray-400 hover:text-emerald-700">
                <ProfileOutlined />
              </Link>
            </Tooltip>
            {status}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="primary" icon={hasRations ? <EditOutlined /> : <PlusOutlined />} onClick={() => onOpenPlanner(horseId)}>
              {hasRations ? 'Sửa khẩu phần ăn' : 'Tạo khẩu phần ăn'}
            </Button>
            <Button icon={<CloseOutlined />} onClick={onBack}>
              Tất cả ngựa
            </Button>
          </div>
        </div>
        <div className="rp-horse-facts">
          <span>
            <small>Cân nặng</small>
            {horse?.weightKg ? `${amountText(horse.weightKg)} kg` : <Text type="warning">Chưa nhập</Text>}
          </span>
          <span>
            <small>Người cho ăn</small>
            {assignment?.assignedCaretaker?.name ? `${assignment.assignedCaretaker.name}${assignment.stableBlock ? ` · ${assignment.stableBlock}` : ''}` : <Text type="warning">Chưa xếp chuồng</Text>}
          </span>
          <span title={plan?.goal}>
            <small>Kế hoạch tập</small>
            {plan ? `${plan.goal || 'Đang áp dụng'} (${dayjs(plan.startDate).format('DD/MM')} – ${planEnd(plan) ? dayjs(planEnd(plan)).format('DD/MM/YYYY') : '—'})` : 'Chưa có kế hoạch'}
          </span>
          <span>
            <small>Giai đoạn hôm nay</small>
            {plan ? PHASE_LABELS[phaseNow] || phaseNow || '—' : '—'}
          </span>
        </div>
      </section>

      {/* One part at a time instead of a long page to scroll. */}
      <Tabs
        className="rp-horse-tabs"
        activeKey={part}
        onChange={setPart}
        items={[
          { key: 'week', label: 'Lịch ăn tuần này', children: <FeedingTimetable horseId={horseId} /> },
          ...(careContent ? [{ key: 'care', label: 'Việc chăm sóc', children: <section aria-label="Việc chăm sóc của ngựa đang xem">{careContent}</section> }] : []),
          { key: 'plan', label: plan ? 'Khẩu phần theo kế hoạch tập' : 'Khẩu phần hằng ngày', children: planBlock },
        ]}
      />
    </div>
  );
}
