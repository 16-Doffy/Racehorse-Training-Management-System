import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, InputNumber, DatePicker, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { trainingPlanApi } from './trainingApi';
import { horsesApi } from '../horses/horsesApi';

const { Title } = Typography;

const PHASE_LABELS = {
  base_building: 'Xây nền',
  strength: 'Sức mạnh',
  speed: 'Tốc độ',
  peak: 'Đỉnh cao',
  recovery: 'Phục hồi',
};

export default function TrainingPlanPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: plansData, isLoading } = useQuery({ queryKey: ['training-plans'], queryFn: () => trainingPlanApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });

  const createMutation = useMutation({
    mutationFn: (payload) => trainingPlanApi.create(payload),
    onSuccess: () => {
      message.success('Đã tạo giáo án huấn luyện.');
      queryClient.invalidateQueries({ queryKey: ['training-plans'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Tạo giáo án thất bại.'),
  });

  const columns = [
    { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
    { title: 'Giai đoạn', dataIndex: 'phase', key: 'phase', render: (p) => PHASE_LABELS[p] || p },
    { title: 'Cự ly mục tiêu (m)', dataIndex: 'distanceTarget', key: 'distanceTarget' },
    { title: 'Mặt sân', dataIndex: 'surface', key: 'surface' },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={s === 'active' ? 'blue' : 'default'}>{s}</Tag>,
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          Giáo án Huấn luyện
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Lập giáo án mới
        </Button>
      </div>

      <Table rowKey="_id" columns={columns} dataSource={plansData?.data} loading={isLoading} />

      <Modal
        title="Lập giáo án huấn luyện"
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
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="phase" label="Giai đoạn" rules={[{ required: true }]}>
            <Select
              options={Object.entries(PHASE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="distanceTarget" label="Cự ly mục tiêu (m)" rules={[{ required: true }]}>
            <InputNumber min={100} step={100} className="w-full" />
          </Form.Item>
          <Form.Item name="surface" label="Mặt sân" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'turf', label: 'Cỏ (Turf)' },
                { value: 'dirt', label: 'Đất (Dirt)' },
                { value: 'synthetic', label: 'Tổng hợp' },
                { value: 'sand', label: 'Cát' },
              ]}
            />
          </Form.Item>
          <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
