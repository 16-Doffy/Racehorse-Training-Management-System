import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import CareModal from '../../components/veterinarian/CareModal';
import { Callout, DueChip, EmptyNote, FilterChips, HorseCell, LoadingBlock, SearchBox, VetCard } from '../../components/veterinarian/ui';
import { CARE_KINDS, CARE_ORDER, dueInfo } from '../../components/veterinarian/vetFormat';
import { useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'overdue', label: 'Quá hạn', tone: 'bad', match: (i) => i.key === 'overdue' },
  { value: 'soon', label: 'Trong 7 ngày', tone: 'watch', match: (i) => i.key === 'today' || i.key === 'soon' },
  { value: 'none', label: 'Chưa đặt lịch', match: (i) => i.key === 'none' },
];

/**
 * Routine care for every horse at a glance: one row per horse, one cell per kind of care. A cell
 * opens the same dialog everywhere — record that it was done (which sets the next date) or move it.
 */
export default function MedicalSchedule() {
  const navigate = useNavigate();
  const refresh = useVetRefresh();
  const horsesQ = useVetHorses();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);

  const rows = useMemo(
    () =>
      (horsesQ.data || []).map((horse) => ({
        horse,
        cells: CARE_ORDER.map((kind) => {
          const date = horse.careSchedule?.[CARE_KINDS[kind].field] || null;
          return { kind, date, info: dueInfo(date) };
        }),
      })),
    [horsesQ.data]
  );
  const allCells = rows.flatMap((r) => r.cells);
  const active = FILTERS.find((f) => f.value === filter);
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || r.horse.name?.toLowerCase().includes(q)) && (!active.match || r.cells.some((c) => active.match(c.info))));

  const open = (horse, cell) => setDialog({ horse, kind: cell.kind, mode: cell.info.key === 'none' ? 'due' : 'record' });

  return (
    <div className="vet-ui">
      <PageHeroBanner
        eyebrow="TEAM 8 • Y TẾ & THÚ Y"
        roleLabel="Bác sĩ Thú y"
        title="Lịch chăm sóc định kỳ"
        subtitle="Khám định kỳ, tiêm phòng, tẩy giun và đóng móng — bấm vào một ô để ghi nhận đã làm hoặc dời lịch."
        stats={
          allCells.length
            ? [
                { label: 'Quá hạn', value: allCells.filter((c) => c.info.key === 'overdue').length },
                { label: 'Trong 7 ngày', value: allCells.filter((c) => c.info.key === 'today' || c.info.key === 'soon').length },
              ]
            : []
        }
      />

      <div className="vet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Tìm tên ngựa…" />
        <FilterChips
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ value: f.value, label: f.label, tone: f.tone, count: f.match ? allCells.filter((c) => f.match(c.info)).length : undefined }))}
        />
      </div>

      {horsesQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {horsesQ.error?.message || 'Không tải được lịch chăm sóc.'}
        </Callout>
      )}

      <VetCard flush>
        {horsesQ.isLoading ? (
          <LoadingBlock rows={5} />
        ) : shown.length === 0 ? (
          <EmptyNote icon="bi-calendar2-check" title={filter === 'all' && !q ? 'Chưa có ngựa nào' : 'Không có lịch phù hợp'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="vet-table">
              <thead>
                <tr>
                  <th>Ngựa</th>
                  {CARE_ORDER.map((kind) => (
                    <th key={kind}>
                      <i className={`bi ${CARE_KINDS[kind].icon} me-1`} aria-hidden="true" />
                      {CARE_KINDS[kind].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.horse._id}>
                    <td style={{ minWidth: 200 }}>
                      <button type="button" className="border-0 bg-transparent p-0 text-start" onClick={() => navigate(`/veterinarian/horses/${r.horse._id}?tab=care`)} title="Mở hồ sơ ngựa">
                        <HorseCell horse={r.horse} size={36} />
                      </button>
                    </td>
                    {r.cells.map((cell) => (
                      <td key={cell.kind} style={{ opacity: active.match && !active.match(cell.info) ? 0.4 : 1 }}>
                        <DueChip date={cell.date} onClick={() => open(r.horse, cell)} title={`${CARE_KINDS[cell.kind].label} · ${r.horse.name}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </VetCard>

      {dialog && <CareModal horse={dialog.horse} kind={dialog.kind} initialMode={dialog.mode} onHide={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}
