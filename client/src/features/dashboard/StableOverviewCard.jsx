import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, Grid, Progress, Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { stallApi } from '../stable/stableApi';
import Stall3D from '../stable/stall3d/Stall3D';
import { groupZones } from '../stable/stall3d/stallStatus';

const KIND = { isolation: { label: 'Cách ly', color: 'red' }, recovery: { label: 'Hồi phục', color: 'blue' } };
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
  const used = zones.reduce((n, z) => n + z.used, 0);
  const zone = zones.find((z) => z.key === picked) || zones.find((z) => z.wrong.length) || [...zones].sort((a, b) => b.used - a.used)[0];
  // The whole zone in view, unless a stall was picked or a horse stands in the wrong zone here.
  const focusCode = zone?.stalls.some((s) => s.code === focus) ? focus : zone?.wrong[0]?.code;

  return (
    <Card
      className="shadow-xs border-[#E5DEC9] rounded-xl"
      loading={isLoading}
      styles={{ title: { whiteSpace: 'normal' }, body: { padding: 12 } }}
      title={
        <div className="py-1">
          <span className="font-semibold text-gray-900 text-[15px]">Chuồng trại toàn CLB</span>
          <p className="m-0 mt-0.5 text-xs font-normal text-gray-600 tabular-nums">
            {stalls.length ? `${used}/${stalls.length} chuồng có ngựa, ${zones.length} khu` : 'Chưa có khu chuồng nào'}
          </p>
        </div>
      }
      extra={
        screens.md && (
          <Link to="/admin/stables">
            <Button size="small">Mở sơ đồ chuồng</Button>
          </Link>
        )
      }
    >
      {!stalls.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tạo khu chuồng để xếp ngựa và giao nhân viên chăm sóc." className="!py-6">
          <Link to="/admin/stables">
            <Button type="primary">Tạo khu chuồng</Button>
          </Link>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <Stall3D stalls={zone.stalls} focusCode={focusCode} onSelect={setFocus} height="clamp(300px, 30vw, 420px)" />
          </div>

          <div className="min-w-0 space-y-4 text-sm">
            <section>
              <div className="mb-1 text-xs font-semibold text-gray-500">Các khu (chọn để xem 3D)</div>
              <ul className="m-0 list-none divide-y divide-gray-100 p-0">
                {zones.map((z) => (
                  <li key={z.key}>
                    <button
                      type="button"
                      aria-pressed={z.key === zone.key}
                      onClick={() => setPicked(z.key)}
                      className={`m-0 block w-full cursor-pointer appearance-none rounded-md border-0 px-2 py-1.5 text-left font-inherit focus-visible:outline-2 focus-visible:outline-emerald-700 ${z.key === zone.key ? 'bg-[rgba(46,125,79,0.13)]' : 'bg-transparent hover:bg-[rgba(120,112,90,0.1)]'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
                          {z.name || `Khu ${z.key}`}
                        </span>
                        {z.kind && (
                          <Tag color={KIND[z.kind].color} className="!m-0 shrink-0 !text-[11px]">
                            {KIND[z.kind].label}
                          </Tag>
                        )}
                        {z.wrong.length > 0 && <WarningOutlined className="shrink-0 text-amber-600" aria-label={`${z.wrong.length} ngựa sai khu`} />}
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600">
                          {z.used}/{z.stalls.length}
                        </span>
                      </div>
                      <Progress percent={Math.round((z.used / z.stalls.length) * 100)} showInfo={false} size="small" strokeColor="#2E7D4F" className="!m-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>

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
                <Link to="/admin/stables" className="mt-1 inline-block text-xs">
                  Xếp lại chuồng
                </Link>
              </section>
            )}
            {!screens.md && (
              <Link to="/admin/stables" className="block text-xs">
                Mở sơ đồ chuồng
              </Link>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
