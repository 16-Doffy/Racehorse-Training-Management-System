import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Typography } from 'antd';
import { UserAddOutlined, ShoppingCartOutlined, InboxOutlined, ApartmentOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usersApi } from '../admin/usersApi';
import { inventoryApi } from '../inventory/inventoryApi';
import { horsesApi } from '../horses/horsesApi';
import { STATUS_TONES } from '../../layouts/forestTheme';

const { Text } = Typography;
const ASSIGNMENT_KEYS = ['owner', 'trainer', 'vet', 'stall'];

/**
 * What a list behind the queue can say: 'loading' (nothing yet), 'error' (it failed and there is
 * nothing to count — the count is unknown, not 0), 'stale' (the last refresh failed; the count is from
 * the copy loaded at `updatedAt`) or 'ok'.
 */
function sourceState(query) {
  if (query.isError) return query.data === undefined ? { state: 'error' } : { state: 'stale', updatedAt: query.dataUpdatedAt };
  if (query.isPending) return { state: 'loading' };
  return { state: 'ok' };
}

/**
 * The Club Manager's queue: what is waiting on them, each with a count and the page that handles it.
 * Accounts waiting for approval, restock requests (and proposed new items) to decide, approved orders
 * whose goods have not been received, and horses still missing an owner, trainer, vet or stall.
 * Built from the lists those pages already load, under the same query keys, so nothing is fetched twice.
 * A list that failed to load is shown as not checked, with a retry — never as 0 or "all resolved".
 */
export default function ManagerQueueCard() {
  const users = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const inventory = useQuery({ queryKey: ['inventory'], queryFn: () => inventoryApi.list() });
  const checklists = useQuery({ queryKey: ['horses', 'checklist'], queryFn: () => horsesApi.checklists() });

  const requests = (inventory.data?.data || []).flatMap((item) => item.restockRequests || []);
  const rows = [
    {
      key: 'accounts',
      source: users,
      icon: <UserAddOutlined />,
      label: 'Tài khoản đăng ký chờ duyệt',
      count: (users.data?.data || []).filter((u) => u.approvalStatus === 'pending').length,
      to: '/admin/users',
      action: 'Duyệt tài khoản',
      desc: 'Người dùng mới đăng ký cần xét duyệt quyền',
    },
    {
      key: 'restock',
      source: inventory,
      icon: <ShoppingCartOutlined />,
      label: 'Đề xuất vật tư chờ duyệt',
      count: requests.filter((r) => r.status === 'pending').length,
      to: '/inventory',
      action: 'Xem đề xuất',
      desc: 'Yêu cầu nhập thức ăn hoặc vật tư y tế',
    },
    {
      key: 'delivery',
      source: inventory,
      icon: <InboxOutlined />,
      label: 'Hàng đã duyệt, chờ nhận',
      count: requests.filter((r) => r.status === 'approved' && r.awaitingDelivery && !r.receivedAt).length,
      to: '/inventory',
      action: 'Nhận hàng',
      desc: 'Đơn hàng đã về kho cần kiểm đếm và nhập',
    },
    {
      key: 'assignment',
      source: checklists,
      icon: <ApartmentOutlined />,
      label: 'Ngựa thiếu phân công',
      count: (checklists.data?.data || []).filter((r) => r.items.some((i) => ASSIGNMENT_KEYS.includes(i.key) && !i.done)).length,
      to: '/horses',
      action: 'Phân công ngay',
      desc: 'Thiếu chủ ngựa, HLV, bác sĩ hoặc chuồng',
    },
  ].map((r) => ({ ...r, ...sourceState(r.source) }));
  // Only lists that answered are counted; one that failed is "not checked", never "nothing waiting".
  const waiting = rows.reduce((total, r) => total + (r.state === 'ok' || r.state === 'stale' ? r.count : 0), 0);
  const loading = rows.some((r) => r.state === 'loading');
  const failed = [...new Set(rows.filter((r) => r.state === 'error').map((r) => r.source))];
  const stale = [...new Set(rows.filter((r) => r.state === 'stale').map((r) => r.source))];
  // One retry for whatever did not load or went stale; the lists that answered are not asked again.
  const retryAll = () => [...failed, ...stale].forEach((q) => q.refetch());
  const retrying = [...failed, ...stale].some((q) => q.isFetching);
  const summary = loading
    ? 'Đang kiểm tra…'
    : failed.length
      ? `Chưa kiểm tra được ${rows.filter((r) => r.state === 'error').length} mục${waiting ? `, ${waiting} việc chưa xử lý` : ''}`
      : stale.length
        ? `${waiting ? `${waiting} việc chưa xử lý` : 'Không có việc chờ'}, theo số liệu cũ`
        : waiting === 0
          ? 'Tất cả đã được giải quyết'
          : `${waiting} việc chưa xử lý`;

  return (
    <Card
      className="light-surface-box shadow-xs border-[#E5DEC9] rounded-xl overflow-hidden"
      styles={{ body: { padding: 0 }, title: { whiteSpace: 'normal', overflow: 'visible' }, header: { height: 'auto' } }}
      title={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900 text-[15px]">Việc đang chờ bạn</span>
            {waiting > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                {waiting} cần xử lý
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Text type="secondary" className="!text-xs font-normal">
              {summary}
            </Text>
            {(failed.length > 0 || stale.length > 0) && (
              <Button size="small" loading={retrying} onClick={retryAll}>
                Thử lại
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="divide-y divide-[#EFE8DA]">
        {rows.map((r) => {
          // A list that did not load has no count: "—" and "chưa tải được", never 0 and "hoàn tất".
          const unknown = r.state === 'error';
          const hasPending = !unknown && r.count > 0;
          const tone = STATUS_TONES[hasPending ? 'watch' : 'neutral'];
          const note = unknown
            ? 'chưa tải được'
            : r.state === 'stale'
              ? `số lúc ${dayjs(r.updatedAt).format('HH:mm')}`
              : hasPending
                ? 'chờ xử lý'
                : 'hoàn tất';
          return (
            <Link
              key={r.key}
              to={r.to}
              className={`flex items-center justify-between p-4 transition-colors hover:bg-emerald-50/40 group ${hasPending ? 'bg-amber-50/20' : ''}`}
            >
              <div className="flex items-center gap-3.5 min-w-0 pr-4">
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
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
                  {loading || unknown ? '–' : r.count}
                </span>
                <span className="text-[11px] text-slate-600 font-medium block">{note}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
