import { useState } from 'react';
import { Table, Tag, Typography, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Alert, Empty } from 'antd';
import { message } from '../../lib/antdStatic';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';
import { usersApi } from '../admin/usersApi';
import { ROLES } from '../../constants/roles';

const { Title } = Typography;

const STATUS_COLORS = {
  eligible: 'green',
  monitoring: 'gold',
  injured: 'red',
  quarantined: 'volcano',
};

const STATUS_LABELS = {
  eligible: 'Đủ điều kiện',
  monitoring: 'Cần theo dõi',
  injured: 'Chấn thương',
  quarantined: 'Cách ly',
};

export default function HorseListPage() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  // Creating/editing a horse and assigning who is responsible for it is the Club Manager's job
  // (POST/PUT /horses is Manager-only on the server); every other role sees the same read-only
  // roster they always had.
  const isManager = user?.role === ROLES.MANAGER;

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['horses'], queryFn: () => horsesApi.list() });
  const horses = data?.data || [];

  // A horse with an empty slot is invisible to whoever should have been in it — no owner means
  // its owner can't follow it, no trainer means no one plans its training, no vet means no one
  // watches its health. Only the Manager can see the gap, so only the Manager can close it.
  const incomplete = isManager
    ? horses.filter((h) => !h.owner || !h.assignedTrainer || !h.assignedVet)
    : [];

  // Assignee dropdowns — only fetched for the Manager, who is the only role that can assign.
  const { data: trainersData } = useQuery({
    queryKey: ['users', ROLES.HEAD_TRAINER],
    queryFn: () => usersApi.list({ role: ROLES.HEAD_TRAINER }),
    enabled: isManager,
  });
  const { data: vetsData } = useQuery({
    queryKey: ['users', ROLES.VETERINARIAN],
    queryFn: () => usersApi.list({ role: ROLES.VETERINARIAN }),
    enabled: isManager,
  });
  const { data: ownersData } = useQuery({
    queryKey: ['users', ROLES.OWNER],
    queryFn: () => usersApi.list({ role: ROLES.OWNER }),
    enabled: isManager,
  });

  const activeOptions = (res) =>
    (res?.data || [])
      .filter((u) => u.isActive)
      .map((u) => ({ value: u._id, label: u.name }));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['horses'] });

  const saveMutation = useMutation({
    mutationFn: (payload) =>
      editTarget ? horsesApi.update(editTarget._id, payload) : horsesApi.create(payload),
    onSuccess: () => {
      message.success(editTarget ? 'Đã cập nhật hồ sơ ngựa.' : 'Đã thêm ngựa mới.');
      invalidate();
      setFormOpen(false);
      setEditTarget(null);
      form.resetFields();
    },
    onError: (err) => message.error(err.message || 'Lưu thất bại.'),
  });

  const openCreate = () => {
    setEditTarget(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (record) => {
    setEditTarget(record);
    form.setFieldsValue({
      name: record.name,
      breed: record.breed,
      color: record.color,
      dob: record.dob ? dayjs(record.dob) : null,
      weightKg: record.weightKg,
      owner: record.owner?._id || record.owner,
      assignedTrainer: record.assignedTrainer?._id || record.assignedTrainer,
      assignedVet: record.assignedVet?._id || record.assignedVet,
    });
    setFormOpen(true);
  };

  const columns = [
    { title: 'Tên ngựa', dataIndex: 'name', key: 'name' },
    { title: 'Giống', dataIndex: 'breed', key: 'breed' },
    { title: 'Màu lông', dataIndex: 'color', key: 'color' },
    {
      title: 'Chủ sở hữu',
      dataIndex: ['owner', 'name'],
      key: 'owner',
      // For the Manager this is an actionable gap, not just a blank — same treatment as the
      // trainer/vet columns below.
      render: (v) => v || (isManager ? <Tag>Chưa gán</Tag> : '—'),
    },
    {
      title: 'Trạng thái sức khỏe',
      dataIndex: 'healthStatus',
      key: 'healthStatus',
      render: (status) => <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status] || status}</Tag>,
    },
  ];

  // Who's responsible matters to the Manager (they assign it) — other roles already only see the
  // horses assigned to them, so the columns would just repeat their own name on every row.
  if (isManager) {
    columns.push(
      {
        title: 'HLV phụ trách',
        dataIndex: ['assignedTrainer', 'name'],
        key: 'assignedTrainer',
        render: (v) => v || <Tag>Chưa gán</Tag>,
      },
      {
        title: 'Bác sĩ phụ trách',
        dataIndex: ['assignedVet', 'name'],
        key: 'assignedVet',
        render: (v) => v || <Tag>Chưa gán</Tag>,
      },
      {
        title: '',
        key: 'actions',
        render: (_, record) => (
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(record);
            }}
          >
            Sửa
          </Button>
        ),
      }
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            {isManager ? 'Danh mục Ngựa' : 'Danh sách Ngựa'}
          </Title>
          {isManager && (
            <Typography.Text type="secondary" className="text-sm">
              Thêm/sửa hồ sơ ngựa và gán Huấn luyện viên, Bác sĩ thú y phụ trách. Mỗi HLV/bác sĩ
              chỉ thấy đúng những con ngựa bạn phân công cho họ.
            </Typography.Text>
          )}
        </div>
        {isManager && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm ngựa mới
          </Button>
        )}
      </div>

      {incomplete.length > 0 && (
        <Alert
          className="mb-3"
          type="warning"
          showIcon
          title={`${incomplete.length} ngựa chưa đủ người phụ trách`}
          description={
            <>
              Ngựa thiếu <b>chủ sở hữu</b> thì không chủ ngựa nào theo dõi được, thiếu <b>HLV</b>{' '}
              thì không ai lập kế hoạch huấn luyện, thiếu <b>bác sĩ</b> thì không ai theo dõi sức
              khỏe. Bấm “Sửa” ở các dòng bên dưới để bổ sung:{' '}
              <b>{incomplete.map((h) => h.name).join(', ')}</b>.
            </>
          }
        />
      )}

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={horses}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: isManager ? (
            'Chưa có ngựa nào trong danh mục. Nhấn "Thêm ngựa mới" để bắt đầu.'
          ) : (
            <Empty
              description={
                <span>
                  Bạn chưa được phân công phụ trách con ngựa nào.
                  <br />
                  Liên hệ Quản lý Câu lạc bộ để được phân công.
                </span>
              }
            />
          ),
        }}
        onRow={(record) => ({ onClick: () => navigate(`/horses/${record._id}`) })}
        rowClassName="cursor-pointer"
      />

      {isManager && (
        <Modal
          title={editTarget ? `Sửa hồ sơ — ${editTarget.name}` : 'Thêm ngựa mới'}
          open={formOpen}
          onCancel={() => {
            setFormOpen(false);
            setEditTarget(null);
          }}
          onOk={() => form.submit()}
          confirmLoading={saveMutation.isPending}
          destroyOnHidden
          width={620}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) =>
              saveMutation.mutate({ ...values, dob: values.dob ? values.dob.toISOString() : undefined })
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <Form.Item name="name" label="Tên ngựa" rules={[{ required: true }]} className="!mb-3">
                <Input placeholder="VD: Thunder Bolt" />
              </Form.Item>
              <Form.Item name="breed" label="Giống" className="!mb-3">
                <Input placeholder="VD: Thoroughbred" />
              </Form.Item>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4">
              <Form.Item name="color" label="Màu lông" className="!mb-3">
                <Input placeholder="VD: Bay" />
              </Form.Item>
              <Form.Item name="dob" label="Ngày sinh" className="!mb-3">
                <DatePicker className="w-full" format="DD/MM/YYYY" />
              </Form.Item>
              <Form.Item name="weightKg" label="Cân nặng (kg)" className="!mb-3">
                <InputNumber min={50} max={1200} className="w-full" />
              </Form.Item>
            </div>
            <Form.Item name="owner" label="Chủ sở hữu" className="!mb-3">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chọn chủ sở hữu"
                options={activeOptions(ownersData)}
              />
            </Form.Item>
            <Form.Item
              name="assignedTrainer"
              label="Huấn luyện viên phụ trách"
              extra="Chỉ HLV được gán mới thấy và lập kế hoạch huấn luyện cho ngựa này."
              className="!mb-3"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chưa gán — chưa HLV nào thấy ngựa này"
                options={activeOptions(trainersData)}
              />
            </Form.Item>
            <Form.Item
              name="assignedVet"
              label="Bác sĩ thú y phụ trách"
              extra="Yêu cầu khám cho ngựa này sẽ gửi thẳng tới bác sĩ được gán."
              className="!mb-3"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Chưa gán — chưa bác sĩ nào thấy ngựa này"
                options={activeOptions(vetsData)}
              />
            </Form.Item>
          </Form>
        </Modal>
      )}
    </div>
  );
}
