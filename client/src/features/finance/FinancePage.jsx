import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Table, Typography, Tag, Button, Modal, Form, Select, InputNumber, Input } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { financeApi } from './financeApi';
import { horsesApi } from '../horses/horsesApi';
import { ROLES } from '../../constants/roles';

const { Title } = Typography;

const columns = (isOwner) => [
  { title: 'Ngựa', dataIndex: ['horse', 'name'], key: 'horse' },
  {
    title: 'Loại',
    dataIndex: 'type',
    key: 'type',
    render: (t) => <Tag color={t === 'revenue' ? 'green' : 'red'}>{t === 'revenue' ? 'Doanh thu' : 'Chi phí'}</Tag>,
  },
  { title: 'Hạng mục', dataIndex: 'category', key: 'category' },
  { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (v) => v.toLocaleString('vi-VN') + ' đ' },
  { title: 'Ngày', dataIndex: 'date', key: 'date', render: (d) => new Date(d).toLocaleDateString() },
  ...(isOwner ? [] : [{ title: 'Ghi chú', dataIndex: 'note', key: 'note' }]),
];

// Owner sees a read-only report for their own horses; Manager records cost/revenue entries.
export default function FinancePage() {
  const { user } = useSelector((state) => state.auth);
  const isOwner = user?.role === ROLES.OWNER;
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['finance', isOwner ? 'mine' : 'all'],
    queryFn: () => (isOwner ? financeApi.listMine() : financeApi.list()),
  });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list(), enabled: !isOwner });

  const createMutation = useMutation({
    mutationFn: (payload) => financeApi.create(payload),
    onSuccess: () => {
      message.success('Đã ghi nhận.');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setOpen(false);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Ghi nhận thất bại.'),
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Title level={3} className="!mb-0">
          {isOwner ? 'Chi phí & Doanh thu' : 'Báo cáo Tài chính'}
        </Title>
        {!isOwner && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Ghi nhận khoản mục
          </Button>
        )}
      </div>

      <Table rowKey="_id" columns={columns(isOwner)} dataSource={data?.data} loading={isLoading} />

      {!isOwner && (
        <Modal
          title="Ghi nhận khoản chi phí / doanh thu"
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
            <Form.Item name="type" label="Loại" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'cost', label: 'Chi phí' },
                  { value: 'revenue', label: 'Doanh thu' },
                ]}
              />
            </Form.Item>
            <Form.Item name="category" label="Hạng mục" rules={[{ required: true }]}>
              <Input placeholder="Thức ăn, y tế, tiền thưởng, tài trợ..." />
            </Form.Item>
            <Form.Item name="amount" label="Số tiền (VNĐ)" rules={[{ required: true }]}>
              <InputNumber min={0} className="w-full" />
            </Form.Item>
            <Form.Item name="note" label="Ghi chú">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
