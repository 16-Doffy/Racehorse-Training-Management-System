import { Table, Tag, Tooltip, Typography } from 'antd';
import { ProfileOutlined, RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { MealChip } from './CareHorseList';

const { Text } = Typography;

const SLOTS = [
  ['morning', 'Sáng'],
  ['noon', 'Trưa'],
  ['evening', 'Chiều'],
];
const idOf = (ref) => String(ref?._id || ref || '');
const amountText = (n) => Number(Math.round(n * 10) / 10).toLocaleString('vi-VN');

/** One of today's meals, counting a make-up meal that was given (same reading as the care tab). */
function mealOf(task, makeUp) {
  const state = task.status === 'completed' ? 'fed' : task.status === 'skipped' ? 'skipped' : task.timing?.state || 'upcoming';
  if ((state === 'missed' || state === 'skipped') && makeUp?.status === 'completed') return { state: 'fed', at: makeUp.completedAt, by: makeUp.completedBy || makeUp.assignedTo, madeUp: true };
  return { state, at: task.completedAt, by: task.completedBy || task.assignedTo, time: dayjs(task.scheduledDate).format('HH:mm') };
}

/**
 * The rations tab at a glance, one row per horse: who feeds it, the plan its meals follow, how today's
 * meals went, its standing ration and what needs a look. A click opens the horse: its feeding week,
 * its plan's feeding calendar and its rations.
 */
export default function RationHorseList({ rations = [], horses = [], tasks = [], assignmentOf, planOf, onSelect, loading }) {
  const today = (tasks || []).filter((t) => t.taskType === 'feeding' && dayjs(t.scheduledDate).isSame(dayjs(), 'day'));
  const rows = horses
    .filter((h) => !h.isArchived)
    .map((h) => {
      const id = String(h._id);
      const mine = rations.filter((r) => idOf(r.horse) === id);
      const plan = planOf(h);
      const groom = assignmentOf(h)?.assignedCaretaker;
      const todays = today.filter((t) => idOf(t.horse) === id);
      const meals = SLOTS.map(([slot, label]) => {
        const task = todays.find((t) => t.mealSlot === slot && !t.makeUpOf);
        return task ? { slot, label, ...mealOf(task, todays.find((t) => idOf(t.makeUpOf) === String(task._id))) } : null;
      }).filter(Boolean);
      // Daily amount by unit, from the standing ration (kg of hay and grain, litres of oil...).
      const perDay = new Map();
      for (const r of mine) {
        for (const i of r.items || []) {
          const unit = i.inventoryItem?.unit;
          if (unit && typeof i.amount === 'number') perDay.set(unit, (perDay.get(unit) || 0) + i.amount);
        }
      }
      const flags = [];
      if (!groom?.name) flags.push(['orange', 'Chưa có người cho ăn']);
      if (meals.some((m) => m.state === 'missed')) flags.push(['red', 'Lỡ bữa']);
      if (mine.some((r) => !r.approvedBy || !r.items?.length)) flags.push(['red', 'Khẩu phần chưa duyệt']);
      if (mine.some((r) => (r.items || []).some((i) => !i.inventoryItem))) flags.push(['orange', 'Có món chưa gắn kho']);
      if (mine.some((r) => (r.items || []).some((i) => typeof i.inventoryItem?.quantity === 'number' && i.inventoryItem.quantity < (i.amount || 0)))) flags.push(['red', 'Kho không đủ']);
      if (!mine.length && !plan) flags.push(['gold', 'Chưa có khẩu phần']);
      return { key: id, horse: h, plan, groom, meals, rations: mine, perDay, flags };
    })
    .filter((r) => r.rations.length || r.plan || r.groom)
    .sort((a, b) => b.flags.length - a.flags.length || a.horse.name.localeCompare(b.horse.name));

  const needLook = rows.filter((r) => r.flags.length).length;

  const columns = [
    {
      title: 'Ngựa',
      key: 'horse',
      render: (_, r) => (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-emerald-900">{r.horse.name}</span>
          <Tooltip title="Hồ sơ ngựa">
            <Link to={`/horses/${r.key}`} onClick={(e) => e.stopPropagation()} aria-label={`Hồ sơ ${r.horse.name}`} className="text-gray-400 hover:text-emerald-700">
              <ProfileOutlined />
            </Link>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Người cho ăn',
      key: 'groom',
      render: (_, r) => r.groom?.name || <Text type="warning">Chưa có</Text>,
    },
    {
      title: 'Lịch ăn theo',
      key: 'plan',
      render: (_, r) =>
        r.plan ? (
          <div className="flex flex-col text-sm max-w-[220px]">
            <span className="truncate">Kế hoạch tập</span>
            <Text type="secondary" className="!text-xs truncate">{r.plan.goal || 'Đang áp dụng'}</Text>
          </div>
        ) : (
          <Text type="secondary" className="!text-sm">Khẩu phần mẫu</Text>
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
          <Text type="secondary" className="!text-xs">Chưa có bữa nào hôm nay</Text>
        ),
    },
    {
      title: 'Khẩu phần mẫu',
      key: 'rations',
      render: (_, r) =>
        r.rations.length ? (
          <div className="flex flex-col text-sm">
            <span className="tabular-nums">{r.rations.length} bữa</span>
            {r.perDay.size > 0 && (
              <Text type="secondary" className="!text-xs tabular-nums">
                {[...r.perDay].map(([unit, n]) => `${amountText(n)} ${unit}`).join(' · ')} mỗi ngày
              </Text>
            )}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
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
    {
      title: '',
      key: 'open',
      width: 40,
      render: () => <RightOutlined className="text-gray-400" aria-hidden />,
    },
  ];

  return (
    <section aria-label="Khẩu phần theo ngựa">
      <p className="text-sm mb-3">
        <Text strong className="tabular-nums">{rows.length} ngựa</Text>
        {needLook > 0 && <Text type="danger" className="tabular-nums"> · {needLook} cần chú ý</Text>}
        <Text type="secondary"> · Bấm vào một ngựa để xem lịch ăn từng ngày, xác nhận lịch theo kế hoạch tập và sửa khẩu phần.</Text>
      </p>
      <Table
        rowKey="key"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={rows.length > 20 ? { pageSize: 20 } : false}
        scroll={{ x: 'max-content' }}
        onRow={(r) => ({ onClick: () => onSelect(r.key), className: 'cursor-pointer' })}
        locale={{ emptyText: 'Chưa có ngựa nào có khẩu phần, kế hoạch tập hay người chăm sóc.' }}
      />
    </section>
  );
}

