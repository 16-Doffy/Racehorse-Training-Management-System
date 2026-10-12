import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { horsesApi } from './horsesApi';

const HEALTH = { eligible: 'Đủ điều kiện', monitoring: 'Cần theo dõi', injured: 'Chấn thương', quarantined: 'Cách ly' };
const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

/**
 * Each of the owner's horses at a glance (GET /horses/owner-summary): how it is, what comes next, how
 * it went last, and this year's money. Prize money written by race results is shown apart from what
 * was entered by hand.
 */
export default function OwnerHorseSummary() {
  const { data, isLoading } = useQuery({ queryKey: ['owner-summary'], queryFn: () => horsesApi.ownerSummary() });
  const rows = data?.data || [];
  if (isLoading || !rows.length) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
      {rows.map((r) => (
        <div key={r.horse._id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <Link to={`/horses/${r.horse._id}`} className="text-base font-semibold text-gray-900">
              {r.horse.name}
            </Link>
            <span className={`text-xs px-2 py-0.5 rounded border ${r.health.restricted ? 'bg-amber-50 text-amber-700 border-amber-200' : !r.health.lastExam ? 'bg-gray-50 text-gray-600 border-gray-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {/* The default health status is not an assessment: say so until a vet has examined it. */}
              {r.health.lastExam ? HEALTH[r.health.status] || r.health.status : 'Chưa có hồ sơ khám'} · {r.health.clearance}
            </span>
          </div>
          {r.health.restricted && r.health.reason && <p className="text-xs text-amber-700 m-0">{r.health.reason}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <div className="min-w-0">
              <div className="text-xs text-gray-500">Việc tiếp theo</div>
              <div className="truncate">{r.next ? `${r.next.kind} · ${dayjs(r.next.at).format('DD/MM HH:mm')}` : 'Chưa có buổi tập nào được xếp'}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500">Kết quả gần nhất</div>
              <div className="truncate" title={r.last?.summary}>
                {r.last ? `${r.last.kind} · ${r.last.status === 'aborted' ? 'dừng giữa chừng' : r.last.met === true ? 'đạt' : r.last.met === false ? 'chưa đạt' : 'đã xong'}${r.last.rating ? ` · ${r.last.rating}/10` : ''}` : 'Chưa có buổi tập nào'}
                {r.last?.videoUrl && (
                  <a href={r.last.videoUrl} target="_blank" rel="noreferrer" className="ml-1 text-xs">
                    xem video
                  </a>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500">{!r.upcomingRace && r.lastRace ? 'Giải gần nhất' : 'Giải sắp tới'}</div>
              <div className="truncate">
                {r.upcomingRace
                  ? `${r.upcomingRace.name} · ${dayjs(r.upcomingRace.date).format('DD/MM')} · ${r.upcomingRace.status === 'confirmed' ? 'đã xác nhận tham gia' : 'chờ HLV quyết định'}${r.upcomingRace.reviewNeeded ? ' · đang xem lại' : ''}`
                  : r.lastRace
                    ? `${r.lastRace.name} — ${r.lastRace.result || (r.lastRace.position ? `hạng ${r.lastRace.position}` : 'đã đua')}`
                    : 'Chưa đăng ký giải'}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-gray-500">Thu / chi năm {r.money.year}</div>
              <div className="truncate">
                {r.money.revenue || r.money.cost ? (
                  <>
                    <span className="text-emerald-700">+{vnd(r.money.revenue)}</span> · <span className="text-red-600">−{vnd(r.money.cost)}</span>
                  </>
                ) : (
                  'Chưa có khoản nào'
                )}
              </div>
              {r.money.prize > 0 && <div className="text-xs text-gray-500">trong đó tiền thưởng giải {vnd(r.money.prize)}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
