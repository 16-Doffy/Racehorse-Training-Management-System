import { useState } from 'react';
import {
  Table,
  Typography,
  Tag,
  Button,
  Space,
  Alert,
  Popconfirm,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tooltip,
  Tabs,
  AutoComplete,
  DatePicker,
  Switch,
  Segmented,
} from 'antd';
import { message } from '../../lib/antdStatic';
import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { inventoryApi } from './inventoryApi';

const { Title, Text } = Typography;

const CATEGORIES = [
  { key: 'feed', label: 'Thức ăn', hint: 'Dùng trong khẩu phần — kho tự trừ mỗi bữa nhân viên cho ăn xong.' },
  { key: 'medicine', label: 'Thuốc & vật tư y tế', hint: 'Bác sĩ kê từ đây — kho tự trừ mỗi liều nhân viên cho dùng.' },
  { key: 'equipment', label: 'Dụng cụ', hint: 'Đồ dùng lâu dài; theo dõi số lượng và đề xuất mua thêm.' },
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
// Units offered per category in the item form (the Manager can still type another one).
const UNIT_SUGGESTIONS = {
  feed: { units: ['kg', 'g', 'lít', 'ml', 'viên'], packUnits: ['bao', 'kiện', 'hộp', 'túi', 'chai', 'can'] },
  medicine: { units: ['viên', 'ml', 'g', 'liều', 'tuýp', 'miếng', 'cái', 'cuộn', 'túi'], packUnits: ['hộp', 'lọ', 'chai', 'tuýp', 'gói', 'thùng'] },
  equipment: { units: ['cái', 'bộ', 'đôi', 'sợi', 'cuộn'], packUnits: [] },
};
const EXPIRY_SOON_DAYS = 30;
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
const num = (n) => Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** "250 kg · 10 bao", "247 kg · 9 bao + 22 kg", or just "8 cái" when the item isn't bought in packs. */
function stockText(item, quantity = item.quantity) {
  const base = `${num(quantity)} ${item.unit}`;
  if (!item.packUnit || !item.packSize || quantity <= 0) return base;
  const packs = Math.floor(quantity / item.packSize + 1e-9);
  if (!packs) return base;
  const rest = Math.round((quantity - packs * item.packSize) * 100) / 100;
  return `${base} · ${num(packs)} ${item.packUnit}${rest > 0 ? ` + ${num(rest)} ${item.unit}` : ''}`;
}

/** The computed status tags of an item: discontinued, out / low / in stock, expired / expiring. */
function statusTags(item) {
  const tags = [];
  if (item.isActive === false) tags.push({ color: 'default', label: 'Ngừng sử dụng' });
  if (item.quantity <= 0) tags.push({ color: 'red', label: 'Hết hàng' });
  else if (item.reorderLevel > 0 && item.quantity <= item.reorderLevel) tags.push({ color: 'orange', label: 'Sắp hết' });
  else tags.push({ color: 'green', label: 'Còn hàng' });
  if (item.expiryDate) {
    const days = dayjs(item.expiryDate).diff(dayjs(), 'day');
    if (days < 0) tags.push({ color: 'red', label: 'Hết hạn' });
    else if (days <= EXPIRY_SOON_DAYS) tags.push({ color: 'gold', label: `Hết hạn sau ${days} ngày` });
  }
  return tags;
}

/** Create or edit one stock item. Units are suggested per category; the Manager can type others. */
function ItemModal({ item, category, open, onClose, units }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const watchedCategory = Form.useWatch('category', form) || item?.category || category;
  const watchedUnit = Form.useWatch('unit', form);
  const watchedPackUnit = Form.useWatch('packUnit', form);
  const suggestions = units[watchedCategory] || DEFAULT_UNITS[watchedCategory] || DEFAULT_UNITS.feed;

  const saveMutation = useMutation({
    mutationFn: (payload) => (item ? inventoryApi.update(item._id, payload) : inventoryApi.create(payload)),
    onSuccess: () => {
      message.success(item ? 'Đã cập nhật vật tư.' : 'Đã thêm vật tư vào kho.');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
      onClose();
    },
    onError: (err) => message.error(err.message || 'Lưu vật tư thất bại.'),
  });

  const submit = (v) =>
    saveMutation.mutate({
      ...v,
      packUnit: v.packUnit || '',
      packSize: v.packUnit ? v.packSize : null,
      expiryDate: v.expiryDate ? v.expiryDate.toISOString() : null,
      stableBlock: v.stableBlock || '',
    });

  return (
    <Modal
      title={item ? `Sửa vật tư — ${item.code ? `${item.code} · ` : ''}${item.name}` : `Thêm vật tư — ${CATEGORY_LABELS[category]}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={item ? 'Lưu' : 'Thêm'}
      cancelText="Huỷ"
      width={640}
      confirmLoading={saveMutation.isPending}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) return;
        form.setFieldsValue(
          item
            ? {
                name: item.name,
                category: item.category,
                description: item.description,
                unit: item.unit,
                packUnit: item.packUnit,
                packSize: item.packSize,
                quantity: item.quantity,
                reorderLevel: item.reorderLevel,
                price: item.price,
                expiryDate: item.expiryDate ? dayjs(item.expiryDate) : null,
                stableBlock: item.stableBlock,
                isActive: item.isActive !== false,
              }
            : { category, quantity: 0, reorderLevel: 0, isActive: true }
        );
      }}
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <div className="grid grid-cols-3 gap-3">
          <Form.Item name="name" label="Tên vật tư" className="col-span-2" rules={[{ required: true, whitespace: true, message: 'Nhập tên vật tư.' }]}>
            <Input placeholder="VD: Yến mạch (Oats)" />
          </Form.Item>
          <Form.Item name="category" label="Danh mục" rules={[{ required: true }]}>
            <Select options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
          </Form.Item>
        </div>
        <Form.Item name="description" label="Công dụng">
          <Input placeholder="VD: Cung cấp năng lượng cho ngựa đua" />
        </Form.Item>

        <div className="grid grid-cols-3 gap-3">
          <Form.Item
            name="unit"
            label="Đơn vị dùng"
            tooltip="Đơn vị để ghi khẩu phần / liều thuốc và để trừ kho mỗi lần dùng."
            rules={[{ required: true, whitespace: true, message: 'Chọn hoặc nhập đơn vị.' }]}
          >
            <AutoComplete options={suggestions.units.map((u) => ({ value: u }))} placeholder="kg, ml, viên…" />
          </Form.Item>
          <Form.Item name="quantity" label="Số lượng tồn" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} suffix={watchedUnit || undefined} />
          </Form.Item>
          <Form.Item name="reorderLevel" label="Tồn tối thiểu" tooltip="Chạm mức này là cảnh báo sắp hết.">
            <InputNumber min={0} style={{ width: '100%' }} suffix={watchedUnit || undefined} />
          </Form.Item>
        </div>

        {watchedCategory !== 'equipment' && (
          <div className="grid grid-cols-3 gap-3">
            <Form.Item name="packUnit" label="Quy cách đóng gói" tooltip="Đơn vị khi mua / nhập kho, VD: bao, hộp, chai. Bỏ trống nếu mua lẻ.">
              <AutoComplete allowClear options={suggestions.packUnits.map((u) => ({ value: u }))} placeholder="bao, hộp…" />
            </Form.Item>
            <Form.Item
              name="packSize"
              label={`1 ${watchedPackUnit || 'gói'} =`}
              dependencies={['packUnit']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, value) =>
                    !getFieldValue('packUnit') || value > 0 ? Promise.resolve() : Promise.reject(new Error('Nhập số lượng trong 1 gói.')),
                }),
              ]}
            >
              <InputNumber min={0} style={{ width: '100%' }} disabled={!watchedPackUnit} suffix={watchedUnit || undefined} />
            </Form.Item>
            <Form.Item name="expiryDate" label="Hạn sử dụng gần nhất">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Form.Item name="price" label={`Đơn giá (₫/${watchedPackUnit || watchedUnit || 'đơn vị'})`}>
            <InputNumber
              min={0}
              step={1000}
              style={{ width: '100%' }}
              formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')}
              parser={(v) => (v ? v.replace(/\./g, '') : '')}
            />
          </Form.Item>
          <Form.Item name="stableBlock" label="Khu vực" tooltip="Để trống = kho chung cho mọi khu.">
            <Input placeholder="VD: Block A" />
          </Form.Item>
          {item && (
            <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked" tooltip="Tắt = ngừng sử dụng: giữ hồ sơ nhưng không chọn được vào khẩu phần / đơn thuốc mới.">
              <Switch />
            </Form.Item>
          )}
        </div>
      </Form>
    </Modal>
  );
}

/** Records a delivery: by the item's unit, or by packs when it has a pack size. */
function ReceiveModal({ item, onClose }) {
  const queryClient = useQueryClient();
  const hasPack = Boolean(item?.packUnit && item?.packSize);
  const [mode, setMode] = useState('packs');
  const [amount, setAmount] = useState(null);
  const [note, setNote] = useState('');
  const byPacks = hasPack && mode === 'packs';
  const added = amount ? (byPacks ? amount * item.packSize : amount) : 0;

  const receiveMutation = useMutation({
    mutationFn: () => inventoryApi.receive(item._id, byPacks ? { packs: amount, note } : { quantity: amount, note }),
    onSuccess: (res) => {
      message.success(res.message || 'Đã nhập kho.');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
      setAmount(null);
      setNote('');
      onClose();
    },
    onError: (err) => message.error(err.message || 'Nhập kho thất bại.'),
  });

  return (
    <Modal
      title={item ? `Nhập kho — ${item.name}` : ''}
      open={Boolean(item)}
      onCancel={onClose}
      onOk={() => receiveMutation.mutate()}
      okText="Nhập kho"
      cancelText="Huỷ"
      okButtonProps={{ disabled: !(amount > 0) }}
      confirmLoading={receiveMutation.isPending}
      destroyOnHidden
    >
      {item && (
        <div className="flex flex-col gap-3">
          <Text type="secondary">Tồn hiện tại: {stockText(item)}</Text>
          {hasPack && (
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'packs', label: `Theo ${item.packUnit} (1 ${item.packUnit} = ${item.packSize} ${item.unit})` },
                { value: 'units', label: `Theo ${item.unit}` },
              ]}
            />
          )}
          <InputNumber min={0} style={{ width: '100%' }} value={amount} onChange={setAmount} suffix={byPacks ? item.packUnit : item.unit} placeholder="Số lượng nhập" />
          {added > 0 && (
            <Text>
              Sau khi nhập: <b>{stockText(item, item.quantity + added)}</b>
            </Text>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (nhà cung cấp, số phiếu…)" />
        </div>
      )}
    </Modal>
  );
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const items = data?.data || [];
  const { data: forecastData } = useQuery({ queryKey: ['inventory-forecast'], queryFn: () => inventoryApi.forecast() });
  const forecastById = new Map((forecastData?.data || []).map((f) => [String(f._id), f]));

  const [tab, setTab] = useState('feed');
  const [editing, setEditing] = useState(null); // null = closed, {} = new item, item = edit
  const [receiving, setReceiving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
  };

  const decideMutation = useMutation({
    mutationFn: ({ itemId, requestId, status, note }) => inventoryApi.decideRestock(itemId, requestId, { status, note }),
    onSuccess: (_res, variables) => {
      message.success(variables.status === 'approved' ? 'Đã duyệt — số lượng tồn kho đã được cộng thêm.' : 'Đã từ chối yêu cầu.');
      refresh();
      setRejecting(null);
      setRejectNote('');
    },
    onError: (err) => message.error(err.message || 'Thao tác thất bại.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => inventoryApi.remove(id),
    onSuccess: () => {
      message.success('Đã xoá vật tư.');
      refresh();
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
        item,
        itemId: item._id,
        requestId: r._id,
        quantity: r.quantity,
        note: r.note,
        blocking: Boolean(r.task),
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
          <span>{r.item.name}</span>
          <Tag className="!m-0">{CATEGORY_LABELS[r.item.category]}</Tag>
          {r.item.isProposed && <Tag color="purple" className="!m-0">Vật tư mới</Tag>}
          {r.blocking && <Tag color="red" className="!m-0">Đang chặn việc</Tag>}
        </Space>
      ),
    },
    {
      title: 'Tồn hiện tại',
      key: 'current',
      render: (_, r) => (r.item.isProposed ? <span className="text-gray-400">Chưa có trong kho</span> : stockText(r.item)),
    },
    { title: 'Đề xuất thêm', key: 'quantity', render: (_, r) => `+${stockText(r.item, r.quantity)}` },
    { title: 'Lý do', dataIndex: 'note', key: 'note', render: (v) => v || <span className="text-gray-400">—</span> },
    { title: 'Người đề xuất', dataIndex: 'requestedBy', key: 'requestedBy', render: (v) => v || '—' },
    { title: 'Thời gian', dataIndex: 'requestedAt', key: 'requestedAt', render: (d) => (d ? dayjs(d).format('DD/MM HH:mm') : '—') },
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

  const columnsFor = (category) => {
    const consumable = category !== 'equipment';
    return [
      { title: 'Mã', dataIndex: 'code', key: 'code', width: 90, render: (v) => <Text code>{v || '—'}</Text> },
      {
        title: 'Tên vật tư',
        key: 'name',
        render: (_, r) => (
          <div className="min-w-[220px]">
            <div className={r.isActive === false ? 'text-gray-400 line-through' : 'font-medium'}>{r.name}</div>
            {r.description && (
              <Text type="secondary" className="!text-xs">
                {r.description}
              </Text>
            )}
          </div>
        ),
      },
      { title: 'Tồn kho', key: 'quantity', render: (_, r) => <span className="whitespace-nowrap">{stockText(r)}</span> },
      {
        title: 'Trạng thái',
        key: 'status',
        render: (_, r) => (
          <div className="flex flex-wrap gap-1">
            {statusTags(r).map((t) => (
              <Tag key={t.label} color={t.color} className="!m-0">
                {t.label}
              </Tag>
            ))}
          </div>
        ),
      },
      ...(consumable
        ? [
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
          ]
        : []),
      { title: 'Tối thiểu', key: 'reorderLevel', render: (_, r) => (r.reorderLevel ? `${r.reorderLevel} ${r.unit}` : '—') },
      ...(consumable
        ? [
            {
              title: 'Quy cách',
              key: 'pack',
              render: (_, r) => (r.packUnit && r.packSize ? `1 ${r.packUnit} = ${r.packSize} ${r.unit}` : '—'),
            },
            { title: 'Hạn dùng', key: 'expiry', render: (_, r) => (r.expiryDate ? dayjs(r.expiryDate).format('DD/MM/YYYY') : '—') },
          ]
        : []),
      {
        title: 'Đơn giá',
        key: 'price',
        render: (_, r) => (r.price ? `${vnd(r.price)}/${r.packUnit || r.unit}` : '—'),
      },
      { title: 'Khu vực', dataIndex: 'stableBlock', key: 'stableBlock', render: (v) => v || 'Kho chung' },
      {
        title: '',
        key: 'actions',
        render: (_, r) => (
          <Space>
            <Button size="small" icon={<DatabaseOutlined />} onClick={() => setReceiving(r)}>
              Nhập kho
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>
              Sửa
            </Button>
            <Popconfirm
              title={`Xoá "${r.name}" khỏi kho?`}
              description="Không xoá được nếu đang dùng trong khẩu phần hoặc đơn thuốc — khi đó hãy tắt 'Đang sử dụng'."
              okText="Xoá"
              cancelText="Huỷ"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteMutation.mutate(r._id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending && deleteMutation.variables === r._id} />
            </Popconfirm>
          </Space>
        ),
      },
    ];
  };

  const stock = items.filter((i) => !i.isProposed);
  const tabItems = CATEGORIES.map((c) => {
    const rows = stock.filter((i) => i.category === c.key).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    const alerts = rows.filter((r) => r.isActive !== false && (r.quantity <= 0 || (r.reorderLevel > 0 && r.quantity <= r.reorderLevel))).length;
    return {
      key: c.key,
      label: (
        <span>
          {c.label} <Tag className="!ml-1 !mr-0">{rows.length}</Tag>
          {alerts > 0 && <Tag color="red" className="!ml-1 !mr-0">{alerts} cần nhập</Tag>}
        </span>
      ),
      children: (
        <div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
            <Text type="secondary" className="text-sm">
              {c.hint}
            </Text>
            <Button icon={<PlusOutlined />} onClick={() => setEditing({ __category: c.key })}>
              Thêm {c.label.toLowerCase()}
            </Button>
          </div>
          <Table
            rowKey="_id"
            columns={columnsFor(c.key)}
            dataSource={rows}
            loading={isLoading}
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{ emptyText: `Chưa có ${c.label.toLowerCase()} nào. Bấm "Thêm ${c.label.toLowerCase()}" để tạo.` }}
          />
        </div>
      ),
    };
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
        <div>
          <Title level={3} className="!mb-0">
            Vật tư &amp; Thức ăn
          </Title>
          <Text type="secondary" className="text-sm">
            Danh mục kho theo từng loại. Khẩu phần và đơn thuốc lấy vật tư từ đây; mỗi bữa ăn hay liều thuốc nhân viên làm xong, kho
            tự trừ. Nhân viên, HLV, bác sĩ đề xuất bổ sung — bạn duyệt là kho được cộng thêm.
          </Text>
        </div>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ __category: tab })}>
            Thêm vật tư
          </Button>
        </Space>
      </div>

      {pendingRequests.length > 0 && (
        <>
          <Alert className="mb-3" type="warning" showIcon title={`${pendingRequests.length} đề xuất vật tư đang chờ duyệt`} />
          <Table
            className="mb-6"
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

      <Tabs activeKey={tab} onChange={setTab} items={tabItems} />

      <ItemModal
        item={editing?._id ? editing : null}
        category={editing?.__category || editing?.category || tab}
        open={editing !== null}
        onClose={() => setEditing(null)}
        units={UNIT_SUGGESTIONS}
      />
      <ReceiveModal item={receiving} onClose={() => setReceiving(null)} />
      <Modal
        title={rejecting ? `Từ chối đề xuất — ${rejecting.item.name}` : ''}
        open={Boolean(rejecting)}
        okText="Từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Huỷ"
        confirmLoading={decideMutation.isPending}
        onCancel={() => {
          setRejecting(null);
          setRejectNote('');
        }}
        onOk={() => decideMutation.mutate({ itemId: rejecting.itemId, requestId: rejecting.requestId, status: 'rejected', note: rejectNote || undefined })}
        destroyOnHidden
      >
        {rejecting?.item.isProposed && (
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
