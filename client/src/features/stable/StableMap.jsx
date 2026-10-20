import { Segmented } from 'antd';
import { STALL_STATES, stallState, groupZones } from './stall3d/stallStatus';

const tileLabel = (s) => {
  if (s.status === 'maintenance') return 'Đang bảo trì';
  if (!s.occupied) return 'Trống';
  return s.occupant?.horse?.name || 'Có ngựa';
};

const LEGEND = ['ok', 'watch', 'bad', 'taken', 'empty', 'maint'];

/**
 * The stable map: one zone at a time (tabs), its stalls in two rows facing the aisle as in the barn.
 * The dot is the stall's state; a horse the viewer may not see shows as "Có ngựa". Light boxes are
 * marked light-surface-box so the dark canvas turns them dark.
 *
 * `compact`: the zone's stalls only, smaller, for beside the 3D view — the page shows the zone tabs.
 */
export default function StableMap({ stalls, zoneKey, onZoneChange, selectedCode, onSelect, compact = false }) {
  const zones = groupZones(stalls);
  const zone = zones.find((z) => z.key === zoneKey) || zones[0];
  if (!zone) return null;
  const items = zone.stalls;
  const perRow = items.length > 2 ? Math.ceil(items.length / 2) : items.length;
  const rows = items.length > 2 ? [items.slice(0, perRow), items.slice(perRow)] : [items];
  const taken = items.filter((s) => s.occupied).length;

  const tile = (s) => {
    const key = stallState(s);
    const state = STALL_STATES[key];
    const selected = s.code === selectedCode;
    return (
      <button
        key={s._id}
        type="button"
        onClick={() => onSelect(s.code)}
        aria-pressed={selected}
        title={`${s.code} · ${tileLabel(s)} · ${state.label}`}
        className={[
          'relative min-w-0 overflow-hidden rounded-lg border text-left transition cursor-pointer',
          compact ? 'py-1.5 pl-3 pr-2' : 'px-2.5 py-2',
          key === 'empty' ? 'border-dashed border-gray-300 bg-transparent' : 'border-gray-200 bg-white',
          key === 'maint' ? 'bg-[repeating-linear-gradient(135deg,rgba(26,43,34,0.07)_0_6px,transparent_6px_12px)]' : '',
          selected ? 'ring-2 ring-[#D4AF37] border-[#D4AF37]' : 'hover:border-[#D4AF37]/60',
        ].join(' ')}
      >
        {compact && <span className="absolute inset-y-0 left-0 w-1" style={{ background: state.color }} aria-hidden="true" />}
        <div className={`${compact ? 'text-[13px]' : 'text-sm'} font-semibold text-gray-800 tabular-nums`}>{s.code}</div>
        <div className={`truncate ${compact ? 'text-xs' : 'text-[13px]'} ${s.occupied ? 'text-gray-700' : 'text-gray-500'}`}>{tileLabel(s)}</div>
        {!compact && (
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: state.color }} />
            <span className="truncate">{state.label}</span>
          </div>
        )}
      </button>
    );
  };

  const columns = Math.min(perRow, 4);
  const grid = (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i}>
          {i === 1 && <div className="my-2 border-y border-dashed border-gray-200 py-1 text-center text-[11px] tracking-[0.12em] text-gray-500">LỐI ĐI</div>}
          <div className={`grid ${compact ? 'gap-1.5' : 'gap-2'}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {row.map(tile)}
          </div>
        </div>
      ))}
    </div>
  );
  const legend = (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 ${compact ? 'text-[10.5px]' : 'text-[11px]'} text-gray-600`}>
      {LEGEND.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: STALL_STATES[k].color }} />
          {STALL_STATES[k].label}
        </span>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="light-surface-box rounded-xl border border-[#E2D9C8] bg-white p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-gray-800">Sơ đồ {zone.name}</div>
          <div className="text-[11px] text-gray-500">Bấm chuồng để xem</div>
        </div>
        {grid}
        <div className="mt-2.5 border-t border-gray-100 pt-2">{legend}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Segmented
        value={zone.key}
        onChange={onZoneChange}
        options={zones.map((z) => ({ value: z.key, label: `${z.name} · ${z.stalls.filter((s) => s.occupied).length}/${z.stalls.length}` }))}
        className="max-w-full overflow-x-auto"
      />
      <div className="light-surface-box rounded-xl border border-gray-200 bg-white p-3.5">
        <div className="mb-2.5">
          <div className="font-semibold text-gray-800">{zone.name}</div>
          <div className="text-xs text-gray-600">
            {zone.purpose ? `${zone.purpose} · ` : ''}
            {items.length} chuồng, {taken} có ngựa
          </div>
        </div>
        {grid}
      </div>
      {legend}
    </div>
  );
}
