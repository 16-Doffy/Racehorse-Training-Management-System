import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { Callout, EmptyNote, FilterChips, HealthPill, HorseCell, LevelPill, LoadingBlock, Pill, SearchBox, VetCard } from '../../components/veterinarian/ui';
import { clearanceOf, fmtDate, idOf, isActiveInjury } from '../../components/veterinarian/vetFormat';
import { useClearances, useExamRequests, useIncidents, useInjuries, useTreatments, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const EXAM_STATE = {
  valid: { label: 'còn hiệu lực', tone: 'good' },
  due_soon: { label: 'sắp hết hạn', tone: 'watch' },
  expired: { label: 'quá hạn', tone: 'bad' },
  never: { label: 'Chưa khám', tone: 'bad' },
};

const FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'attention', label: 'Cần xử lý', tone: 'bad' },
  { value: 'restricted', label: 'Hạn chế tập', tone: 'watch' },
  { value: 'injured', label: 'Chấn thương', tone: 'bad' },
  { value: 'quarantined', label: 'Cách ly', tone: 'quar' },
  { value: 'eligible', label: 'Đủ điều kiện', tone: 'good' },
];

/** ?filter=… (and the old ?lock=locked link) picks the starting filter. */
function initialFilter(params) {
  if (params.get('lock') === 'locked') return 'restricted';
  const f = params.get('filter');
  return FILTERS.some((x) => x.value === f) ? f : 'all';
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
    const incidents = count(incidentsQ.data, (t) => idOf(t.horse));
    const meds = count(
      (treatmentsQ.data || []).filter((t) => t.status === 'ongoing' && t.medications?.length),
      (t) => idOf(t.horse)
    );
    const exams = new Map((clearancesQ.data || []).map((c) => [idOf(c.horse), c]));
    return (horsesQ.data || []).map((horse) => {
      const exam = exams.get(horse._id);
      const r = {
        horse,
        clearance: clearanceOf(horse),
        exam,
        injuries: injuries.get(horse._id) || 0,
        requests: requests.get(horse._id) || 0,
        incidents: incidents.get(horse._id) || 0,
        treatments: meds.get(horse._id) || 0,
      };
      r.attention = r.requests > 0 || r.incidents > 0 || exam?.status === 'never' || exam?.status === 'expired';
      return r;
    });
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
          <div style={{ overflowX: 'auto' }}>
            <table className="vet-table">
              <thead>
                <tr>
                  <th>Ngựa</th>
                  <th>Sức khỏe</th>
                  <th>Mức tập</th>
                  <th className="vet-hide-md">Khám gần nhất</th>
                  <th className="vet-hide-md">Đang theo dõi</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const open = () => navigate(`/veterinarian/horses/${r.horse._id}`);
                  const examState = EXAM_STATE[r.exam?.status];
                  return (
                    <tr key={r.horse._id} className="is-clickable" onClick={open}>
                      <td style={{ minWidth: 220 }}>
                        <HorseCell horse={r.horse} />
                      </td>
                      <td>
                        <HealthPill status={r.horse.healthStatus} />
                      </td>
                      <td>{r.clearance.restricted ? <LevelPill level={r.clearance.level} short title={r.clearance.reason || undefined} /> : <span className="vet-small vet-muted">Bình thường</span>}</td>
                      <td className="vet-hide-md">
                        {r.exam?.lastExam ? (
                          <>
                            <div className="vet-tnum">{fmtDate(r.exam.lastExam.date)}</div>
                            {examState && <div className={`vet-small vet-text-${examState.tone}`}>{examState.label}</div>}
                          </>
                        ) : (
                          <span className="vet-small vet-text-bad">Chưa khám</span>
                        )}
                      </td>
                      <td className="vet-hide-md">
                        <div className="d-flex flex-wrap gap-1">
                          {r.incidents > 0 && <Pill tone="bad">{r.incidents} sự cố</Pill>}
                          {r.requests > 0 && <Pill tone="info">{r.requests} yêu cầu khám</Pill>}
                          {r.injuries > 0 && <Pill tone="watch">{r.injuries} chấn thương</Pill>}
                          {r.treatments > 0 && (
                            <Pill icon="bi-capsule">
                              {r.treatments} đơn thuốc
                            </Pill>
                          )}
                          {!r.incidents && !r.requests && !r.injuries && !r.treatments && <span className="vet-faint">—</span>}
                        </div>
                      </td>
                      <td className="text-end" style={{ width: 1 }}>
                        <div className="d-flex align-items-center justify-content-end gap-2">
                          <Button
                            size="sm"
                            variant={r.attention ? 'vet' : 'vet-outline'}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/veterinarian/examinations/new/${r.horse._id}`);
                            }}
                          >
                            Khám
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
        )}
      </VetCard>
    </div>
  );
}
