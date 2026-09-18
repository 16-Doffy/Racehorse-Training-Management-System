import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, DatePicker, Tag, message, Popover } from 'antd';
import { PlusOutlined, WarningFilled } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dailyTaskApi } from './stableApi';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { ROLES } from '../../constants/roles';

const { Title } = Typography;
const TASK_LABELS = { feeding: 'Cho ăn', cleaning: 'Vệ sinh chuồng', bathing: 'Tắm rửa', icing: 'Ngâm chân nước đá' };
const STATUS_LABELS = { pending: 'Chưa thực hiện', completed: 'Đã hoàn thành', skipped: 'Đã bỏ qua' };
const STATUS_COLORS = { pending: 'default', completed: 'green', skipped: 'orange' };
const SEVERITY_LABELS = { low: 'Nhẹ', medium: 'Trung bình', high: 'Nghiêm trọng' };
const SEVERITY_COLORS = { low: 'gold', medium: 'orange', high: 'red' };

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
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => <Link to={`/horses/${record.horse?._id}`}>{name}</Link>,
    },
    { title: 'Người phụ trách', dataIndex: ['assignedTo', 'name'], key: 'assignedTo' },
    { title: 'Công việc', dataIndex: 'taskType', key: 'taskType', render: (t) => TASK_LABELS[t] || t },
    {
      title: 'Ngày',
      dataIndex: 'scheduledDate',
      key: 'scheduledDate',
      render: (d) => new Date(d).toLocaleDateString('vi-VN'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag>,
    },
    {
      title: 'Sự cố',
      key: 'incident',
      render: (_, record) => {
        const incident = record.incidentReport;
        if (!incident) return <span className="text-gray-400">—</span>;
        return (
          <Popover
            title="Chi tiết sự cố"
            content={
              <div className="max-w-xs">
                <Tag color={SEVERITY_COLORS[incident.severity]}>{SEVERITY_LABELS[incident.severity] || incident.severity}</Tag>
                <p className="mt-2 mb-0">{incident.description}</p>
                {incident.images?.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1 mb-0">{incident.images.length} ảnh đính kèm</p>
                )}
              </div>
            }
          >
            <Tag color="red" icon={<WarningFilled />} className="cursor-pointer">
              Có sự cố
            </Tag>
          </Popover>
        );
      },
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Phân công Chuồng trại
          </Title>
          <Typography.Text type="secondary" className="text-sm">
            Giao việc chăm sóc hàng ngày (cho ăn, vệ sinh, tắm rửa...) cho nhân viên chăm sóc. Cột
            "Sự cố" hiện khi nhân viên báo cáo vấn đề bất thường trong lúc thực hiện.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Phân công công việc
        </Button>
      </div>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={data?.data}
        loading={isLoading}
        locale={{ emptyText: 'Chưa có công việc nào được phân công. Nhấn "Phân công công việc" để bắt đầu.' }}
      />

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
