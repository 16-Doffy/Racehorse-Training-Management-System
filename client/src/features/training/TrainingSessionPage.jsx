import { useState } from 'react';
import {
  Table,
  Button,
  Typography,
  Modal,
  Form,
  Select,
  DatePicker,
  Tag,
  message,
  InputNumber,
  Input,
  Segmented,
} from 'antd';
import { PlusOutlined, EditOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingSessionApi, trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { useLockedHorseIds } from './useLockedHorses';

const { Title } = Typography;

const STATUS_LABELS = {
  scheduled: 'Đã lên lịch',
  in_progress: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
};
const STATUS_COLORS = { scheduled: 'default', in_progress: 'processing', completed: 'success', cancelled: 'error' };
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
const SESSION_TYPE_LABELS = { training: 'Buổi tập thường', trial_run: 'Lượt chạy thử' };

export default function TrainingSessionPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [createForm] = Form.useForm();
  const [evalForm] = Form.useForm();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const planFilter = searchParams.get('plan');
  const horseFilter = searchParams.get('horse');
  const lockedHorseIds = useLockedHorseIds();

  const { data: sessionsData, isLoading } = useQuery({
    // Re-fetches whenever the filter changes, letting the server do the filtering rather than
    // hiding rows client-side — keeps this consistent with every other list page in the app.
    queryKey: ['training-sessions', typeFilter, planFilter, horseFilter],
    queryFn: () =>
      trainingSessionApi.list({
        ...(typeFilter !== 'all' ? { sessionType: typeFilter } : {}),
        ...(planFilter ? { trainingPlan: planFilter } : {}),
        ...(horseFilter ? { horse: horseFilter } : {}),
      }),
  });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });

  const filteredPlan = planFilter ? (plansData?.data || []).find((p) => p._id === planFilter) : null;
  const filteredHorse = horseFilter ? (horsesData?.data || []).find((h) => h._id === horseFilter) : null;

  const horseOptions = (horsesData?.data || []).map((h) => ({
    value: h._id,
    label: lockedHorseIds.has(h._id) ? `🔒 ${h.name} (đang bị khóa huấn luyện)` : h.name,
    disabled: lockedHorseIds.has(h._id),
  }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['training-sessions'] });

  const createMutation = useMutation({
    mutationFn: (payload) => trainingSessionApi.create(payload),
    onSuccess: () => {
      message.success('Đã tạo buổi tập.');
      invalidate();
      setCreateOpen(false);
      createForm.resetFields();
    },
    // Surfaces the training-lock 409 from the API (Veterinarian's emergency lock) verbatim.
    onError: (err) => message.error(err.message || 'Không thể tạo buổi tập.'),
  });

  const evalMutation = useMutation({
    mutationFn: ({ id, payload }) => trainingSessionApi.recordEvaluation(id, payload),
    onSuccess: () => {
      message.success('Đã ghi nhận đánh giá.');
      invalidate();
      setEvalOpen(false);
    },
    onError: (err) => message.error(err.message || 'Ghi nhận thất bại.'),
  });

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => (
        <span>
          <Link to={`/horses/${record.horse?._id}`}>{name}</Link>
          {lockedHorseIds.has(record.horse?._id) && (
            <Tag color="red" className="ml-2">
              🔒 Đang khóa
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: 'Loại',
      dataIndex: 'sessionType',
      key: 'sessionType',
      render: (t) => <Tag color={t === 'trial_run' ? 'purple' : 'default'}>{SESSION_TYPE_LABELS[t] || t}</Tag>,
    },
    {
      title: 'Thời gian',
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      render: (d) => new Date(d).toLocaleString('vi-VN'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag>,
    },
    {
      title: 'Nhịp tim TB / Tốc độ tối đa',
      key: 'metrics',
      render: (_, r) => `${r.metrics?.avgHeartRate ?? '—'} bpm / ${r.metrics?.maxSpeed ?? '—'} km/h`,
    },
    {
      title: 'Điểm phong độ',
      dataIndex: 'performanceRating',
      key: 'performanceRating',
      render: (v) => (v != null ? `${v} / 10` : 'Chưa đánh giá'),
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setActiveSession(record);
            evalForm.setFieldsValue({
              trainerComment: record.trainerComment,
              performanceRating: record.performanceRating,
              status: record.status,
            });
            setEvalOpen(true);
          }}
        >
          Đánh giá
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Buổi Tập &amp; Đánh giá
          </Title>
          <Typography.Text type="secondary" className="text-sm">
            Từng buổi tập cụ thể thuộc một kế hoạch huấn luyện — theo dõi chỉ số thể lực ghi nhận
            được và ghi lại đánh giá chuyên môn sau mỗi buổi.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Tạo buổi tập
        </Button>
      </div>

      {filteredPlan && (
        <Tag
          closable
          closeIcon={<CloseCircleOutlined />}
          onClose={() => setSearchParams({})}
          color="blue"
          className="mb-4"
        >
          Đang lọc theo kế hoạch: {filteredPlan.horse?.name} — {filteredPlan.phase}
        </Tag>
      )}
      {filteredHorse && (
        <Tag
          closable
          closeIcon={<CloseCircleOutlined />}
          onClose={() => setSearchParams({})}
          color="blue"
          className="mb-4"
        >
          Đang lọc theo ngựa: {filteredHorse.name}
        </Tag>
      )}

      <Segmented
        className="mb-4"
        value={typeFilter}
        onChange={setTypeFilter}
        options={[
          { value: 'all', label: 'Tất cả' },
          { value: 'training', label: SESSION_TYPE_LABELS.training },
          { value: 'trial_run', label: SESSION_TYPE_LABELS.trial_run },
        ]}
      />

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={sessionsData?.data}
        loading={isLoading}
        locale={{ emptyText: 'Chưa có buổi tập nào. Nhấn "Tạo buổi tập" để thêm buổi tập cho một kế hoạch.' }}
      />

      <Modal
        title="Tạo buổi tập mới"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) =>
            createMutation.mutate({ ...values, scheduledAt: values.scheduledAt?.toISOString() })
          }
        >
          <Form.Item name="trainingPlan" label="Kế hoạch" rules={[{ required: true }]}>
            <Select options={(plansData?.data || []).map((p) => ({ value: p._id, label: `${p.horse?.name} — ${p.phase}` }))} />
          </Form.Item>
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={horseOptions} />
          </Form.Item>
          <Form.Item name="sessionType" label="Loại buổi tập" initialValue="training">
            <Select options={Object.entries(SESSION_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="scheduledAt" label="Thời gian" rules={[{ required: true }]}>
            <DatePicker showTime className="w-full" />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái" initialValue="scheduled">
            <Select
              options={[
                { value: 'scheduled', label: 'Đã lên lịch' },
                { value: 'in_progress', label: 'Đang diễn ra (bật cảm biến thể lực mô phỏng)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Đánh giá buổi tập — ${activeSession?.horse?.name || ''}`}
        open={evalOpen}
        onCancel={() => setEvalOpen(false)}
        onOk={() => evalForm.submit()}
        confirmLoading={evalMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={evalForm}
          layout="vertical"
          onFinish={(values) => evalMutation.mutate({ id: activeSession._id, payload: values })}
        >
          <Form.Item name="status" label="Trạng thái">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="performanceRating"
            label="Điểm phong độ (1 = kém, 10 = xuất sắc)"
          >
            <InputNumber min={1} max={10} className="w-full" placeholder="VD: 8" />
          </Form.Item>
          <Form.Item
            name="trainerComment"
            label="Nhận xét chuyên môn"
            extra="Ghi lại quan sát của bạn về phong độ, kỹ thuật, hoặc bất thường trong buổi tập này."
          >
            <Input.TextArea rows={3} placeholder="VD: Ngựa chạy ổn định, nên tăng nhẹ cường độ tuần tới." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
