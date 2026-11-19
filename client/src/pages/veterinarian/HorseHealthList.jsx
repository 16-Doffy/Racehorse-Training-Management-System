import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { Callout, EmptyNote, FilterChips, HealthPill, HorseCell, LoadingBlock, SearchBox, VetCard } from '../../components/veterinarian/ui';
import { LEVEL_META, clearanceOf, daysUntil, fmtShort, idOf, isActiveInjury } from '../../components/veterinarian/vetFormat';
import { useClearances, useExamRequests, useIncidents, useInjuries, useTreatments, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'attention', label: 'Cần khám ngay', tone: 'bad' },
  { value: 'restricted', label: 'Hạn chế tập', tone: 'watch' },
  { value: 'injured', label: 'Chấn thương', tone: 'bad' },
  { value: 'quarantined', label: 'Cách ly', tone: 'quar' },
  { value: 'eligible', label: 'Đủ điều kiện', tone: 'good' },
];
const DEFAULT_CLEARANCE_DAYS = 14;

/** ?filter=… (and the old ?lock=locked link) picks the starting filter. */
function initialFilter(params) {
  if (params.get('lock') === 'locked') return 'restricted';
  const f = params.get('filter');
  return FILTERS.some((x) => x.value === f) ? f : 'all';
}

/** May the horse train, in plain words: not at all (injured, isolated or locked), only lighter work, or as usual. */
function trainingOf(r) {
  const sick = ['injured', 'quarantined'].includes(r.horse.healthStatus);
  if (sick || r.clearance.level === 'none') {
    return { tone: 'bad', icon: 'bi-lock-fill', text: 'Không được tập', title: r.clearance.reason || (sick ? 'Ngựa chấn thương / cách ly không tập cho tới khi bác sĩ cho tập lại.' : undefined) };
  }
  if (r.clearance.restricted) return { tone: 'watch', icon: 'bi-exclamation-triangle-fill', text: LEVEL_META[r.clearance.level]?.label || 'Hạn chế tập', title: r.clearance.reason || undefined };
  return { tone: 'faint', icon: 'bi-check2', text: 'Tập bình thường' };
}

/** The horse's health certificate: its last exam, valid this many days — still valid, about to lapse, lapsed, or none. */
function examOf(r) {
  if (!r.exam) return null;
  if (r.exam.status === 'never' || !r.exam.lastExam) return { tone: 'bad', chip: 'Chưa có', sub: 'Ngựa chưa được khám lần nào' };
  const left = daysUntil(r.exam.validUntil);
  const sub = `Khám ${fmtShort(r.exam.lastExam.date)} · hiệu lực tới ${fmtShort(r.exam.validUntil)}`;
  if (r.exam.status === 'expired') return { tone: 'bad', chip: `Hết hạn ${Math.max(1, -left)} ngày`, sub };
  if (r.exam.status === 'due_soon') return { tone: 'watch', chip: left > 0 ? `Còn ${left} ngày` : 'Hết hạn hôm nay', sub };
  return { tone: 'good', chip: `Còn ${left} ngày`, sub };
}

/**
 * What the vet has to do for a horse, and why, in words on the row — the button says the job, the line beside
 * it the reason. `now`: to be done now (a request or an incident waiting, never examined, the certificate
 * lapsed); those rows come first, with a filled button and a red edge. `rank` orders the list.
 */
function nextStep(r) {
  const followUp = r.injuries > 0 || r.ongoing > 0;
  const waiting = [r.requests > 0 && (r.urgent > 0 ? `${r.urgent} yêu cầu KHẨN` : `${r.requests} yêu cầu khám`), r.incidents > 0 && `${r.incidents} sự cố`].filter(Boolean);
  if (r.requests > 0) return { now: true, rank: r.urgent > 0 ? 0 : 1, tone: 'bad', icon: 'bi-megaphone-fill', label: 'Khám theo yêu cầu', reason: `Có ${waiting.join(', ')} đang chờ` };
  if (r.incidents > 0) return { now: true, rank: 1, tone: 'bad', icon: 'bi-exclamation-octagon-fill', label: 'Khám sự cố', reason: `Có ${waiting.join(', ')} chưa xử lý` };
  if (r.exam?.status === 'never') return { now: true, rank: 2, tone: 'bad', icon: 'bi-clipboard2-plus', label: 'Khám lần đầu', reason: 'Chưa khám lần nào' };
  if (r.exam?.status === 'expired') return { now: true, rank: 2, tone: 'bad', icon: 'bi-calendar-x', label: followUp ? 'Tái khám' : 'Khám lại', reason: 'Giấy khám đã hết hạn' };
  if (r.exam?.status === 'due_soon') return { now: false, rank: 3, tone: 'watch', icon: 'bi-hourglass-split', label: followUp ? 'Tái khám' : 'Khám', reason: 'Giấy khám sắp hết hạn' };
  if (followUp) return { now: false, rank: 4, tone: 'info', icon: 'bi-arrow-repeat', label: 'Tái khám', reason: 'Đang điều trị' };
  return { now: false, rank: 5, tone: 'faint', icon: null, label: 'Khám', reason: 'Không có việc gấp' };
}

export default function HorseHealthList() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refresh = useVetRefresh();
  const horsesQ = useVetHorses();
  const clearancesQ = useClearances();
  const injuriesQ = useInjuries();
  const requestsQ = useExamRequests();
  const incidentsQ = useIncidents();
  const treatmentsQ = useTreatments();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(() => initialFilter(params));

  const rows = useMemo(() => {
    const count = (list, pick) =>
      (list || []).reduce((acc, x) => {
        const id = pick(x);
        if (id) acc.set(id, (acc.get(id) || 0) + 1);
        return acc;
      }, new Map());
    const injuries = count((injuriesQ.data || []).filter(isActiveInjury), (m) => idOf(m.horse));
    const requests = count(requestsQ.data, (r) => idOf(r.horse));
    const urgent = count((requestsQ.data || []).filter((r) => r.priority === 'urgent'), (r) => idOf(r.horse));
    const incidents = count(incidentsQ.data, (t) => idOf(t.horse));
    const ongoing = count((treatmentsQ.data || []).filter((t) => t.status === 'ongoing'), (t) => idOf(t.horse));
    const exams = new Map((clearancesQ.data || []).map((c) => [idOf(c.horse), c]));
    return (horsesQ.data || [])
      .map((horse) => {
        const r = {
          horse,
          clearance: clearanceOf(horse),
          exam: exams.get(horse._id),
          injuries: injuries.get(horse._id) || 0,
          requests: requests.get(horse._id) || 0,
          urgent: urgent.get(horse._id) || 0,
          incidents: incidents.get(horse._id) || 0,
          ongoing: ongoing.get(horse._id) || 0,
        };
        r.next = nextStep(r);
        r.attention = r.next.now;
        return r;
      })
      // Most pressing first; the same rank keeps the stable's own order.
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.next.rank - b.r.next.rank || a.i - b.i)
      .map(({ r }) => r);
  }, [horsesQ.data, clearancesQ.data, injuriesQ.data, requestsQ.data, incidentsQ.data, treatmentsQ.data]);

  const matches = {
    all: () => true,
    attention: (r) => r.attention,
    restricted: (r) => r.clearance.restricted,
    injured: (r) => r.injuries > 0 || r.horse.healthStatus === 'injured',
    quarantined: (r) => r.horse.healthStatus === 'quarantined',
    eligible: (r) => r.horse.healthStatus === 'eligible' && !r.clearance.restricted,
  };
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => matches[filter](r) && (!q || [r.horse.name, r.horse.breed, r.horse.owner?.name].some((s) => s?.toLowerCase().includes(q))));
  const chipOptions = FILTERS.map((f) => ({ ...f, count: rows.filter(matches[f.value]).length })).filter((f) => f.value === 'all' || f.value === filter || f.count > 0);
  const clearanceDays = (clearancesQ.data || [])[0]?.clearanceDays || DEFAULT_CLEARANCE_DAYS;

  return (
    <div className="vet-ui">
      <PageHeroBanner
        eyebrow="TEAM 8 • Y TẾ & THÚ Y"
        roleLabel="Bác sĩ Thú y"
        title="Ngựa & hồ sơ sức khỏe"
        subtitle="Chọn một ngựa để khám, kê đơn, ghi chấn thương hoặc đổi mức tập."
      />

      <div className="vet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Tìm tên ngựa, giống, chủ sở hữu…" />
        <FilterChips value={filter} onChange={setFilter} options={chipOptions} />
        <Button size="sm" variant="vet-ghost" className="vet-icon-btn ms-auto" onClick={refresh} title="Làm mới" aria-label="Làm mới">
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
        </Button>
      </div>

      {horsesQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {horsesQ.error?.message || 'Không tải được danh sách ngựa.'}
        </Callout>
      )}

      <VetCard flush>
        {horsesQ.isLoading ? (
          <LoadingBlock rows={5} />
        ) : shown.length === 0 ? (
          <EmptyNote
            icon="bi-search"
            title={rows.length ? 'Không có ngựa phù hợp' : 'Bạn chưa phụ trách ngựa nào'}
            action={
              rows.length > 0 && (
                <Button
                  size="sm"
                  variant="vet-outline"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Xem tất cả
                </Button>
              )
            }
          >
            {rows.length ? 'Thử bỏ bộ lọc hoặc từ khóa.' : 'Quản lý phân công ngựa cho bác sĩ ở Danh mục Ngựa.'}
          </EmptyNote>
        ) : (
          <>
            {/* What the columns mean, once, in a line. */}
            <div className="vet-table-legend">
              <span>
                <i className="bi bi-info-circle" aria-hidden="true" /> <strong>Giấy khám</strong> = lần khám gần nhất, có hiệu lực {clearanceDays} ngày. Hết hạn thì buổi tập nặng và chạy thử bị cảnh báo.
              </span>
              <span>
                <span className="vet-legend-edge" aria-hidden="true" /> Vạch đỏ đầu dòng: ngựa cần khám ngay.
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="vet-table vet-horse-table">
                <thead>
                  <tr>
                    <th>Ngựa</th>
                    <th title="Kết luận của lần khám gần nhất, và ngựa có được tập không">Sức khỏe</th>
                    <th className="vet-hide-md" title={`Lần khám gần nhất, có hiệu lực ${clearanceDays} ngày`}>
                      Giấy khám
                    </th>
                    <th className="vet-hide-md" title="Chấn thương chưa khỏi và đơn thuốc đang dùng">
                      Đang điều trị
                    </th>
                    <th className="text-end">Việc cần làm</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const open = () => navigate(`/veterinarian/horses/${r.horse._id}`);
                    const training = trainingOf(r);
                    const exam = examOf(r);
                    return (
                      <tr key={r.horse._id} className={`is-clickable${r.attention ? ' is-attention' : ''}`} onClick={open}>
                        <td style={{ minWidth: 220 }}>
                          <HorseCell horse={r.horse} />
                        </td>

                        {/* Its health, and in words whether it may train. */}
                        <td>
                          <div className="vet-cell-stack">
                            <HealthPill status={r.horse.healthStatus} />
                            <span className={`vet-cell-sub vet-text-${training.tone}`} title={training.title}>
                              <i className={`bi ${training.icon}`} aria-hidden="true" /> {training.text}
                            </span>
                          </div>
                        </td>

                        {/* The certificate: how long it is still good for (or since when it lapsed), and its dates. */}
                        <td className="vet-hide-md">
                          {exam ? (
                            <div className="vet-cell-stack">
                              <span className={`vet-exam-chip vet-tone-${exam.tone}`}>{exam.chip}</span>
                              <span className="vet-cell-sub vet-faint vet-tnum">{exam.sub}</span>
                            </div>
                          ) : (
                            <span className="vet-faint">—</span>
                          )}
                        </td>

                        {/* What is being treated, in words. */}
                        <td className="vet-hide-md">
                          {r.injuries || r.ongoing ? (
                            <div className="vet-cell-stack">
                              {r.injuries > 0 && (
                                <span className="vet-cell-item">
                                  <i className="bi bi-bandaid vet-text-watch" aria-hidden="true" /> {r.injuries} chấn thương chưa khỏi
                                </span>
                              )}
                              {r.ongoing > 0 && (
                                <span className="vet-cell-item">
                                  <i className="bi bi-capsule vet-text-info" aria-hidden="true" /> {r.ongoing} đơn thuốc đang dùng
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="vet-faint">Không</span>
                          )}
                        </td>

                        {/* The job and why: "Khám theo yêu cầu · Có 2 yêu cầu khám đang chờ". */}
                        <td className="text-end" style={{ width: 1 }}>
                          <div className="vet-next">
                            <span className={`vet-next-why vet-text-${r.next.tone}`}>
                              {r.next.icon && <i className={`bi ${r.next.icon}`} aria-hidden="true" />}
                              {r.next.reason}
                            </span>
                            <Button
                              size="sm"
                              variant={r.next.now ? 'vet' : 'vet-outline'}
                              className="vet-next-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/veterinarian/examinations/new/${r.horse._id}`);
                              }}
                            >
                              {r.next.label}
                            </Button>
                            <i className="bi bi-chevron-right vet-faint" aria-hidden="true" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </VetCard>
    </div>
  );
}
