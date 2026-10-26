import { useState } from 'react';
import { Input, Segmented, Table, Tag, Tooltip, Typography } from 'antd';
import { ProfileOutlined, SearchOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { MEAL_STATUS_META, TASK_TYPE_LABELS } from '../../constants/care';
import { fold } from '../../utils/fold';

const { Text } = Typography;

const SLOTS = [
  ['morning', 'Sáng'],
  ['noon', 'Trưa'],
  ['evening', 'Chiều'],
];
const STATUS_WORDS = { pending: 'chưa làm', completed: 'đã xong', skipped: 'bỏ qua' };
const idOf = (ref) => String(ref?._id || ref || '');

/** One of today's meals: what happened, counting a make-up meal that was given. */
function mealOf(task, makeUp) {
  const state = task.status === 'completed' ? 'fed' : task.status === 'skipped' ? 'skipped' : task.timing?.state || 'upcoming';
  if ((state === 'missed' || state === 'skipped') && makeUp?.status === 'completed') return { state: 'fed', at: makeUp.completedAt, by: makeUp.completedBy || makeUp.assignedTo, madeUp: true };
  return { state, at: task.completedAt, by: task.completedBy || task.assignedTo, time: dayjs(task.scheduledDate).format('HH:mm') };
}

export function MealChip({ label, meal }) {
  const meta = MEAL_STATUS_META[meal.state] || MEAL_STATUS_META.upcoming;
  const text =
    meal.state === 'fed'
      ? `${meal.madeUp ? 'ăn bù' : 'đã ăn'} ${meal.at ? dayjs(meal.at).format('HH:mm') : ''}`
      : meal.state === 'upcoming'
        ? meal.time
        : meta.label.toLowerCase();
  return (
    <Tooltip title={meal.state === 'fed' ? `${meal.by?.name || 'Nhân viên'} cho ăn${meal.madeUp ? ' bù' : ''} lúc ${dayjs(meal.at).format('HH:mm')}` : `${meta.label} · giờ hẹn ${meal.time}`}>
      <Tag color={meta.color} className="!m-0 tabular-nums">
        {label}: {text}
      </Tag>
    </Tooltip>
  );
}

/**
 * Today's care at a glance, one row per horse: its groom, how each meal went, the other jobs and what
 * needs a look. A horse that needs a look comes first, then the one whose work changed last. A click
 * opens the horse: its feeding timetable and its jobs. Many horses: found by name, or only those needing a look.
 */
export default function CareHorseList({ tasks = [], horses = [], stallOfHorse, onSelect, loading, action = null }) {
  const [search, setSearch] = useState('');
  const [only, setOnly] = useState('all');
  const today = (tasks || []).filter((t) => dayjs(t.scheduledDate).isSame(dayjs(), 'day'));
  const rows = horses
    .filter((h) => !h.isArchived)
    .map((h) => {
      const id = String(h._id);
      const mine = today.filter((t) => idOf(t.horse) === id);
      const meals = SLOTS.map(([slot, label]) => {
        const task = mine.find((t) => t.taskType === 'feeding' && t.mealSlot === slot && !t.makeUpOf);
        return task ? { slot, label, ...mealOf(task, mine.find((t) => idOf(t.makeUpOf) === String(task._id))) } : null;
      }).filter(Boolean);
      const others = mine.filter((t) => t.taskType !== 'feeding');
      const flags = [];
      if (mine.some((t) => t.status === 'pending' && t.timing?.state === 'late')) flags.push(['orange', 'Trễ hạn']);
      if (mine.some((t) => t.status === 'pending' && t.supplyStatus && !t.supplyStatus.ok)) flags.push(['red', 'Thiếu vật tư']);
      if (mine.some((t) => t.incidentReport)) flags.push(['volcano', 'Có sự cố']);
      const stall = stallOfHorse.get(id);
      const changedAt = Math.max(0, ...mine.map((t) => new Date(t.updatedAt || t.createdAt || 0).getTime()));
      const look = flags.length > 0 || meals.some((m) => m.state === 'missed');
      return { key: id, horse: h, stall, meals, others, flags, changedAt, look };
    })
    .filter((r) => r.stall || r.meals.length || r.others.length)
    .sort((a, b) => Number(b.look) - Number(a.look) || b.flags.length - a.flags.length || b.changedAt - a.changedAt || a.horse.name.localeCompare(b.horse.name));
  const needLook = rows.filter((r) => r.look).length;
  const q = fold(search.trim());
  const shown = rows.filter((r) => (only === 'all' || r.look) && (!q || fold(r.horse.name).includes(q)));

  const columns = [
    {
      title: 'Ngựa',
      key: 'horse',
      render: (_, r) => (
        <div className="max-w-[260px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-900">{r.horse.name}</span>
            <Tooltip title="Hồ sơ ngựa">
              <Link to={`/horses/${r.key}`} onClick={(e) => e.stopPropagation()} aria-label={`Hồ sơ ${r.horse.name}`} className="text-gray-400 hover:text-emerald-700">
                <ProfileOutlined />
              </Link>
            </Tooltip>
          </div>
          {/* Its stall and its groom on one small line, instead of a column of the groom's name. */}
          <div className="truncate text-[11px] text-gray-500">
            {r.stall?.code ? `Chuồng ${r.stall.code}, ` : ''}
            {r.stall?.caretaker?.name || 'chưa có người chăm sóc'}
          </div>
        </div>
      ),
    },
    {
      title: 'Bữa hôm nay',
      key: 'meals',
      render: (_, r) =>
        r.meals.length ? (
          <div className="flex flex-wrap gap-1">
            {r.meals.map((m) => (
              <MealChip key={m.slot} label={m.label} meal={m} />
            ))}
          </div>
        ) : (
          <Text type="secondary" className="!text-xs">
            Chưa có bữa nào hôm nay
          </Text>
        ),
    },
    {
      title: 'Việc khác hôm nay',
      key: 'others',
      render: (_, r) => {
        if (!r.others.length) return <span className="text-gray-400">—</span>;
        const pending = r.others.filter((t) => t.status === 'pending').length;
        return (
          <Tooltip title={r.others.map((t) => `${TASK_TYPE_LABELS[t.taskType] || t.taskType}: ${STATUS_WORDS[t.status] || t.status}`).join(' · ')}>
            <span className="tabular-nums">{pending ? `${pending}/${r.others.length} việc chưa làm` : `Xong ${r.others.length} việc`}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'Cần chú ý',
      key: 'flags',
      render: (_, r) =>
        r.flags.length ? (
          <div className="flex flex-wrap gap-1">
            {r.flags.map(([color, label]) => (
              <Tag key={label} color={color} className="!m-0">
                {label}
              </Tag>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={only}
          onChange={setOnly}
          options={[
            { value: 'all', label: `Tất cả (${rows.length})` },
            { value: 'look', label: `Cần chú ý (${needLook})` },
          ]}
        />
        <Input allowClear prefix={<SearchOutlined className="text-gray-400" />} placeholder="Tìm ngựa" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-48" aria-label="Tìm ngựa trong công việc chăm sóc" />
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <Table
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={shown}
        loading={loading}
        pagination={shown.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        scroll={{ x: 'max-content' }}
        onRow={(r) => ({ onClick: () => onSelect(r.key), className: 'cursor-pointer' })}
        locale={{ emptyText: rows.length ? 'Không có ngựa nào khớp.' : 'Chưa có ngựa nào được xếp chuồng và có người chăm sóc.' }}
      />
    </>
  );
}
