import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Popconfirm, Space, Tag } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import Stall3D from './stall3d/Stall3D';
import StableMap from './StableMap';
import { STALL_STATES, STALL_TYPE_LABELS, stallState, groupZones } from './stall3d/stallStatus';
import { HEALTH_LABELS, HEALTH_COLORS } from '../../constants/health';

/**
 * The stable map with the barn in 3D beside it: pick a zone and a stall on the map (or click a stall
 * in the scene), its details and — for the Manager — what can be done with it show under the 3D view,
 * which stays pinned while the map scrolls. Other roles get the same view, read only.
 */
export default function StableMapBoard({ stalls, unplaced = [], canManage, onAssign, onEdit, onRemove, onMaintenance, busyId }) {
  const zones = useMemo(() => groupZones(stalls), [stalls]);
  const firstPick = () => stalls.find((s) => s.occupied && s.occupant?.horse) || stalls[0];
  const [code, setCode] = useState(() => firstPick()?.code);
  const selected = stalls.find((s) => s.code === code) || firstPick();
  // A stall that left the map (retired) falls back to the first one with a horse.
  const [zoneKey, setZoneKey] = useState(selected?.zone);
  const zone = zones.find((z) => z.key === (selected?.zone || zoneKey)) || zones[0];

  const viewRef = useRef(null);
  const pick = (nextCode, fromMap = true) => {
    const s = stalls.find((it) => it.code === nextCode);
    if (!s) return;
    setCode(nextCode);
    setZoneKey(s.zone);
    // On a narrow screen the 3D view sits under the map: bring it into view after a tap on the map.
    if (fromMap && window.innerWidth < 1024) viewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const changeZone = (key) => {
    setZoneKey(key);
    const z = zones.find((it) => it.key === key);
    const s = z?.stalls.find((it) => it.occupied && it.occupant?.horse) || z?.stalls[0];
    if (s) setCode(s.code);
  };

  if (!selected) return null;
  const key = stallState(selected);
  const horse = selected.occupant?.horse;

  return (
    <div className="space-y-4">
      {canManage && unplaced.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={`${unplaced.length} ngựa đang ở chuồng ghi tay, chưa có trên sơ đồ`}
          description={
            <div className="text-sm">
              Chọn ngựa để đặt vào một chuồng trên sơ đồ:{' '}
              {unplaced.map((u) => (
                <Button key={u.assignment} size="small" type="link" className="!px-1" onClick={() => onEdit({ assignment: u.assignment, horse: u.horse, caretaker: u.caretaker })}>
                  {u.horse.name} ({u.stableBlock})
                </Button>
              ))}
            </div>
          }
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className="min-w-0">
          <StableMap stalls={stalls} zoneKey={zone?.key} onZoneChange={changeZone} selectedCode={selected.code} onSelect={pick} />
        </div>
        <div className="min-w-0" ref={viewRef}>
          <div className="space-y-3 lg:sticky lg:top-4">
            <Stall3D stalls={zone?.stalls || []} focusCode={selected.code} onSelect={(c) => pick(c, false)} height={360} />
            <Card size="small" className="!rounded-xl !border-[#E2D9C8]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold leading-none tabular-nums">{selected.code}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {selected.zoneName}{selected.zonePurpose ? ` · ${selected.zonePurpose}` : ''}
                  </div>
                </div>
                <Space size={4} wrap>
                  {selected.type !== 'standard' && <Tag color={selected.type === 'isolation' ? 'red' : 'blue'}>{STALL_TYPE_LABELS[selected.type]}</Tag>}
                  <Tag color={STALL_STATES[key].tag}>{STALL_STATES[key].label}</Tag>
                </Space>
              </div>

              <div className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                <span className="text-gray-600">Ngựa</span>
                <span className="min-w-0">
                  {horse ? <Link to={`/horses/${horse._id}`}>{horse.name}</Link> : selected.occupied ? 'Có ngựa (không xem được)' : '—'}
                  {horse?.healthStatus && <Tag color={HEALTH_COLORS[horse.healthStatus]} className="!ml-2">{HEALTH_LABELS[horse.healthStatus]}</Tag>}
                </span>
                <span className="text-gray-600">Chăm sóc</span>
                <span>{selected.occupant?.caretaker?.name || (horse ? 'Chưa gán' : '—')}</span>
                <span className="text-gray-600">Vào chuồng</span>
                <span className="tabular-nums">{selected.occupant?.since ? dayjs(selected.occupant.since).format('DD/MM/YYYY') : '—'}</span>
                {selected.status === 'maintenance' && (
                  <>
                    <span className="text-gray-600">Bảo trì</span>
                    <span>
                      {selected.maintenanceNote || 'Đang sửa chữa'}
                      {selected.maintenanceUntil ? ` · xong dự kiến ${dayjs(selected.maintenanceUntil).format('DD/MM')}` : ''}
                    </span>
                  </>
                )}
              </div>

              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  {selected.status === 'maintenance' && (
                    <Button size="small" loading={busyId === selected._id} onClick={() => onMaintenance(selected, false)}>Mở lại chuồng</Button>
                  )}
                  {selected.status !== 'maintenance' && !selected.occupied && (
                    <>
                      <Button size="small" type="primary" onClick={() => onAssign(selected)}>Xếp ngựa vào chuồng này</Button>
                      <Popconfirm title={`Đặt chuồng ${selected.code} bảo trì?`} description="Không xếp ngựa vào được cho tới khi mở lại." okText="Đặt bảo trì" cancelText="Huỷ" onConfirm={() => onMaintenance(selected, true)}>
                        <Button size="small" loading={busyId === selected._id}>Đặt bảo trì</Button>
                      </Popconfirm>
                    </>
                  )}
                  {selected.occupied && horse && (
                    <>
                      <Button size="small" type="primary" onClick={() => onEdit({ assignment: selected.occupant.assignment, horse, caretaker: selected.occupant.caretaker, stall: selected })}>
                        Đổi chuồng / người chăm sóc
                      </Button>
                      <Popconfirm title={`Gỡ ${horse.name} khỏi chuồng ${selected.code}?`} description="Việc cho ăn hằng ngày sẽ ngừng được tạo tự động." okText="Gỡ" cancelText="Huỷ" onConfirm={() => onRemove(selected.occupant.assignment)}>
                        <Button size="small" danger loading={busyId === selected.occupant.assignment}>Gỡ khỏi chuồng</Button>
                      </Popconfirm>
                    </>
                  )}
                </div>
              ) : (
                <p className="mb-0 mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">Chỉ xem: xếp và đổi chuồng do Quản lý CLB làm.</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
