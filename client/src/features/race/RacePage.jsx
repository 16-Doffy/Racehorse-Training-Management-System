import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, DatePicker, InputNumber, Input, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { raceApi } from './raceApi';
import { horsesApi } from '../horses/horsesApi';

const { Title } = Typography;

// Real scaffold CRUD wired up; leaderboard/results integration comes later.
export default function RacePage() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['races'], queryFn: () => raceApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });

  const createMutation = useMutation({
    mutationFn: (payload) => raceApi.create(payload),
    onSuccess: () => {
      message.success('Đã đăng ký giải đua.');
      queryClient.invalidateQueries({ queryKey: ['races'] });
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Đăng ký thất bại.'),
  });

  const columns = [
    { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
    { title: 'Giải đua', dataIndex: 'raceName', key: 'raceName' },
    { title: 'Ngày đua', dataIndex: 'raceDate', key: 'raceDate', render: (d) => new Date(d).toLocaleDateString() },
    { title: 'Cự ly (m)', dataIndex: 'distance', key: 'distance' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s) => <Tag>{s}</Tag> },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          Đăng ký Giải đua
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Đăng ký giải mới
        </Button>
      </div>

      <Table rowKey="_id" columns={columns} dataSource={data?.data} loading={isLoading} />

      <Modal
        title="Đăng ký giải đua"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate({ ...values, raceDate: values.raceDate?.toISOString() })}
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="raceName" label="Tên giải đua" rules={[{ required: true }]}>
            <Input placeholder="Spring Derby 2026..." />
          </Form.Item>
          <Form.Item name="raceDate" label="Ngày đua" rules={[{ required: true }]}>
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="distance" label="Cự ly (m)">
            <InputNumber min={100} step={100} className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
