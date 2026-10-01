import { useState } from 'react';
import { Table, Typography, Tag, Button, Space, Alert, Popconfirm, Modal, Form, Input, InputNumber, Select, Tooltip } from 'antd';
import { message } from '../../lib/antdStatic';
import { CheckOutlined, CloseOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from './inventoryApi';

const { Title, Text } = Typography;

const CATEGORY_LABELS = { feed: 'Thức ăn', medicine: 'Thuốc/Y tế', equipment: 'Dụng cụ' };
const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const LOW_STOCK_THRESHOLD = 10;

/** Create or edit one stock item. */
function ItemModal({ item, open, onClose }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: (payload) => (item ? inventoryApi.update(item._id, payload) : inventoryApi.create(payload)),
    onSuccess: () => {
      message.success(item ? 'Đã cập nhật vật tư.' : 'Đã thêm vật tư vào kho.');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
    onError: (err) => message.error(err.message || 'Lưu vật tư thất bại.'),
  });

  return (
    <Modal
      title={item ? `Sửa vật tư — ${item.name}` : 'Thêm vật tư'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={item ? 'Lưu' : 'Thêm'}
      cancelText="Huỷ"
      confirmLoading={saveMutation.isPending}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (visible) {
          form.setFieldsValue(
            item
              ? { name: item.name, category: item.category, unit: item.unit, quantity: item.quantity, stableBlock: item.stableBlock }
              : { category: 'feed', quantity: 0 }
          );
        }
      }}
    >
      <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
        <Form.Item name="name" label="Tên vật tư" rules={[{ required: true, whitespace: true, message: 'Nhập tên vật tư.' }]}>
          <Input placeholder="VD: Cỏ khô Timothy" />
        </Form.Item>
        <div className="grid grid-cols-2 gap-3">
          <Form.Item name="category" label="Danh mục" rules={[{ required: true }]}>
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="unit" label="Đơn vị tính" rules={[{ required: true, whitespace: true, message: 'Nhập đơn vị.' }]}>
            <Input placeholder="kg, bao, hộp…" />
          </Form.Item>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Form.Item name="quantity" label="Số lượng tồn" rules={[{ required: true }]}>
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="stableBlock" label="Khu vực" extra="Bỏ trống nếu dùng chung toàn CLB.">
            <Input placeholder="VD: Block A" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const items = data?.data || [];
  // How fast each item is used by the rations and ongoing treatments, and how long the stock lasts.
  const { data: forecastData } = useQuery({ queryKey: ['inventory-forecast'], queryFn: () => inventoryApi.forecast() });
  const forecastById = new Map((forecastData?.data || []).map((f) => [String(f._id), f]));
  const [editing, setEditing] = useState(null); // null = closed, {} = new item, item = edit
  const [rejecting, setRejecting] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  const decideMutation = useMutation({
    mutationFn: ({ itemId, requestId, status, note }) => inventoryApi.decideRestock(itemId, requestId, { status, note }),
    onSuccess: (_res, variables) => {
      message.success(
        variables.status === 'approved' ? 'Đã duyệt — số lượng tồn kho đã được cộng thêm.' : 'Đã từ chối yêu cầu.'
      );
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
      setRejecting(null);
      setRejectNote('');
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => inventoryApi.remove(id),
    onSuccess: () => {
      message.success('Đã xoá vật tư.');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => message.error(err.message || 'Xoá thất bại.'),
  });

  // Pending restock requests live inside each item's subdocument array; flatten them so the
  // Manager sees one actionable queue instead of having to open every item to find them.
  const pendingRequests = items.flatMap((item) =>
    (item.restockRequests || [])
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        key: `${item._id}-${r._id}`,
        itemId: item._id,
        requestId: r._id,
        itemName: item.name,
        isProposed: item.isProposed,
        category: item.category,
        unit: item.unit,
        currentQuantity: item.quantity,
        quantity: r.quantity,
        note: r.note,
        requestedBy: r.requestedBy?.name || r.requestedBy,
        requestedAt: r.requestedAt,
      }))
  );

  const requestColumns = [
    {
      title: 'Vật tư',
      key: 'itemName',
      render: (_, r) => (
        <Space size={4} wrap>
          <span>{r.itemName}</span>
          {r.isProposed && <Tag color="purple">Vật tư mới</Tag>}
        </Space>
      ),
    },
    {
      title: 'Tồn hiện tại',
      key: 'current',
      render: (_, r) =>
        r.isProposed ? (
          <span className="text-gray-400">Chưa có trong kho</span>
        ) : (
          <span className={r.currentQuantity <= LOW_STOCK_THRESHOLD ? 'text-red-600 font-medium' : ''}>
            {r.currentQuantity} {r.unit}
          </span>
        ),
    },
    { title: 'Số lượng đề xuất', key: 'quantity', render: (_, r) => `+${r.quantity} ${r.unit}` },
    { title: 'Lý do', dataIndex: 'note', key: 'note', render: (v) => v || <span className="text-gray-400">—</span> },
    { title: 'Người đề xuất', dataIndex: 'requestedBy', key: 'requestedBy', render: (v) => v || '—' },
    {
      title: 'Thời gian',
      dataIndex: 'requestedAt',
      key: 'requestedAt',
      render: (d) => (d ? new Date(d).toLocaleString('vi-VN') : '—'),
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            loading={decideMutation.isPending && decideMutation.variables?.requestId === r.requestId}
            onClick={() => decideMutation.mutate({ itemId: r.itemId, requestId: r.requestId, status: 'approved' })}
          >
            Duyệt
          </Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => setRejecting(r)}>
            Từ chối
          </Button>
        </Space>
      ),
    },
  ];

  const stockItems = items.filter((i) => !i.isProposed);
  const columns = [
    { title: 'Tên vật tư', dataIndex: 'name', key: 'name' },
    { title: 'Danh mục', dataIndex: 'category', key: 'category', render: (c) => CATEGORY_LABELS[c] || c },
    {
      title: 'Số lượng',
      key: 'quantity',
      render: (_, r) =>
        r.quantity <= LOW_STOCK_THRESHOLD ? (
          <Tag color={r.quantity === 0 ? 'red' : 'orange'}>
            {r.quantity} {r.unit} {r.quantity === 0 ? '— đã hết' : '— sắp hết'}
          </Tag>
        ) : (
          `${r.quantity} ${r.unit}`
        ),
    },
    {
      title: 'Đủ dùng',
      key: 'daysLeft',
      render: (_, r) => {
        const f = forecastById.get(String(r._id));
        if (!f || !f.dailyUsage) return <span className="text-gray-400">Chưa dùng</span>;
        const color = f.quantity <= 0 || f.daysLeft < 3 ? 'red' : f.daysLeft < 7 ? 'orange' : 'green';
        const usedBy = f.usedBy
          .map((u) => (u.kind === 'ration' ? `${u.horse}: ${u.amount} ${r.unit}/bữa` : `${u.horse}: ${u.medicine} ${u.amount} ${r.unit} × ${u.doses}`))
          .join('\n');
        return (
          <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{`Dùng ${f.dailyUsage} ${r.unit}/ngày\n${usedBy}`}</span>}>
            <Tag color={color}>{f.quantity <= 0 ? 'Đã hết' : f.daysLeft < 1 ? 'Dưới 1 ngày' : `~${f.daysLeft} ngày`}</Tag>
          </Tooltip>
        );
      },
    },
    { title: 'Khu vực', dataIndex: 'stableBlock', key: 'stableBlock', render: (v) => v || '—' },
    {
      title: 'Yêu cầu bổ sung',
      key: 'requests',
      render: (_, r) => {
        const pending = (r.restockRequests || []).filter((x) => x.status === 'pending').length;
        return pending > 0 ? <Tag color="gold">{pending} chờ duyệt</Tag> : <span className="text-gray-400">—</span>;
      },
    },
    {
      title: '',
      key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>
            Sửa
          </Button>
          <Popconfirm
            title={`Xoá "${r.name}" khỏi kho?`}
            description="Các yêu cầu bổ sung đang chờ của mặt hàng này cũng mất theo."
            okText="Xoá"
            cancelText="Huỷ"
            onConfirm={() => deleteMutation.mutate(r._id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending && deleteMutation.variables === r._id}>
              Xoá
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Vật tư &amp; Thức ăn
          </Title>
          <Text type="secondary" className="text-sm">
            Quản lý danh mục vật tư toàn câu lạc bộ và duyệt đề xuất của nhân viên chăm sóc, HLV, bác sĩ —
            gồm cả đề xuất bổ sung và đề xuất vật tư mới. Duyệt xong hệ thống tự cộng số lượng vào tồn kho.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>
          Thêm vật tư
        </Button>
      </div>

      {pendingRequests.length > 0 && (
        <>
          <Alert className="mb-3" type="warning" showIcon title={`${pendingRequests.length} đề xuất vật tư đang chờ duyệt`} />
          <Table
            className="mb-8"
            rowKey="key"
            title={() => <span className="font-semibold">Chờ duyệt ({pendingRequests.length})</span>}
            columns={requestColumns}
            dataSource={pendingRequests}
            loading={isLoading}
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        </>
      )}

      <Table
        rowKey="_id"
        title={() => <span className="font-semibold">Tồn kho ({stockItems.length} mặt hàng)</span>}
        columns={columns}
        dataSource={stockItems}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa có vật tư nào trong kho. Bấm "Thêm vật tư" để bắt đầu.' }}
      />

      <ItemModal item={editing?._id ? editing : null} open={editing !== null} onClose={() => setEditing(null)} />

      <Modal
        title={rejecting ? `Từ chối đề xuất — ${rejecting.itemName}` : ''}
        open={Boolean(rejecting)}
        okText="Từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Huỷ"
        confirmLoading={decideMutation.isPending}
        onCancel={() => {
          setRejecting(null);
          setRejectNote('');
        }}
        onOk={() =>
          decideMutation.mutate({ itemId: rejecting.itemId, requestId: rejecting.requestId, status: 'rejected', note: rejectNote || undefined })
        }
        destroyOnHidden
      >
        {rejecting?.isProposed && (
          <Text type="secondary" className="block !text-xs mb-2">
            Đây là đề xuất vật tư mới — từ chối sẽ gỡ mặt hàng này khỏi danh mục.
          </Text>
        )}
        <Input.TextArea
          rows={3}
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          placeholder="Lý do (người đề xuất sẽ thấy) — VD: Kho còn đủ đến cuối tháng."
        />
      </Modal>
    </div>
  );
}
