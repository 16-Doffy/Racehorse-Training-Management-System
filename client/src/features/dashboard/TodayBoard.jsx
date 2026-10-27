import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Empty, Grid, Segmented, Table, Tag, Tooltip, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { horsesApi } from '../horses/horsesApi';
import { dailyTaskApi } from '../stable/stableApi';
import HorseNextStep from '../horses/HorseNextStep';
import { coatFor } from '../horses/horse3d/horseBreeds';
import { HEALTH_COLORS, HEALTH_LABELS } from '../../constants/health';
import { SESSION_KINDS, OBJECTIVE_LABELS, DONE_STATUSES, WEEK_DAYS } from '../training/trainingVocab';
import { SESSION_BADGE_STATUS, SESSION_STATUS_LABELS } from '../training/sessionStatus';
import { useFirst } from './useFirst';

const { Text } = Typography;
const MEALS = [
  { slot: 'morning', label: 'sáng' },
  { slot: 'noon', label: 'trưa' },
  { slot: 'evening', label: 'chiều' },
];
// A meal's dot: filled once given (or given late, or missed), a ring while it is still to come.
const MEAL_STATES = {
  fed: { label: 'đã cho ăn', color: '#2E7D4F', filled: true },
  madeUp: { label: 'đã cho ăn bù', color: '#2E7D4F', filled: true },
  open: { label: 'đang trong giờ cho ăn', color: '#B7791F', filled: false },
  late: { label: 'quá giờ, chưa ghi nhận', color: '#B7791F', filled: true },
  missed: { label: 'bị bỏ lỡ', color: '#C0392B', filled: true },
  upcoming: { label: 'chưa tới giờ', color: '#9CA3AF', filled: false },
  none: { label: 'không có trong lịch', color: '#C9CDD3', filled: true, size: 6 },
};
const LEGEND = ['fed', 'open', 'late', 'missed', 'upcoming'];
const TROUBLE = ['blocked', 'missed', 'aborted'];
const hhmm = (d) => dayjs(d).format('HH:mm');
const horseIdOf = (x) => String(x.horse?._id || x.horse);

/** Where today's meal stands, from its task (and the make-up meal ordered for it, if any). */
function mealState(task, makeUp) {
  if (!task) return 'none';
  if (task.status === 'completed') return 'fed';
  if (makeUp?.status === 'completed') return 'madeUp';
  if (task.status === 'skipped') return 'missed';
  return { missed: 'missed', late: 'late', open: 'open' }[task.timing?.state] || 'upcoming';
}

function Dot({ state, size = 12 }) {
  const s = MEAL_STATES[state];
  // No meal in the schedule: a small grey dot in the same room, nothing to look at.
  const d = s.size ? Math.min(size, s.size) : size;
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: d, height: d, margin: (size - d) / 2, background: s.filled ? s.color : 'transparent', border: s.size ? 0 : `2px solid ${s.color}` }}
    />
  );
}

function MealDots({ meals }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {meals.map((m) => {
        const text = `Bữa ${m.label}${m.at ? ` ${m.at}` : ''}: ${MEAL_STATES[m.state].label}${m.makeUpPending ? ', đã báo cho ăn bù' : ''}`;
        return (
          <Tooltip key={m.slot} title={text}>
            <span role="img" aria-label={text} tabIndex={0} className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2">
              <Dot state={m.state} />
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

/** A horse's sessions today: time, kind, and how it went once run; each opens its sessions page. */
function Sessions({ list, horseId }) {
  if (!list.length) return <span className="text-xs text-gray-400">Chưa có buổi hôm nay</span>;
  return (
    <div className="space-y-0.5">
      {list.map((s) => (
        <Link key={s._id} to={`/training/sessions?horse=${horseId}`} className="flex w-fit items-center gap-1.5 whitespace-nowrap text-xs">
          <Tooltip title={SESSION_STATUS_LABELS[s.status]}>
            <Badge status={SESSION_BADGE_STATUS[s.status]} />
          </Tooltip>
          <span className="tabular-nums text-gray-500">{hhmm(s.scheduledAt)}</span>
          <span className="text-gray-900">{SESSION_KINDS[s.kind]?.short || OBJECTIVE_LABELS[s.objective] || 'Buổi tập'}</span>
          {DONE_STATUSES.includes(s.status) && s.outcome?.met != null && (
            <Text type={s.outcome.met ? 'success' : 'danger'} className="!text-xs">
              {s.outcome.met ? 'Đạt' : 'Chưa đạt'}
            </Text>
          )}
          {TROUBLE.includes(s.status) && (
            <Text type="danger" className="!text-xs">
              {SESSION_STATUS_LABELS[s.status]}
            </Text>
          )}
        </Link>
      ))}
    </div>
  );
}

function HorseName({ row }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.coat.swatch, boxShadow: '0 0 0 1px rgba(0,0,0,.15)' }} />
      <Link to={`/horses/${row.id}`} className="truncate font-semibold" title={row.name}>
        {row.name}
      </Link>
      {row.health !== 'eligible' && HEALTH_LABELS[row.health] && (
        <Tag color={HEALTH_COLORS[row.health]} className="!m-0 shrink-0 !text-[11px]">
          {HEALTH_LABELS[row.health]}
        </Tag>
      )}
    </div>
  );
}

/**
 * The Head Trainer's day, one line per horse, as a yard's trackwork board: its sessions today in the
 * order they run, its three meals, and its next step from arrival to training (the checklist). Horses
 * that need something — held back, a meal missed, a session blocked, missed or stopped, a step still to
 * do — come first, and "Cần xử lý" shows only them.
 */
export default function TodayBoard({ horses = [], sessions = [] }) {
  const screens = Grid.useBreakpoint();
  const [filter, setFilter] = useState('all');
  const today = dayjs().format('YYYY-MM-DD');
  const { data: checklistData } = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });
  // The same query as MissedMealsCard: today's tasks of every kind, the meals among them.
  const { data: taskData } = useQuery({
    queryKey: ['daily-tasks', 'missed-meals', today],
    queryFn: () => dailyTaskApi.list({ date: today }),
    refetchInterval: 60000,
  });

  const checklistByHorse = new Map((checklistData?.data || []).map((r) => [String(r.horse._id), r]));
  const tasks = taskData?.data || [];
  const makeUps = new Map(tasks.filter((t) => t.makeUpOf).map((t) => [String(t.makeUpOf), t]));
  const meals = tasks.filter((t) => t.taskType === 'feeding' && t.mealSlot && !t.makeUpOf);
  const todays = sessions
    .filter((s) => s.scheduledAt && dayjs(s.scheduledAt).isSame(dayjs(), 'day') && s.status !== 'cancelled')
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  const allRows = horses.map((h) => {
    const id = String(h._id);
    const own = todays.filter((s) => horseIdOf(s) === id);
    const horseMeals = MEALS.map(({ slot, label }) => {
      const task = meals.find((t) => horseIdOf(t) === id && t.mealSlot === slot);
      const makeUp = task && makeUps.get(String(task._id));
      return { slot, label, state: mealState(task, makeUp), at: task ? hhmm(task.scheduledDate) : null, makeUpPending: Boolean(makeUp && makeUp.status !== 'completed') };
    });
    const checklist = checklistByHorse.get(id);
    const needs = Boolean(checklist?.blocked) || (checklist && !checklist.nextStep.done) || horseMeals.some((m) => m.state === 'missed') || own.some((s) => TROUBLE.includes(s.status));
    return {
      id,
      name: h.name,
      health: h.healthStatus,
      coat: coatFor({ breed: h.breed, color: h.color }),
      sessions: own,
      first: own[0] ? new Date(own[0].scheduledAt).getTime() : Infinity,
      meals: horseMeals,
      checklist,
      needs,
    };
  });
  allRows.sort((a, b) => Number(b.needs) - Number(a.needs) || a.first - b.first || a.name.localeCompare(b.name, 'vi'));
  const needCount = allRows.filter((r) => r.needs).length;
  const rows = filter === 'needs' ? allRows.filter((r) => r.needs) : allRows;
  const [shown, more] = useFirst(rows, 8);
  const weekday = WEEK_DAYS.find((w) => w.day === dayjs().day())?.short;
  const filterSwitch = horses.length > 0 && (
    <Segmented
      size="small"
      value={filter}
      onChange={setFilter}
      options={[
        { value: 'all', label: `Tất cả (${allRows.length})` },
        { value: 'needs', label: `Cần xử lý (${needCount})` },
      ]}
    />
  );

  const columns = [
    { title: 'Ngựa', key: 'horse', width: 200, render: (_, r) => <HorseName row={r} /> },
    { title: 'Buổi tập hôm nay', key: 'sessions', width: 200, render: (_, r) => <Sessions list={r.sessions} horseId={r.id} /> },
    { title: 'Bữa ăn', key: 'meals', width: 84, render: (_, r) => <MealDots meals={r.meals} /> },
    { title: 'Bước tiếp theo', key: 'next', render: (_, r) => <HorseNextStep checklist={r.checklist} /> },
  ];

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl overflow-hidden"
      styles={{ title: { whiteSpace: 'normal' }, header: { height: 'auto', paddingBlock: 10 }, body: { padding: screens.lg ? 0 : '4px 12px 8px' } }}
      title={
        <div>
          <span className="font-semibold text-gray-900 text-[15px]">Bảng việc hôm nay</span>
          <p className="m-0 mt-0.5 text-xs font-normal text-gray-600">
            {weekday} {dayjs().format('DD/MM')}: buổi tập, bữa ăn và bước tiếp theo của từng ngựa
          </p>
        </div>
      }
      extra={screens.md && filterSwitch}
    >
      {/* On a phone the switch goes under the title, which would otherwise be squeezed to a word a line. */}
      {!screens.md && filterSwitch && <div className="pb-1 pt-2">{filterSwitch}</div>}
      {!horses.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ngựa nào giao cho bạn." className="!py-6" />
      ) : !rows.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không ngựa nào cần xử lý lúc này." className="!py-6" />
      ) : screens.lg ? (
        <Table rowKey="id" size="small" columns={columns} dataSource={shown} pagination={false} scroll={{ x: 'max-content' }} />
      ) : (
        <ul className="m-0 list-none divide-y divide-gray-100 p-0">
          {shown.map((r) => (
            <li key={r.id} className="space-y-1.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <HorseName row={r} />
                <MealDots meals={r.meals} />
              </div>
              <Sessions list={r.sessions} horseId={r.id} />
              <HorseNextStep checklist={r.checklist} />
            </li>
          ))}
        </ul>
      )}
      {(more || horses.length > 0) && (
        <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-gray-500 ${screens.lg ? 'px-4 py-2' : 'pt-1'}`}>
          <span>{more}</span>
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {LEGEND.map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <Dot state={k} size={9} />
                {MEAL_STATES[k].label}
              </span>
            ))}
          </span>
        </div>
      )}
    </Card>
  );
}
