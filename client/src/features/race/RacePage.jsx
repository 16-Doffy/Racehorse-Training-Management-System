import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, DatePicker, InputNumber, Input, Tag, Space, Tooltip, Radio, Alert, Empty } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, FlagOutlined, ScheduleOutlined, WarningOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { raceApi } from './raceApi';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi, trainingPlanApi } from '../training/trainingApi';
import { SURFACE_LABELS, surfaceOptions, DONE_STATUSES } from '../training/trainingVocab';

const { Title, Text } = Typography;

const STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận tham gia',
  completed: 'Đã thi đấu xong',
  withdrawn: 'Đã rút lui',
};
const STATUS_COLORS = { registered: 'default', confirmed: 'blue', completed: 'green', withdrawn: 'red' };
const refId = (x) => String(x?._id || x || '');
const raceDayOf = (entry) => dayjs(entry.raceDate).startOf('day');
const isBeforeRaceDay = (entry) => raceDayOf(entry).isAfter(dayjs().startOf('day'));
const isPast = (entry) => raceDayOf(entry).isBefore(dayjs().startOf('day'));

/**
 * The trial run of this entry: only sessions linked to it (never "same horse, around those dates", which
 * mixes up two races close together) — the last one run, else the next one booked.
 */
function trialFor(entry, trials) {
  const mine = trials.filter((s) => refId(s.raceEntry) === String(entry._id) && !['cancelled', 'missed'].includes(s.status));
  const done = mine.filter((s) => DONE_STATUSES.includes(s.status)).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  if (done.length) return done[0];
  return mine.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null;
}

const metricsLine = (m = {}) =>
  [m.distance ? `${m.distance}m` : null, m.maxSpeed ? `tối đa ${m.maxSpeed} km/h` : null, m.avgHeartRate ? `nhịp tim TB ${Math.round(m.avgHeartRate)}` : null]
    .filter(Boolean)
    .join(' · ');

function TrialCell({ trial }) {
  if (!trial) return <Text type="secondary" className="!text-xs">Chưa có chạy thử cho giải này</Text>;
  const when = dayjs(trial.scheduledAt).format('DD/MM');
  if (!DONE_STATUSES.includes(trial.status)) {
    return (
      <Text className="!text-xs">
        {trial.status === 'in_progress' ? 'Đang chạy' : 'Đã lên lịch'} {when} · {dayjs(trial.scheduledAt).format('HH:mm')}
      </Text>
    );
  }
  const met = trial.outcome?.met;
  return (
    <Tooltip title={trial.outcome?.summary}>
      <div className="flex flex-col gap-0.5">
        <span>
          {met === true && <Tag color="green" className="!m-0">Đạt</Tag>}
          {met === false && <Tag color="red" className="!m-0">Chưa đạt</Tag>}
          {met == null && <Tag className="!m-0">Đã chạy</Tag>}
          <Text type="secondary" className="!text-xs ml-1">{when}</Text>
        </span>
        <Text type="secondary" className="!text-xs">{metricsLine(trial.metrics)}</Text>
      </div>
    </Tooltip>
  );
}

function DecisionCell({ entry }) {
  const d = entry.decision;
  return (
    <div className="flex flex-col gap-1">
      <Tag color={STATUS_COLORS[entry.status]} className="!m-0 w-fit">
        {STATUS_LABELS[entry.status] || entry.status}
      </Tag>
      {d?.at && (
        <Text type="secondary" className="!text-xs">
          {d.by?.name || 'HLV'} · {dayjs(d.at).format('DD/MM HH:mm')}
          {d.status === 'confirmed' ? (d.exception ? ' · ngoại lệ, chưa chạy thử' : d.trialMet === false ? ' · chạy thử chưa đạt' : ' · dựa trên chạy thử') : ''}
          {d.reason ? ` — ${d.reason}` : ''}
        </Text>
      )}
      {!d?.at && entry.status === 'confirmed' && <Text type="secondary" className="!text-xs">Xác nhận cũ (chưa ghi người quyết định)</Text>}
      {entry.reviewNeeded && (
        <Tooltip title={entry.reviewReason}>
          <Tag color="warning" icon={<WarningOutlined />} className="!m-0 w-fit">
            Cần xem lại
          </Tag>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * The trainer's decision whether the horse goes. The trial is shown as evidence next to the horse's
 * medical state; a passed trial is not the same as being fit to race, and the server checks the medical
 * state again when the decision is filed.
 */
function DecisionModal({ entry, horse, onClose, onDone }) {
  const [form] = Form.useForm();
  const decision = Form.useWatch('decision', form);
  const trialId = Form.useWatch('trialSession', form);
  const { data, isLoading } = useQuery({ queryKey: ['race-trials', entry?._id], queryFn: () => raceApi.trials(entry._id), enabled: Boolean(entry) });
  const linked = data?.data || [];
  const done = linked.filter((t) => DONE_STATUSES.includes(t.status));
  const chosen = done.find((t) => t._id === trialId) || null;
  const clearance = horse?.trainingClearance;
  const grounded = clearance?.level === 'none' || ['injured', 'quarantined'].includes(horse?.healthStatus);
  const recovering = !grounded && clearance?.restricted;
  const needsReason = decision === 'withdrawn' || (decision === 'confirmed' && (!chosen || chosen.outcome?.met === false));

  const mutation = useMutation({
    mutationFn: (values) => raceApi.decision(entry._id, values),
    onSuccess: (_res, values) => {
      message.success(values.decision === 'confirmed' ? 'Đã xác nhận tham gia giải.' : 'Đã rút khỏi giải.');
      form.resetFields();
      onDone();
    },
    onError: (err) => message.error(err.message || 'Không ghi được quyết định.'),
  });

  return (
    <Modal
      open={Boolean(entry)}
      title={`Quyết định dự giải — ${entry?.horse?.name || ''} · ${entry?.raceName || ''}`}
      okText="Ghi quyết định"
      cancelText="Đóng"
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={mutation.isPending}
      width={640}
      destroyOnHidden
    >
      {entry && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{ decision: 'confirmed', trialSession: done[0]?._id }}
          key={done[0]?._id || 'none'}
          onFinish={(values) => mutation.mutate({ decision: values.decision, trialSession: values.decision === 'confirmed' ? values.trialSession : undefined, reason: values.reason })}
        >
          <Text strong className="block mb-1">Bằng chứng</Text>
          <div className="mb-3 flex flex-col gap-2">
            {isLoading ? (
              <Text type="secondary">Đang tải buổi chạy thử…</Text>
            ) : done.length ? (
              <Form.Item name="trialSession" label="Buổi chạy thử dùng để quyết định" className="!mb-0">
                <Select
                  options={done.map((t) => ({
                    value: t._id,
                    label: `${dayjs(t.scheduledAt).format('DD/MM HH:mm')} · ${t.outcome?.met === true ? 'Đạt' : t.outcome?.met === false ? 'Chưa đạt' : 'Đã chạy'} · ${metricsLine(t.metrics)}`,
                  }))}
                />
              </Form.Item>
            ) : (
              <Alert type="warning" showIcon title="Chưa có buổi chạy thử nào của giải này đã chạy xong." description="Xác nhận lúc này là ngoại lệ: cần ghi lý do theo quy định CLB." />
            )}
            {chosen?.outcome?.summary && <Text type="secondary" className="!text-xs">{chosen.outcome.summary}</Text>}
            <Alert
              type={grounded ? 'error' : recovering ? 'warning' : 'success'}
              showIcon
              title={grounded ? 'Bác sĩ đang khóa tập / ngựa chấn thương — không xác nhận được' : recovering ? `Đang hồi phục: bác sĩ chỉ cho ${clearance.label}` : 'Không có hạn chế y tế nào đang hiệu lực'}
              description="Chạy thử đạt không đồng nghĩa đủ điều kiện thi đấu: hệ thống kiểm tra lại tình trạng y tế ngay lúc ghi quyết định."
            />
            {entry.reviewNeeded && <Alert type="warning" showIcon title="Sức khỏe đã thay đổi sau lần xác nhận trước" description={entry.reviewReason} />}
          </div>
          <Form.Item name="decision" label="Quyết định">
            <Radio.Group
              options={[
                { value: 'confirmed', label: 'Tham gia giải' },
                { value: 'withdrawn', label: 'Rút khỏi giải' },
              ]}
              optionType="button"
              buttonStyle="solid"
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Lý do"
            rules={[{ required: needsReason, whitespace: true, message: decision === 'withdrawn' ? 'Ghi lý do rút' : 'Ghi lý do (ngoại lệ hoặc chạy thử chưa đạt)' }]}
            extra={needsReason ? null : 'Không bắt buộc khi đã có buổi chạy thử đạt.'}
          >
            <Input.TextArea rows={2} placeholder={decision === 'withdrawn' ? 'VD: Ngựa đang hồi phục chấn thương gân.' : 'VD: Chạy thử đạt, sức khỏe tốt, sẵn sàng thi đấu.'} />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

// Registration, the trial run that decides whether the horse goes, and the result after the race.
export default function RacePage() {
  const [open, setOpen] = useState(false);
  const [resultRace, setResultRace] = useState(null);
  const [decisionRace, setDecisionRace] = useState(null);
  const [form] = Form.useForm();
  const [resultForm] = Form.useForm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: trialsData } = useQuery({
    queryKey: ['training-sessions', 'trial_run'],
    queryFn: () => trainingSessionApi.list({ sessionType: 'trial_run' }),
  });
  const trials = trialsData?.data || [];
  const horseById = new Map((horsesData?.data || []).map((h) => [String(h._id), h]));
  const activePlanByHorse = new Map((plansData?.data || []).filter((p) => p.status === 'active').map((p) => [refId(p.horse), p]));

  // A horse the vet has grounded or is still recovering can't be entered (the server refuses it too).
  const horseOptions = (horsesData?.data || []).map((h) => {
    const level = h.trainingClearance?.level;
    const grounded = level === 'none' || h.healthStatus === 'injured' || h.healthStatus === 'quarantined';
    const recovering = !grounded && h.trainingClearance?.restricted;
    return {
      value: h._id,
      disabled: grounded || recovering,
      label: grounded ? `🔒 ${h.name} (bác sĩ đang khóa / chấn thương)` : recovering ? `🩹 ${h.name} (đang hồi phục)` : h.name,
    };
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['races'] });
    queryClient.invalidateQueries({ queryKey: ['race-trials'] });
  };

  const createMutation = useMutation({
    mutationFn: (payload) => raceApi.create(payload),
    onSuccess: () => {
      message.success('Đã đăng ký giải đua. Bấm "Lập kế hoạch" trên dòng giải để chuẩn bị cho giải này.');
      refresh();
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Đăng ký thất bại.'),
  });

  const resultMutation = useMutation({
    mutationFn: ({ id, payload }) => raceApi.results(id, payload),
    onSuccess: (_res, { payload }) => {
      message.success(payload.prizeMoney ? 'Đã lưu kết quả — tiền thưởng đã ghi vào doanh thu của chủ ngựa.' : 'Đã lưu kết quả.');
      refresh();
      setResultRace(null);
    },
    onError: (err) => message.error(err.message || 'Cập nhật thất bại.'),
  });

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => <Link to={`/horses/${record.horse?._id}`}>{name}</Link>,
    },
    {
      title: 'Giải đua',
      dataIndex: 'raceName',
      key: 'raceName',
      render: (name, r) => (
        <div>
          <div>{name}</div>
          {r.venue && <Text type="secondary" className="!text-xs">{r.venue}</Text>}
        </div>
      ),
    },
    {
      title: 'Ngày đua',
      dataIndex: 'raceDate',
      key: 'raceDate',
      render: (d, r) => {
        const days = dayjs(d).startOf('day').diff(dayjs().startOf('day'), 'day');
        return (
          <div>
            <div className="tabular-nums">{dayjs(d).format('DD/MM/YYYY')}</div>
            {['registered', 'confirmed'].includes(r.status) && days >= 0 && (
              <Text type="secondary" className="!text-xs">{days === 0 ? 'Hôm nay' : `Còn ${days} ngày`}</Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'Cự ly · mặt sân',
      key: 'distance',
      render: (_, r) => [r.distance ? `${r.distance}m` : null, SURFACE_LABELS[r.surface]].filter(Boolean).join(' · ') || '—',
    },
    {
      title: 'Chạy thử',
      key: 'trial',
      width: 210,
      render: (_, r) => (r.status === 'withdrawn' ? <Text type="secondary" className="!text-xs">—</Text> : <TrialCell trial={trialFor(r, trials)} />),
    },
    {
      title: 'Quyết định',
      key: 'status',
      width: 230,
      render: (_, r) => <DecisionCell entry={r} />,
    },
    {
      title: 'Kết quả',
      dataIndex: 'result',
      key: 'result',
      render: (v, r) =>
        v ? (
          <div>
            <div>{v}</div>
            {r.prizeMoney > 0 && (
              <Text type="success" className="!text-xs">
                Thưởng {Number(r.prizeMoney).toLocaleString('vi-VN')} ₫
              </Text>
            )}
          </div>
        ) : (
          <span className="text-gray-400">Chưa có kết quả</span>
        ),
    },
    {
      title: '',
      key: 'actions',
      // Pinned so the actions stay in view when the table scrolls sideways.
      fixed: 'right',
      render: (_, record) => {
        const open = ['registered', 'confirmed'].includes(record.status);
        const plan = activePlanByHorse.get(refId(record.horse));
        const planForThis = plan && refId(plan.targetRace) === String(record._id);
        return (
          <Space size={4} wrap>
            {open && !isPast(record) && !plan && (
              <Button size="small" icon={<ScheduleOutlined />} onClick={() => navigate(`/training/plans?race=${record._id}`)}>
                Lập kế hoạch
              </Button>
            )}
            {open && planForThis && (
              <Button size="small" type="link" className="!px-1" onClick={() => navigate('/training/plans')}>
                Xem kế hoạch
              </Button>
            )}
            {['registered', 'confirmed', 'withdrawn'].includes(record.status) && !isPast(record) && (
              <Button size="small" type={record.status === 'registered' || record.reviewNeeded ? 'primary' : 'default'} icon={<FlagOutlined />} onClick={() => setDecisionRace(record)}>
                Quyết định dự giải
              </Button>
            )}
            {!isBeforeRaceDay(record) && record.status !== 'withdrawn' && (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setResultRace(record);
                  resultForm.setFieldsValue({ position: record.position, finishTime: record.finishTime, prizeMoney: record.prizeMoney || undefined, result: record.result });
                }}
              >
                Cập nhật kết quả
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Đăng ký Giải đua
          </Title>
          <Text type="secondary" className="text-sm">
            Đăng ký ngựa, lập kế hoạch hướng tới giải, quyết định tham gia dựa trên chạy thử và sức khỏe, nhập kết quả sau khi thi đấu.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Đăng ký giải mới
        </Button>
      </div>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={data?.data}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: <Empty description='Chưa có giải đua nào được đăng ký. Nhấn "Đăng ký giải mới" để bắt đầu.' /> }}
      />

      <Modal
        title="Đăng ký giải đua"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Đăng ký"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ surface: 'turf' }}
          onFinish={(values) => createMutation.mutate({ ...values, raceDate: values.raceDate?.startOf('day').toISOString() })}
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true, message: 'Chọn ngựa' }]} extra="Ngựa đang bị khóa hoặc đang hồi phục không đăng ký được.">
            <Select placeholder="Chọn ngựa" options={horseOptions} />
          </Form.Item>
          <Form.Item name="raceName" label="Tên giải đua" rules={[{ required: true, whitespace: true, message: 'Nhập tên giải' }]}>
            <Input placeholder="VD: Cúp Mùa Đông 2026" />
          </Form.Item>
          <Form.Item name="venue" label="Trường đua">
            <Input placeholder="VD: Trường đua Đại Nam" />
          </Form.Item>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
            <Form.Item name="raceDate" label="Ngày đua" rules={[{ required: true, message: 'Chọn ngày đua' }]}>
              <DatePicker className="w-full" format="DD/MM/YYYY" disabledDate={(d) => d && d.isBefore(dayjs(), 'day')} />
            </Form.Item>
            <Form.Item name="distance" label="Cự ly (m)" rules={[{ required: true, message: 'Nhập cự ly' }]} extra="Kế hoạch chia giai đoạn theo cự ly này.">
              <InputNumber min={400} max={6000} step={100} className="w-full" placeholder="1600" />
            </Form.Item>
            <Form.Item name="surface" label="Mặt sân">
              <Select options={surfaceOptions} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <DecisionModal
        entry={decisionRace}
        horse={decisionRace ? horseById.get(refId(decisionRace.horse)) : null}
        onClose={() => setDecisionRace(null)}
        onDone={() => {
          setDecisionRace(null);
          refresh();
        }}
      />

      <Modal
        title={`Cập nhật kết quả — ${resultRace?.horse?.name || ''} tại ${resultRace?.raceName || ''}`}
        open={Boolean(resultRace)}
        onCancel={() => setResultRace(null)}
        onOk={() => resultForm.submit()}
        okText="Lưu kết quả"
        cancelText="Đóng"
        confirmLoading={resultMutation.isPending}
        destroyOnHidden
      >
        <Form form={resultForm} layout="vertical" onFinish={(values) => resultMutation.mutate({ id: resultRace._id, payload: values })}>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item name="position" label="Thứ hạng">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
            </Form.Item>
            <Form.Item name="finishTime" label="Thời gian về đích">
              <Input placeholder="VD: 1:38.50" />
            </Form.Item>
          </div>
          <Form.Item name="prizeMoney" label="Tiền thưởng (₫)" extra="Tự ghi vào doanh thu của chủ ngựa; sửa lại không tạo trùng.">
            <InputNumber
              min={0}
              step={1000000}
              style={{ width: '100%' }}
              formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')}
              parser={(v) => (v ? v.replace(/\./g, '') : '')}
            />
          </Form.Item>
          <Form.Item name="result" label="Ghi chú kết quả" extra="Bỏ trống để hệ thống tự ghi theo thứ hạng và thời gian.">
            <Input placeholder="VD: Về nhất, bứt tốc 200m cuối" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
