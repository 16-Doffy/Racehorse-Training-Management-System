import { useState } from 'react';
import { Alert, Button, Modal, Radio, Tag, TimePicker, Typography } from 'antd';
import { DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import MealItemsEditor from './MealItemsEditor';
import { PHASE_SHORT, SESSION_KINDS } from '../training/trainingVocab';
import { MEAL_ROLES, SLOT_LABELS, WORK_COLORS, WORK_LABELS, amountText, dayLabel, itemsComplete, mealTimesProblem } from './feedingPlan';

const { Text } = Typography;
const mealText = (meal) => (meal?.items || []).map((i) => `${amountText(i.amount)} ${i.unit} ${i.name}`).join(' + ');

/**
 * One meal of one day in the planner: its time and foods, or no meal at all that day. What is set can
 * go to this day only, or to the same meal of the days like it from this day on (same phase and work,
 * the whole phase, or every day left), so a plan of many weeks is not edited a day at a time.
 * `target` = { date, slot, dates? } — `dates`: a group of days that eat the same (the folded view),
 * which the meal goes to by default; `days` = the planner's days; `onApply(dates, meal | null)`.
 */
export default function MealEditModal({ target, days, feedItems, gapHours, onApply, onClose, onPropose }) {
  const day = days.find((d) => d.date === target.date);
  const current = day.meals.find((m) => m.slot === target.slot);
  const suggested = day.suggested?.find((m) => m.slot === target.slot);
  const start = current || suggested || { slot: target.slot, time: dayjs().format('HH:mm'), items: [{}] };
  const group = (target.dates || []).filter((date) => !days.find((d) => d.date === date)?.locked?.[target.slot]);
  const [time, setTime] = useState(start.time);
  const [items, setItems] = useState(() => start.items.map((i) => ({ ...i })));
  const [scope, setScope] = useState(group.length > 1 ? 'group' : 'day');
  const [error, setError] = useState(null);

  // The days a scope reaches, from this day on; today's meal that already happened stays out.
  const ahead = days.filter((d) => d.date >= day.date && !d.locked?.[target.slot]);
  const scopes = [
    ...(group.length > 1 ? [{ value: 'group', dates: group, label: `Cả nhóm ${WORK_LABELS[day.work].toLowerCase()} này của giai đoạn ${PHASE_SHORT[day.phase] || day.phase}` }] : []),
    { value: 'day', dates: [day.date], label: `Chỉ ${dayLabel(day.date)}` },
    {
      value: 'kind',
      dates: ahead.filter((d) => d.phase === day.phase && d.work === day.work).map((d) => d.date),
      label: `Các ngày ${WORK_LABELS[day.work].toLowerCase()} của giai đoạn ${PHASE_SHORT[day.phase] || day.phase}`,
    },
    { value: 'phase', dates: ahead.filter((d) => d.phase === day.phase).map((d) => d.date), label: `Cả giai đoạn ${PHASE_SHORT[day.phase] || day.phase}` },
    { value: 'all', dates: ahead.map((d) => d.date), label: 'Tất cả các ngày còn lại của kế hoạch' },
  ];
  const chosen = scopes.find((s) => s.value === scope);

  // Checked against every day it goes to: each must keep its meals in their parts of the day, far enough apart.
  const check = (meal) => {
    for (const date of chosen.dates) {
      const d = days.find((x) => x.date === date);
      const meals = [...d.meals.filter((m) => m.slot !== target.slot), ...(meal ? [meal] : [])];
      if (!meals.length) return `${dayLabel(date)} sẽ không còn bữa nào — mỗi ngày cần ít nhất một bữa.`;
      const problem = mealTimesProblem(meals, gapHours);
      if (problem) return chosen.dates.length > 1 ? `${dayLabel(date)}: ${problem}` : problem;
    }
    return null;
  };
  const apply = () => {
    if (!itemsComplete(items)) return setError('Mỗi dòng cần chọn món trong kho và nhập lượng lớn hơn 0.');
    const meal = { slot: target.slot, time, items: items.map((i) => ({ inventoryItem: i.inventoryItem, name: i.name, amount: Number(i.amount), unit: i.unit })) };
    const problem = check(meal);
    if (problem) return setError(problem);
    return onApply(chosen.dates, meal);
  };
  const leaveOut = () => {
    const problem = check(null);
    if (problem) return setError(problem);
    return onApply(chosen.dates, null);
  };

  return (
    <Modal
      open
      width={640}
      title={group.length > 1 ? `${SLOT_LABELS[target.slot]} · ${WORK_LABELS[day.work].toLowerCase()}, ${group.length} ngày` : `${SLOT_LABELS[target.slot]} · ${dayLabel(day.date)}`}
      onCancel={onClose}
      destroyOnHidden
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {current ? (
            <Button danger icon={<DeleteOutlined />} onClick={leaveOut}>
              Không cho ăn bữa này
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose}>Huỷ</Button>
            <Button type="primary" onClick={apply}>
              {chosen.dates.length > 1 ? `Áp dụng cho ${chosen.dates.length} ngày` : 'Áp dụng'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <Tag color={WORK_COLORS[day.work]} className="!m-0">
            {WORK_LABELS[day.work]}
          </Tag>
          <span className="text-gray-600">Giai đoạn {PHASE_SHORT[day.phase] || day.phase}</span>
          {(day.sessions || []).map((s, i) => (
            <Tag key={i} color={SESSION_KINDS[s.kind]?.color} className="!m-0">
              {SESSION_KINDS[s.kind]?.short || s.kind}
              {s.slot === 'afternoon' ? ' (chiều)' : ''}
            </Tag>
          ))}
          <Text type="secondary" className="basis-full !text-xs">
            {day.work === 'rest' && target.slot === 'morning' ? 'Ngày không tập: thức ăn tinh chia đều hơn giữa các bữa.' : MEAL_ROLES[target.slot]}
          </Text>
        </div>

        {suggested && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <span>
              <ThunderboltOutlined className="mr-1 text-blue-700" />
              Gợi ý theo kế hoạch: <b>{suggested.time}</b> · {mealText(suggested)}
            </span>
            <Button
              size="small"
              onClick={() => {
                setTime(suggested.time);
                setItems(suggested.items.map((i) => ({ ...i })));
                setError(null);
              }}
            >
              Dùng gợi ý
            </Button>
          </div>
        )}

        <label className="!flex flex-col gap-1 text-sm">
          <span className="font-medium">Giờ cho ăn</span>
          <TimePicker
            format="HH:mm"
            minuteStep={5}
            allowClear={false}
            needConfirm={false}
            value={time ? dayjs(time, 'HH:mm') : null}
            onChange={(_, value) => {
              setTime(value);
              setError(null);
            }}
            className="!w-36"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Món trong bữa</span>
          <MealItemsEditor
            value={items}
            onChange={(next) => {
              setItems(next);
              setError(null);
            }}
            feedItems={feedItems}
            onPropose={onPropose}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Áp dụng cho</span>
          <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)} className="!flex !flex-col gap-1.5">
            {scopes.map((s) => (
              <Radio key={s.value} value={s.value} disabled={!s.dates.length}>
                {s.label}
                {s.value !== 'day' && <Text type="secondary"> ({s.dates.length} ngày)</Text>}
              </Radio>
            ))}
          </Radio.Group>
          {scope !== 'day' && (
            <Text type="secondary" className="!text-xs">
              {SLOT_LABELS[target.slot]} của các ngày đó được thay bằng bữa này, tính từ {dayLabel(day.date)}. Bữa nào trong số đó bạn đã sửa riêng cũng bị thay.
            </Text>
          )}
        </div>

        {error && <Alert type="error" showIcon title={error} />}
      </div>
    </Modal>
  );
}
