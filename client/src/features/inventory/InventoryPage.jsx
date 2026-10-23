import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Table, Typography, Tag, Button, Popconfirm, Modal, Form, Input, InputNumber, Select, Tooltip, AutoComplete, DatePicker, Switch, Segmented, Alert, Empty } from 'antd';
import { message } from '../../lib/antdStatic';
import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DatabaseOutlined,
  MedicineBoxOutlined,
  ToolOutlined,
  SearchOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { inventoryApi } from './inventoryApi';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import './inventory.css';
import { newestFirst } from '../../utils/newestFirst';

const { Text } = Typography;

/** A sheaf of grain — antd has no icon for feed. */
const FeedIcon = () => (
  <span className="anticon" role="img" aria-label="thức ăn">
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V9" />
      <path d="M12 13c-2.5 0-4.5-2-4.5-4.5C10 8.5 12 10.5 12 13Z" />
      <path d="M12 13c2.5 0 4.5-2 4.5-4.5C14 8.5 12 10.5 12 13Z" />
      <path d="M12 8.5C10 8.5 8.5 6.5 8.5 4 10.5 4 12 6 12 8.5Z" />
      <path d="M12 8.5c2 0 3.5-2 3.5-4.5-2 0-3.5 2-3.5 4.5Z" />
    </svg>
  </span>
);

// One storeroom for everything the club buys, in three kinds that behave differently.
const CATEGORIES = [
  { key: 'feed', label: 'Thức ăn', icon: <FeedIcon />, hint: 'Dùng trong khẩu phần — kho tự trừ mỗi bữa nhân viên cho ăn xong.' },
  { key: 'medicine', label: 'Thuốc & y tế', icon: <MedicineBoxOutlined />, hint: 'Bác sĩ kê từ đây — kho tự trừ mỗi liều nhân viên cho dùng.' },
  { key: 'equipment', label: 'Dụng cụ', icon: <ToolOutlined />, hint: 'Đồ dùng lâu dài; theo dõi số lượng và đề xuất mua thêm.' },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
// The kind of a feed: how long a horse waits after eating it before harder work (readiness check).
const FEED_TYPES = [
  { value: 'concentrate', label: 'Thức ăn tinh', color: 'orange', hint: 'Cám, ngũ cốc, thức ăn viên. Sau bữa có loại này, bài vừa/nặng phải chờ 60 phút.' },
  { value: 'forage', label: 'Cỏ', color: 'green', hint: 'Cỏ khô, rơm, alfalfa. Tập ngay sau bữa chỉ bị cảnh báo.' },
  { value: 'supplement', label: 'Bổ sung', color: 'blue', hint: 'Dầu, khoáng, vitamin, điện giải. Không tính là một bữa ăn.' },
];
const FEED_TYPE_BY_VALUE = Object.fromEntries(FEED_TYPES.map((t) => [t.value, t]));
// Units offered per category in the item form (the Manager can still type another one).
const UNIT_SUGGESTIONS = {
  feed: { units: ['kg', 'g', 'lít', 'ml', 'viên'], packUnits: ['bao', 'kiện', 'hộp', 'túi', 'chai', 'can'] },
  medicine: { units: ['viên', 'ml', 'g', 'liều', 'tuýp', 'miếng', 'cái', 'cuộn', 'túi'], packUnits: ['hộp', 'lọ', 'chai', 'tuýp', 'gói', 'thùng'] },
  equipment: { units: ['cái', 'bộ', 'đôi', 'sợi', 'cuộn'], packUnits: [] },
};
const EXPIRY_SOON_DAYS = 30;
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} ₫`;
const num = (n) => Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const fold = (text = '') => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** "9 bao + 5 kg" — the stock in the packs it is bought in, or null when it isn't bought in packs. */
function packText(item, quantity = item.quantity) {
  if (!item.packUnit || !item.packSize || quantity <= 0) return null;
  const packs = Math.floor(quantity / item.packSize + 1e-9);
  if (!packs) return null;
  const rest = Math.round((quantity - packs * item.packSize) * 100) / 100;
  return `${num(packs)} ${item.packUnit}${rest > 0 ? ` + ${num(rest)} ${item.unit}` : ''}`;
}
/** "250 kg · 10 bao", "247 kg · 9 bao + 22 kg", or just "8 cái" when the item isn't bought in packs. */
function stockText(item, quantity = item.quantity) {
  const packs = packText(item, quantity);
  return `${num(quantity)} ${item.unit}${packs ? ` · ${packs}` : ''}`;
}

const isLow = (i) => i.isActive !== false && (i.quantity <= 0 || (i.reorderLevel > 0 && i.quantity <= i.reorderLevel));
const expiryDays = (i) => (i.expiryDate ? dayjs(i.expiryDate).startOf('day').diff(dayjs().startOf('day'), 'day') : null);
const isExpiring = (i) => i.isActive !== false && expiryDays(i) !== null && expiryDays(i) <= EXPIRY_SOON_DAYS;

/** The computed status tags of an item: discontinued, out / low / in stock, expired / expiring. */
function statusTags(item) {
  const tags = [];
  if (item.isActive === false) tags.push({ color: 'default', label: 'Ngừng sử dụng' });
  if (item.quantity <= 0) tags.push({ color: 'red', label: 'Hết hàng' });
  else if (item.reorderLevel > 0 && item.quantity <= item.reorderLevel) tags.push({ color: 'orange', label: 'Sắp hết' });
  else tags.push({ color: 'green', label: 'Còn hàng' });
  const days = expiryDays(item);
  if (days !== null) {
    if (days < 0) tags.push({ color: 'red', label: 'Hết hạn' });
    else if (days <= EXPIRY_SOON_DAYS) tags.push({ color: 'gold', label: `Hết hạn sau ${days} ngày` });
  }
  return tags;
}

/** Quick picks under a unit field: one tap fills it, the field still takes any other unit. */
function UnitChips({ options, value, onPick }) {
  if (!options?.length) return null;
  return (
    <div className="inv-chips">
      {options.map((u) => (
        <button key={u} type="button" className={`inv-chip${value === u ? ' is-on' : ''}`} onClick={() => onPick(u)}>
          {u}
        </button>
      ))}
    </div>
  );
}

/**
 * Create or edit one stock item: first what kind it is (feed, medicine & medical supplies, equipment —
 * each behaves differently), then what it is, the unit it is used and counted in with how much is
 * on hand, how it is bought (packs) and its nearest expiry, and its price and place. A line at the
 * bottom reads the item back before it is saved.
 */
function ItemModal({ item, category, open, onClose }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const watchedCategory = Form.useWatch('category', form) || item?.category || category;
  const watchedName = Form.useWatch('name', form);
  const watchedUnit = Form.useWatch('unit', form);
  const watchedPackUnit = Form.useWatch('packUnit', form);
  const watchedPackSize = Form.useWatch('packSize', form);
  const watchedQuantity = Form.useWatch('quantity', form);
  const watchedReorder = Form.useWatch('reorderLevel', form);
  const watchedExpiry = Form.useWatch('expiryDate', form);
  const watchedFeedType = Form.useWatch('feedType', form);
  const suggestions = UNIT_SUGGESTIONS[watchedCategory] || UNIT_SUGGESTIONS.feed;
  const consumable = watchedCategory !== 'equipment';
  const kind = CATEGORY_BY_KEY[watchedCategory] || CATEGORIES[0];

  const saveMutation = useMutation({
    mutationFn: (payload) => (item ? inventoryApi.update(item._id, payload) : inventoryApi.create(payload)),
    onSuccess: () => {
      message.success(item ? 'Đã cập nhật vật tư.' : 'Đã thêm vào kho.');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
      onClose();
    },
    onError: (err) => message.error(err.message || 'Lưu vật tư thất bại.'),
  });

  const submit = (v) =>
    saveMutation.mutate({
      ...v,
      // Only a feed has a kind; left empty, the server guesses it from the name.
      feedType: v.category === 'feed' ? v.feedType || undefined : undefined,
      packUnit: v.category === 'equipment' ? '' : v.packUnit || '',
      packSize: v.category !== 'equipment' && v.packUnit ? v.packSize : null,
      expiryDate: v.category !== 'equipment' && v.expiryDate ? v.expiryDate.toISOString() : null,
      stableBlock: v.stableBlock || '',
    });

  const preview = {
    unit: watchedUnit || 'đơn vị',
    packUnit: consumable ? watchedPackUnit : '',
    packSize: consumable ? watchedPackSize : null,
  };
  const summary = [
    watchedName?.trim() || 'Vật tư mới',
    kind.label,
    watchedCategory === 'feed' && FEED_TYPE_BY_VALUE[watchedFeedType] ? FEED_TYPE_BY_VALUE[watchedFeedType].label : null,
    `tồn ${stockText(preview, Number(watchedQuantity) || 0)}`,
    watchedReorder > 0 ? `cảnh báo khi còn ≤ ${num(watchedReorder)} ${preview.unit}` : 'chưa đặt mức tối thiểu',
    consumable && watchedExpiry ? `HSD ${dayjs(watchedExpiry).format('DD/MM/YYYY')}` : null,
  ].filter(Boolean);

  return (
    <Modal
      title={item ? `Sửa vật tư — ${item.code ? `${item.code} · ` : ''}${item.name}` : 'Thêm vào kho'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={item ? 'Lưu thay đổi' : `Thêm ${kind.label.toLowerCase()}`}
      cancelText="Huỷ"
      width={760}
      confirmLoading={saveMutation.isPending}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) return;
        form.setFieldsValue(
          item
            ? {
                name: item.name,
                category: item.category,
                feedType: item.feedType,
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
      <Form form={form} layout="vertical" onFinish={submit} className="inv-ui" requiredMark="optional">
        <Form.Item name="category" rules={[{ required: true }]} hidden>
          <Input />
        </Form.Item>
        <div className="mb-1">
          <div className="inv-kinds" role="radiogroup" aria-label="Nhóm vật tư">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={watchedCategory === c.key}
                className={`inv-kind${watchedCategory === c.key ? ' is-on' : ''}`}
                onClick={() => form.setFieldValue('category', c.key)}
              >
                <span className={`inv-cat-icon is-${c.key}`}>{c.icon}</span>
                <span className="min-w-0">
                  <span className="inv-kind-title block">{c.label}</span>
                  <span className="inv-kind-hint block">{c.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="inv-section">Thông tin</div>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <Form.Item name="name" label="Tên vật tư" rules={[{ required: true, whitespace: true, message: 'Nhập tên vật tư.' }]} className="!mb-3">
            <Input placeholder={watchedCategory === 'medicine' ? 'VD: Phenylbutazone 1g' : watchedCategory === 'equipment' ? 'VD: Dây dắt ngựa' : 'VD: Yến mạch (Oats)'} />
          </Form.Item>
          <Form.Item name="description" label="Công dụng" className="!mb-3">
            <Input placeholder={watchedCategory === 'medicine' ? 'VD: Giảm đau, kháng viêm' : 'VD: Cung cấp năng lượng cho ngựa đua'} />
          </Form.Item>
        </div>
        {watchedCategory === 'feed' && (
          <Form.Item
            name="feedType"
            label="Loại thức ăn"
            tooltip="Quyết định ngựa phải chờ bao lâu sau bữa ăn mới được tập vừa/nặng."
            extra={FEED_TYPE_BY_VALUE[watchedFeedType]?.hint || 'Bỏ trống thì hệ thống đoán theo tên.'}
            className="!mb-3"
          >
            <Segmented block options={FEED_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Form.Item>
        )}

        <div className="inv-section">Đơn vị & tồn kho</div>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
          <Form.Item label="Đơn vị dùng" tooltip="Đơn vị ghi khẩu phần / liều thuốc và trừ kho mỗi lần dùng." required className="!mb-3">
            <Form.Item name="unit" noStyle rules={[{ required: true, whitespace: true, message: 'Chọn hoặc nhập đơn vị.' }]}>
              <AutoComplete options={suggestions.units.map((u) => ({ value: u }))} placeholder="kg, ml, viên…" />
            </Form.Item>
            <UnitChips options={suggestions.units} value={watchedUnit} onPick={(u) => form.setFieldValue('unit', u)} />
          </Form.Item>
          <Form.Item name="quantity" label="Đang có trong kho" rules={[{ required: true, message: 'Nhập số lượng.' }]} className="!mb-3">
            <InputNumber min={0} style={{ width: '100%' }} suffix={watchedUnit || undefined} />
          </Form.Item>
          <Form.Item name="reorderLevel" label="Mức tối thiểu" tooltip="Còn bằng hoặc dưới mức này là cảnh báo sắp hết." className="!mb-3">
            <InputNumber min={0} style={{ width: '100%' }} suffix={watchedUnit || undefined} />
          </Form.Item>
        </div>

        {consumable && (
          <>
            <div className="inv-section">Đóng gói & hạn dùng</div>
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
              <Form.Item label="Mua theo" tooltip="Đơn vị khi mua / nhập kho, VD: bao, hộp, chai. Bỏ trống nếu mua lẻ." className="!mb-3">
                <Form.Item name="packUnit" noStyle>
                  <AutoComplete allowClear options={suggestions.packUnits.map((u) => ({ value: u }))} placeholder="Mua lẻ" />
                </Form.Item>
                <UnitChips options={suggestions.packUnits} value={watchedPackUnit} onPick={(u) => form.setFieldValue('packUnit', u)} />
              </Form.Item>
              <Form.Item
                name="packSize"
                label={`1 ${watchedPackUnit || 'gói'} =`}
                dependencies={['packUnit']}
                className="!mb-3"
                rules={[
                  ({ getFieldValue }) => ({
                    validator: (_, value) => (!getFieldValue('packUnit') || value > 0 ? Promise.resolve() : Promise.reject(new Error('Nhập số lượng trong 1 gói.'))),
                  }),
                ]}
              >
                <InputNumber min={0} style={{ width: '100%' }} disabled={!watchedPackUnit} suffix={watchedUnit || undefined} placeholder={watchedPackUnit ? 'VD: 25' : 'Chọn "Mua theo" trước'} />
              </Form.Item>
              <Form.Item name="expiryDate" label="Hạn sử dụng gần nhất" className="!mb-3">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </div>
          </>
        )}

        <div className="inv-section">Giá & nơi để</div>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
          <Form.Item name="price" label={`Đơn giá (₫/${(consumable && watchedPackUnit) || watchedUnit || 'đơn vị'})`} className="!mb-3">
            <InputNumber
              min={0}
              step={1000}
              style={{ width: '100%' }}
              formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '')}
              parser={(v) => (v ? v.replace(/\./g, '') : '')}
            />
          </Form.Item>
          <Form.Item name="stableBlock" label="Khu vực" tooltip="Để trống = kho chung cho mọi khu." className="!mb-3">
            <Input placeholder="Kho chung" />
          </Form.Item>
          {item && (
            <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked" tooltip="Tắt = ngừng sử dụng: giữ hồ sơ nhưng không chọn được vào khẩu phần / đơn thuốc mới." className="!mb-3">
              <Switch />
            </Form.Item>
          )}
        </div>

        <div className="inv-summary">
          <Text type="secondary" className="!text-xs">
            Sẽ lưu:{' '}
          </Text>
          {summary.join(' · ')}
        </div>
      </Form>
    </Modal>
  );
}

/**
 * Records a delivery: by the item's unit, or by packs when it has a pack size. Opened from an approved
 * request, it receives that request (once) with the quantity asked for filled in.
 */
function ReceiveModal({ item, request = null, onClose }) {
  const queryClient = useQueryClient();
  const hasPack = Boolean(item?.packUnit && item?.packSize);
  const [mode, setMode] = useState(request ? 'units' : 'packs');
  const [amount, setAmount] = useState(request?.approvedQuantity ?? request?.quantity ?? null);
  const [note, setNote] = useState('');
  const byPacks = hasPack && mode === 'packs';
  const added = amount ? (byPacks ? amount * item.packSize : amount) : 0;

  const receiveMutation = useMutation({
    mutationFn: () => inventoryApi.receive(item._id, { ...(byPacks ? { packs: amount } : { quantity: amount }), note, ...(request ? { requestId: request.requestId } : {}) }),
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
      title={item ? `${request ? 'Nhận hàng theo đề xuất' : 'Nhập kho'} — ${item.name}` : ''}
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

/**
 * The club's storeroom — feed, medicine & medical supplies, equipment — for the Manager: counts that
 * double as filters, the restock requests waiting on a decision or a delivery, and every item with
 * its stock, state, packing, expiry and price on one line, what needs attention first.
 */
export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const items = data?.data || [];
  const { data: forecastData } = useQuery({ queryKey: ['inventory-forecast'], queryFn: () => inventoryApi.forecast() });
  const forecastById = new Map((forecastData?.data || []).map((f) => [String(f._id), f]));

  const [tab, setTab] = useState('all');
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // null = closed, {} = new item, item = edit
  const [receiving, setReceiving] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  // Approving opens a small form: the quantity may be less than asked (e.g. 15 of 20 kg).
  const [approving, setApproving] = useState(null);
  const [approvedQty, setApprovedQty] = useState(null);
  const [approveNote, setApproveNote] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-forecast'] });
  };

  const decideMutation = useMutation({
    mutationFn: ({ itemId, requestId, status: decision, note, approvedQuantity }) => inventoryApi.decideRestock(itemId, requestId, { status: decision, note, approvedQuantity }),
    onSuccess: (_res, variables) => {
      message.success(variables.status === 'approved' ? 'Đã duyệt — kho chỉ cộng khi bấm "Nhận hàng" lúc hàng về.' : 'Đã từ chối yêu cầu.');
      refresh();
      setRejecting(null);
      setRejectNote('');
      setApproving(null);
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
  // Pending ones wait for a decision; approved ones (under the current flow) wait for the delivery.
  const pendingRequests = items
    .flatMap((item) =>
      (item.restockRequests || [])
        .filter((r) => r.status === 'pending' || (r.status === 'approved' && r.awaitingDelivery && !r.receivedAt))
        .map((r) => ({
          status: r.status,
          key: `${item._id}-${r._id}`,
          item,
          itemId: item._id,
          requestId: r._id,
          quantity: r.quantity,
          approvedQuantity: r.approvedQuantity ?? null,
          priority: r.priority || 'normal',
          destinationBlock: r.destinationBlock || null,
          note: r.note,
          blocking: Boolean(r.task),
          requestedBy: r.requestedBy?.name || r.requestedBy,
          requestedAt: r.requestedAt,
          lastChange: r.receivedAt || r.reviewedAt || r.requestedAt,
        }))
    )
    // What waits on a decision first; within each, the newest change on top.
    .sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || new Date(b.lastChange) - new Date(a.lastChange));

  const stock = items.filter((i) => !i.isProposed);
  const countOf = (key) => stock.filter((i) => key === 'all' || i.category === key).length;
  const lowCount = stock.filter(isLow).length;
  const outCount = stock.filter((i) => i.isActive !== false && i.quantity <= 0).length;
  const expiringCount = stock.filter(isExpiring).length;
  const pendingCount = pendingRequests.filter((r) => r.status === 'pending').length;
  const awaitingCount = pendingRequests.filter((r) => r.status === 'approved').length;

  const STATUS = {
    all: () => true,
    restock: isLow,
    expiry: isExpiring,
    inactive: (i) => i.isActive === false,
  };
  const q = fold(search.trim());
  // Newest first: an item just added or changed is the first row. What needs the Manager is the
  // "Cần nhập" / "Sắp hết hạn" filter.
  const rows = newestFirst(
    stock
      .filter((i) => tab === 'all' || i.category === tab)
      .filter(STATUS[status] || STATUS.all)
      .filter((i) => !q || fold([i.code, i.name, i.description, i.stableBlock].join(' ')).includes(q))
  );
  // A notification about one item (?item=<id>, tab=requests for a supply request) opens it
  // highlighted: its row in the list, or its requests in the queue above.
  const focusItem = searchParams.get('item');
  const focusRequests = searchParams.get('tab') === 'requests';
  useEffect(() => {
    if (!focusItem || !data) return undefined;
    const timer = setTimeout(() => document.querySelector('[data-focus="item"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400);
    return () => clearTimeout(timer);
  }, [focusItem, data]);

  const columns = [
    {
      title: 'Vật tư',
      key: 'name',
      render: (_, r) => (
        <div className="flex min-w-0 items-start gap-3">
          <span className={`inv-cat-icon is-${r.category} shrink-0`} title={CATEGORY_BY_KEY[r.category]?.label}>
            {CATEGORY_BY_KEY[r.category]?.icon}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={r.isActive === false ? 'text-gray-400 line-through' : 'font-semibold'}>{r.name}</span>
              {FEED_TYPE_BY_VALUE[r.feedType] && (
                <Tag color={FEED_TYPE_BY_VALUE[r.feedType].color} bordered={false} className="!m-0 !text-xs">
                  {FEED_TYPE_BY_VALUE[r.feedType].label}
                </Tag>
              )}
            </div>
            <Text type="secondary" className="!text-xs">
              {[r.code, r.description, r.stableBlock ? `Khu ${r.stableBlock}` : null].filter(Boolean).join(' · ') || CATEGORY_BY_KEY[r.category]?.label}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Tồn kho',
      key: 'quantity',
      width: 170,
      align: 'right',
      render: (_, r) => (
        <div className="tabular-nums">
          <div className={`font-semibold ${isLow(r) ? 'text-rose-600' : ''}`}>
            {num(r.quantity)} {r.unit}
          </div>
          {packText(r) && (
            <Text type="secondary" className="block !text-xs">
              {packText(r)}
            </Text>
          )}
          <Text type="secondary" className="block !text-[11px]">
            {r.reorderLevel ? `tối thiểu ${num(r.reorderLevel)} ${r.unit}` : 'chưa đặt mức tối thiểu'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Tình trạng',
      key: 'status',
      width: 190,
      render: (_, r) => {
        const f = forecastById.get(String(r._id));
        const usedBy = (f?.usedBy || [])
          .map((u) => (u.kind === 'ration' ? `${u.horse}: ${u.amount} ${r.unit}/bữa` : `${u.horse}: ${u.medicine} ${u.amount} ${r.unit} × ${u.doses}`))
          .join('\n');
        return (
          <div className="flex flex-wrap gap-1">
            {statusTags(r).map((t) => (
              <Tag key={t.label} color={t.color} className="!m-0">
                {t.label}
              </Tag>
            ))}
            {r.category !== 'equipment' && f?.dailyUsage ? (
              <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{`Dùng ${f.dailyUsage} ${r.unit}/ngày\n${usedBy}`}</span>}>
                <Tag className="!m-0" color={f.quantity <= 0 || f.daysLeft < 3 ? 'red' : f.daysLeft < 7 ? 'orange' : 'default'} bordered={false}>
                  {f.quantity <= 0 ? 'Đã hết' : f.daysLeft < 1 ? 'Đủ dưới 1 ngày' : `Đủ ~${f.daysLeft} ngày`}
                </Tag>
              </Tooltip>
            ) : null}
          </div>
        );
      },
    },
    {
      title: 'Quy cách · hạn · giá',
      key: 'facts',
      width: 200,
      render: (_, r) => {
        const facts = [
          r.packUnit && r.packSize ? `1 ${r.packUnit} = ${num(r.packSize)} ${r.unit}` : r.category !== 'equipment' ? 'Mua lẻ' : null,
          r.expiryDate ? `HSD ${dayjs(r.expiryDate).format('DD/MM/YYYY')}` : null,
          r.price ? `${vnd(r.price)}/${r.packUnit || r.unit}` : null,
        ].filter(Boolean);
        return facts.length ? (
          <div className="flex flex-col text-[13px] leading-5">
            {facts.map((f) => (
              <span key={f} className="tabular-nums">
                {f}
              </span>
            ))}
          </div>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 168,
      align: 'right',
      render: (_, r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="small" type={isLow(r) ? 'primary' : 'default'} icon={<DatabaseOutlined />} onClick={() => setReceiving(r)}>
            Nhập kho
          </Button>
          <Tooltip title="Sửa">
            <Button size="small" icon={<EditOutlined />} aria-label={`Sửa ${r.name}`} onClick={() => setEditing(r)} />
          </Tooltip>
          <Popconfirm
            title={`Xoá "${r.name}" khỏi kho?`}
            description="Không xoá được nếu đang dùng trong khẩu phần hoặc đơn thuốc — khi đó hãy tắt 'Đang sử dụng'."
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteMutation.mutate(r._id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Xoá ${r.name}`} loading={deleteMutation.isPending && deleteMutation.variables === r._id} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  const toggleStatus = (key) => setStatus((s) => (s === key ? 'all' : key));
  const tiles = [
    {
      key: 'all',
      label: 'Mặt hàng trong kho',
      value: stock.length,
      unit: 'mặt hàng',
      tone: 'text-[#0F5A43]',
      onClick: () => {
        setStatus('all');
        setTab('all');
      },
    },
    { key: 'restock', label: 'Cần nhập thêm', value: lowCount, unit: outCount ? `· ${outCount} đã hết` : 'mặt hàng', tone: outCount ? 'text-rose-600' : lowCount ? 'text-amber-700' : 'text-slate-700', onClick: () => toggleStatus('restock') },
    { key: 'expiry', label: `Hết hạn / hết hạn trong ${EXPIRY_SOON_DAYS} ngày`, value: expiringCount, unit: 'mặt hàng', tone: expiringCount ? 'text-amber-700' : 'text-slate-700', onClick: () => toggleStatus('expiry') },
    {
      key: 'requests',
      label: 'Đề xuất mua',
      value: pendingCount,
      unit: awaitingCount ? `chờ duyệt · ${awaitingCount} chờ hàng về` : 'chờ duyệt',
      tone: pendingCount ? 'text-amber-700' : 'text-slate-700',
      onClick: () => document.getElementById('inv-queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
  ];
  const kind = CATEGORY_BY_KEY[tab];
  const addHere = () => setEditing({ __category: tab === 'all' ? 'feed' : tab });

  return (
    <div className="inv-ui">
      <PageHeroBanner
        eyebrow="Hậu cần & tồn kho"
        roleLabel="Quản lý CLB"
        title="Kho vật tư"
        subtitle="Một kho cho thức ăn, thuốc & vật tư y tế và dụng cụ: tồn kho, hạn dùng, đề xuất mua và hàng về. Khẩu phần và đơn thuốc tự trừ kho khi nhân viên làm xong."
        actionButton={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={addHere}
            className="!h-9 !px-4 !rounded-lg !bg-[#D4AF37] hover:!bg-[#E2C058] !border-[#D4AF37] !text-[#061812] font-semibold cursor-pointer"
          >
            Thêm vào kho
          </Button>
        }
      />

      {/* The counts double as filters for the list below. */}
      <div className="light-surface-box grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#E4DFD3] mb-4 rounded-xl bg-[#FAF7F0] border border-[#E5DEC9] shadow-xs overflow-hidden">
        {tiles.map((t) => {
          const on = (t.key === 'restock' || t.key === 'expiry') && status === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={on}
              onClick={t.onClick}
              className={`cursor-pointer border-0 p-3.5 text-left transition-colors sm:p-4 ${on ? 'bg-[#0F5A43]/10 shadow-[inset_0_-3px_0_#0F5A43]' : 'bg-transparent hover:bg-black/[0.03]'}`}
            >
              <div className="text-xs font-medium text-slate-600">{t.label}</div>
              <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${t.tone}`}>
                {t.value} <span className="text-xs font-normal text-slate-500">{t.unit}</span>
              </div>
            </button>
          );
        })}
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          className="mb-4"
          title="Chưa tải được danh mục kho"
          description={error?.message || 'Không thể lấy dữ liệu tồn kho lúc này.'}
          action={
            <Button size="small" onClick={() => refetch()}>
              Thử lại
            </Button>
          }
        />
      )}

      {pendingRequests.length > 0 && (
        <section id="inv-queue" className="inv-queue mb-5">
          <div className="inv-queue-head">
            <span>
              Đề xuất mua & hàng chờ về <Tag className="!ml-1">{pendingRequests.length}</Tag>
            </span>
            <Text type="secondary" className="!text-xs">
              Từ HLV, bác sĩ & nhân viên chăm sóc · duyệt là đặt hàng, kho chỉ cộng khi nhận hàng
            </Text>
          </div>
          {pendingRequests.map((r) => (
            <div key={r.key} className={`inv-request${focusItem && r.itemId === focusItem ? ' is-focus' : ''}`} data-focus={focusItem && r.itemId === focusItem ? 'item' : undefined}>
              <span className={`inv-cat-icon is-${r.item.category}`}>{CATEGORY_BY_KEY[r.item.category]?.icon}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inv-ink font-semibold">{r.item.name}</span>
                  {r.item.isProposed && (
                    <Tag color="purple" className="!m-0">
                      Vật tư mới
                    </Tag>
                  )}
                  {r.priority === 'urgent' && (
                    <Tag color="red" className="!m-0">
                      Khẩn
                    </Tag>
                  )}
                  {r.blocking && (
                    <Tag color="red" className="!m-0">
                      Đang chặn việc
                    </Tag>
                  )}
                  {r.destinationBlock && <Tag className="!m-0">Cho {r.destinationBlock}</Tag>}
                </div>
                <div className="inv-ink text-[13px]">
                  <b className="tabular-nums">
                    {r.status === 'approved' && r.approvedQuantity !== null && r.approvedQuantity < r.quantity
                      ? `Duyệt ${num(r.approvedQuantity)}/${num(r.quantity)} ${r.item.unit}`
                      : `+${stockText(r.item, r.quantity)}`}
                  </b>
                  <span className="inv-muted"> · {r.item.isProposed ? 'chưa có trong kho' : `đang có ${stockText(r.item)}`}</span>
                  {r.note ? <span className="inv-muted"> · {r.note}</span> : null}
                </div>
                <Text type="secondary" className="!text-xs">
                  {r.requestedBy || '—'} · {r.requestedAt ? dayjs(r.requestedAt).format('DD/MM HH:mm') : '—'}
                </Text>
              </div>
              <div className="inv-request-actions flex flex-wrap items-center justify-end gap-2">
                {r.status === 'approved' ? (
                  <>
                    <Tag color="cyan" className="!m-0">
                      Đã duyệt, chờ hàng về
                    </Tag>
                    <Button type="primary" size="small" icon={<InboxOutlined />} onClick={() => setReceiving({ item: r.item, request: r })}>
                      Nhận hàng
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckOutlined />}
                      loading={decideMutation.isPending && decideMutation.variables?.requestId === r.requestId}
                      onClick={() => {
                        setApproving(r);
                        setApprovedQty(r.quantity);
                        setApproveNote('');
                      }}
                    >
                      Duyệt
                    </Button>
                    <Button danger size="small" icon={<CloseOutlined />} onClick={() => setRejecting(r)}>
                      Từ chối
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[{ key: 'all', label: 'Tất cả' }, ...CATEGORIES].map((c) => ({
            value: c.key,
            label: (
              <span className="inline-flex items-center gap-1.5">
                {c.icon}
                {c.label}
                <span className="inv-faint text-xs tabular-nums">{countOf(c.key)}</span>
              </span>
            ),
          }))}
        />
        <Input
          allowClear
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Tìm mã, tên, công dụng, khu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="!w-full sm:!w-64"
        />
        <Select
          value={status}
          onChange={setStatus}
          className="!w-full sm:!w-56"
          options={[
            { value: 'all', label: 'Mọi tình trạng' },
            { value: 'restock', label: `Cần nhập thêm (${lowCount})` },
            { value: 'expiry', label: `Hết hạn / sắp hết hạn (${expiringCount})` },
            { value: 'inactive', label: 'Ngừng sử dụng' },
          ]}
        />
        <Button className="sm:!ml-auto" icon={<PlusOutlined />} onClick={addHere}>
          Thêm {kind ? kind.label.toLowerCase() : 'vào kho'}
        </Button>
      </div>
      {kind && (
        <Text type="secondary" className="mb-2 block !text-xs">
          {kind.hint}
        </Text>
      )}

      <Table
        rowKey="_id"
        size="middle"
        columns={columns}
        dataSource={rows}
        loading={isLoading && !data}
        tableLayout="fixed"
        scroll={{ x: 1000 }}
        pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
        rowClassName={(r) => [r.isActive === false ? 'opacity-60' : '', focusItem && !focusRequests && r._id === focusItem ? 'row-focus' : ''].join(' ').trim()}
        onRow={(r) => (focusItem && !focusRequests && r._id === focusItem ? { 'data-focus': 'item' } : {})}
        locale={{
          emptyText:
            stock.length && (q || status !== 'all') ? (
              <Empty description="Không có vật tư nào khớp tìm kiếm / bộ lọc.">
                <Button
                  size="small"
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                  }}
                >
                  Bỏ lọc
                </Button>
              </Empty>
            ) : (
              <Empty description={`Chưa có ${kind ? kind.label.toLowerCase() : 'vật tư'} nào trong kho.`}>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={addHere}>
                  Thêm vào kho
                </Button>
              </Empty>
            ),
        }}
      />

      <ItemModal item={editing?._id ? editing : null} category={editing?.__category || editing?.category || (tab === 'all' ? 'feed' : tab)} open={editing !== null} onClose={() => setEditing(null)} />
      <ReceiveModal
        key={receiving?.request?.requestId || receiving?._id || 'none'}
        item={receiving?.request ? receiving.item : receiving}
        request={receiving?.request || null}
        onClose={() => setReceiving(null)}
      />
      <Modal
        title={approving ? `Duyệt đề xuất — ${approving.item.name}` : ''}
        open={Boolean(approving)}
        okText="Duyệt"
        cancelText="Huỷ"
        confirmLoading={decideMutation.isPending}
        okButtonProps={{ disabled: !approvedQty || approvedQty <= 0 || approvedQty > (approving?.quantity || 0) }}
        onCancel={() => setApproving(null)}
        onOk={() =>
          decideMutation.mutate({
            itemId: approving.itemId,
            requestId: approving.requestId,
            status: 'approved',
            approvedQuantity: approvedQty,
            note: approveNote || undefined,
          })
        }
        destroyOnHidden
      >
        <Text type="secondary" className="block !text-xs mb-2">
          Duyệt là đặt hàng; kho chỉ tăng khi bấm "Nhận hàng" lúc hàng về. Có thể duyệt ít hơn số đề xuất.
        </Text>
        <div className="flex items-center gap-2 mb-3">
          <InputNumber min={0.01} max={approving?.quantity} value={approvedQty} onChange={setApprovedQty} style={{ width: 140 }} />
          <Text>
            / {approving?.quantity} {approving?.item.unit} đề xuất
          </Text>
        </div>
        <Input.TextArea rows={2} value={approveNote} onChange={(e) => setApproveNote(e.target.value)} placeholder="Ghi chú cho người đề xuất (không bắt buộc) — VD: Duyệt 15 kg, phần còn lại tháng sau." />
      </Modal>
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
        <Input.TextArea rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Lý do (người đề xuất sẽ thấy) — VD: Kho còn đủ đến cuối tháng." />
      </Modal>
    </div>
  );
}
