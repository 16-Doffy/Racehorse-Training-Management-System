import { Select, Tooltip } from 'antd';
import { WarningFilled } from '@ant-design/icons';
import { ZONE_KINDS, zoneKind } from './stall3d/stallStatus';

// Zones shown as buttons under the chosen kind; the others are one search away.
const SHOWN_ZONES = 6;

const takenOf = (stalls) => stalls.filter((s) => s.occupied).length;
const wrongOf = (z) => z.stalls.some((s) => s.placement);

/** A thin bar: how full, in the kind's colour. */
function Fill({ taken, total, color }) {
  return (
    <div className="h-1 min-w-6 flex-1 overflow-hidden rounded-full bg-gray-500/20">
      <div className="h-full rounded-full" style={{ width: `${total ? (taken / total) * 100 : 0}%`, background: color }} />
    </div>
  );
}

/**
 * Picking a zone of the stable, as two short rows whatever the number of zones: the stable's three parts
 * (ordinary stalls, isolation, recovery) as tabs with how many zones and how full, then the zones of the
 * part chosen — the first few as buttons, the rest in a searchable list. A zone holding a horse in the
 * wrong part for its health is marked (placement, from the server), on its button and on its part.
 */
export default function ZonePicker({ zones, value, onChange }) {
  const current = zones.find((z) => z.key === value) || zones[0];
  const kind = current ? zoneKind(current) : 'standard';
  const meta = ZONE_KINDS[kind];
  const mine = zones.filter((z) => zoneKind(z) === kind);
  // The zone being looked at stays on a button even when it is one of the many.
  const first = mine.slice(0, SHOWN_ZONES);
  const shown = current && !first.includes(current) ? [...first.slice(0, SHOWN_ZONES - 1), current] : first;
  const rest = mine.filter((z) => !shown.includes(z));

  return (
    <div className="light-surface-box flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2">
      <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Các phần của chuồng trại">
        {Object.entries(ZONE_KINDS).map(([key, k]) => {
          const ofKind = zones.filter((z) => zoneKind(z) === key);
          const stalls = ofKind.flatMap((z) => z.stalls);
          const taken = takenOf(stalls);
          const on = key === kind;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              disabled={!ofKind.length}
              onClick={() => onChange(ofKind[0].key)}
              className={`min-w-0 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                on ? 'bg-gray-50' : 'border-transparent bg-transparent hover:bg-gray-50'
              } ${ofKind.length ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              style={on ? { borderColor: k.color, boxShadow: `inset 0 -2px 0 ${k.color}` } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: k.color }} aria-hidden />
                {/* The short name on a phone, the full one where there is room. */}
                <span className="truncate text-sm font-semibold text-gray-900 sm:hidden">{k.short}</span>
                <span className="hidden truncate text-sm font-semibold text-gray-900 sm:inline">{k.label}</span>
                {ofKind.some(wrongOf) && <WarningFilled className="shrink-0 text-amber-500" aria-label="Có ngựa ở sai khu" />}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                  {ofKind.length ? (
                    <>
                      {ofKind.length} khu<span className="hidden sm:inline"> · {taken}/{stalls.length} chuồng</span>
                    </>
                  ) : (
                    'Chưa có khu'
                  )}
                </span>
                {ofKind.length > 0 && (
                  <span className="hidden flex-1 sm:flex">
                    <Fill taken={taken} total={stalls.length} color={k.color} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-1 pt-2">
        <span className="mr-0.5 text-[11px] text-gray-500">Chọn khu:</span>
        {shown.map((z) => {
          const zTaken = takenOf(z.stalls);
          const on = z.key === current?.key;
          return (
            <button
              key={z.key}
              type="button"
              onClick={() => onChange(z.key)}
              aria-pressed={on}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                on ? 'font-semibold text-white' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
              }`}
              style={on ? { background: meta.color, borderColor: meta.color } : undefined}
            >
              <span className="max-w-[140px] truncate">{z.name}</span>
              <span className={`tabular-nums ${on ? 'text-white/85' : 'text-gray-500'}`}>
                {zTaken}/{z.stalls.length}
              </span>
              {wrongOf(z) && (
                <Tooltip title="Có ngựa đang ở khu không hợp với tình trạng sức khỏe">
                  <WarningFilled className={on ? 'text-amber-200' : 'text-amber-500'} />
                </Tooltip>
              )}
            </button>
          );
        })}
        {rest.length > 0 && (
          <Select
            size="small"
            showSearch
            value={null}
            placeholder={`+${rest.length} khu khác`}
            optionFilterProp="label"
            popupMatchSelectWidth={240}
            className="!w-[150px]"
            aria-label="Chọn khu khác"
            onChange={onChange}
            options={rest.map((z) => ({ value: z.key, label: `${z.name} · ${takenOf(z.stalls)}/${z.stalls.length}${wrongOf(z) ? ' ⚠' : ''}` }))}
          />
        )}
      </div>
    </div>
  );
}
