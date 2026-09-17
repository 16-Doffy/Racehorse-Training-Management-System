import { useMemo, useState } from 'react';
import { Table, Tag, Segmented, Switch, Input, Button, Modal, Form, InputNumber, Empty, Tooltip, message } from 'antd';
import { ShoppingOutlined, WarningOutlined, StopOutlined, ClockCircleOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { inventoryApi } from './inventoryApi';
import { useStableOverview } from '../stable/useGroomData';
import {
  HEADING_FONT,
  INVENTORY_CATEGORY_CONFIG,
  LOW_STOCK_THRESHOLD,
  RESTOCK_STATUS_CONFIG,
  getStockLevel,
  refId,
} from '../stable/groomConfig';
import { GroomPageHeader, StatCard } from '../stable/GroomUI';

/** Items with no stableBlock are shared stock; otherwise the item belongs to a block like "Block A". */
function isInMyArea(item, myBlocks) {
  if (!item.stableBlock) return true;
  const itemBlock = item.stableBlock.toLowerCase();
  return myBlocks.some((b) => itemBlock.startsWith(b.toLowerCase()));
}

// Groom: track supplies (feed, medicine, equipment) for the stable area they look after and
// propose restocks. Approval happens on the Manager's inventory screen.
export default function GroomSuppliesPage() {
  const [category, setCategory] = useState('all');
  const [onlyMyArea, setOnlyMyArea] = useState(true);
  const [search, setSearch] = useState('');
  const [restockItem, setRestockItem] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { myBlocks, userId } = useStableOverview();
  const { data, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const items = useMemo(() => data?.data || [], [data]);

  const restockMutation = useMutation({
    mutationFn: ({ id, quantity }) => inventoryApi.requestRestock(id, { quantity }),
    onSuccess: () => {
      message.success('Đã gửi đề xuất bổ sung. Quản lý CLB sẽ xem xét.');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setRestockItem(null);
    },
    onError: (err) => message.error(err.message || 'Gửi đề xuất thất bại.'),
  });

  const areaFilterActive = onlyMyArea && myBlocks.length > 0;
  const areaItems = items.filter((i) => !areaFilterActive || isInMyArea(i, myBlocks));
  const visibleItems = areaItems
    .filter((i) => category === 'all' || i.category === category)
    .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  const myRequests = useMemo(
    () =>
      items
        .flatMap((item) =>
          (item.restockRequests || [])
            .filter((r) => refId(r.requestedBy) === userId)
            .map((r) => ({ ...r, item }))
        )
        .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)),
    [items, userId]
  );

  const lowCount = areaItems.filter((i) => getStockLevel(i.quantity).key === 'low').length;
  const outCount = areaItems.filter((i) => getStockLevel(i.quantity).key === 'out').length;
  const pendingCount = myRequests.filter((r) => r.status === 'pending').length;

  const latestMyRequest = (item) =>
    (item.restockRequests || [])
      .filter((r) => refId(r.requestedBy) === userId)
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];

  const columns = [
    {
      title: 'Vật tư',
      dataIndex: 'name',
      key: 'name',
      render: (name, item) => {
        const cfg = INVENTORY_CATEGORY_CONFIG[item.category];
        return (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#fdfbf7] border border-gray-100 flex items-center justify-center text-lg">{cfg?.emoji || '📦'}</div>
            <div>
              <div className="font-semibold text-gray-800">{name}</div>
              <div className="text-[11px] text-gray-400">{item.stableBlock || 'Kho chung'}</div>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      key: 'category',
      render: (c) => <Tag color={INVENTORY_CATEGORY_CONFIG[c]?.color}>{INVENTORY_CATEGORY_CONFIG[c]?.label || c}</Tag>,
    },
    {
      title: 'Tồn kho',
      dataIndex: 'quantity',
      key: 'quantity',
      sorter: (a, b) => a.quantity - b.quantity,
      render: (q, item) => {
        const level = getStockLevel(q);
        return (
          <div className="flex items-center gap-2">
            <span className={`font-bold ${level.key === 'ok' ? 'text-gray-800' : level.key === 'low' ? 'text-orange-600' : 'text-red-600'}`}>
              {q} <span className="font-normal text-gray-400 text-xs">{item.unit}</span>
            </span>
            <Tag color={level.color} className="!m-0 rounded-full">
              {level.label}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Đề xuất gần nhất của tôi',
      key: 'myRequest',
      render: (_, item) => {
        const req = latestMyRequest(item);
        if (!req) return <span className="text-gray-300">—</span>;
        const st = RESTOCK_STATUS_CONFIG[req.status];
        return (
          <div>
            <Tag color={st?.color} className="!m-0">
              {st?.label || req.status}
            </Tag>
            <div className="text-[11px] text-gray-400 mt-0.5">
              +{req.quantity} {item.unit} • {dayjs(req.requestedAt).format('DD/MM HH:mm')}
            </div>
          </div>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, item) => {
        const hasPending = latestMyRequest(item)?.status === 'pending';
        return (
          <Tooltip title={hasPending ? 'Bạn đã có đề xuất đang chờ duyệt cho vật tư này' : undefined}>
            <Button
              size="small"
              type={getStockLevel(item.quantity).key === 'ok' ? 'default' : 'primary'}
              icon={<PlusOutlined />}
              className="!rounded-full"
              onClick={() => {
                form.resetFields();
                setRestockItem(item);
              }}
            >
              Đề xuất bổ sung
            </Button>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      <GroomPageHeader
        icon={<ShoppingOutlined />}
        title="Vật tư Khu vực"
        subtitle={`Theo dõi thức ăn, thuốc và dụng cụ tại khu vực phụ trách${myBlocks.length ? ` (${myBlocks.join(', ')})` : ''} và đề xuất bổ sung khi sắp hết.`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<ShoppingOutlined />} label="Vật tư theo dõi" value={areaItems.length} />
        <StatCard
          icon={<WarningOutlined />}
          label={`Sắp hết (≤ ${LOW_STOCK_THRESHOLD})`}
          value={lowCount}
          accent="border-t-orange-500"
          iconClass="bg-orange-50 text-orange-500"
        />
        <StatCard icon={<StopOutlined />} label="Hết hàng" value={outCount} accent="border-t-red-500" iconClass="bg-red-50 text-red-500" />
        <StatCard
          icon={<ClockCircleOutlined />}
          label="Đề xuất chờ duyệt"
          value={pendingCount}
          accent="border-t-[#eab308]"
          iconClass="bg-yellow-50 text-[#eab308]"
        />
      </div>

      <div className="premium-card p-5 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <Segmented
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'Tất cả' },
              ...Object.entries(INVENTORY_CATEGORY_CONFIG).map(([value, cfg]) => ({ value, label: `${cfg.emoji} ${cfg.label}` })),
            ]}
          />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
            placeholder="Tìm vật tư..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
            <Switch size="small" checked={onlyMyArea} onChange={setOnlyMyArea} disabled={myBlocks.length === 0} />
            Chỉ khu vực tôi phụ trách
          </label>
        </div>
        <Table
          rowKey="_id"
          columns={columns}
          dataSource={visibleItems}
          loading={isLoading}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          size="middle"
          scroll={{ x: 760 }}
          locale={{ emptyText: <Empty description="Không có vật tư nào" /> }}
          rowClassName={(item) => (getStockLevel(item.quantity).key === 'out' ? 'bg-red-50/40' : '')}
        />
      </div>

      <div className="premium-card p-5">
        <h3 className="font-bold text-lg text-[#022c22] mb-4">Lịch sử đề xuất của tôi</h3>
        {myRequests.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bạn chưa gửi đề xuất bổ sung nào" />
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {myRequests.slice(0, 15).map((r) => {
              const st = RESTOCK_STATUS_CONFIG[r.status];
              return (
                <div key={r._id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{r.item.name}</span>
                    <span className="text-gray-400 text-sm">
                      {' '}
                      • +{r.quantity} {r.item.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-gray-400">{dayjs(r.requestedAt).format('DD/MM/YYYY HH:mm')}</span>
                    <Tag color={st?.color} className="!m-0">
                      {st?.label || r.status}
                    </Tag>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={!!restockItem}
        onCancel={() => setRestockItem(null)}
        title={<span style={{ fontFamily: HEADING_FONT }}>Đề xuất bổ sung vật tư</span>}
        okText="Gửi đề xuất"
        cancelText="Huỷ"
        onOk={() => form.submit()}
        confirmLoading={restockMutation.isPending}
        destroyOnHidden
      >
        {restockItem && (
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            onFinish={({ quantity }) => restockMutation.mutate({ id: restockItem._id, quantity })}
          >
            <div className="bg-[#fdfbf7] border border-gray-100 rounded-xl p-3 mb-4 flex items-center justify-between">
              <div>
                <div className="font-bold text-[#022c22]">
                  {INVENTORY_CATEGORY_CONFIG[restockItem.category]?.emoji} {restockItem.name}
                </div>
                <div className="text-xs text-gray-500">{restockItem.stableBlock || 'Kho chung'}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Tồn kho</div>
                <div className="font-bold text-gray-800">
                  {restockItem.quantity} {restockItem.unit}
                </div>
              </div>
            </div>
            {latestMyRequest(restockItem)?.status === 'pending' && (
              <div className="text-xs text-orange-600 mb-3">
                ⚠ Bạn đã có một đề xuất đang chờ duyệt cho vật tư này (+{latestMyRequest(restockItem).quantity} {restockItem.unit}).
              </div>
            )}
            <Form.Item
              name="quantity"
              label="Số lượng cần bổ sung"
              rules={[{ required: true, message: 'Nhập số lượng cần bổ sung' }]}
            >
              <InputNumber min={1} max={100000} className="!w-full" suffix={restockItem.unit} autoFocus />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
