import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, Input, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { treatmentApi, healthRecordApi } from './healthApi';
import { horsesApi } from '../horses/horsesApi';

const { Title } = Typography;

export default function TreatmentPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [lockTarget, setLockTarget] = useState(null);
  const [createForm] = Form.useForm();
  const [lockForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['treatments'], queryFn: () => treatmentApi.list() });
  const { data: recordsData } = useQuery({ queryKey: ['health-records'], queryFn: () => healthRecordApi.list() });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['treatments'] });

  const createMutation = useMutation({
    mutationFn: (payload) => treatmentApi.create(payload),
    onSuccess: () => {
      message.success('Đã tạo phác đồ điều trị.');
      invalidate();
      setCreateOpen(false);
      createForm.resetFields();
    },
    onError: (err) => message.error(err.message || 'Tạo thất bại.'),
  });

  const lockMutation = useMutation({
    mutationFn: ({ id, isTrainingLocked, lockReason }) =>
      treatmentApi.setTrainingLock(id, { isTrainingLocked, lockReason }),
    onSuccess: (_, vars) => {
      message.success(vars.isTrainingLocked ? 'Đã khóa huấn luyện khẩn cấp.' : 'Đã gỡ khóa huấn luyện.');
      invalidate();
      setLockTarget(null);
      lockForm.resetFields();
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const columns = [
    { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
    { title: 'Bác sĩ kê đơn', dataIndex: ['prescribedBy', 'name'], key: 'prescribedBy' },
    {
      title: 'Thuốc',
      dataIndex: 'medications',
      key: 'medications',
      render: (meds) => (meds || []).map((m) => `${m.name} (${m.dosage})`).join(', ') || '—',
    },
    {
      title: 'Khóa huấn luyện',
      dataIndex: 'isTrainingLocked',
      key: 'isTrainingLocked',
      render: (v, record) =>
        v ? (
          <Tag color="red" icon={<LockOutlined />}>
            {record.lockReason || 'Đang khóa'}
          </Tag>
        ) : (
          <Tag>Không khóa</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) =>
        record.isTrainingLocked ? (
          <Popconfirm title="Gỡ lệnh khóa huấn luyện?" onConfirm={() => lockMutation.mutate({ id: record._id, isTrainingLocked: false })}>
            <Button size="small" icon={<UnlockOutlined />}>
              Gỡ khóa
            </Button>
          </Popconfirm>
        ) : (
          <Button size="small" danger icon={<LockOutlined />} onClick={() => setLockTarget(record)}>
            Khóa huấn luyện
          </Button>
        ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          Điều trị &amp; Khóa Huấn luyện
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Tạo phác đồ điều trị
        </Button>
      </div>

      <Table rowKey="_id" columns={columns} dataSource={data?.data} loading={isLoading} />

      <Modal
        title="Tạo phác đồ điều trị"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select options={(horsesData?.data || []).map((h) => ({ value: h._id, label: h.name }))} />
          </Form.Item>
          <Form.Item name="healthRecord" label="Hồ sơ khám liên quan" rules={[{ required: true }]}>
            <Select
              options={(recordsData?.data || []).map((r) => ({
                value: r._id,
                label: `${r.horse?.name} — ${r.diagnosis}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="Đơn thuốc">
            <Form.List name="medications">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...rest }) => (
                    <div key={key} className="flex gap-2 mb-2">
                      <Form.Item {...rest} name={[name, 'name']} noStyle rules={[{ required: true }]}>
                        <Input placeholder="Tên thuốc" />
                      </Form.Item>
                      <Form.Item {...rest} name={[name, 'dosage']} noStyle rules={[{ required: true }]}>
                        <Input placeholder="Liều dùng" />
                      </Form.Item>
                      <Button danger onClick={() => remove(name)}>
                        Xóa
                      </Button>
                    </div>
                  ))}
                  <Button block onClick={() => add()}>
                    + Thêm thuốc
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Khóa huấn luyện khẩn cấp — ${lockTarget?.horse?.name || ''}`}
        open={!!lockTarget}
        onCancel={() => setLockTarget(null)}
        onOk={() => lockForm.submit()}
        okText="Xác nhận khóa"
        okButtonProps={{ danger: true }}
        confirmLoading={lockMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={lockForm}
          layout="vertical"
          onFinish={(values) =>
            lockMutation.mutate({ id: lockTarget._id, isTrainingLocked: true, lockReason: values.lockReason })
          }
        >
          <Form.Item name="lockReason" label="Lý do khóa" rules={[{ required: true }]}>
            <Input.TextArea placeholder="Chấn thương, nguy cơ tái phát, ..." rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
