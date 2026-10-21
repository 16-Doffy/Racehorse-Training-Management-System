import { useMemo, useState } from 'react';
import { Button, Card, Popconfirm, Segmented, Select, Space, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import Stall3D from './stall3d/Stall3D';
import StableMap from './StableMap';
import { STALL_STATES, STALL_TYPE_LABELS, stallState, groupZones } from './stall3d/stallStatus';
import { HEALTH_LABELS, HEALTH_COLORS } from '../../constants/health';
import { modal } from '../../lib/antdStatic';

const idOf = (ref) => String(ref?._id || ref || '');

/**
 * Asks before a groom change that moves horses: their unfinished feeds and care go to the new groom.
 * An empty stall changes hands at once.
 */
function confirmGroomChange({ where, horses, groomName, run }) {
  if (!horses.length) return run();
  return modal.confirm({
    title: groomName ? `Giao ${where} cho ${groomName}?` : `Bỏ người chăm sóc của ${where}?`,
    content: groomName
      ? `${horses.join(', ')} và các việc chưa làm của ngựa (cho ăn, chăm sóc, cho thuốc) sẽ chuyển sang ${groomName}.`
      : `${horses.join(', ')} sẽ không còn người chăm sóc: việc cho ăn hằng ngày không được tự tạo và buổi tập sẽ báo thiếu người chăm sóc.`,
    okText: 'Đồng ý',
    cancelText: 'Huỷ',
    onOk: run,
  });
}

/**
 * The stable map, zone by zone: a bar to pick the zone (and, for the Manager, its groom and the zone's
 * own tools), the barn in 3D large on the left, and beside it the zone as a map to pick a stall from and
 * the picked stall's details with what can be done with it. Clicking a stall in the 3D view picks it too.
 * Other roles get the same view, read only.
 */
export default function StableMapBoard({
  stalls,
  canManage,
  onAssign,
  onEdit,
  onRemove,
  onMaintenance,
  busyId,
  grooms = [],
  onSetCaretaker,
  onEditZone,
  onRetireZone,
  onRetireStall,
}) {
  const zones = useMemo(() => groupZones(stalls), [stalls]);
  const firstPick = () => stalls.find((s) => s.occupied && s.occupant?.horse) || stalls[0];
  const [code, setCode] = useState(() => firstPick()?.code);
  // A stall that left the map (retired) falls back to the first one with a horse.
  const selected = stalls.find((s) => s.code === code) || firstPick();
  const [zoneKey, setZoneKey] = useState(selected?.zone);
  const zone = zones.find((z) => z.key === (selected?.zone || zoneKey)) || zones[0];

  const pick = (nextCode) => {
    const s = stalls.find((it) => it.code === nextCode);
    if (!s) return;
    setCode(nextCode);
    setZoneKey(s.zone);
  };
  const changeZone = (key) => {
    setZoneKey(key);
    const z = zones.find((it) => it.key === key);
    const s = z?.stalls.find((it) => it.occupied && it.occupant?.horse) || z?.stalls[0];
    if (s) setCode(s.code);
  };

  if (!selected || !zone) return null;
  const key = stallState(selected);
  const horse = selected.occupant?.horse;

  // Each stall has its own groom, given stall by stall.
  const groomOptions = grooms.map((g) => ({ value: g._id, label: g.name }));
  const nameOf = (id) => grooms.find((g) => idOf(g) === idOf(id))?.name;
  const zoneHorses = zone.stalls.filter((s) => s.occupied);
  const setStallGroom = (id) =>
    confirmGroomChange({
      where: `chuồng ${selected.code}`,
      horses: horse && idOf(selected.caretaker) !== idOf(id) ? [horse.name] : [],
      groomName: nameOf(id),
      run: () => onSetCaretaker(selected, id || null),
    });

  // Taking the whole zone out of use: only once no horse is left in it.
  const confirmRetireZone = () =>
    modal.confirm({
      title: `Xoá ${zone.name}?`,
      content: `${zone.stalls.length} chuồng (${zone.stalls[0]?.code} … ${zone.stalls[zone.stalls.length - 1]?.code}) rời sơ đồ. Mã chuồng được giữ: tạo lại khu ${zone.key} thì các chuồng này quay lại.`,
      okText: 'Xoá khu',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => onRetireZone(zone),
    });

  return (
    <div className="space-y-3">
      {/* The zone bar: which zone, what it is, and its tools. */}
      <div className="light-surface-box rounded-xl border border-[#E2D9C8] bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
          <div className="min-w-0 max-w-full">
            <Segmented
              value={zone.key}
              onChange={changeZone}
              options={zones.map((z) => ({ value: z.key, label: `${z.name} · ${z.stalls.filter((s) => s.occupied).length}/${z.stalls.length}` }))}
              className="max-w-full overflow-x-auto"
            />
            <div className="mt-1.5 px-0.5 text-xs text-gray-600">
              {zone.purpose ? `${zone.purpose} · ` : ''}
              {zone.stalls.length} chuồng, {zoneHorses.length} có ngựa · mã khu {zone.key}
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              {onEditZone && (
                <Button size="small" icon={<EditOutlined />} onClick={() => onEditZone(zone)}>
                  Sửa khu · thêm / bỏ chuồng
                </Button>
              )}
              {onRetireZone && (
                <Tooltip title={zoneHorses.length ? `Còn ${zoneHorses.length} ngựa trong khu — chuyển ngựa đi trước khi xoá khu` : ''}>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={zoneHorses.length > 0}
                    loading={busyId === `retire:${zone.key}`}
                    onClick={confirmRetireZone}
                  >
                    Xoá khu
                  </Button>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Stall3D stalls={zone.stalls} focusCode={selected.code} onSelect={pick} height="clamp(320px, 62vh, 600px)" />

        <aside className="min-w-0 space-y-3">
          <StableMap stalls={stalls} zoneKey={zone.key} selectedCode={selected.code} onSelect={pick} compact />

          <Card size="small" className="!rounded-xl !border-[#E2D9C8]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-bold leading-none tabular-nums">{selected.code}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {selected.zoneName}
                  {selected.zonePurpose ? ` · ${selected.zonePurpose}` : ''}
                </div>
              </div>
              <Space size={4} wrap>
                {selected.type !== 'standard' && <Tag color={selected.type === 'isolation' ? 'red' : 'blue'}>{STALL_TYPE_LABELS[selected.type]}</Tag>}
                <Tag color={STALL_STATES[key].tag}>{STALL_STATES[key].label}</Tag>
              </Space>
            </div>

            <div className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-gray-600">Ngựa</span>
              <span className="min-w-0">
                {horse ? <Link to={`/horses/${horse._id}`}>{horse.name}</Link> : selected.occupied ? 'Có ngựa (không xem được)' : '—'}
                {horse?.healthStatus && (
                  <Tag color={HEALTH_COLORS[horse.healthStatus]} className="!ml-2">
                    {HEALTH_LABELS[horse.healthStatus]}
                  </Tag>
                )}
              </span>
              <span className="text-gray-600">Chăm sóc</span>
              {canManage && onSetCaretaker && selected.status !== 'maintenance' ? (
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Select
                    size="small"
                    className="w-full max-w-[220px]"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="Chưa có người chăm sóc"
                    value={selected.caretaker?._id && !selected.caretaker.inactive ? selected.caretaker._id : undefined}
                    options={groomOptions}
                    loading={busyId === `stall:${selected._id}`}
                    onChange={setStallGroom}
                    aria-label={`Người chăm sóc chuồng ${selected.code}`}
                  />
                  {selected.caretaker?.inactive && <Tag color="orange">{selected.caretaker.name}: tài khoản đã khóa</Tag>}
                </span>
              ) : (
                <span>{selected.caretaker?.name || selected.occupant?.caretaker?.name || (horse ? 'Chưa gán' : '—')}</span>
              )}
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
                  <Button size="small" loading={busyId === selected._id} onClick={() => onMaintenance(selected, false)}>
                    Mở lại chuồng
                  </Button>
                )}
                {selected.status !== 'maintenance' && !selected.occupied && (
                  <>
                    <Button size="small" type="primary" onClick={() => onAssign(selected)}>
                      Xếp ngựa vào chuồng này
                    </Button>
                    <Popconfirm
                      title={`Đặt chuồng ${selected.code} bảo trì?`}
                      description="Không xếp ngựa vào được cho tới khi mở lại."
                      okText="Đặt bảo trì"
                      cancelText="Huỷ"
                      onConfirm={() => onMaintenance(selected, true)}
                    >
                      <Button size="small" loading={busyId === selected._id}>
                        Đặt bảo trì
                      </Button>
                    </Popconfirm>
                  </>
                )}
                {!selected.occupied && onRetireStall && (
                  <Popconfirm
                    title={`Bỏ chuồng ${selected.code}?`}
                    description="Chuồng rời sơ đồ, mã được giữ lại. Thêm lại chuồng vào khu thì nó quay lại."
                    okText="Bỏ chuồng"
                    okButtonProps={{ danger: true }}
                    cancelText="Huỷ"
                    onConfirm={() => onRetireStall(selected)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === `retire-stall:${selected._id}`}>
                      Bỏ chuồng này
                    </Button>
                  </Popconfirm>
                )}
                {selected.occupied && horse && (
                  <>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => onEdit({ assignment: selected.occupant.assignment, horse, caretaker: selected.occupant.caretaker, stall: selected })}
                    >
                      Đổi chuồng / người chăm sóc
                    </Button>
                    <Popconfirm
                      title={`Gỡ ${horse.name} khỏi chuồng ${selected.code}?`}
                      description="Việc cho ăn hằng ngày sẽ ngừng được tạo tự động."
                      okText="Gỡ"
                      cancelText="Huỷ"
                      onConfirm={() => onRemove(selected.occupant.assignment)}
                    >
                      <Button size="small" danger loading={busyId === selected.occupant.assignment}>
                        Gỡ khỏi chuồng
                      </Button>
                    </Popconfirm>
                  </>
                )}
              </div>
            ) : (
              <p className="mb-0 mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">Chỉ xem: xếp và đổi chuồng do Quản lý CLB làm.</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
