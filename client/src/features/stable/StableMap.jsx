import { Segmented } from 'antd';
import { STALL_STATES, stallState, groupZones } from './stall3d/stallStatus';

const tileLabel = (s) => {
  if (s.status === 'maintenance') return 'Đang bảo trì';
  if (!s.occupied) return 'Trống';
  return s.occupant?.horse?.name || 'Có ngựa';
};

/**
 * The stable map: one zone at a time (tabs), its stalls in two rows facing the aisle as in the barn.
 * The dot is the stall's state; a horse the viewer may not see shows as "Có ngựa". Light boxes are
 * marked light-surface-box so the dark canvas turns them dark.
 */
export default function StableMap({ stalls, zoneKey, onZoneChange, selectedCode, onSelect }) {
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
        className={[
          'min-w-0 rounded-lg border px-2.5 py-2 text-left transition cursor-pointer',
          key === 'empty' ? 'border-dashed border-gray-300 bg-transparent' : 'border-gray-200 bg-white',
          key === 'maint' ? 'bg-[repeating-linear-gradient(135deg,rgba(26,43,34,0.07)_0_6px,transparent_6px_12px)]' : '',
          selected ? 'ring-2 ring-[#D4AF37] border-[#D4AF37]' : 'hover:border-[#D4AF37]/60',
        ].join(' ')}
      >
        <div className="text-sm font-semibold text-gray-800 tabular-nums">{s.code}</div>
        <div className="truncate text-[13px] text-gray-700">{tileLabel(s)}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: state.color }} />
          <span className="truncate">{state.label}</span>
        </div>
      </button>
    );
  };

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
            {zone.purpose ? `${zone.purpose} · ` : ''}{items.length} chuồng, {taken} có ngựa
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i}>
              {i === 1 && <div className="my-2 border-y border-dashed border-gray-200 py-1 text-center text-[11px] tracking-[0.12em] text-gray-500">LỐI ĐI</div>}
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(perRow, 4)}, minmax(0, 1fr))` }}>
                {row.map(tile)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
        {['ok', 'watch', 'bad', 'taken', 'empty', 'maint'].map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: STALL_STATES[k].color }} />
            {STALL_STATES[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}
