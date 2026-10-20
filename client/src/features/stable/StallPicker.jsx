import { useState } from 'react';
import { Select } from 'antd';
import { STALL_STATES, STALL_TYPE_LABELS, stallState } from './stall3d/stallStatus';
import { caretakerLoad, isPickable, zoneCaretaker, zonesWithRoom } from './stallPicking';
import './stallPicker.css';

/**
 * The stable map as a picker: the zones as tabs, each zone's stalls as a grid. Empty stalls can be
 * picked; taken ones show who is in them, stalls under maintenance are hatched. The stall the horse
 * stands in now (`horseId`) stays pickable, so a form for a placed horse shows where it is.
 * Used as a form control: `value` is the stall id.
 */
export function StallPicker({ stalls = [], value, onChange, horseId, allowClear = false, id }) {
  const zones = zonesWithRoom(stalls, horseId);
  const picked = stalls.find((s) => s._id === value) || null;
  const [zoneKey, setZoneKey] = useState(null);
  const shown =
    zones.find((z) => z.key === zoneKey) || zones.find((z) => z.key === picked?.zone) || zones.find((z) => z.free > 0) || zones[0];

  if (!shown) {
    return (
      <div className="stall-ui" id={id}>
        <div className="sp-box sp-muted text-sm">Trại chưa có sơ đồ chuồng. Tạo khu ở trang Chuồng trại.</div>
      </div>
    );
  }
  const totalFree = zones.reduce((n, z) => n + z.free, 0);

  return (
    <div className="stall-ui" id={id}>
      <div className="sp-box">
        {zones.length > 1 ? (
          <div className="sp-zones" role="tablist" aria-label="Khu chuồng">
            {zones.map((z) => (
              <button
                key={z.key}
                type="button"
                role="tab"
                aria-selected={z.key === shown.key}
                className={`sp-zone${z.key === shown.key ? ' is-active' : ''}`}
                onClick={() => setZoneKey(z.key)}
              >
                {z.name} <span className="sp-zone-free">· {z.free} trống</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="mb-2 text-xs sp-muted">
          {zones.length === 1 ? `${shown.name} · ` : ''}
          {shown.purpose ? `${shown.purpose} · ` : ''}
          {shown.free}/{shown.stalls.length} chuồng trống
        </div>

        <div className="sp-grid" role="radiogroup" aria-label={`Chuồng trong ${shown.name}`}>
          {shown.stalls.map((s) => {
            const pickable = isPickable(s, horseId);
            const here = pickable && s.occupied;
            const isPicked = s._id === value;
            const maintenance = s.status === 'maintenance';
            const type = s.type && s.type !== 'standard' ? STALL_TYPE_LABELS[s.type] : '';
            const sub = maintenance
              ? 'Bảo trì'
              : here
                ? 'Ngựa đang ở đây'
                : s.occupied
                  ? s.occupant?.horse?.name || 'Có ngựa'
                  : `Trống${type ? ` · ${type.toLowerCase()}` : ''}`;
            return (
              <button
                key={s._id}
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={!pickable}
                className={`sp-stall${isPicked ? ' is-picked' : ''}${maintenance ? ' is-maint' : ''}`}
                style={{ '--sp-dot': s.occupied && !here ? STALL_STATES[stallState(s)].color : 'transparent' }}
                title={maintenance ? s.maintenanceNote || 'Đang bảo trì' : undefined}
                onClick={() => onChange?.(isPicked && allowClear ? undefined : s._id)}
              >
                <div className="sp-stall-code">{s.code}</div>
                <div className="sp-stall-sub">{sub}</div>
              </button>
            );
          })}
        </div>

        <div className="sp-summary">
          {picked ? (
            <span className="sp-ink">
              Đã chọn <b className="tabular-nums">{picked.code}</b>
              <span className="sp-muted">
                {' '}
                · {picked.zoneName}
                {picked.type && picked.type !== 'standard' ? ` · ${STALL_TYPE_LABELS[picked.type]}` : ''}
              </span>
            </span>
          ) : (
            <span className="sp-muted">{totalFree ? 'Bấm một chuồng trống để chọn.' : 'Hết chuồng trống — thêm khu ở trang Chuồng trại.'}</span>
          )}
          {picked && allowClear ? (
            <button type="button" className="sp-link sp-muted text-xs" onClick={() => onChange?.(undefined)}>
              Bỏ chọn
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The groom for a horse, each with how many horses they look after now and where, plus the one who
 * already looks after most of the stall's zone as a one-click suggestion.
 */
export function CaretakerSelect({ grooms = [], stalls = [], unplaced = [], zone, horseId, value, onChange, id }) {
  const load = caretakerLoad(stalls, unplaced, horseId);
  const suggestion = zoneCaretaker(stalls, zone, horseId);
  const options = grooms.map((g) => {
    const mine = load[String(g._id)];
    return { value: g._id, label: g.name, count: mine?.count || 0, zones: [...(mine?.zones || [])] };
  });
  const offer = suggestion && String(suggestion._id) !== String(value || '') && options.some((o) => String(o.value) === suggestion._id);

  return (
    <div className="stall-ui">
      <Select
        id={id}
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder="Chưa gán"
        value={value}
        onChange={onChange}
        options={options}
        notFoundContent="Chưa có nhân viên chăm sóc nào đang hoạt động"
        optionRender={(o) => (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{o.data.label}</span>
            <span className="shrink-0 text-xs opacity-70 tabular-nums">
              {o.data.count ? `${o.data.count} ngựa${o.data.zones.length ? ` · khu ${o.data.zones.join(', ')}` : ''}` : 'chưa có ngựa'}
            </span>
          </div>
        )}
      />
      {offer ? (
        <div className="mt-1.5 text-xs sp-muted">
          Gợi ý:{' '}
          <button type="button" className="sp-link font-semibold sp-ink" onClick={() => onChange?.(suggestion._id)}>
            {suggestion.name}
          </button>{' '}
          đang chăm {suggestion.count} ngựa ở khu này.
        </div>
      ) : null}
    </div>
  );
}
