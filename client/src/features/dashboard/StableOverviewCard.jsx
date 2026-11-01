import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, Grid } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { stallApi } from '../stable/stableApi';
import Stall3D from '../stable/stall3d/Stall3D';
import { STALL_TYPE_LABELS, ZONE_KINDS, groupZones } from '../stable/stall3d/stallStatus';

const kindOf = (zone) => (zone.stalls.every((s) => s.type === 'isolation') ? 'isolation' : zone.stalls.every((s) => s.type === 'recovery') ? 'recovery' : null);

/**
 * The Manager's stable at a glance: one zone in 3D (the barn of stallScene.js, a horse in its coat in
 * each taken stall, the lamp in its health), every zone beside it with how full it is, and the horses
 * standing in the wrong zone for their health (a quarantined horse outside isolation, …) with the way
 * to move them. A zone with a horse in the wrong place is shown first.
 */
export default function StableOverviewCard() {
  const screens = Grid.useBreakpoint();
  const { data, isLoading } = useQuery({ queryKey: ['stalls'], queryFn: () => stallApi.map() });
  const [picked, setPicked] = useState(null);
  const [focus, setFocus] = useState(null);

  const stalls = data?.data?.stalls || [];
  const zones = groupZones(stalls).map((z) => ({
    ...z,
    kind: kindOf(z),
    used: z.stalls.filter((s) => s.occupied).length,
    wrong: z.stalls.filter((s) => s.placement && s.occupant?.horse),
  }));
  const wrong = zones.flatMap((z) => z.wrong);
  // Moved by the system as soon as a stall of the kind comes free (server: healthPlacement.service.js).
  const waiting = data?.data?.waiting || [];
  const reserved = stalls.filter((s) => s.reservedFor).length;
  const used = zones.reduce((n, z) => n + z.used, 0);
  const zone = zones.find((z) => z.key === picked) || zones.find((z) => z.wrong.length) || [...zones].sort((a, b) => b.used - a.used)[0];
  // The whole zone in view, unless a stall was picked or a horse stands in the wrong zone here.
  const focusCode = zone?.stalls.some((s) => s.code === focus) ? focus : zone?.wrong[0]?.code;

  const notes = (wrong.length > 0 || waiting.length > 0) && (
    <div className="grid gap-4 border-t border-gray-100 p-4 text-sm sm:grid-cols-2">
      {wrong.length > 0 && (
        <section>
          <div className="mb-1 text-xs font-semibold text-amber-700">Sai khu theo sức khỏe</div>
          <ul className="m-0 list-none space-y-1.5 p-0">
            {wrong.map((s) => (
              <li key={s._id} className="text-xs">
                <span className="font-semibold text-gray-900">{s.occupant.horse.name}</span>
                <span className="text-gray-500"> ở {s.code}: </span>
                <span className="text-gray-600">{s.placement.message}</span>
              </li>
            ))}
          </ul>
          <Link to="/admin/stables" className="mt-1 inline-block text-xs">Xếp lại chuồng</Link>
        </section>
      )}
      {waiting.length > 0 && (
        <section>
          <div className="mb-1 text-xs font-semibold text-amber-700">Chờ chuồng trống</div>
          <ul className="m-0 list-none space-y-1.5 p-0">
            {waiting.map((w) => (
              <li key={w.horse._id} className="text-xs">
                <span className="font-semibold text-gray-900">{w.horse.name}</span>
                <span className="text-gray-600">
                  {' '}
                  đang ở {w.now}, cần chuồng {(STALL_TYPE_LABELS[w.wants] || w.wants).toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-1 text-xs text-gray-500">Có chỗ là hệ thống tự chuyển; cần gấp thì thêm chuồng hoặc chuyển ngựa khác đi.</p>
        </section>
      )}
    </div>
  );

  return (
    <Card
      className="!overflow-hidden"
      loading={isLoading}
      styles={{ body: { padding: 0 }, title: { whiteSpace: 'normal' } }}
      title={
        <span>
          <span>Chuồng trại toàn CLB</span>
          <span className="ml-2 text-xs font-normal tabular-nums text-gray-500">
            {stalls.length ? `${used}/${stalls.length} chuồng có ngựa, ${zones.length} khu${reserved ? `, ${reserved} giữ chỗ` : ''}` : 'chưa có khu chuồng nào'}
          </span>
        </span>
      }
      extra={screens.md && <Link to="/admin/stables"><Button size="small">Mở sơ đồ chuồng</Button></Link>}
    >
      {!stalls.length ? (
        <Empty className="!py-8" image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tạo khu chuồng để xếp ngựa và giao nhân viên chăm sóc.">
          <Link to="/admin/stables">
            <Button type="primary">Tạo khu chuồng</Button>
          </Link>
        </Empty>
      ) : (
        <>
          <Stall3D stalls={zone.stalls} focusCode={focusCode} onSelect={setFocus} height={screens.md ? 'clamp(360px, 54vh, 580px)' : '280px'} />
          <div className="flex flex-wrap items-center gap-1.5 p-3">
            {zones.map((z) => {
              const meta = ZONE_KINDS[z.kind || 'standard'];
              return (
                <button
                  key={z.key}
                  type="button"
                  aria-pressed={z.key === zone.key}
                  onClick={() => setPicked(z.key)}
                  className={`st-zone-chip inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${z.key === zone.key ? 'font-semibold' : ''}`}
                  style={{ '--zone': meta.color, '--zone-soft': meta.soft }}
                >
                  <span className="max-w-[140px] truncate">{z.name || `Khu ${z.key}`}</span>
                  <span className="tabular-nums opacity-80">{z.used}/{z.stalls.length}</span>
                  {z.wrong.length > 0 && <WarningOutlined aria-label={`${z.wrong.length} ngựa sai khu`} />}
                </button>
              );
            })}
          </div>
        </>
      )}
      {notes}
    </Card>
  );
}
