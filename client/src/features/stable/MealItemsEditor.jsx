import { Button, InputNumber, Select, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { idOf } from './feedingPlan';

/**
 * The foods of one meal, each a stock item and an amount in that item's unit: change, add, remove.
 * `value` = [{ inventoryItem, name, amount, unit }]; an item is picked once per meal. `onPropose` asks the
 * Manager for a food the stock does not have yet.
 */
export default function MealItemsEditor({ value = [], onChange, feedItems = [], disabled = false, onPropose }) {
  const byId = new Map(feedItems.map((f) => [String(f._id), f]));
  const set = (index, patch) => onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const pick = (index, id) => {
    const item = byId.get(String(id));
    set(index, { inventoryItem: id, name: item?.name, unit: item?.unit });
  };
  return (
    <div className="flex flex-col gap-2">
      {value.map((row, index) => {
        const id = idOf(row.inventoryItem);
        const item = byId.get(id);
        const taken = new Set(value.filter((_, i) => i !== index).map((r) => idOf(r.inventoryItem)));
        return (
          <div key={index} className="flex items-center gap-2">
            <Select
              showSearch
              optionFilterProp="label"
              disabled={disabled}
              value={id || undefined}
              placeholder="Chọn thức ăn trong kho"
              status={!id ? 'warning' : undefined}
              className="min-w-0 flex-1"
              onChange={(v) => pick(index, v)}
              options={[
                ...feedItems.map((f) => ({ value: String(f._id), label: `${f.name} — kho còn ${f.quantity} ${f.unit}`, disabled: taken.has(String(f._id)) })),
                // An item no longer in the stock list still shows by its name.
                ...(id && !item ? [{ value: id, label: `${row.name || 'Món đã ngừng'} (không còn trong kho)` }] : []),
              ]}
            />
            <InputNumber
              disabled={disabled}
              min={0.1}
              step={0.5}
              value={row.amount}
              status={!(row.amount > 0) ? 'error' : undefined}
              onChange={(v) => set(index, { amount: v })}
              className="!w-24"
              aria-label="Lượng"
            />
            <span className="w-10 shrink-0 text-xs text-gray-500">{item?.unit || row.unit || ''}</span>
            <Tooltip title="Bỏ món này">
              <Button
                type="text"
                danger
                disabled={disabled || value.length <= 1}
                icon={<DeleteOutlined />}
                aria-label="Bỏ món này"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              />
            </Tooltip>
          </div>
        );
      })}
      {!disabled && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...value, { inventoryItem: undefined, amount: undefined }])}>
            Thêm món
          </Button>
          {onPropose && (
            <Button size="small" type="link" className="!px-0" onClick={onPropose}>
              Kho chưa có món cần dùng?
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
