import { useMemo } from 'react';
import { BellOutlined, HeartOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { Card, ClearancePill, EmptyNote, HealthPill, HorseAvatar, HorsePicker, OwnerPage, PageHead, Pill, Row } from './kit';
import { AttentionList } from './lists';
import HealthDetail from './HealthDetail';
import { fmtDate, idOf } from './ownerFormat';
import { attentionItems, horseName } from './ownerInsights';
import { useHorseParam, useMyHorses, useOwnerSummary, useTreatments } from './useOwnerData';

/**
 * The health of the owner's horses: all of them at a glance (status, the vet's last word, ongoing
 * treatments and what needs a look), or one horse in full when it is picked.
 */
export default function OwnerHealth() {
  const { horses, isLoading } = useMyHorses();
  const { rows } = useOwnerSummary();
  const { treatments } = useTreatments();
  const [horseId, setHorse] = useHorseParam(horses);

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const rowOf = useMemo(() => new Map(rows.map((r) => [idOf(r.horse), r])), [rows]);
  const attention = useMemo(() => attentionItems(rows, horsesById).filter((a) => a.kind !== 'race'), [rows, horsesById]);
  const ongoing = treatments.filter((t) => t.status === 'ongoing' && horsesById.has(idOf(t.horse)));
  const picked = horseId ? horsesById.get(horseId) : null;
  const examinedOf = (id) => (rowOf.has(id) ? Boolean(rowOf.get(id).health.lastExam) : true);
  const count = (pred) => horses.filter(pred).length;

  return (
    <OwnerPage>
      <PageHead
        eyebrow="Chủ sở hữu"
        title="Sức khỏe"
        sub="Kết luận của bác sĩ thú y, phác đồ điều trị, chấn thương và lịch chăm sóc định kỳ của từng chiến mã."
        stats={[
          { label: 'Đủ điều kiện', value: `${count((h) => h.healthStatus === 'eligible' && examinedOf(idOf(h)))} con` },
          { label: 'Đang theo dõi', value: `${count((h) => h.healthStatus === 'monitoring')} con` },
          { label: 'Chấn thương / cách ly', value: `${count((h) => ['injured', 'quarantined'].includes(h.healthStatus))} con` },
          { label: 'Đang điều trị', value: `${ongoing.length} phác đồ` },
        ]}
      />
      <HorsePicker horses={horses} value={horseId} onChange={setHorse} />

      {picked ? (
        <HealthDetail key={horseId} horse={picked} examined={examinedOf(horseId)} />
      ) : (
        <>
          <Card title="Từng chiến mã" icon={<HeartOutlined />} flush>
            {horses.length === 0 ? (
              <EmptyNote>{isLoading ? 'Đang tải…' : 'Bạn chưa có chiến mã nào.'}</EmptyNote>
            ) : (
              <ul className="own-list">
                {horses.map((h) => {
                  const id = idOf(h);
                  const exam = rowOf.get(id)?.health.lastExam;
                  return (
                    <li key={id}>
                      <Row
                        to={`/owner/health?horse=${id}`}
                        lead={<HorseAvatar horse={h} size={36} />}
                        title={h.name}
                        sub={exam ? `Khám ${fmtDate(exam.date)} · ${exam.diagnosis}` : 'Chưa có lần khám nào'}
                        side={
                          <div className="own-hero-pills justify-end">
                            <HealthPill status={h.healthStatus} examined={examinedOf(id)} />
                            <ClearancePill horse={h} />
                          </div>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <div className="own-grid-2">
            <Card title="Cần chú ý" icon={<BellOutlined />} flush>
              <AttentionList items={attention} emptyText="Không có việc sức khỏe nào cần để ý." />
            </Card>
            <Card title="Đang điều trị" icon={<MedicineBoxOutlined />} flush>
              {ongoing.length === 0 ? (
                <EmptyNote>Không có ngựa nào đang điều trị.</EmptyNote>
              ) : (
                <ul className="own-list">
                  {ongoing.map((t) => (
                    <li key={t._id}>
                      <Row
                        to={`/owner/health?horse=${idOf(t.horse)}`}
                        lead={<span className="own-icon is-info"><MedicineBoxOutlined /></span>}
                        title={`${horseName(t.horse, horsesById)} · ${t.medications?.length ? t.medications.map((m) => m.name).join(', ') : 'chăm sóc theo y lệnh'}`}
                        sub={`Từ ${fmtDate(t.startDate || t.createdAt)}${t.endDate ? ` đến ${fmtDate(t.endDate)}` : ''}${t.prescribedBy?.name ? ` · kê bởi ${t.prescribedBy.name}` : ''}`}
                        side={t.isTrainingLocked ? <Pill tone="bad">Khóa tập</Pill> : null}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </OwnerPage>
  );
}
