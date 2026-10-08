import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, DatePicker, InputNumber, Input, Tag, Space, Tooltip } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { raceApi } from './raceApi';
import { horsesApi } from '../horses/horsesApi';
import { trainingSessionApi } from '../training/trainingApi';
import { SURFACE_LABELS, surfaceOptions } from '../training/trainingVocab';

const { Title, Text } = Typography;

const STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận tham gia',
  completed: 'Đã thi đấu xong',
  withdrawn: 'Đã rút lui',
};
const STATUS_COLORS = { registered: 'default', confirmed: 'blue', completed: 'green', withdrawn: 'red' };
// "Completed" is reached by entering the result, not by picking it.
const MANUAL_STATUSES = ['registered', 'confirmed', 'withdrawn'];
const DONE = ['completed', 'evaluated'];
// A result can be entered from race day on (the server refuses it before); entering is possible up to race day.
const raceDayOf = (entry) => dayjs(entry.raceDate).startOf('day');
const isBeforeRaceDay = (entry) => raceDayOf(entry).isAfter(dayjs().startOf('day'));
const isRaceDayOrLater = (entry) => !isBeforeRaceDay(entry);

/**
 * The horse's trial run for this race: run after the horse was entered and before race day — the last
 * finished one, else the next one booked. (The plan books it about a week before the race.)
 */
function trialFor(entry, trials) {
  const raceDay = dayjs(entry.raceDate).endOf('day');
  const from = dayjs(entry.createdAt).startOf('day');
  const mine = trials.filter(
    (s) => String(s.horse?._id || s.horse) === String(entry.horse?._id) && dayjs(s.scheduledAt).isAfter(from) && dayjs(s.scheduledAt).isBefore(raceDay) && !['cancelled', 'missed'].includes(s.status)
  );
  const done = mine.filter((s) => DONE.includes(s.status)).sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  if (done.length) return done[0];
  return mine.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0] || null;
}

function TrialCell({ trial }) {
  if (!trial) return <Text type="secondary" className="!text-xs">Chưa chạy thử</Text>;
  const when = dayjs(trial.scheduledAt).format('DD/MM');
  if (!DONE.includes(trial.status)) {
    return (
      <Text className="!text-xs">
        Đã lên lịch {when} · {dayjs(trial.scheduledAt).format('HH:mm')}
      </Text>
    );
  }
  const met = trial.outcome?.met;
  const m = trial.metrics || {};
  return (
    <Tooltip title={trial.outcome?.summary}>
      <div className="flex flex-col gap-0.5">
        <span>
          {met === true && <Tag color="green" className="!m-0">Đạt</Tag>}
          {met === false && <Tag color="red" className="!m-0">Chưa đạt</Tag>}
          {met == null && <Tag className="!m-0">Đã chạy</Tag>}
          <Text type="secondary" className="!text-xs ml-1">{when}</Text>
        </span>
        <Text type="secondary" className="!text-xs">
          {[m.distance ? `${m.distance}m` : null, m.maxSpeed ? `tối đa ${m.maxSpeed} km/h` : null, m.avgHeartRate ? `nhịp tim TB ${Math.round(m.avgHeartRate)}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </div>
    </Tooltip>
  );
}

// Registration, the trial run that decides whether the horse goes, and the result after the race.
export default function RacePage() {
  const [open, setOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [activeRace, setActiveRace] = useState(null);
  const [form] = Form.useForm();
  const [resultForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: trialsData } = useQuery({
    queryKey: ['training-sessions', 'trial_run'],
    queryFn: () => trainingSessionApi.list({ sessionType: 'trial_run' }),
  });
  const trials = trialsData?.data || [];

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

  const createMutation = useMutation({
    mutationFn: (payload) => raceApi.create(payload),
    onSuccess: () => {
      message.success('Đã đăng ký giải đua. Giờ có thể lập kế hoạch huấn luyện hướng tới giải này.');
      queryClient.invalidateQueries({ queryKey: ['races'] });
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Đăng ký thất bại.'),
  });

  const confirmMutation = useMutation({
    mutationFn: (id) => raceApi.update(id, { status: 'confirmed' }),
    onSuccess: () => {
      message.success('Đã xác nhận ngựa tham gia giải.');
      queryClient.invalidateQueries({ queryKey: ['races'] });
    },
    onError: (err) => message.error(err.message || 'Không xác nhận được.'),
  });

  const updateResultMutation = useMutation({
    // Any other status is a plain change; a finished race goes through the results endpoint, which
    // also records the prize money as the owner's revenue.
    mutationFn: ({ id, payload }) =>
      payload.status === 'completed'
        ? raceApi.results(id, { position: payload.position, finishTime: payload.finishTime, prizeMoney: payload.prizeMoney, result: payload.result })
        : raceApi.update(id, { status: payload.status }),
    onSuccess: (_res, { payload }) => {
      message.success(payload.status === 'completed' && payload.prizeMoney ? 'Đã lưu kết quả — tiền thưởng đã ghi vào doanh thu của chủ ngựa.' : 'Đã cập nhật kết quả.');
      queryClient.invalidateQueries({ queryKey: ['races'] });
      setResultOpen(false);
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
      width: 200,
      render: (_, r) => (r.status === 'withdrawn' ? <Text type="secondary" className="!text-xs">—</Text> : <TrialCell trial={trialFor(r, trials)} />),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag>,
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
        const canConfirm = record.status === 'registered' && !raceDayOf(record).isBefore(dayjs().startOf('day'));
        const resultTime = isRaceDayOrLater(record) && record.status !== 'withdrawn';
        return (
          <Space size={4} wrap>
            {canConfirm && (
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={confirmMutation.isPending && confirmMutation.variables === record._id}
                onClick={() => confirmMutation.mutate(record._id)}
              >
                Xác nhận tham gia
              </Button>
            )}
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setActiveRace(record);
                resultForm.setFieldsValue({
                  // A race already run is most often being given its result; otherwise keep its status.
                  status: ['registered', 'confirmed'].includes(record.status) && resultTime ? 'completed' : record.status,
                  position: record.position,
                  finishTime: record.finishTime,
                  prizeMoney: record.prizeMoney || undefined,
                  result: record.result,
                });
                setResultOpen(true);
              }}
            >
              {resultTime ? 'Cập nhật kết quả' : 'Đổi trạng thái'}
            </Button>
          </Space>
        );
      },
    },
  ];

  const resultUpcoming = activeRace ? isBeforeRaceDay(activeRace) : false;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Đăng ký Giải đua
          </Title>
          <Text type="secondary" className="text-sm">
            Đăng ký ngựa, xem kết quả chạy thử trước giải để xác nhận tham gia, và nhập kết quả sau khi thi đấu.
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
        locale={{ emptyText: 'Chưa có giải đua nào được đăng ký. Nhấn "Đăng ký giải mới" để bắt đầu.' }}
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

      <Modal
        title={`${resultUpcoming ? 'Đổi trạng thái' : 'Cập nhật kết quả'} — ${activeRace?.horse?.name || ''} tại ${activeRace?.raceName || ''}`}
        open={resultOpen}
        onCancel={() => setResultOpen(false)}
        onOk={() => resultForm.submit()}
        confirmLoading={updateResultMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={resultForm}
          layout="vertical"
          onFinish={(values) => updateResultMutation.mutate({ id: activeRace._id, payload: values })}
        >
          <Form.Item
            name="status"
            label="Trạng thái"
            rules={[{ required: true }]}
            extra={resultUpcoming ? 'Kết quả nhập được từ ngày đua.' : null}
          >
            <Select
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
                disabled: value === 'completed' ? resultUpcoming : !MANUAL_STATUSES.includes(value),
              }))}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.status !== b.status}>
            {({ getFieldValue }) =>
              getFieldValue('status') === 'completed' && (
                <>
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
                </>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
