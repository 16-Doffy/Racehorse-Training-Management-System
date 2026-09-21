import { Table, Typography, Tag, Button, Space, Alert, Popconfirm, message } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from './inventoryApi';

const { Title, Text } = Typography;

const CATEGORY_LABELS = { feed: 'Thức ăn', medicine: 'Thuốc/Y tế', equipment: 'Dụng cụ' };
const LOW_STOCK_THRESHOLD = 10;

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const items = data?.data || [];

  const decideMutation = useMutation({
    mutationFn: ({ itemId, requestId, status }) => inventoryApi.decideRestock(itemId, requestId, { status }),
    onSuccess: (_res, variables) => {
      message.success(
        variables.status === 'approved'
          ? 'Đã duyệt — số lượng tồn kho đã được cộng thêm.'
          : 'Đã từ chối yêu cầu.'
      );
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
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
        unit: item.unit,
        currentQuantity: item.quantity,
        quantity: r.quantity,
        requestedBy: r.requestedBy?.name || r.requestedBy,
        requestedAt: r.requestedAt,
      }))
  );

  const requestColumns = [
    { title: 'Vật tư', dataIndex: 'itemName', key: 'itemName' },
    {
      title: 'Tồn hiện tại',
      key: 'current',
      render: (_, r) => (
        <span className={r.currentQuantity <= LOW_STOCK_THRESHOLD ? 'text-red-600 font-medium' : ''}>
          {r.currentQuantity} {r.unit}
        </span>
      ),
    },
    {
      title: 'Số lượng đề xuất',
      key: 'quantity',
      render: (_, r) => `+${r.quantity} ${r.unit}`,
    },
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
            loading={decideMutation.isPending}
            onClick={() => decideMutation.mutate({ itemId: r.itemId, requestId: r.requestId, status: 'approved' })}
          >
            Duyệt
          </Button>
          <Popconfirm
            title="Từ chối yêu cầu này?"
            okText="Từ chối"
            cancelText="Huỷ"
            onConfirm={() => decideMutation.mutate({ itemId: r.itemId, requestId: r.requestId, status: 'rejected' })}
          >
            <Button danger size="small" icon={<CloseOutlined />}>
              Từ chối
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = [
    { title: 'Tên vật tư', dataIndex: 'name', key: 'name' },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      key: 'category',
      render: (c) => CATEGORY_LABELS[c] || c,
    },
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
    { title: 'Khu vực', dataIndex: 'stableBlock', key: 'stableBlock', render: (v) => v || '—' },
    {
      title: 'Yêu cầu bổ sung',
      key: 'requests',
      render: (_, r) => {
        const pending = (r.restockRequests || []).filter((x) => x.status === 'pending').length;
        return pending > 0 ? <Tag color="gold">{pending} chờ duyệt</Tag> : <span className="text-gray-400">—</span>;
      },
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <Title level={3} className="!mb-0">
          Vật tư &amp; Thức ăn
        </Title>
        <Text type="secondary" className="text-sm">
          Theo dõi tồn kho toàn câu lạc bộ và duyệt các yêu cầu bổ sung do nhân viên chăm sóc gửi
          lên. Duyệt xong hệ thống tự cộng số lượng vào tồn kho.
        </Text>
      </div>

      {pendingRequests.length > 0 && (
        <>
          <Alert
            className="mb-3"
            type="warning"
            showIcon
            message={`${pendingRequests.length} yêu cầu bổ sung vật tư đang chờ duyệt`}
          />
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
        title={() => <span className="font-semibold">Tồn kho ({items.length} mặt hàng)</span>}
        columns={columns}
        dataSource={items}
        loading={isLoading}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: 'Chưa có vật tư nào trong kho.' }}
      />
    </div>
  );
}
