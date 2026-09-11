import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, Input, InputNumber, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { healthRecordApi } from './healthApi';
import { horsesApi } from '../horses/horsesApi';

const { Title } = Typography;

const STATUS_OPTIONS = [
  { value: 'eligible', label: 'Đủ điều kiện', color: 'green' },
  { value: 'monitoring', label: 'Cần theo dõi', color: 'gold' },
  { value: 'injured', label: 'Chấn thương', color: 'red' },
  { value: 'quarantined', label: 'Cách ly', color: 'volcano' },
];
const colorOf = (v) => STATUS_OPTIONS.find((o) => o.value === v)?.color;
const labelOf = (v) => STATUS_OPTIONS.find((o) => o.value === v)?.label || v;

export default function HealthBoardPage() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['health-records'], queryFn: () => healthRecordApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });

  const createMutation = useMutation({
    mutationFn: (payload) => healthRecordApi.create(payload),
    onSuccess: () => {
      message.success('Đã ghi nhận hồ sơ khám bệnh.');
      queryClient.invalidateQueries({ queryKey: ['health-records'] });
      queryClient.invalidateQueries({ queryKey: ['horses'] });
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Ghi nhận thất bại.'),
  });

  const columns = [
    { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
    { title: 'Ngày khám', dataIndex: 'date', key: 'date', render: (d) => new Date(d).toLocaleDateString() },
    { title: 'Chẩn đoán', dataIndex: 'diagnosis', key: 'diagnosis' },
    {
      title: 'Kết luận',
      dataIndex: 'resultStatus',
      key: 'resultStatus',
      render: (s) => <Tag color={colorOf(s)}>{labelOf(s)}</Tag>,
    },
    { title: 'Bác sĩ', dataIndex: ['examinedBy', 'name'], key: 'examinedBy' },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          Sơ đồ &amp; Hồ sơ Khám bệnh
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Ghi nhận khám bệnh
        </Button>
      </div>

      <Table rowKey="_id" columns={columns} dataSource={data?.data} loading={isLoading} />

      <Modal
        title="Ghi nhận hồ sơ khám bệnh"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="diagnosis" label="Chẩn đoán" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="resultStatus" label="Kết luận trạng thái" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="Chỉ số sinh tồn">
            <div className="grid grid-cols-3 gap-2">
              <Form.Item name={['vitalSigns', 'temperatureC']} noStyle>
                <InputNumber placeholder="Nhiệt độ (°C)" className="w-full" />
              </Form.Item>
              <Form.Item name={['vitalSigns', 'heartRate']} noStyle>
                <InputNumber placeholder="Nhịp tim (bpm)" className="w-full" />
              </Form.Item>
              <Form.Item name={['vitalSigns', 'respiratoryRate']} noStyle>
                <InputNumber placeholder="Nhịp thở" className="w-full" />
              </Form.Item>
            </div>
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
