import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Modal, Popover, Segmented, Select, Spin, Switch, Tag, TimePicker, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message, modal } from '../../lib/antdStatic';
import { feedingApi } from '../feeding/feedingApi';
import { PHASE_LABELS } from '../training/trainingVocab';
import { useClubPolicy } from '../training/useClubPolicy';
import { breakfastBy } from './rationSuggestion';
import FeedingDaysTable from './FeedingDaysTable';
import FeedingGroupsTable from './FeedingGroupsTable';
import MealEditModal from './MealEditModal';
import MealItemsEditor from './MealItemsEditor';
import { Fact, PhaseStrip, StockNeedList } from './FeedingPlanParts';
import {
  DEFAULT_MEAL_TIMES,
  MEAL_ROLES,
  SLOTS,
  SLOT_LABELS,
  SLOT_SHORT,
  WORK_LABELS,
  amountText,
  idOf,
  itemsComplete,
  mealTimesProblem,
  planEnd,
  sameMeal,
  stockNeed,
} from './feedingPlan';

const { Text } = Typography;
const BASIS =
  'Căn cứ: cả ngày 2–2,5% cân nặng; cỏ không dưới 1,5%; thức ăn tinh tăng theo mức tập và không quá 0,5% cân nặng mỗi bữa (NRC 2007). Khoáng mỗi ngày, dầu ở giai đoạn sức mạnh và tốc độ, điện giải ngày tập nặng. Món: món ngựa đang ăn, nếu không thì món đủ dùng cả tuần, hết hạn sớm nhất trước. Ngày nghỉ ít thức ăn tinh hơn.';
const SLOT_RANGE_HINT = 'trước 11:00, bữa trưa 11:00–15:59, bữa chiều từ 16:00';
const toPayloadItems = (items) => items.map((i) => ({ inventoryItem: idOf(i.inventoryItem), amount: Number(i.amount) }));
const askToDrop = (onOk) =>
  modal.confirm({
    title: 'Bỏ các thay đổi chưa lưu?',
    content: 'Các bữa bạn vừa sửa chưa được xác nhận nên nhân viên chưa nhận được.',
    okText: 'Bỏ thay đổi',
    okButtonProps: { danger: true },
    cancelText: 'Tiếp tục sửa',
    onOk,
  });

/* -------------------------------------------------------------------------- */
/* A horse with a training plan: every day from today to the plan's end        */
/* -------------------------------------------------------------------------- */

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'train', label: 'Ngày tập' },
  { value: 'rest', label: 'Ngày nghỉ' },
  { value: 'edited', label: 'Đã chỉnh' },
];

function PlanCalendarEditor({ plan, feedItems, policy, onDone, setDirty, onPropose }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['feeding-calendar', plan._id],
    queryFn: () => feedingApi.calendar(plan._id),
  });
  const calendar = data?.data;
  // The planner's own copy of the days ahead: what the trainer sees is what is confirmed.
  const [draft, setDraft] = useState(null);
  const [draftOf, setDraftOf] = useState(null);
  const [changedDates, setChangedDates] = useState(() => new Set());
  const [times, setTimes] = useState(null);
  const [timesChanged, setTimesChanged] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [filter, setFilter] = useState('all');
  // Folded by default: a plan of many weeks reads as a few rows a phase, not a day a row.
  const [view, setView] = useState('group');
  const [editing, setEditing] = useState(null);
  const loadedKey = calendar ? `${plan._id}:${calendar.plan.updatedAt}` : null;
  if (calendar && draftOf !== loadedKey) {
    // Loaded (or the plan changed under the planner): start from the server's days.
    setDraftOf(loadedKey);
    setDraft(calendar.days.filter((d) => !d.past));
    setTimes(calendar.clocks || DEFAULT_MEAL_TIMES);
    setChangedDates(new Set());
    setTimesChanged(false);
    setFresh(false);
  }
  const dirty = changedDates.size > 0 || timesChanged || fresh;
  useEffect(() => setDirty(dirty), [dirty, setDirty]);

  const save = useMutation({
    mutationFn: () =>
      feedingApi.confirmCalendar(plan._id, {
        expectedUpdatedAt: calendar.plan.updatedAt,
        ...(timesChanged ? { times } : {}),
        ...(fresh ? { fresh: true } : {}),
        days: draft
          .filter((d) => changedDates.has(d.date))
          .map((d) => ({ date: d.date, meals: d.meals.map((m) => ({ slot: m.slot, time: m.time, items: toPayloadItems(m.items) })) })),
      }),
    onSuccess: (res) => {
      message.success(res.data?.changed ? `Đã xác nhận lịch ăn ${res.data.days} ngày; nhân viên đã nhận thông báo.` : 'Lịch ăn đã được xác nhận, không có gì thay đổi.');
      queryClient.invalidateQueries({ queryKey: ['feeding-calendar'] });
      queryClient.invalidateQueries({ queryKey: ['feeding'] });
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      onDone();
    },
    onError: (err) => message.error(err.message || 'Chưa xác nhận được lịch ăn. Tải lại và thử lại.'),
  });

  if (isLoading || (calendar && !draft)) {
    return (
      <div className="py-16 text-center">
        <Spin />
      </div>
    );
  }
  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={`Không tải được lịch ăn: ${error?.message?.includes('Route not found') ? 'máy chủ chưa có API lịch ăn, cần bản server mới nhất.' : error?.message}`}
        action={<Button onClick={() => refetch()}>Thử lại</Button>}
      />
    );
  }

  // A server from before the planner sends neither the suggestion nor the day's work beside each day,
  // and would confirm the rules' days whatever was changed here: the planner says so instead.
  const outdated = !calendar.clocks || draft.some((d) => !d.suggested);
  const ruled = (day, slot) => day.suggested?.find((m) => m.slot === slot);
  const isEdited = (date, slot) => {
    const day = draft.find((d) => d.date === date);
    const meal = day?.meals.find((m) => m.slot === slot);
    if (!meal || day.locked?.[slot]) return false;
    return day.suggested ? !sameMeal(meal, ruled(day, slot)) : Boolean(meal.edited);
  };
  const dayEdited = (d) => SLOTS.some((s) => (d.meals.some((m) => m.slot === s) ? isEdited(d.date, s) : Boolean(ruled(d, s))));
  const shown = draft.filter((d) => (filter === 'train' ? d.work !== 'rest' : filter === 'rest' ? d.work === 'rest' : filter === 'edited' ? dayEdited(d) : true));
  const confirmed = draft.filter((d) => d.approved && !d.stale).length;
  const stale = draft.filter((d) => d.stale).length;
  const training = draft.filter((d) => d.work !== 'rest').length;
  const editedDays = draft.filter(dayEdited).length;
  // Today's meals already given have left stock.
  const need = stockNeed(draft.map((d) => ({ ...d, meals: d.meals.filter((m) => !d.locked?.[m.slot]) })), feedItems);
  const short = need.filter((r) => r.short);
  const timeProblem = draft.map((d) => ({ d, p: mealTimesProblem(d.meals, policy.mealMinGapHours) })).find((x) => x.p);
  const morningBy = breakfastBy(calendar.plan.sessionTime || policy.morningTime, policy.digestMinutes);
  const blocked = outdated || (calendar.problems || []).length > 0 || Boolean(timeProblem) || !draft.length;
  const allConfirmed = confirmed === draft.length && !dirty;

  const setSlotTime = (slot, value) => {
    setTimes({ ...times, [slot]: value });
    setTimesChanged(true);
    // Every day's meal at that slot, and the suggestion beside it, takes the new time.
    setDraft(
      draft.map((d) =>
        d.locked?.[slot]
          ? d
          : {
              ...d,
              meals: d.meals.map((m) => (m.slot === slot ? { ...m, time: value } : m)),
              suggested: (d.suggested || []).map((m) => (m.slot === slot ? { ...m, time: value } : m)),
            }
      )
    );
  };
  const applyMeal = (dates, meal) => {
    const set = new Set(dates);
    setDraft(
      draft.map((d) => {
        if (!set.has(d.date)) return d;
        const others = d.meals.filter((m) => m.slot !== editing.slot);
        return { ...d, meals: (meal ? [...others, { ...meal, items: meal.items.map((i) => ({ ...i })) }] : others).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)) };
      })
    );
    setChangedDates(new Set([...changedDates, ...dates]));
    setEditing(null);
  };
  const backToSuggestion = () =>
    modal.confirm({
      title: 'Đưa toàn bộ lịch về gợi ý?',
      content: 'Mọi bữa đã sửa hoặc đã bỏ (kể cả đã xác nhận trước đây) trở lại đúng gợi ý theo kế hoạch tập và cân nặng hiện tại. Lưu ý: chỉ áp dụng khi bạn bấm Xác nhận.',
      okText: 'Về gợi ý',
      cancelText: 'Huỷ',
      onOk: () => {
        setDraft(draft.map((d) => ({ ...d, meals: [...(d.suggested || []).filter((m) => !d.locked?.[m.slot]), ...d.meals.filter((m) => d.locked?.[m.slot])].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)) })));
        setChangedDates(new Set());
        setFresh(true);
      },
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm">
            <b>{draft.length} ngày</b>{' '}
            <Text type="secondary">
              {draft[0] ? dayjs(draft[0].date).format('DD/MM') : '—'} → {draft.at(-1) ? dayjs(draft.at(-1).date).format('DD/MM/YYYY') : '—'} · {training} ngày tập, {draft.length - training} ngày nghỉ
            </Text>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Tag color={allConfirmed ? 'green' : confirmed ? 'blue' : 'default'} className="!m-0">
              Đã xác nhận {confirmed}/{draft.length} ngày
            </Tag>
            {stale > 0 && (
              <Tag color="gold" className="!m-0">
                {stale} ngày cần xác nhận lại
              </Tag>
            )}
          </div>
        </div>
        <PhaseStrip days={draft} />
      </div>

      {outdated && (
        <Alert
          type="error"
          showIcon
          title="Máy chủ đang chạy bản cũ: chưa nhận được các bữa sửa trong bảng này."
          description="Cập nhật server (chạy server mới hoặc deploy bản mới) rồi mở lại. Trong lúc này bảng chỉ để xem; nút xác nhận đã khoá để các bữa bạn sửa không bị bỏ qua mà không báo."
        />
      )}
      {(calendar.problems || []).length > 0 && <Alert type="error" showIcon title="Chưa thể xác nhận lịch ăn" description={calendar.problems.join(' ')} />}
      {calendar.weightNote && <Alert type="warning" showIcon title={`Kiểm tra cân nặng: ${calendar.weightNote}`} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
        <Segmented
          size="small"
          value={view}
          onChange={setView}
          options={[
            { value: 'group', label: 'Gọn theo nhóm ngày' },
            { value: 'day', label: 'Từng ngày' },
          ]}
        />
        <Segmented
          size="small"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, label: f.value === 'edited' ? `${f.label} (${editedDays})` : f.label }))}
        />
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {SLOTS.map((slot) => (
            <label key={slot} className="!flex items-center gap-1 text-xs text-gray-600">
              {SLOT_SHORT[slot]}
              <TimePicker
                size="small"
                aria-label={`Giờ ${SLOT_LABELS[slot].toLowerCase()}`}
                format="HH:mm"
                minuteStep={5}
                allowClear={false}
                needConfirm={false}
                suffixIcon={null}
                value={times?.[slot] ? dayjs(times[slot], 'HH:mm') : null}
                onChange={(_, value) => setSlotTime(slot, value)}
                className="!w-[62px]"
              />
            </label>
          ))}
          <Tooltip
            title={`Đổi giờ ở đây là đổi cho mọi ngày. Bữa sáng ${SLOT_RANGE_HINT}; hai bữa cách nhau ít nhất ${policy.mealMinGapHours} giờ.${morningBy ? ` Buổi tập sáng ${calendar.plan.sessionTime || policy.morningTime}: ăn sáng xong trước ${morningBy} để đủ ${policy.digestMinutes} phút tiêu hóa.` : ''}`}
          >
            <InfoCircleOutlined className="text-gray-400" aria-label="Quy định giờ ăn" />
          </Tooltip>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Popover
            trigger="click"
            placement="bottomRight"
            title="Lượng thức ăn cả kỳ so với kho"
            content={
              <div className="flex w-[min(520px,85vw)] flex-col gap-2">
                <StockNeedList rows={need} />
                {short.length > 0 && <Text type="secondary" className="!text-xs">Món thiếu vẫn xác nhận được; Quản lý cần nhập thêm trước các bữa đó, nếu không nhân viên không ghi nhận được bữa ăn.</Text>}
              </div>
            }
          >
            <Button size="small" danger={short.length > 0}>
              {short.length > 0 ? `Kho cả kỳ: thiếu ${short.length} món` : 'Kho cả kỳ: đủ'}
            </Button>
          </Popover>
          <Popover
            trigger="click"
            placement="bottomRight"
            title="Cách hệ thống gợi ý khẩu phần"
            content={
              <div className="flex w-[min(460px,85vw)] flex-col gap-1 text-xs text-gray-600">
                {SLOTS.map((s) => (
                  <span key={s}>
                    <b>{SLOT_LABELS[s]}:</b> {MEAL_ROLES[s]}
                  </span>
                ))}
                <span>{BASIS}</span>
              </div>
            }
          >
            <Button size="small">Cách gợi ý</Button>
          </Popover>
          <Button size="small" icon={<ReloadOutlined />} onClick={backToSuggestion} disabled={outdated}>
            Về gợi ý
          </Button>
        </div>
      </div>

      {shown.length ? (
        view === 'group' ? (
          <FeedingGroupsTable days={shown} edited={isEdited} onEditMeal={(dates, slot) => setEditing({ date: dates[0], dates, slot })} />
        ) : (
          <FeedingDaysTable days={shown} phases={calendar.phases} edited={isEdited} onEditMeal={(date, slot) => setEditing({ date, slot })} />
        )
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === 'edited' ? 'Chưa có bữa nào khác gợi ý.' : 'Không có ngày nào.'} />
      )}

      {editing && (
        <MealEditModal target={editing} days={draft} feedItems={feedItems} gapHours={policy.mealMinGapHours} onApply={applyMeal} onClose={() => setEditing(null)} onPropose={onPropose} />
      )}

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-1 pt-2.5 pb-0.5">
        <div className="min-w-0 text-xs">
          {timeProblem ? (
            <Text type="danger">
              {dayjs(timeProblem.d.date).format('DD/MM')}: {timeProblem.p}
            </Text>
          ) : dirty ? (
            <Text type="warning">
              Có thay đổi chưa lưu{changedDates.size ? `: ${changedDates.size} ngày đã sửa` : ''}
              {timesChanged ? ', giờ các bữa' : ''}
              {fresh ? ', đưa về gợi ý' : ''}. Nhân viên chỉ nhận lịch khi bạn xác nhận.
            </Text>
          ) : (
            <Text type="secondary">Bấm vào một bữa để sửa món, đổi giờ hoặc bỏ bữa; phù hợp thì xác nhận một lần cho cả kỳ.</Text>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => (dirty ? askToDrop(onDone) : onDone())}>Đóng</Button>
          <Button type="primary" disabled={blocked || allConfirmed} loading={save.isPending} onClick={() => save.mutate()}>
            {allConfirmed ? 'Lịch ăn đã xác nhận' : `Xác nhận lịch ăn ${draft.length} ngày`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A horse without a plan: the same meals every day                            */
/* -------------------------------------------------------------------------- */

function DailyRationEditor({ horse, rations, feedItems, policy, onDone, setDirty, onPropose }) {
  const queryClient = useQueryClient();
  const { data: suggestData, isLoading } = useQuery({
    queryKey: ['feeding-suggest', horse._id, 'all'],
    queryFn: () => feedingApi.suggest(horse._id),
  });
  const suggestion = suggestData?.data;
  const mine = rations.filter((r) => idOf(r.horse) === String(horse._id));
  const [meals, setMeals] = useState(null);
  const [touched, setTouched] = useState(false);
  const fromSuggestion = (slot) => {
    const s = suggestion?.meals?.find((m) => m.slot === slot);
    return { on: true, time: s?.time || DEFAULT_MEAL_TIMES[slot], items: s?.items?.length ? s.items.map((i) => ({ ...i })) : [{}] };
  };
  if (!meals && suggestion) {
    // The horse's rations as they are; a meal it has none for starts from the suggestion.
    setMeals(
      Object.fromEntries(
        SLOTS.map((slot) => {
          const r = mine.find((x) => x.mealTime === slot);
          if (r) {
            const items = (r.items || []).filter((i) => i.inventoryItem).map((i) => ({ inventoryItem: idOf(i.inventoryItem), name: i.inventoryItem?.name || i.type, amount: i.amount, unit: i.inventoryItem?.unit || i.unit }));
            // A ration of text-only items (before stock links) is picked again from stock.
            return [slot, { on: true, time: r.timeOfDay || DEFAULT_MEAL_TIMES[slot], items: items.length ? items : [{}] }];
          }
          return [slot, { ...fromSuggestion(slot), on: !mine.length }];
        })
      )
    );
  }
  useEffect(() => setDirty(touched), [touched, setDirty]);
  const change = (slot, patch) => {
    setMeals({ ...meals, [slot]: { ...meals[slot], ...patch } });
    setTouched(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const on = SLOTS.filter((s) => meals[s].on);
      await feedingApi.confirmRations({
        horse: horse._id,
        basis: 'Khẩu phần hằng ngày',
        meals: on.map((slot) => ({ mealTime: slot, timeOfDay: meals[slot].time, items: toPayloadItems(meals[slot].items) })),
      });
      // A meal turned off: its ration goes (today's meal not yet given goes with it).
      for (const r of mine.filter((x) => !meals[x.mealTime]?.on)) {
        // eslint-disable-next-line no-await-in-loop
        await feedingApi.remove(r._id);
      }
    },
    onSuccess: () => {
      message.success('Đã lưu khẩu phần hằng ngày; nhân viên thấy bữa mới ngay.');
      queryClient.invalidateQueries({ queryKey: ['feeding'] });
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onDone();
    },
    onError: (err) => message.error(err.message || 'Lưu khẩu phần thất bại.'),
  });

  if (isLoading || !meals) {
    return (
      <div className="py-16 text-center">
        <Spin />
      </div>
    );
  }
  const on = SLOTS.filter((s) => meals[s].on);
  const problem = !on.length
    ? 'Cần ít nhất một bữa.'
    : on.some((s) => !itemsComplete(meals[s].items))
      ? 'Mỗi dòng cần chọn món trong kho và nhập lượng lớn hơn 0.'
      : mealTimesProblem(on.map((s) => ({ slot: s, time: meals[s].time })), policy.mealMinGapHours);
  const totals = stockNeed([{ meals: on.map((s) => ({ items: meals[s].items.filter((i) => idOf(i.inventoryItem)) })) }], feedItems);

  return (
    <div className="flex flex-col gap-4">
      <Alert
        type="info"
        showIcon
        title="Ngựa chưa có kế hoạch tập đang áp dụng: khẩu phần dưới đây lặp lại mỗi ngày."
        description={
          <span>
            Gợi ý tính cho {WORK_LABELS[suggestion?.work || 'rest'].toLowerCase()}
            {suggestion?.weightKg ? `, nặng ${suggestion.weightKg} kg` : ''}. Khi ngựa có kế hoạch tập, lịch ăn sẽ đi theo từng ngày của kế hoạch.{' '}
            <Link to="/training/plans">Mở kế hoạch huấn luyện</Link>
          </span>
        }
      />
      {suggestion?.warning && <Alert type="warning" showIcon title={suggestion.warning} />}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {SLOTS.map((slot) => {
          const meal = meals[slot];
          const s = suggestion?.meals?.find((m) => m.slot === slot);
          return (
            <section key={slot} className={`flex flex-col gap-3 rounded-xl border p-3 ${meal.on ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">{SLOT_LABELS[slot]}</span>
                <Switch size="small" checked={meal.on} onChange={(v) => change(slot, v && !meal.items.length ? fromSuggestion(slot) : { on: v })} checkedChildren="Cho ăn" unCheckedChildren="Bỏ" />
              </div>
              <Text type="secondary" className="!text-xs">
                {MEAL_ROLES[slot]}
              </Text>
              {meal.on ? (
                <>
                  <label className="!flex items-center gap-2 text-xs font-medium text-gray-700">
                    Giờ
                    <TimePicker
                      format="HH:mm"
                      minuteStep={5}
                      allowClear={false}
                      needConfirm={false}
                      value={dayjs(meal.time, 'HH:mm')}
                      onChange={(_, v) => change(slot, { time: v })}
                      className="!w-28"
                    />
                  </label>
                  <MealItemsEditor value={meal.items} onChange={(items) => change(slot, { items })} feedItems={feedItems} onPropose={onPropose} />
                  {s?.items?.length > 0 && !sameMeal({ time: meal.time, items: meal.items }, s) && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs">
                      <ThunderboltOutlined className="mr-1 text-blue-700" />
                      Gợi ý: {s.items.map((i) => `${amountText(i.amount)} ${i.unit} ${i.name}`).join(' + ')}{' '}
                      <Button size="small" type="link" className="!h-auto !p-0 !text-xs" onClick={() => change(slot, { time: s.time, items: s.items.map((i) => ({ ...i })) })}>
                        Dùng gợi ý
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <Text type="secondary" className="!text-xs">
                  Ngựa không ăn bữa này.
                </Text>
              )}
            </section>
          );
        })}
      </div>
      {totals.length > 0 && (
        <div>
          <Text strong className="!text-sm">
            Mỗi ngày
          </Text>
          <StockNeedList rows={totals} />
        </div>
      )}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-1 pt-3 pb-1">
        <div className="min-w-0 text-xs">{problem ? <Text type="danger">{problem}</Text> : <Text type="secondary">Lưu xong, bữa hôm nay của nhân viên cập nhật ngay (bữa đã cho ăn giữ nguyên).</Text>}</div>
        <div className="flex gap-2">
          <Button onClick={() => (touched ? askToDrop(onDone) : onDone())}>Đóng</Button>
          <Button type="primary" disabled={Boolean(problem)} loading={save.isPending} onClick={() => save.mutate()}>
            Lưu khẩu phần hằng ngày
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The planner                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Making a horse's rations in one place. Pick the horse: with an active training plan, every day from
 * today to the plan's end comes up with its meals worked out from the day's training (rationRules.js on
 * the server) — the trainer reads them, changes, adds or leaves out what they want, and confirms once;
 * without a plan, the three daily meals. `horseId` opens it on a horse.
 */
export default function RationPlanner({ open, horseId, onClose, horses = [], plans = [], rations = [], assignmentOf, feedItems = [], onPropose }) {
  const policy = useClubPolicy();
  const [picked, setPicked] = useState(horseId || null);
  const [openedFor, setOpenedFor] = useState({ open, horseId });
  if (openedFor.open !== open || openedFor.horseId !== horseId) {
    setOpenedFor({ open, horseId });
    if (open) setPicked(horseId || null);
  }
  // Whether the editor below holds changes not yet confirmed (asked before closing or switching horse).
  const [dirty, setDirty] = useState(false);
  const horse = horses.find((h) => String(h._id) === String(picked));
  const plan = horse ? plans.find((p) => p.status === 'active' && idOf(p.horse) === String(horse._id)) : null;
  const assignment = horse ? assignmentOf(horse) : null;
  const morningBy = plan ? breakfastBy(plan.sessionTime || policy.morningTime, policy.digestMinutes) : null;
  const close = () => {
    setDirty(false);
    onClose();
  };
  const switchHorse = (id) =>
    dirty
      ? askToDrop(() => {
          setDirty(false);
          setPicked(id);
        })
      : setPicked(id);

  return (
    <Modal
      open={open}
      width={1240}
      centered
      title={horse ? `Tạo khẩu phần ăn — ${horse.name}` : 'Tạo khẩu phần ăn'}
      onCancel={() => (dirty ? askToDrop(close) : close())}
      footer={null}
      destroyOnHidden
      styles={{ body: { maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', paddingRight: 4 } }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <label className="!flex shrink-0 flex-col gap-1 text-sm font-medium lg:w-72">
            Ngựa
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Chọn ngựa để xem khẩu phần theo lịch tập"
              className="w-full"
              value={picked || undefined}
              onChange={switchHorse}
              options={horses
                .filter((h) => !h.isArchived)
                .map((h) => {
                  const hasPlan = plans.some((p) => p.status === 'active' && idOf(p.horse) === String(h._id));
                  return { value: String(h._id), label: h.name, hasPlan };
                })
                .sort((a, b) => Number(b.hasPlan) - Number(a.hasPlan) || a.label.localeCompare(b.label))}
              optionRender={(o) => (
                <div className="flex items-center justify-between gap-2">
                  <span>{o.data.label}</span>
                  {o.data.hasPlan && <span className="text-[11px] text-emerald-700">có kế hoạch tập</span>}
                </div>
              )}
            />
          </label>
          {horse && (
            <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 md:grid-cols-4">
              <Fact label="Cân nặng">{horse.weightKg ? `${amountText(horse.weightKg)} kg` : <Text type="warning">Chưa nhập</Text>}</Fact>
              <Fact label="Người cho ăn">
                {assignment?.assignedCaretaker?.name ? (
                  <>
                    {assignment.assignedCaretaker.name}
                    {assignment.stableBlock ? <Text type="secondary"> · {assignment.stableBlock}</Text> : null}
                  </>
                ) : (
                  <Text type="warning">Chưa xếp chuồng</Text>
                )}
              </Fact>
              <Fact label="Kế hoạch tập">
                {plan ? (
                  <span title={plan.goal}>
                    {plan.goal || PHASE_LABELS[plan.phase] || 'Đang áp dụng'}
                    <Text type="secondary" className="!block !text-xs">
                      {dayjs(plan.startDate).format('DD/MM')} – {planEnd(plan) ? dayjs(planEnd(plan)).format('DD/MM/YYYY') : '—'}
                    </Text>
                  </span>
                ) : (
                  <Text type="secondary">Chưa có</Text>
                )}
              </Fact>
              <Fact label="Giờ tập sáng">
                {plan ? (
                  <>
                    {plan.sessionTime || policy.morningTime}
                    {morningBy && (
                      <Text type="secondary" className="!block !text-xs">
                        ăn sáng xong trước {morningBy}
                      </Text>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </Fact>
            </div>
          )}
        </div>

        {!horse ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chọn một con ngựa: hệ thống bày sẵn khẩu phần từng bữa, từ hôm nay đến hết lịch huấn luyện của ngựa, theo đúng ngày tập và ngày nghỉ."
          />
        ) : plan ? (
          <PlanCalendarEditor key={plan._id} plan={plan} feedItems={feedItems} policy={policy} onDone={close} setDirty={setDirty} onPropose={onPropose} />
        ) : (
          <DailyRationEditor key={horse._id} horse={horse} rations={rations} feedItems={feedItems} policy={policy} onDone={close} setDirty={setDirty} onPropose={onPropose} />
        )}
      </div>
    </Modal>
  );
}

