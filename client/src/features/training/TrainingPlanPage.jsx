import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, InputNumber, DatePicker, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';
import { useLockedHorseIds } from './useLockedHorses';

const { Title } = Typography;

const PHASE_LABELS = {
  base_building: 'Xây nền',
  strength: 'Sức mạnh',
  speed: 'Tốc độ',
  peak: 'Đỉnh cao',
  recovery: 'Phục hồi',
};

const INTENSITY_LABELS = { light: 'Nhẹ', moderate: 'Vừa', high: 'Cao' };
const INTENSITY_COLORS = { light: 'green', moderate: 'gold', high: 'red' };

const STATUS_LABELS = { draft: 'Nháp', active: 'Đang áp dụng', completed: 'Đã hoàn thành', cancelled: 'Đã hủy' };
const STATUS_COLORS = { draft: 'default', active: 'blue', completed: 'green', cancelled: 'red' };

const SURFACE_LABELS = { turf: 'Cỏ (Turf)', dirt: 'Đất (Dirt)', synthetic: 'Tổng hợp', sand: 'Cát' };
const SURFACE_OPTIONS = Object.entries(SURFACE_LABELS).map(([value, label]) => ({ value, label }));

export default function TrainingPlanPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: plansData, isLoading } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const lockedHorseIds = useLockedHorseIds();

  const horseOptions = (horsesData?.data || []).map((h) => ({
    value: h._id,
    label: lockedHorseIds.has(h._id) ? `🔒 ${h.name} (đang bị khóa huấn luyện)` : h.name,
    disabled: lockedHorseIds.has(h._id),
  }));

  const createMutation = useMutation({
    mutationFn: (payload) => trainingPlanApi.create(payload),
    onSuccess: () => {
      message.success('Đã tạo kế hoạch huấn luyện.');
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Tạo kế hoạch thất bại.'),
  });

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => (
        <Link to={`/horses/${record.horse?._id}`} onClick={(e) => e.stopPropagation()}>
          {name}
        </Link>
      ),
    },
    { title: 'Giai đoạn', dataIndex: 'phase', key: 'phase', render: (p) => PHASE_LABELS[p] || p },
    { title: 'Cự ly mục tiêu (m)', dataIndex: 'distanceTarget', key: 'distanceTarget' },
    { title: 'Khối lượng (km/tuần)', dataIndex: 'weeklyVolumeKm', key: 'weeklyVolumeKm' },
    {
      title: 'Cường độ',
      dataIndex: 'intensity',
      key: 'intensity',
      render: (v) => <Tag color={INTENSITY_COLORS[v]}>{INTENSITY_LABELS[v] || v}</Tag>,
    },
    { title: 'Mặt sân', dataIndex: 'surface', key: 'surface', render: (v) => SURFACE_LABELS[v] || v },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, record) =>
        lockedHorseIds.has(record.horse?._id) ? (
          <Tag color="red">🔒 Đang khóa</Tag>
        ) : (
          <Tag color={STATUS_COLORS[record.status]}>{STATUS_LABELS[record.status] || record.status}</Tag>
        ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Kế hoạch Huấn luyện
          </Title>
          <Typography.Text type="secondary" className="text-sm">
            Kế hoạch huấn luyện dài hạn cho từng ngựa — giai đoạn tập luyện, cường độ và mục tiêu cự
            ly. Mỗi kế hoạch gồm nhiều buổi tập cụ thể (xem ở tab "Buổi Tập &amp; Đánh giá").
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Lập kế hoạch mới
        </Button>
      </div>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={plansData?.data}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa có kế hoạch huấn luyện nào. Nhấn "Lập kế hoạch mới" để bắt đầu.' }}
        onRow={(record) => ({
          onClick: () => navigate(`/training/sessions?plan=${record._id}`),
          className: 'cursor-pointer',
        })}
      />
      <Typography.Paragraph type="secondary" className="!mt-2 !mb-0 text-xs">
        💡 Nhấp vào một dòng để xem các buổi tập thuộc kế hoạch đó.
      </Typography.Paragraph>

      <Modal
        title="Lập kế hoạch huấn luyện"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            createMutation.mutate({ ...values, startDate: values.startDate?.toISOString() })
          }
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={horseOptions} />
          </Form.Item>
          <Form.Item name="phase" label="Giai đoạn" rules={[{ required: true }]}>
            <Select
              options={Object.entries(PHASE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="distanceTarget" label="Cự ly mục tiêu (m)" rules={[{ required: true }]}>
            <InputNumber min={100} step={100} className="w-full" />
          </Form.Item>
          <Form.Item name="weeklyVolumeKm" label="Khối lượng (km/tuần)" rules={[{ required: true }]}>
            <InputNumber min={1} step={1} className="w-full" />
          </Form.Item>
          <Form.Item name="intensity" label="Cường độ" initialValue="moderate">
            <Select options={Object.entries(INTENSITY_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="surface" label="Mặt sân" rules={[{ required: true }]}>
            <Select options={SURFACE_OPTIONS} />
          </Form.Item>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
