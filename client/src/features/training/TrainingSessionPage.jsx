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
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingSessionApi, trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';

const { Title } = Typography;

const STATUS_COLORS = { scheduled: 'default', in_progress: 'processing', completed: 'success', cancelled: 'error' };
const SESSION_TYPE_LABELS = { training: 'Buổi tập thường', trial_run: 'Lượt chạy thử' };

export default function TrainingSessionPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [createForm] = Form.useForm();
  const [evalForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: sessionsData, isLoading } = useQuery({
    // Re-fetches whenever the filter changes, letting the server do the filtering rather than
    // hiding rows client-side — keeps this consistent with every other list page in the app.
    queryKey: ['training-sessions', typeFilter],
    queryFn: () => trainingSessionApi.list(typeFilter === 'all' ? undefined : { sessionType: typeFilter }),
  });
  const { data: plansData } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });

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
    { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
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
      render: (d) => new Date(d).toLocaleString(),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: 'Nhịp tim TB / Tốc độ tối đa',
      key: 'metrics',
      render: (_, r) => `${r.metrics?.avgHeartRate ?? '—'} bpm / ${r.metrics?.maxSpeed ?? '—'} km/h`,
    },
    { title: 'Đánh giá', dataIndex: 'performanceRating', key: 'performanceRating', render: (v) => v ?? '—' },
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
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          Buổi Tập &amp; Đánh giá
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Tạo buổi tập
        </Button>
      </div>

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

      <Table rowKey="_id" columns={columns} dataSource={sessionsData?.data} loading={isLoading} />

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
          <Form.Item name="trainingPlan" label="Giáo án" rules={[{ required: true }]}>
            <Select options={(plansData?.data || []).map((p) => ({ value: p._id, label: `${p.horse?.name} — ${p.phase}` }))} />
          </Form.Item>
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
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
                { value: 'in_progress', label: 'Đang diễn ra (bật cảm biến realtime)' },
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
            <Select
              options={[
                { value: 'scheduled', label: 'Đã lên lịch' },
                { value: 'in_progress', label: 'Đang diễn ra' },
                { value: 'completed', label: 'Hoàn thành' },
                { value: 'cancelled', label: 'Đã hủy' },
              ]}
            />
          </Form.Item>
          <Form.Item name="performanceRating" label="Điểm phong độ (1-10)">
            <InputNumber min={1} max={10} className="w-full" />
          </Form.Item>
          <Form.Item name="trainerComment" label="Nhận xét chuyên môn">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
