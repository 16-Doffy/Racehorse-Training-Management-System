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
      desc: 'Người dùng mới đăng ký cần xét duyệt quyền',
    },
    {
      key: 'restock',
      icon: <ShoppingCartOutlined />,
      label: 'Đề xuất vật tư chờ duyệt',
      count: requests.filter((r) => r.status === 'pending').length,
      to: '/inventory',
      action: 'Xem đề xuất',
      desc: 'Yêu cầu nhập thức ăn hoặc vật tư y tế',
    },
    {
      key: 'delivery',
      icon: <InboxOutlined />,
      label: 'Hàng đã duyệt, chờ nhận',
      count: requests.filter((r) => r.status === 'approved' && r.awaitingDelivery && !r.receivedAt).length,
      to: '/inventory',
      action: 'Nhận hàng',
      desc: 'Đơn hàng đã về kho cần kiểm đếm và nhập',
    },
    {
      key: 'assignment',
      icon: <ApartmentOutlined />,
      label: 'Ngựa thiếu phân công',
      count: (checklists.data?.data || []).filter((r) => r.items.some((i) => ASSIGNMENT_KEYS.includes(i.key) && !i.done)).length,
      to: '/horses',
      action: 'Phân công ngay',
      desc: 'Thiếu chủ ngựa, HLV, bác sĩ hoặc chuồng',
    },
  ];
  const waiting = rows.reduce((total, r) => total + r.count, 0);
  const loading = users.isLoading || inventory.isLoading || checklists.isLoading;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] border-t-2 border-t-[#0F5A43] rounded-xl overflow-hidden"
      styles={{ body: { padding: 0 }, title: { whiteSpace: 'normal', overflow: 'visible' }, header: { height: 'auto' } }}
      headStyle={{ whiteSpace: 'normal' }}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 text-base">Việc đang chờ bạn</span>
            {waiting > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                {waiting} cần xử lý
              </span>
            )}
          </div>
          <Text type="secondary" className="!text-xs font-normal">
            {loading ? 'Đang kiểm tra…' : waiting === 0 ? 'Tất cả đã được giải quyết' : `${waiting} việc chưa xử lý`}
          </Text>
        </div>
      }
    >
      <div className="divide-y divide-[#EFE8DA]">
        {rows.map((r) => {
          const tone = STATUS_TONES[r.count ? 'watch' : 'neutral'];
          const hasPending = r.count > 0;
          return (
            <Link
              key={r.key}
              to={r.to}
              className={`flex items-center justify-between p-4 transition-colors hover:bg-emerald-50/40 group ${hasPending ? 'bg-amber-50/20' : ''}`}
            >
              <div className="flex items-center gap-3.5 min-w-0 pr-4">
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0 transition-transform group-hover:scale-105"
                  style={{ background: tone.bg, color: tone.color }}
                >
                  {r.icon}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 group-hover:text-emerald-900 transition-colors">
                      {r.label}
                    </span>
                    {hasPending && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                        {r.action}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 block truncate mt-0.5">{r.desc}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`text-xl font-bold tabular-nums block ${hasPending ? 'text-amber-600' : 'text-slate-600'}`}
                >
                  {loading ? '–' : r.count}
                </span>
                <span className="text-[11px] text-slate-600 font-medium block">
                  {hasPending ? 'chờ xử lý' : 'hoàn tất'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
