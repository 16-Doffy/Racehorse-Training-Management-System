import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, DatePicker, Tag, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dailyTaskApi } from './stableApi';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { ROLES } from '../../constants/roles';

const { Title } = Typography;
const TASK_LABELS = { feeding: 'Cho ăn', cleaning: 'Vệ sinh chuồng', bathing: 'Tắm rửa', icing: 'Ngâm chân nước đá' };
const STATUS_COLORS = { pending: 'default', completed: 'green', skipped: 'orange' };

// Head Trainer / Manager assign the day's worklist; Groom executes it from "Công việc Hàng ngày".
export default function StableAssignPage() {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['daily-tasks-all'], queryFn: () => dailyTaskApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => dailyTaskApi.create(payload),
    onSuccess: () => {
      message.success('Đã phân công công việc.');
      queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Phân công thất bại.'),
  });

  const columns = [
    { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
    { title: 'Người phụ trách', dataIndex: ['assignedTo', 'name'], key: 'assignedTo' },
    { title: 'Công việc', dataIndex: 'taskType', key: 'taskType', render: (t) => TASK_LABELS[t] || t },
    {
      title: 'Ngày',
      dataIndex: 'scheduledDate',
      key: 'scheduledDate',
      render: (d) => new Date(d).toLocaleDateString(),
    },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          Phân công Chuồng trại
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Phân công công việc
        </Button>
      </div>

      <Table rowKey="_id" columns={columns} dataSource={data?.data} loading={isLoading} />

      <Modal
        title="Phân công công việc hàng ngày"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            createMutation.mutate({ ...values, scheduledDate: values.scheduledDate?.toISOString() })
          }
        >
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="assignedTo" label="Nhân viên chăm sóc" rules={[{ required: true }]}>
            <Select options={(groomsData?.data || []).map((u) => ({ value: u._id, label: u.name }))} />
          </Form.Item>
          <Form.Item name="taskType" label="Loại công việc" rules={[{ required: true }]}>
            <Select options={Object.entries(TASK_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="scheduledDate" label="Ngày thực hiện" rules={[{ required: true }]} initialValue={undefined}>
            <DatePicker className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
