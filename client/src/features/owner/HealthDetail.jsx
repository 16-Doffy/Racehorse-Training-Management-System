import { useMemo, useState } from 'react';
import { AlertOutlined, CalendarOutlined, FileSearchOutlined, HeartOutlined, LineChartOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import { Segmented } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import HorseInjuryViewer from '../../components/veterinarian/HorseInjuryViewer';
import { SEVERITY_META, isActiveInjury, recoveryMeta } from '../../components/veterinarian/vetFormat';
// The 3D viewer is styled by the vet's stylesheet, whose rules all sit under .vet-ui.
import '../../components/veterinarian/vet.css';
import CareBodyMap from '../horses/CareBodyMap';
import CareHistoryCard from '../horses/CareHistoryCard';
import { horsesApi } from '../horses/horsesApi';
import { TRAINING_LEVEL_META } from '../../constants/health';
import { Card, ClearancePill, DateChip, EmptyNote, Facts, HealthPill, MoreButton, Pill, Row } from './kit';
import { VitalsMultiples } from './charts';
import { CareSchedule } from './lists';
import { capFirst, clearanceOf, fmtDate, fmtDateTime, fmtShort, healthOf, idOf } from './ownerFormat';
import { useHealthRecords, useInjuries, useTreatments } from './useOwnerData';

const VITALS = [
  ['heartRate', 'Nhịp tim', 'bpm'],
  ['temperatureC', 'Nhiệt độ', '°C'],
  ['respiratoryRate', 'Nhịp thở', 'lần/phút'],
];
const vitalsText = (v) =>
  VITALS.filter(([key]) => v?.[key])
    .map(([key, , unit]) => `${v[key]} ${unit}`)
    .join(' · ');

/**
 * One horse's health as the owner follows it: how it is now and why, routine care, treatments and
 * prescriptions, injuries (on the horse in 3D), the vital signs over the exams and every exam.
 * Read-only: the vet writes all of it.
 */
export default function HealthDetail({ horse, examined = true }) {
  const id = idOf(horse);
  const { records } = useHealthRecords();
  const { treatments } = useTreatments();
  const { injuries } = useInjuries();
  const [examsShown, setExamsShown] = useState(6);
  const [bodyLayer, setBodyLayer] = useState(null); // 'injury' | 'care'; until chosen, injuries if any are open
  // The same request as the care history table below, so the two share one fetch.
  const careQuery = useQuery({ queryKey: ['care-events', id, 'all'], queryFn: () => horsesApi.careEvents(id), enabled: Boolean(id) });
  const careEvents = useMemo(() => (Array.isArray(careQuery.data?.data) ? careQuery.data.data : []), [careQuery.data]);

  const exams = useMemo(() => records.filter((r) => idOf(r.horse) === id), [records, id]);
  const plans = useMemo(
    () =>
      // Ongoing first, then the newest.
      treatments
        .filter((t) => idOf(t.horse) === id)
        .sort((a, b) => (b.status === 'ongoing') - (a.status === 'ongoing') || new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt)),
    [treatments, id],
  );
  const marks = useMemo(() => injuries.filter((i) => idOf(i.horse) === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [injuries, id]);
  const open = marks.filter(isActiveInjury);
  const bodyShown = bodyLayer || (open.length > 0 || careEvents.length === 0 ? 'injury' : 'care');
  const showBody = open.length > 0 || careEvents.length > 0;
  const latest = exams[0];
  const clearance = clearanceOf(horse);
  const vitalSeries = useMemo(() => {
    const withVitals = exams.filter((r) => VITALS.some(([key]) => r.vitalSigns?.[key])).slice(0, 20).reverse();
    return VITALS.map(([key, name, unit]) => ({
      key,
      name,
      unit,
      points: withVitals.filter((r) => r.vitalSigns?.[key]).map((r) => ({ label: fmtShort(r.date), full: fmtDateTime(r.date), value: r.vitalSigns[key] })),
    }));
  }, [exams]);
  const showVitals = vitalSeries.some((s) => s.points.length >= 2);

  return (
    <div className="flex flex-col gap-4">
      <div className="own-grid-2">
        <Card title="Tình trạng hiện tại" icon={<HeartOutlined />}>
          <div className="flex flex-col gap-3">
            <div className="own-hero-pills">
              <HealthPill status={horse.healthStatus} examined={examined} />
              <ClearancePill horse={horse} />
            </div>
            {clearance.restricted && (
              <div className={`own-note${clearance.level === 'none' ? ' is-bad' : ''}`}>
                {capFirst(clearance.label)}
                {clearance.reason ? ` — ${clearance.reason}` : ''}
                {horse.trainingClearance?.prescribedBy ? ` · theo ${horse.trainingClearance.prescribedBy}` : ''}
                {horse.trainingClearance?.since ? ` từ ${fmtShort(horse.trainingClearance.since)}` : ''}. Hết hạn chế khi bác sĩ nâng mức hoặc kết thúc điều trị.
              </div>
            )}
            {latest ? (
              <Facts
                items={[
                  ['Lần khám gần nhất', `${fmtDate(latest.date)}${latest.examinedBy?.name ? ` · ${latest.examinedBy.name}` : ''}`],
                  ['Kết luận', healthOf(latest.resultStatus).label],
                  ['Chẩn đoán', latest.diagnosis],
                  ...VITALS.map(([key, label, unit]) => [label, latest.vitalSigns?.[key] ? `${latest.vitalSigns[key]} ${unit}` : '—']),
                  latest.notes && ['Ghi chú', latest.notes],
                ]}
              />
            ) : (
              <EmptyNote>Chưa có lần khám nào. Tình trạng trên là mặc định khi nhập ngựa, chưa phải kết luận của bác sĩ.</EmptyNote>
            )}
          </div>
        </Card>
        <Card title="Chăm sóc định kỳ" icon={<CalendarOutlined />} flush>
          <CareSchedule horse={horse} />
        </Card>
      </div>

      <Card title="Điều trị & đơn thuốc" icon={<MedicineBoxOutlined />} flush extra={plans.some((t) => t.status === 'ongoing') && <Pill tone="info">{plans.filter((t) => t.status === 'ongoing').length} đang điều trị</Pill>}>
        {plans.length === 0 ? (
          <EmptyNote>Ngựa chưa có phác đồ điều trị nào.</EmptyNote>
        ) : (
          <ul className="own-list">
            {plans.map((t) => {
              const ongoing = t.status === 'ongoing';
              const level = t.trainingLevel ? TRAINING_LEVEL_META[t.trainingLevel]?.label : null;
              return (
                <li key={t._id}>
                  <Row
                    lead={<span className={`own-icon is-${ongoing ? 'info' : 'good'}`}><MedicineBoxOutlined /></span>}
                    title={t.medications?.length ? t.medications.map((m) => m.name).join(', ') : 'Chăm sóc theo y lệnh'}
                    sub={`${fmtDate(t.startDate || t.createdAt)} → ${t.endDate ? fmtDate(t.endDate) : 'chưa định ngày kết thúc'}${t.prescribedBy?.name ? ` · kê bởi ${t.prescribedBy.name}` : ''}`}
                    side={
                      <>
                        <Pill tone={ongoing ? 'info' : 'good'}>{ongoing ? 'Đang điều trị' : 'Đã xong'}</Pill>
                        {t.isTrainingLocked ? <Pill tone="bad">Khóa tập</Pill> : level && <Pill tone="watch">{level}</Pill>}
                      </>
                    }
                  >
                    {t.medications?.length > 0 && (
                      <div className="own-row-sub">
                        {t.medications.map((m) => [m.name, m.dosage, m.frequency].filter(Boolean).join(' · ')).join('  |  ')}
                      </div>
                    )}
                    {t.careInstructions && <div className="own-quote">{t.careInstructions}</div>}
                    {t.isTrainingLocked && t.lockReason && <div className="own-row-sub own-bad">Lý do khóa tập: {t.lockReason}</div>}
                  </Row>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Chấn thương" icon={<AlertOutlined />} flush extra={open.length > 0 && <Pill tone="bad">{open.length} chưa khỏi</Pill>}>
        {showBody && (
          // The horse in 3D, look only: where the vet marked the injuries still open, or where routine care was done.
          <div className="vet-ui" style={{ padding: 14 }}>
            <div style={{ marginBottom: 10 }}>
              <Segmented
                size="small"
                value={bodyShown}
                onChange={setBodyLayer}
                options={[
                  { value: 'injury', label: 'Chấn thương' },
                  { value: 'care', label: 'Chăm sóc định kỳ' },
                ]}
              />
            </div>
            {bodyShown === 'care' ? <CareBodyMap horse={horse} events={careEvents} /> : <HorseInjuryViewer horse={horse} injuries={open} height={340} />}
          </div>
        )}
        {marks.length === 0 ? (
          <EmptyNote>Không có chấn thương nào được ghi nhận.</EmptyNote>
        ) : (
          <ul className="own-list">
            {marks.map((m) => {
              const severity = SEVERITY_META[m.severity] || { label: m.severity, tone: 'neutral' };
              const recovery = recoveryMeta(m.recoveryStatus);
              return (
                <li key={m._id}>
                  <Row
                    lead={<DateChip date={m.createdAt} />}
                    title={m.bodyPart}
                    sub={[`Ghi nhận ${fmtDate(m.createdAt)}`, m.notes].filter(Boolean).join(' · ')}
                    side={
                      <>
                        <Pill tone={recovery.tone}>{recovery.label}</Pill>
                        <Pill tone={severity.tone} dot={false}>
                          Mức {severity.label.toLowerCase()}
                        </Pill>
                      </>
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {showVitals && (
        <Card title="Chỉ số sinh tồn qua các lần khám" icon={<LineChartOutlined />}>
          <VitalsMultiples series={vitalSeries} />
        </Card>
      )}

      <Card title="Lịch sử khám" icon={<FileSearchOutlined />} flush extra={exams.length > 0 && <span className="own-faint text-xs">{exams.length} lần khám</span>}>
        {exams.length === 0 ? (
          <EmptyNote>Chưa có lần khám nào.</EmptyNote>
        ) : (
          <>
            <ul className="own-list">
              {exams.slice(0, examsShown).map((r) => {
                const result = healthOf(r.resultStatus);
                return (
                  <li key={r._id}>
                    <Row
                      lead={<DateChip date={r.date} sub={dayjs(r.date).format('MM/YY')} />}
                      title={r.diagnosis}
                      sub={[r.examinedBy?.name, vitalsText(r.vitalSigns)].filter(Boolean).join(' · ') || null}
                      side={<Pill tone={result.tone}>{result.label}</Pill>}
                    >
                      {r.notes && <div className="own-row-sub">{r.notes}</div>}
                    </Row>
                  </li>
                );
              })}
            </ul>
            <MoreButton shown={examsShown} total={exams.length} onMore={() => setExamsShown((n) => n + 10)} />
          </>
        )}
      </Card>

      <CareHistoryCard horseId={id} />
    </div>
  );
}
