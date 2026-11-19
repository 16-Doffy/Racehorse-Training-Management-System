import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import CareModal from '../../components/veterinarian/CareModal';
import { Callout, EmptyNote, HorseAvatar, HorseCell, LoadingBlock, PageHead, SearchBox, StatTiles, VetCard } from '../../components/veterinarian/ui';
import { CARE_KINDS, CARE_ORDER, dueInfo, fmtShort } from '../../components/veterinarian/vetFormat';
import { useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
// What each tile picks out of the care dates.
const TILES = {
  overdue: { label: 'Quá hạn', match: (i) => i.key === 'overdue' },
  soon: { label: 'Trong 7 ngày tới', match: (i) => i.key === 'today' || i.key === 'soon' },
  month: { label: 'Trong 30 ngày tới', match: (i) => i.key === 'later' && i.days <= 30 },
  none: { label: 'Chưa đặt lịch', match: (i) => i.key === 'none' },
};
const SOON = (i) => TILES.overdue.match(i) || TILES.soon.match(i);

/**
 * Routine care for every horse, in two parts. On top, what is due soon as a list by date — overdue first —
 * each with its one action: examine the horse (an exam is done by filing one), or record that the vaccination,
 * deworming or farrier work was done; or move the date. Below, every horse against the four kinds of care,
 * to see and set any date. Tiles count each set and filter both.
 */
export default function MedicalSchedule() {
  const navigate = useNavigate();
  const refresh = useVetRefresh();
  const horsesQ = useVetHorses();
  const [tile, setTile] = useState(null);
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
  const count = (key) => allCells.filter((c) => TILES[key].match(c.info)).length;
  const match = tile ? TILES[tile].match : null;
  const q = query.trim().toLowerCase();
  const byName = (r) => !q || r.horse.name?.toLowerCase().includes(q);
  const shown = rows.filter((r) => byName(r) && (!match || r.cells.some((c) => match(c.info))));

  // The list on top: what the tile picks (else overdue and the coming week), earliest first.
  const agendaMatch = tile && tile !== 'none' ? match : SOON;
  const agenda = rows
    .filter(byName)
    .flatMap((r) => r.cells.filter((c) => agendaMatch(c.info)).map((c) => ({ ...c, horse: r.horse })))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const open = (horse, cell, mode) => setDialog({ horse, kind: cell.kind, mode: mode || (cell.info.key === 'none' ? 'due' : 'record') });

  return (
    <div className="vet-ui">
      <PageHead
        title="Lịch chăm sóc định kỳ"
        subtitle="Khám định kỳ, tiêm phòng, tẩy giun, đóng móng của từng ngựa. Phía trên là việc sắp tới hạn; bảng phía dưới để xem và đặt lịch cho mọi ngựa."
      />

      {!horsesQ.isLoading && (
        <StatTiles
          value={tile}
          onChange={setTile}
          items={[
            { key: 'overdue', label: 'Quá hạn', value: count('overdue'), icon: 'bi-exclamation-octagon', tone: count('overdue') ? 'bad' : 'neutral', hint: 'Đã qua ngày hẹn, chưa làm' },
            { key: 'soon', label: '7 ngày tới', value: count('soon'), icon: 'bi-alarm', tone: count('soon') ? 'watch' : 'neutral', hint: 'Cần chuẩn bị' },
            { key: 'month', label: '30 ngày tới', value: count('month'), icon: 'bi-calendar-week', tone: 'info', hint: 'Đã có lịch' },
            { key: 'none', label: 'Chưa đặt lịch', value: count('none'), icon: 'bi-calendar-plus', tone: 'neutral', hint: 'Bấm ô trong bảng để đặt' },
          ]}
        />
      )}

      {horsesQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {horsesQ.error?.message || 'Không tải được lịch chăm sóc.'}
        </Callout>
      )}

      {horsesQ.isLoading ? (
        <LoadingBlock rows={5} />
      ) : (
        <>
          {/* ---------- What is due soon, by date ---------- */}
          {tile !== 'none' && (
            <VetCard
              title={tile ? TILES[tile].label : 'Việc cần làm sớm'}
              icon="bi-list-check"
              count={agenda.length}
              extra={!tile && <span className="vet-small vet-faint">Quá hạn và trong 7 ngày tới</span>}
              flush
              className="mb-3"
            >
              {agenda.length === 0 ? (
                <EmptyNote icon="bi-check2-circle" title={tile ? 'Không có lịch nào' : 'Không có việc nào quá hạn hay trong 7 ngày tới'} />
              ) : (
                <div className="vet-agenda">
                  {agenda.map((a) => {
                    const meta = CARE_KINDS[a.kind];
                    const d = new Date(a.date);
                    return (
                      <div key={`${a.horse._id}-${a.kind}`} className={`vet-agenda-row is-${a.info.tone}`}>
                        <div className={`vet-agenda-date vet-tone-${a.info.tone}`}>
                          <span className="vet-agenda-day">{fmtShort(a.date)}</span>
                          <span className="vet-agenda-wd">{WEEKDAY[d.getDay()]}</span>
                        </div>
                        <div className="vet-agenda-main">
                          <div className="vet-agenda-what">
                            <i className={`bi ${meta.icon}`} aria-hidden="true" /> {meta.label}
                          </div>
                          <button type="button" className="vet-agenda-horse" onClick={() => navigate(`/veterinarian/horses/${a.horse._id}?tab=care`)} title="Mở hồ sơ ngựa">
                            <HorseAvatar horse={a.horse} size={22} /> {a.horse.name}
                          </button>
                        </div>
                        <span className={`vet-agenda-when vet-text-${a.info.tone}`}>{a.info.rel}</span>
                        <div className="vet-agenda-actions">
                          {a.kind === 'exam' ? (
                            <Button size="sm" variant="vet" onClick={() => navigate(`/veterinarian/examinations/new/${a.horse._id}`)}>
                              <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Khám ngay
                            </Button>
                          ) : (
                            <Button size="sm" variant="vet" onClick={() => open(a.horse, a, 'record')}>
                              <i className="bi bi-check2" aria-hidden="true" /> Ghi nhận đã làm
                            </Button>
                          )}
                          <Button size="sm" variant="vet-outline" onClick={() => open(a.horse, a, 'due')}>
                            Dời lịch
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </VetCard>
          )}

          {/* ---------- Every horse against the four kinds of care ---------- */}
          <VetCard
            title="Tổng quan theo ngựa"
            icon="bi-grid-3x3-gap"
            flush
            extra={<SearchBox value={query} onChange={setQuery} placeholder="Tìm tên ngựa…" />}
          >
            <div className="vet-care-legend">
              <span>
                <span className="vet-care-swatch vet-tone-bad" /> Quá hạn
              </span>
              <span>
                <span className="vet-care-swatch vet-tone-watch" /> Trong 7 ngày
              </span>
              <span>
                <span className="vet-care-swatch vet-tone-good" /> Còn xa
              </span>
              <span className="vet-faint">Bấm một ô để ghi nhận đã làm, đặt hoặc dời lịch.</span>
            </div>
            {shown.length === 0 ? (
              <EmptyNote icon="bi-calendar2-check" title={!tile && !q ? 'Chưa có ngựa nào' : 'Không có ngựa phù hợp'} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="vet-table vet-care-table">
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
                            <HorseCell horse={r.horse} size={34} />
                          </button>
                        </td>
                        {r.cells.map((cell) => {
                          const dim = match && !match(cell.info);
                          const label = `${CARE_KINDS[cell.kind].label} · ${r.horse.name}`;
                          return (
                            <td key={cell.kind} style={{ opacity: dim ? 0.35 : 1 }}>
                              {cell.info.key === 'none' ? (
                                <button type="button" className="vet-care-add" onClick={() => open(r.horse, cell)} title={`Đặt lịch: ${label}`}>
                                  <i className="bi bi-plus" aria-hidden="true" /> Đặt lịch
                                </button>
                              ) : (
                                <button type="button" className={`vet-care-date vet-tone-${cell.info.tone}`} onClick={() => open(r.horse, cell)} title={label}>
                                  <span className="vet-tnum">{fmtShort(cell.date)}</span>
                                  <span className="vet-care-rel">{cell.info.rel}</span>
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </VetCard>
        </>
      )}

      {dialog && <CareModal horse={dialog.horse} kind={dialog.kind} initialMode={dialog.mode} onHide={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}
