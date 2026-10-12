import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Typography } from 'antd';
import { UserAddOutlined, ShoppingCartOutlined, InboxOutlined, ApartmentOutlined } from '@ant-design/icons';
import { usersApi } from '../admin/usersApi';
import { inventoryApi } from '../inventory/inventoryApi';
import { horsesApi } from '../horses/horsesApi';
import { STATUS_TONES } from '../../layouts/forestTheme';

const { Text } = Typography;
const ASSIGNMENT_KEYS = ['owner', 'trainer', 'vet', 'stall'];

/**
 * The Club Manager's queue: what is waiting on them, each with a count and the page that handles it.
 * Accounts waiting for approval, restock requests (and proposed new items) to decide, approved orders
 * whose goods have not been received, and horses still missing an owner, trainer, vet or stall.
 * Built from the lists those pages already load, under the same query keys, so nothing is fetched twice.
 */
export default function ManagerQueueCard() {
  const users = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const inventory = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const checklists = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });

  const requests = (inventory.data?.data || []).flatMap((item) => item.restockRequests || []);
  const rows = [
    {
      key: 'accounts',
      icon: <UserAddOutlined />,
      label: 'Tài khoản đăng ký chờ duyệt',
      count: (users.data?.data || []).filter((u) => u.approvalStatus === 'pending').length,
      to: '/admin/users',
      action: 'Duyệt tài khoản',
    },
    {
      key: 'restock',
      icon: <ShoppingCartOutlined />,
      label: 'Đề xuất vật tư chờ duyệt',
      count: requests.filter((r) => r.status === 'pending').length,
      to: '/inventory',
      action: 'Xem đề xuất',
    },
    {
      key: 'delivery',
      icon: <InboxOutlined />,
      label: 'Hàng đã duyệt, chờ nhận',
      count: requests.filter((r) => r.status === 'approved' && r.awaitingDelivery && !r.receivedAt).length,
      to: '/inventory',
      action: 'Nhận hàng',
    },
    {
      key: 'assignment',
      icon: <ApartmentOutlined />,
      label: 'Ngựa thiếu chủ, HLV, bác sĩ hoặc chuồng',
      count: (checklists.data?.data || []).filter((r) => r.items.some((i) => ASSIGNMENT_KEYS.includes(i.key) && !i.done)).length,
      to: '/horses',
      action: 'Phân công',
    },
  ];
  const waiting = rows.reduce((total, r) => total + r.count, 0);
  const loading = users.isLoading || inventory.isLoading || checklists.isLoading;

  return (
    <Card
      className="mt-6"
      title={
        <span>
          Việc đang chờ bạn{' '}
          <Text type="secondary" className="!text-xs font-normal">
            {loading ? 'đang tải…' : waiting ? `${waiting} việc` : 'không có việc nào đang chờ bạn'}
          </Text>
        </span>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((r) => {
          const tone = STATUS_TONES[r.count ? 'watch' : 'neutral'];
          return (
            <Link
              key={r.key}
              to={r.to}
              className={`flex items-center gap-3 rounded-xl border border-black/5 p-3 min-w-0 transition-colors hover:bg-black/[0.02] ${r.count ? '' : 'opacity-60'}`}
            >
              <span className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0" style={{ background: tone.bg, color: tone.color }}>
                {r.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-gray-700">{r.label}</span>
                <span className="block text-xs text-gray-500">{r.count ? `${r.action} →` : 'Không có'}</span>
              </span>
              <span className="text-2xl font-semibold tabular-nums" style={{ color: tone.color }}>
                {loading ? '–' : r.count}
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
