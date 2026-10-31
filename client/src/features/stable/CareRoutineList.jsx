import { useState } from 'react';
import { Button, Popconfirm, Segmented, Table, Tag, Tooltip, Typography } from 'antd';
import { EditOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { message } from '../../lib/antdStatic';
import { careRoutineApi } from './stableApi';
import { ROUTINE_TYPE_LABELS, minutesText, weekDaysText } from './careRoutineVocab';

const { Text } = Typography;

/** Where a routine stands today: running, not started yet, over, or stopped by the trainer. */
function stateOf(r) {
  if (r.status === 'stopped') return { label: 'Đã dừng', color: 'default' };
  if (r.endDate && dayjs(r.endDate).isBefore(dayjs(), 'day')) return { label: 'Đã hết hạn', color: 'default' };
  if (dayjs(r.startDate).isAfter(dayjs(), 'day')) return { label: `Bắt đầu ${dayjs(r.startDate).format('DD/MM')}`, color: 'blue' };
  return { label: 'Đang làm', color: 'green' };
}
const running = (r) => r.status === 'active' && !(r.endDate && dayjs(r.endDate).isBefore(dayjs(), 'day'));

/**
 * The care jobs handed out for many days: for which horse, what, who does it, how many times a day and
 * how long, on which days, from when to when — with their changing and stopping. `showHorse` is off on
 * one horse's page.
 */
export default function CareRoutineList({ routines = [], loading, showHorse = true, stallOfHorse, onEdit, action = null }) {
  const queryClient = useQueryClient();
  const [show, setShow] = useState('running');
  const stop = useMutation({
    mutationFn: (id) => careRoutineApi.stop(id),
    onSuccess: (res) => {
      const removed = res.data?.today?.removed || 0;
      message.success(`Đã dừng việc từ hôm nay${removed ? `; ${removed} lần chưa làm hôm nay được bỏ khỏi danh sách nhân viên` : ''}.`);
      queryClient.invalidateQueries({ queryKey: ['care-routines'] });
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
    },
    onError: (err) => message.error(err.message || 'Chưa dừng được việc.'),
  });
  const runningCount = routines.filter(running).length;
  const shown = show === 'running' ? routines.filter(running) : routines;

  const columns = [
    ...(showHorse ? [{ title: 'Ngựa', key: 'horse', render: (_, r) => <span className="font-semibold text-emerald-900">{r.horse?.name}</span> }] : []),
    {
      title: 'Công việc',
      key: 'what',
      render: (_, r) => (
        <div className="max-w-[340px]">
          <div className="font-medium">{r.taskType === 'other' ? r.title : ROUTINE_TYPE_LABELS[r.taskType]}</div>
          <Tooltip title={<span className="whitespace-pre-line">{r.instructions}</span>} placement="topLeft">
            <Text type="secondary" className="!block !truncate !text-xs">
              {r.instructions.split('\n')[0]}
            </Text>
          </Tooltip>
        </div>
      ),
    },
    {
      title: 'Lịch làm',
      key: 'when',
      render: (_, r) => (
        <div className="min-w-[200px] text-sm">
          <div>
            <b>{r.times.length} lần/ngày</b> · mỗi lần {minutesText(r.durationMinutes)}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {r.times.map((t) => (
              <Tag key={t} className="!m-0 tabular-nums">
                {t}
              </Tag>
            ))}
          </div>
          <Text type="secondary" className="!text-xs">
            {weekDaysText(r.weekDays)}
          </Text>
        </div>
      ),
    },
    {
      title: 'Thời gian',
      key: 'range',
      render: (_, r) => (
        <div className="whitespace-nowrap text-sm tabular-nums">
          {dayjs(r.startDate).format('DD/MM')} → {r.endDate ? dayjs(r.endDate).format('DD/MM/YYYY') : 'khi dừng'}
          <div>
            <Text type="secondary" className="!text-xs">
              {r.occurrences != null ? `${r.occurrences} lần` : 'Không hẹn ngày kết thúc'}
              {running(r) && r.endDate ? ` · còn ${dayjs(r.endDate).diff(dayjs().startOf('day'), 'day') + 1} ngày` : ''}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Người làm',
      key: 'who',
      render: (_, r) => {
        const stallGroom = stallOfHorse?.get(String(r.horse?._id || r.horse))?.caretaker?.name;
        return r.assignedTo?.name || (
          <span>
            {stallGroom || <Text type="warning">Chưa có</Text>}
            <Text type="secondary" className="!block !text-xs">
              người chăm sóc chuồng
            </Text>
          </span>
        );
      },
    },
    {
      title: 'Trạng thái',
      key: 'state',
      render: (_, r) => {
        const s = stateOf(r);
        return (
          <Tag color={s.color} className="!m-0">
            {s.label}
          </Tag>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) =>
        running(r) ? (
          <div className="flex gap-1.5">
            <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(r)}>
              Sửa
            </Button>
            <Popconfirm
              title="Dừng việc này từ hôm nay?"
              description="Các lần chưa làm hôm nay được bỏ; những lần đã làm vẫn giữ trong lịch sử."
              okText="Dừng việc"
              okButtonProps={{ danger: true }}
              cancelText="Không"
              onConfirm={() => stop.mutate(r._id)}
            >
              <Button size="small" danger icon={<StopOutlined />} loading={stop.isPending && stop.variables === r._id}>
                Dừng
              </Button>
            </Popconfirm>
          </div>
        ) : (
          <Text type="secondary" className="!text-xs">
            {r.stoppedBy?.name ? `${r.stoppedBy.name} dừng ${dayjs(r.stoppedAt).format('DD/MM')}` : '—'}
          </Text>
        ),
    },
  ];

  return (
    <section aria-label="Việc giao dài hạn" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Việc giao dài hạn</span>
          <Segmented
            size="small"
            value={show}
            onChange={setShow}
            options={[
              { value: 'running', label: `Đang áp dụng (${runningCount})` },
              { value: 'all', label: `Tất cả (${routines.length})` },
            ]}
          />
        </div>
        {action}
      </div>
      <Table
        rowKey="_id"
        size="small"
        columns={columns}
        dataSource={shown}
        loading={loading}
        pagination={shown.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: show === 'running' ? 'Chưa có việc nào đang giao dài hạn. Bấm "Giao việc chăm sóc" để giao một việc làm nhiều ngày.' : 'Chưa giao việc dài hạn nào.' }}
      />
    </section>
  );
}
