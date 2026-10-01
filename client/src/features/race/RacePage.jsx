import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, DatePicker, InputNumber, Input, Tag } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { raceApi } from './raceApi';
import { horsesApi } from '../horses/horsesApi';

const { Title } = Typography;

const STATUS_LABELS = {
  registered: 'Đã đăng ký',
  confirmed: 'Đã xác nhận tham gia',
  completed: 'Đã thi đấu xong',
  withdrawn: 'Đã rút lui',
};
const STATUS_COLORS = { registered: 'default', confirmed: 'blue', completed: 'green', withdrawn: 'red' };

// Registration + post-race result entry both wired up to real CRUD; a club-wide leaderboard
// across all horses/races is still a later phase.
export default function RacePage() {
  const [open, setOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [activeRace, setActiveRace] = useState(null);
  const [form] = Form.useForm();
  const [resultForm] = Form.useForm();
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

  const updateResultMutation = useMutation({
    // Any other status is a plain change; a finished race goes through the results endpoint, which
    // also records the prize money as the owner's revenue.
    mutationFn: ({ id, payload }) =>
      payload.status === 'completed'
        ? raceApi.results(id, { position: payload.position, finishTime: payload.finishTime, prizeMoney: payload.prizeMoney, result: payload.result })
        : raceApi.update(id, { status: payload.status }),
    onSuccess: (_res, { payload }) => {
      message.success(payload.status === 'completed' && payload.prizeMoney ? 'Đã lưu kết quả — tiền thưởng đã ghi vào doanh thu của chủ ngựa.' : 'Đã cập nhật kết quả.');
      queryClient.invalidateQueries({ queryKey: ['races'] });
      setResultOpen(false);
    },
    onError: (err) => message.error(err.message || 'Cập nhật thất bại.'),
  });

  const columns = [
    {
      title: 'Ngựa',
      dataIndex: ['horse', 'name'],
      key: 'horse',
      render: (name, record) => <Link to={`/horses/${record.horse?._id}`}>{name}</Link>,
    },
    { title: 'Giải đua', dataIndex: 'raceName', key: 'raceName' },
    {
      title: 'Ngày đua',
      dataIndex: 'raceDate',
      key: 'raceDate',
      render: (d) => new Date(d).toLocaleDateString('vi-VN'),
    },
    { title: 'Cự ly (m)', dataIndex: 'distance', key: 'distance', render: (v) => v ?? '—' },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag>,
    },
    {
      title: 'Kết quả',
      dataIndex: 'result',
      key: 'result',
      render: (v, r) =>
        v ? (
          <div>
            <div>{v}</div>
            {r.prizeMoney > 0 && (
              <Typography.Text type="success" className="!text-xs">
                Thưởng {Number(r.prizeMoney).toLocaleString('vi-VN')} ₫
              </Typography.Text>
            )}
          </div>
        ) : (
          <span className="text-gray-400">Chưa có kết quả</span>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, record) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setActiveRace(record);
            resultForm.setFieldsValue({
              // A race already run is most often being given its result; otherwise keep its status.
              status: record.status === 'registered' || record.status === 'confirmed' ? (new Date(record.raceDate) <= new Date() ? 'completed' : record.status) : record.status,
              position: record.position,
              finishTime: record.finishTime,
              prizeMoney: record.prizeMoney || undefined,
              result: record.result,
            });
            setResultOpen(true);
          }}
        >
          Cập nhật kết quả
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Đăng ký Giải đua
          </Title>
          <Typography.Text type="secondary" className="text-sm">
            Đăng ký ngựa tham gia các giải đua và theo dõi kết quả sau khi thi đấu.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Đăng ký giải mới
        </Button>
      </div>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={data?.data}
        loading={isLoading}
        locale={{ emptyText: 'Chưa có giải đua nào được đăng ký. Nhấn "Đăng ký giải mới" để bắt đầu.' }}
      />

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

      <Modal
        title={`Cập nhật kết quả — ${activeRace?.horse?.name || ''} tại ${activeRace?.raceName || ''}`}
        open={resultOpen}
        onCancel={() => setResultOpen(false)}
        onOk={() => resultForm.submit()}
        confirmLoading={updateResultMutation.isPending}
        destroyOnHidden
      >
        <Form
          form={resultForm}
          layout="vertical"
          onFinish={(values) => updateResultMutation.mutate({ id: activeRace._id, payload: values })}
        >
          <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}>
            <Select options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.status !== b.status}>
            {({ getFieldValue }) =>
              getFieldValue('status') === 'completed' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Form.Item name="position" label="Thứ hạng">
                      <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                    </Form.Item>
                    <Form.Item name="finishTime" label="Thời gian về đích">
                      <Input placeholder="VD: 1:12.45" />
                    </Form.Item>
                  </div>
                  <Form.Item name="prizeMoney" label="Tiền thưởng (₫)" extra="Tự ghi vào doanh thu của chủ ngựa; sửa lại không tạo trùng.">
                    <InputNumber
                      min={0}
                      step={1000000}
                      style={{ width: '100%' }}
                      formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')}
                      parser={(v) => (v ? v.replace(/\./g, '') : '')}
                    />
                  </Form.Item>
                  <Form.Item name="result" label="Ghi chú kết quả" extra="Bỏ trống để hệ thống tự ghi theo thứ hạng và thời gian.">
                    <Input placeholder="VD: Về nhất, bứt tốc 200m cuối" />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
