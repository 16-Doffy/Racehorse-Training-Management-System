import { Link } from 'react-router-dom';
import { Button, Card, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '../inventory/inventoryApi';
import QuietCard from './QuietCard';
import { useFirst } from './useFirst';

// Worth a look: out, at or under the level set for reordering, or under a week left at today's use.
const WEEK = 7;
const isShort = (f) => f.quantity <= 0 || (f.reorderLevel > 0 && f.quantity <= f.reorderLevel) || (f.daysLeft != null && f.daysLeft < WEEK);

function StockTag({ item }) {
  if (item.quantity <= 0) return <Tag color="error" className="!m-0 shrink-0 !text-[11px]">Đã hết</Tag>;
  if (item.daysLeft != null && item.daysLeft < WEEK) {
    return (
      <Tag color={item.daysLeft < 3 ? 'error' : 'warning'} className="!m-0 shrink-0 !text-[11px]">
        {item.daysLeft < 1 ? 'Đủ dưới 1 ngày' : `Đủ ~${item.daysLeft} ngày`}
      </Tag>
    );
  }
  return <Tag color="warning" className="!m-0 shrink-0 !text-[11px]">Dưới mức đặt lại</Tag>;
}

/**
 * The Manager's store at a glance: the items running out, from the forecast of daily use by the horses'
 * rations and ongoing treatments (the same query as the store page), the most urgent first.
 */
export default function StockWatchCard() {
  const { data, isLoading } = useQuery({ queryKey: ['inventory-forecast'], queryFn: () => inventoryApi.forecast() });
  const items = (data?.data || [])
    .filter(isShort)
    .sort((a, b) => (a.quantity <= 0 ? -1 : 0) - (b.quantity <= 0 ? -1 : 0) || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.name.localeCompare(b.name, 'vi'));
  const [shown, more] = useFirst(items, 5);

  if (!isLoading && !items.length) return <QuietCard title="Kho cần chú ý">Không có vật tư nào sắp hết</QuietCard>;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl"
      loading={isLoading}
      styles={{ title: { whiteSpace: 'normal' }, body: { padding: '4px 16px 12px' } }}
      title={
        <div className="py-1">
          <span className="font-semibold text-gray-900 text-[15px]">Kho cần chú ý</span>
          <p className="m-0 mt-0.5 text-xs font-normal text-gray-600">{items.length} vật tư sắp hết, theo mức dùng mỗi ngày</p>
        </div>
      }
      extra={
        <Link to="/inventory">
          <Button size="small">Mở kho</Button>
        </Link>
      }
    >
      <ul className="m-0 list-none divide-y divide-gray-100 p-0">
        {shown.map((f) => (
          <li key={f._id} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium text-gray-900" title={f.name}>
              {f.name}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-gray-600">
              {f.quantity} {f.unit}
              {f.dailyUsage > 0 && <span className="text-gray-400">, dùng {f.dailyUsage}/ngày</span>}
            </span>
            <StockTag item={f} />
          </li>
        ))}
      </ul>
      {more}
    </Card>
  );
}
