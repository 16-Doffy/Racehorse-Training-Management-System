import { Card, Empty, Tag, Button } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import Stall3D from './stall3d/Stall3D';
import { stallApi } from './stableApi';
import { STALL_STATES, STALL_TYPE_LABELS, stallState } from './stall3d/stallStatus';

/**
 * The horse's stall on its detail page: the barn of its zone in 3D looking into its stall, the stall
 * code, zone and groom. A horse still on a free-text stall shows that text; one without a stall says
 * so (and the Manager gets the way to the stable map).
 */
export default function HorseStallCard({ horseId, canManage }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['stall-of-horse', horseId],
    queryFn: () => stallApi.forHorse(horseId),
    enabled: Boolean(horseId),
  });
  const info = data?.data || null;
  const stall = info?.stall || null;
  const { data: mapData } = useQuery({ queryKey: ['stalls'], queryFn: () => stallApi.map(), enabled: Boolean(stall) });
  const zoneStalls = stall ? (mapData?.data?.stalls || []).filter((s) => s.zone === stall.zone) : [];
  const shown = zoneStalls.find((s) => s.code === stall?.code) || stall;

  const title = (
    <span>
      Chuồng {stall ? <span className="tabular-nums">{stall.code}</span> : info?.stableBlock ? <span>{info.stableBlock}</span> : null}
    </span>
  );
  return (
    <Card className="!rounded-xl !border-[#E2D9C8]" title={title} loading={isLoading && !data}>
      {isError ? (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-600">
          Chưa tải được thông tin chuồng.
          <Button size="small" onClick={() => refetch()}>Thử lại</Button>
        </div>
      ) : !info ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ngựa chưa được xếp chuồng.">
          {canManage && <Link to="/admin/stables">Mở sơ đồ chuồng để xếp</Link>}
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {stall ? (
            <Stall3D stalls={zoneStalls.length ? zoneStalls : [stall]} focusCode={stall.code} height={320} />
          ) : (
            <div className="light-surface-box grid min-h-[160px] place-items-center rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-600">
              Chuồng ghi tay “{info.stableBlock}”, chưa có trên sơ đồ nên chưa xem được 3D.
              {canManage && <Link to="/admin/stables" className="mt-1 block">Đặt lên sơ đồ chuồng</Link>}
            </div>
          )}
          <div className="grid content-start grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <span className="text-gray-600">Mã chuồng</span>
            <span className="font-semibold tabular-nums">{stall?.code || info.stableBlock}</span>
            {stall && (
              <>
                <span className="text-gray-600">Khu</span>
                <span>{stall.zoneName}{stall.zonePurpose ? ` · ${stall.zonePurpose}` : ''}</span>
                <span className="text-gray-600">Loại</span>
                <span>{STALL_TYPE_LABELS[stall.type] || stall.type}</span>
                <span className="text-gray-600">Trạng thái</span>
                <span><Tag color={STALL_STATES[stallState(shown)].tag}>{STALL_STATES[stallState(shown)].label}</Tag></span>
              </>
            )}
            <span className="text-gray-600">Chăm sóc</span>
            <span>{info.caretaker?.name || 'Chưa gán'}</span>
            <span className="text-gray-600">Vào chuồng</span>
            <span className="tabular-nums">{info.since ? dayjs(info.since).format('DD/MM/YYYY') : '—'}</span>
            {canManage && (
              <Link to="/admin/stables" className="col-span-2 mt-1">Đổi chuồng trên sơ đồ</Link>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
