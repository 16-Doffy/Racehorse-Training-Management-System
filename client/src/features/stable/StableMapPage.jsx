import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Segmented, Drawer, Tag, Empty, Spin, Timeline, Button, Progress, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  HomeOutlined,
  UserOutlined,
  AlertOutlined,
  CarryOutOutlined,
  LockFilled,
  StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useFeedingSchedules, useMyTasks, useStableOverview, useTrainingSessions } from './useGroomData';
import {
  HEADING_FONT,
  HEALTH_STATUS_CONFIG,
  TASK_CONFIG,
  TASK_STATUS_CONFIG,
  buildDailyRoutine,
  describeDaysLeft,
  formatViDate,
  getUpcomingCare,
  isSameDay,
  parseStableBlock,
  refId,
} from './groomConfig';
import { GroomPageHeader, StatCard, HorseAvatar } from './GroomUI';

export default function StableMapPage() {
  const [scope, setScope] = useState('mine');
  const [selectedHorseId, setSelectedHorseId] = useState(null);

  const { assignments, horses, horseById, myAssignments, myHorseIds, myBlocks, lockedHorseIds, isLoading } = useStableOverview();
  const { tasks } = useMyTasks();

  const todayTasks = useMemo(() => tasks.filter((t) => isSameDay(t.scheduledDate, dayjs())), [tasks]);
  const tasksByHorse = useMemo(() => {
    const map = new Map();
    todayTasks.forEach((t) => {
      const id = refId(t.horse);
      map.set(id, [...(map.get(id) || []), t]);
    });
    return map;
  }, [todayTasks]);

  const visibleAssignments = scope === 'mine' ? myAssignments : assignments;

  const blocks = useMemo(() => {
    const map = new Map();
    visibleAssignments.forEach((a) => {
      const { block } = parseStableBlock(a.stableBlock);
      map.set(block, [...(map.get(block) || []), a]);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true }))
      .map(([block, stalls]) => ({
        block,
        stalls: stalls.sort((x, y) => x.stableBlock.localeCompare(y.stableBlock, 'vi', { numeric: true })),
      }));
  }, [visibleAssignments]);

  const assignedHorseIds = new Set(assignments.map((a) => refId(a.horse)));
  const unassignedHorses = horses.filter((h) => !assignedHorseIds.has(h._id));

  const myNeedsAttention = [...myHorseIds].filter((id) => {
    const status = horseById.get(id)?.healthStatus;
    return status && status !== 'eligible';
  }).length;
  const pendingToday = todayTasks.filter((t) => t.status === 'pending').length;

  return (
    <div className="max-w-[1400px] mx-auto">
      <GroomPageHeader
        icon={<AppstoreOutlined />}
        title="Sơ đồ Chuồng trại"
        subtitle="Vị trí chuồng của từng chiến mã, người phụ trách và lịch trình sinh hoạt trong ngày."
        extra={
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: `⭐ Chuồng của tôi (${myAssignments.length})` },
              { value: 'all', label: `🏠 Toàn bộ (${assignments.length})` },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<HomeOutlined />} label="Tổng số chuồng" value={assignments.length} />
        <StatCard
          icon={<StarFilled />}
          label="Tôi phụ trách"
          value={myAssignments.length}
          suffix={myBlocks.length ? myBlocks.join(', ') : undefined}
          accent="border-t-[#eab308]"
          iconClass="bg-yellow-50 text-[#eab308]"
        />
        <StatCard icon={<AlertOutlined />} label="Cần chú ý (của tôi)" value={myNeedsAttention} accent="border-t-red-500" iconClass="bg-red-50 text-red-500" />
        <StatCard icon={<CarryOutOutlined />} label="Việc còn lại hôm nay" value={pendingToday} accent="border-t-green-500" iconClass="bg-green-50 text-green-600" />
      </div>

      <div className="premium-card px-5 py-3 mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-600">
        <span className="font-bold uppercase tracking-widest text-[10px] text-gray-400">Chú thích</span>
        {Object.values(HEALTH_STATUS_CONFIG).map((cfg) => (
          <span key={cfg.label} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} /> {cfg.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded border-2 border-[#eab308]" /> Chuồng bạn phụ trách
        </span>
        <span className="flex items-center gap-1.5">
          <LockFilled style={{ color: '#ef4444' }} /> Đang khóa huấn luyện
        </span>
      </div>

      {isLoading ? (
        <div className="premium-card p-10 flex justify-center">
          <Spin />
        </div>
      ) : blocks.length === 0 ? (
        <div className="premium-card p-10">
          <Empty
            description={scope === 'mine' ? 'Bạn chưa được phân công phụ trách chuồng nào' : 'Chưa có chuồng nào được xếp'}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {blocks.map(({ block, stalls }) => (
            <div key={block} className="premium-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-[#022c22] text-[#eab308] flex items-center justify-center">
                    <HomeOutlined />
                  </div>
                  <h2 className="text-lg font-bold text-[#022c22] m-0">Khu {block}</h2>
                </div>
                <span className="text-xs text-gray-400">{stalls.length} chuồng</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stalls.map((a) => (
                  <StallTile
                    key={a._id}
                    assignment={a}
                    horse={horseById.get(refId(a.horse))}
                    isMine={myHorseIds.has(refId(a.horse))}
                    isLocked={lockedHorseIds.has(refId(a.horse))}
                    tasks={tasksByHorse.get(refId(a.horse)) || []}
                    onClick={() => setSelectedHorseId(refId(a.horse))}
                  />
                ))}
              </div>
            </div>
          ))}

          {scope === 'all' && unassignedHorses.length > 0 && (
            <div className="premium-card p-5">
              <h2 className="text-base font-bold text-gray-500 m-0 mb-3">Chưa xếp chuồng</h2>
              <div className="flex flex-wrap gap-2">
                {unassignedHorses.map((h) => (
                  <Tag key={h._id} className="!px-3 !py-1 rounded-full cursor-pointer" onClick={() => setSelectedHorseId(h._id)}>
                    {h.name}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <HorseRoutineDrawer
        horseId={selectedHorseId}
        onClose={() => setSelectedHorseId(null)}
        tasks={selectedHorseId ? tasksByHorse.get(selectedHorseId) || [] : []}
      />
    </div>
  );
}

function StallTile({ assignment, horse, isMine, isLocked, tasks, onClick }) {
  const { stall } = parseStableBlock(assignment.stableBlock);
  const health = HEALTH_STATUS_CONFIG[horse?.healthStatus] || HEALTH_STATUS_CONFIG.eligible;
  const done = tasks.filter((t) => t.status === 'completed').length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl p-4 border-2 bg-white transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer relative ${
        isMine ? 'border-[#eab308]' : 'border-gray-100 opacity-80'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{stall}</span>
        <div className="flex items-center gap-2">
          {isLocked && (
            <Tooltip title="Bác sĩ thú y đã khóa huấn luyện">
              <LockFilled style={{ color: '#ef4444' }} />
            </Tooltip>
          )}
          <Tooltip title={health.label}>
            <span className={`w-3 h-3 rounded-full inline-block ${health.dot}`} />
          </Tooltip>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <HorseAvatar name={assignment.horse?.name} size={40} />
        <div className="min-w-0">
          <div className="font-bold text-[#022c22] truncate">{assignment.horse?.name || 'Không rõ'}</div>
          <div className="text-[11px] text-gray-400 truncate">
            {horse?.breed || '—'} {horse?.weightKg ? `• ${horse.weightKg}kg` : ''}
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-1.5 truncate">
        <UserOutlined /> {assignment.assignedCaretaker?.name || 'Chưa phân công'}
      </div>
      {isMine && tasks.length > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-[11px] text-gray-500 mb-0.5">
            <span>Việc hôm nay</span>
            <span className="font-semibold">
              {done}/{tasks.length}
            </span>
          </div>
          <Progress percent={Math.round((done / tasks.length) * 100)} showInfo={false} size="small" strokeColor="#022c22" />
        </div>
      )}
      {isMine && (
        <span className="absolute -top-2 -right-2 bg-[#eab308] text-[#022c22] text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow">
          CỦA TÔI
        </span>
      )}
    </button>
  );
}

function HorseRoutineDrawer({ horseId, onClose, tasks }) {
  const navigate = useNavigate();
  const { horseById, assignmentByHorseId, lockedHorseIds } = useStableOverview();
  const { feedings } = useFeedingSchedules();
  const { sessions } = useTrainingSessions();

  const horse = horseById.get(horseId);
  const assignment = assignmentByHorseId.get(horseId);
  const health = HEALTH_STATUS_CONFIG[horse?.healthStatus];
  const today = dayjs();
  const routine = horseId ? buildDailyRoutine({ horseIds: new Set([horseId]), feedings, sessions, day: today }) : [];
  const care = getUpcomingCare(horse, 30);

  return (
    <Drawer
      open={!!horseId}
      onClose={onClose}
      size={480}
      title={
        <div className="flex items-center gap-3">
          <HorseAvatar name={horse?.name} size={36} />
          <div>
            <div className="text-[#022c22] font-bold" style={{ fontFamily: HEADING_FONT }}>
              {horse?.name || '—'}
            </div>
            <div className="text-xs text-gray-400 font-normal">{assignment?.stableBlock || 'Chưa xếp chuồng'}</div>
          </div>
        </div>
      }
    >
      {horse && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {health && (
              <Tag color={health.color} className="rounded-full">
                {health.label}
              </Tag>
            )}
            {lockedHorseIds.has(horseId) && (
              <Tag color="red" icon={<LockFilled />} className="rounded-full">
                Khóa huấn luyện
              </Tag>
            )}
            <Tag className="rounded-full">{horse.breed || 'Không rõ giống'}</Tag>
            {horse.weightKg && <Tag className="rounded-full">{horse.weightKg} kg</Tag>}
            <Tag icon={<UserOutlined />} className="rounded-full">
              {assignment?.assignedCaretaker?.name || 'Chưa có người phụ trách'}
            </Tag>
          </div>

          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
              Lịch trình sinh hoạt • {formatViDate(today)}
            </h4>
            {routine.length > 0 ? (
              <Timeline
                items={routine.map((e) => ({
                  color: e.kind === 'meal' ? (e.approved ? 'green' : 'gold') : e.status === 'in_progress' ? 'blue' : 'gray',
                  content: (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{e.time}</span>
                        <span className="font-semibold text-gray-800">{e.title}</span>
                        {e.kind === 'meal' && !e.approved && <Tag color="gold" className="!m-0">Chờ duyệt</Tag>}
                      </div>
                      {e.detail && <div className="text-xs text-gray-500 mt-1">{e.detail}</div>}
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có khẩu phần ăn hoặc buổi tập hôm nay" />
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 m-0">Công việc của tôi hôm nay</h4>
              <Button type="link" size="small" className="!p-0" onClick={() => navigate('/stable/my-tasks')}>
                Mở danh sách →
              </Button>
            </div>
            {tasks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {tasks.map((t) => {
                  const cfg = TASK_CONFIG[t.taskType] || { label: t.taskType, emoji: '📋' };
                  const status = TASK_STATUS_CONFIG[t.status] || TASK_STATUS_CONFIG.pending;
                  return (
                    <div key={t._id} className="flex items-center justify-between bg-[#fdfbf7] border border-gray-100 rounded-lg px-3 py-2">
                      <span className="text-sm">
                        {cfg.emoji} {cfg.label}
                        {t.incidentReport && <Tag color="red" className="!ml-2">Có sự cố</Tag>}
                      </span>
                      <Tag color={status.color} className="!m-0">
                        {status.label}
                      </Tag>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-400">Không có công việc nào được giao cho bạn với ngựa này hôm nay.</div>
            )}
          </section>

          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Lịch chăm sóc định kỳ (30 ngày tới)</h4>
            {care.length > 0 ? (
              <div className="flex flex-col gap-2">
                {care.map((c) => (
                  <div key={c.key} className="flex items-center justify-between text-sm">
                    <span>
                      {c.emoji} {c.label} <span className="text-gray-400">• {dayjs(c.date).format('DD/MM/YYYY')}</span>
                    </span>
                    <Tag color={c.daysLeft < 0 ? 'red' : c.daysLeft <= 3 ? 'orange' : 'default'} className="!m-0">
                      {describeDaysLeft(c.daysLeft)}
                    </Tag>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400">Không có lịch tiêm phòng, tẩy giun hay kiểm tra móng trong 30 ngày tới.</div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
