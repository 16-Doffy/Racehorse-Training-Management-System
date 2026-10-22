import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import InjuryModal from '../../components/veterinarian/InjuryModal';
import { setInjuryStage } from '../../components/veterinarian/vetActions';
import { Callout, EmptyNote, FilterChips, HealthPill, HorseCell, LevelPill, LoadingBlock, Pill, RecoveryStepper, SearchBox, VetCard } from '../../components/veterinarian/ui';
import { SEVERITY_META, ago, clearanceOf, idOf, isActiveInjury, shortBodyPart } from '../../components/veterinarian/vetFormat';
import { useInjuries, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const SEVERITY_RANK = { severe: 0, moderate: 1, mild: 2 };

/**
 * Injuries across the vet's horses, grouped by horse, worst first. Once recorded an injury is not
 * edited nor deleted: only its stage of recovery moves, with one click on its stepper (or with the
 * horse's treatment). The 3D view of each horse's injuries is on the horse's page.
 * ?new=1[&horseId=] opens the form.
 */
export default function InjuryManagement() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refresh = useVetRefresh();
  const injuriesQ = useInjuries();
  const horsesQ = useVetHorses();
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(() => (params.get('new') ? { type: 'new', horseId: params.get('horseId') } : null));

  const horses = useMemo(() => horsesQ.data || [], [horsesQ.data]);
  const injuries = useMemo(() => injuriesQ.data || [], [injuriesQ.data]);
  const horseById = useMemo(() => new Map(horses.map((h) => [h._id, h])), [horses]);
  const activeCount = injuries.filter(isActiveInjury).length;

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const byHorse = new Map();
    for (const m of injuries) {
      if (status === 'active' && !isActiveInjury(m)) continue;
      if (status === 'recovered' && isActiveInjury(m)) continue;
      const horse = horseById.get(idOf(m.horse));
      if (q && !(horse?.name?.toLowerCase().includes(q) || m.bodyPart?.toLowerCase().includes(q) || m.notes?.toLowerCase().includes(q))) continue;
      const key = idOf(m.horse);
      if (!byHorse.has(key)) byHorse.set(key, { horse, horseId: key, injuries: [] });
      byHorse.get(key).injuries.push(m);
    }
    const list = [...byHorse.values()];
    list.forEach((g) => g.injuries.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) || new Date(b.createdAt) - new Date(a.createdAt)));
    return list.sort((a, b) => (SEVERITY_RANK[a.injuries[0].severity] ?? 3) - (SEVERITY_RANK[b.injuries[0].severity] ?? 3) || (a.horse?.name || '').localeCompare(b.horse?.name || ''));
  }, [injuries, horseById, status, q]);

  const close = () => setDialog(null);

  return (
    <div className="vet-ui">
      <PageHeroBanner
        eyebrow="TEAM 8 • Y TẾ & THÚ Y"
        roleLabel="Bác sĩ Thú y"
        title="Chấn thương"
        subtitle="Tổn thương đang theo dõi và tiến độ hồi phục của từng ngựa."
        stats={activeCount ? [{ label: 'Đang theo dõi', value: activeCount }, { label: 'Ngựa', value: new Set(injuries.filter(isActiveInjury).map((m) => idOf(m.horse))).size }] : []}
        actionButton={
          <Button variant="vet-hero" onClick={() => setDialog({ type: 'new' })}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Ghi chấn thương
          </Button>
        }
      />

      <div className="vet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Tìm ngựa, vị trí tổn thương…" />
        <FilterChips
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: 'Đang theo dõi', count: activeCount },
            { value: 'recovered', label: 'Đã khỏi', count: injuries.length - activeCount },
            { value: 'all', label: 'Tất cả', count: injuries.length },
          ]}
        />
      </div>
      <div className="vet-small vet-muted mb-3">
        <i className="bi bi-arrow-repeat me-1" aria-hidden="true" />
        Giai đoạn tự chuyển theo đơn điều trị: kê đơn cho ngựa → <strong>Đang điều trị</strong>; kết thúc đơn cuối cùng → <strong>Đang hồi phục</strong>. “Đã khỏi” do bác sĩ xác nhận — bấm vào chấm trên dòng chấn thương, hoặc tích khi lưu phiếu khám cho tập bình thường.
      </div>

      {injuriesQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {injuriesQ.error?.message || 'Không tải được danh sách chấn thương.'}
        </Callout>
      )}

      {injuriesQ.isLoading ? (
        <VetCard flush>
          <LoadingBlock rows={3} height={70} />
        </VetCard>
      ) : groups.length === 0 ? (
        <VetCard>
          <EmptyNote icon="bi-shield-check" title={status === 'active' && !q ? 'Không có chấn thương nào đang theo dõi' : 'Không có chấn thương phù hợp'} />
        </VetCard>
      ) : (
        <div className="vet-stack">
          {groups.map((g) => {
            const clearance = clearanceOf(g.horse);
            return (
              <VetCard
                key={g.horseId}
                flush
                title={
                  <span className="d-inline-flex flex-wrap align-items-center gap-2">
                    <HorseCell horse={g.horse || { name: 'Ngựa' }} size={34} sub={`${g.injuries.length} chấn thương`} />
                  </span>
                }
                extra={
                  <>
                    {g.horse && <HealthPill status={g.horse.healthStatus} />}
                    {clearance.restricted && <LevelPill level={clearance.level} short />}
                    <Button size="sm" variant="vet-outline" onClick={() => navigate(`/veterinarian/horses/${g.horseId}?tab=injuries`)}>
                      Xem trên mô hình 3D
                    </Button>
                  </>
                }
              >
                <div className="vet-list">
                  {g.injuries.map((m) => (
                    <div key={m._id} className="vet-row" style={{ alignItems: 'flex-start' }}>
                      <div className="vet-row-main">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="fw-semibold" title={m.bodyPart}>
                            {shortBodyPart(m.bodyPart)}
                          </span>
                          <Pill tone={SEVERITY_META[m.severity]?.tone}>{SEVERITY_META[m.severity]?.label || m.severity}</Pill>
                          <span className="vet-small vet-faint">ghi {ago(m.createdAt)}</span>
                          {m.healthRecord && (
                            <button type="button" className="vet-link vet-small" onClick={() => navigate(`/veterinarian/examinations/${idOf(m.healthRecord)}`)}>
                              <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Phiếu khám
                            </button>
                          )}
                        </div>
                        {m.notes && <div className="vet-small vet-muted vet-clamp-2 mt-1">{m.notes}</div>}
                        <div className="mt-2">
                          <RecoveryStepper value={m.recoveryStatus} onChange={(stage) => setInjuryStage(m, stage, { refresh })} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </VetCard>
            );
          })}
        </div>
      )}

      {dialog?.type === 'new' && (
        <InjuryModal defaultHorseId={dialog.horseId || ''} horses={horses} injuries={injuries} onHide={close} onDone={refresh} />
      )}
    </div>
  );
}
