import { useState } from 'react';
import { Table, Button, Typography, Modal, Form, Select, Input, Tag, Alert, Popconfirm, Space } from 'antd';
import { message } from '../../lib/antdStatic';
import { EditOutlined, DeleteOutlined, HomeOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stableAssignmentApi } from './stableApi';
import { horsesApi } from '../horses/horsesApi';
import { usersApi } from '../admin/usersApi';
import { ROLES } from '../../constants/roles';

const { Title, Text } = Typography;

const HEALTH_LABELS = {
  eligible: 'Đủ điều kiện',
  monitoring: 'Cần theo dõi',
  injured: 'Chấn thương',
  quarantined: 'Cách ly',
};
const HEALTH_COLORS = { eligible: 'green', monitoring: 'gold', injured: 'red', quarantined: 'volcano' };

/**
 * Manager assigns each horse a stall and the groom responsible for it.
 *
 * This was the missing link in the chain: the endpoints existed and the daily-task generator
 * depended on these records, but no screen had ever created one — so the only assignments in the
 * system came from the seed script, and a horse added through the UI would silently never get fed.
 */
export default function StableAssignmentPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: assignmentsData, isLoading } = useQuery({
    queryKey: ['stable-assignments'],
    queryFn: () => stableAssignmentApi.list(),
  });
  const { data: horsesData } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const { data: groomsData } = useQuery({
    queryKey: ['users', ROLES.GROOM],
    queryFn: () => usersApi.list({ role: ROLES.GROOM }),
  });

  const assignments = assignmentsData?.data || [];
  const horses = horsesData?.data || [];
  const grooms = (groomsData?.data || []).filter((u) => u.isActive !== false);

  const assignedHorseIds = new Set(assignments.map((a) => a.horse?._id || a.horse));
  const unstabled = horses.filter((h) => !assignedHorseIds.has(h._id));
  const uncared = assignments.filter((a) => !a.assignedCaretaker);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['stable-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['daily-tasks-all'] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => stableAssignmentApi.upsert(payload),
    onSuccess: () => {
      message.success('Đã lưu phân công chuồng trại.');
      invalidate();
      setOpen(false);
      setEditing(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Lưu thất bại.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => stableAssignmentApi.remove(id),
    onSuccess: () => {
      message.success('Đã gỡ phân công.');
      invalidate();
    },
    onError: (err) => message.error(err.message || 'Gỡ phân công thất bại.'),
  });

  const openModal = (record, presetHorseId) => {
    setEditing(record || null);
    form.setFieldsValue({
      horse: record ? record.horse?._id || record.horse : presetHorseId,
      stableBlock: record?.stableBlock,
      assignedCaretaker: record?.assignedCaretaker?._id || record?.assignedCaretaker,
    });
    setOpen(true);
  };

  const columns = [
    {
      title: 'Ngựa',
      key: 'horse',
      render: (_, r) => (
        <Space orientation="vertical" size={0}>
          <Link to={`/horses/${r.horse?._id}`}>{r.horse?.name}</Link>
          {r.horse?.healthStatus && (
            <Tag color={HEALTH_COLORS[r.horse.healthStatus]} className="!mt-1">
              {HEALTH_LABELS[r.horse.healthStatus] || r.horse.healthStatus}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Chuồng',
      dataIndex: 'stableBlock',
      key: 'stableBlock',
      render: (v) => (
        <Space>
          <HomeOutlined className="text-gray-400" />
          {v}
        </Space>
      ),
    },
    {
      title: 'Nhân viên chăm sóc',
      key: 'assignedCaretaker',
      render: (_, r) =>
        r.assignedCaretaker ? (
          r.assignedCaretaker.name
        ) : (
          <Tag color="orange">Chưa gán — ngựa sẽ không được tự tạo việc cho ăn</Tag>
        ),
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
            Sửa
          </Button>
          <Popconfirm
            title="Gỡ ngựa này khỏi chuồng?"
            description="Việc cho ăn hàng ngày sẽ ngừng được tạo tự động."
            okText="Gỡ"
            cancelText="Huỷ"
            onConfirm={() => removeMutation.mutate(r._id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Gỡ
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <Title level={3} className="!mb-0">
          Chuồng trại &amp; Nhân viên chăm sóc
        </Title>
        <Text type="secondary" className="text-sm">
          Mỗi con ngựa cần một chuồng và một nhân viên chăm sóc phụ trách. Đây là căn cứ để hệ thống
          tự tạo việc cho ăn hàng ngày theo khẩu phần, và cũng là một trong các điều kiện để Huấn
          luyện viên được xếp lịch tập.
        </Text>
      </div>

      {unstabled.length > 0 && (
        <Alert
          className="!mb-3"
          type="warning"
          showIcon
          title={`${unstabled.length} ngựa chưa được xếp chuồng`}
          description={
            <div className="text-sm">
              {unstabled.map((h) => (
                <Button key={h._id} size="small" type="link" className="!px-1" onClick={() => openModal(null, h._id)}>
                  {h.name}
                </Button>
              ))}
            </div>
          }
        />
      )}

      {uncared.length > 0 && (
        <Alert
          className="!mb-3"
          type="warning"
          showIcon
          title={`${uncared.length} chuồng chưa có người chăm sóc`}
          description="Ngựa trong các chuồng này sẽ không được tự tạo việc cho ăn, và buổi tập của chúng sẽ hiện cảnh báo."
        />
      )}

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={assignments}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa xếp chuồng cho ngựa nào.' }}
      />

      <Modal
        title={editing ? `Sửa phân công — ${editing.horse?.name}` : 'Xếp chuồng cho ngựa'}
        open={open}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="horse" label="Ngựa" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(editing)}
              showSearch
              optionFilterProp="label"
              options={horses.map((h) => ({
                value: h._id,
                label: h.name,
                // One stall per horse is enforced by a unique index, so re-picking an already
                // stabled horse would just fail — hide the option instead.
                disabled: !editing && assignedHorseIds.has(h._id),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="stableBlock"
            label="Chuồng"
            rules={[{ required: true, message: 'Nhập khu và số ô chuồng' }]}
            extra="Ghi theo dạng “Block A - Stall 12” để sơ đồ chuồng trại nhóm đúng khu."
          >
            <Input placeholder="Block A - Stall 12" />
          </Form.Item>
          <Form.Item
            name="assignedCaretaker"
            label="Nhân viên chăm sóc"
            extra="Người này sẽ tự động nhận việc cho ăn hàng ngày và việc chăm sóc sau buổi tập nặng."
          >
            <Select
              allowClear
              placeholder="Chưa gán"
              options={grooms.map((u) => ({ value: u._id, label: u.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
