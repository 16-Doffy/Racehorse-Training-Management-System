import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertOutlined, CalendarOutlined, FileSearchOutlined, LineChartOutlined, MedicineBoxOutlined } from '@ant-design/icons';
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
import { Card, ClearancePill, DateChip, EmptyNote, MoreButton, Pill, Row } from './kit';
import { VitalsMultiples } from './charts';
import { CareSchedule } from './lists';
import { capFirst, clearanceOf, fmtDate, fmtDateTime, fmtShort, healthOf, idOf, relDay } from './ownerFormat';
import { useHealthRecords, useInjuries, useTreatments } from './useOwnerData';
import ExamSummary, { FollowUpPill, TreatmentBlock } from '../health/ExamSummary';

const VITALS = [
  ['heartRate', 'Nhịp tim', 'bpm'],
  ['temperatureC', 'Nhiệt độ', '°C'],
  ['respiratoryRate', 'Nhịp thở', 'lần/phút'],
];
const vitalsText = (v) =>
  VITALS.filter(([key]) => v?.[key])
    .map(([key, , unit]) => `${v[key]} ${unit}`)
    .join(' · ');

const TABS = ['treatments', 'injuries', 'exams', 'care'];

/**
 * One horse's health as the owner follows it. On top, how it is now and why: the vet's conclusion and any
 * limit on its training, the last exam and its vital signs, what it eats while unwell and the follow-up.
 * Then a tab each for the treatments, the injuries (on the horse in 3D), the exams over time and the
 * routine care. Read-only: the vet writes all of it.
 */
export default function HealthDetail({ horse, examined = true }) {
  const id = idOf(horse);
  const { records } = useHealthRecords();
  const { treatments } = useTreatments();
  const { injuries } = useInjuries();
  // A reminder of a care visit opens on the routine care (?tab=care).
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => (TABS.includes(params.get('tab')) ? params.get('tab') : null));
  const [examsShown, setExamsShown] = useState(6);
  const [openExamId, setOpenExamId] = useState(null);
  // An exam opened from elsewhere on the page: the exams tab, with it unfolded.
  const openExam = (examId) => {
    setTab('exams');
    setOpenExamId(examId);
  };
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
  const ongoing = plans.filter((t) => t.status === 'ongoing');
  const bodyShown = bodyLayer || (open.length > 0 || careEvents.length === 0 ? 'injury' : 'care');
  const showBody = open.length > 0 || careEvents.length > 0;
  const latest = exams[0];
  const clearance = clearanceOf(horse);
  const health = healthOf(horse.healthStatus);
  const diet = horse.feedingDiet;
  const followUp = horse.careSchedule?.nextExamDue;
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
  // The tab that matters first: what is going on now, else the exams.
  const shownTab = tab || (ongoing.length ? 'treatments' : open.length ? 'injuries' : 'exams');

  return (
    <div className="flex flex-col gap-4">
      <section className={`own-card own-hh is-${examined ? health.tone : 'neutral'}`} aria-label="Tình trạng hiện tại">
        <div className="own-hh-status">
          <span className="own-hh-label">Tình trạng hiện tại</span>
          <span className="own-hh-value">{examined ? health.label : 'Chưa khám'}</span>
          <div className="own-hero-pills">
            <ClearancePill horse={horse} />
            {ongoing.length > 0 && <Pill tone="info">{ongoing.length} phác đồ đang điều trị</Pill>}
            {open.length > 0 && <Pill tone="bad">{open.length} chấn thương chưa khỏi</Pill>}
          </div>
        </div>
        <div className="own-hh-body">
          {latest ? (
            <>
              <div className="own-hh-exam">
                <span className="own-faint">
                  Lần khám gần nhất · {fmtDate(latest.date)} ({relDay(latest.date)}){latest.examinedBy?.name ? ` · BS ${latest.examinedBy.name}` : ''}
                </span>
                <b>{latest.diagnosis}</b>
              </div>
              <div className="own-hh-vitals">
                {VITALS.map(([key, label, unit]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <b>{latest.vitalSigns?.[key] ? `${latest.vitalSigns[key]} ${unit}` : '—'}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="own-muted">Chưa có lần khám nào: tình trạng trên là mặc định khi nhập ngựa, chưa phải kết luận của bác sĩ.</div>
          )}
          {clearance.restricted && (
            <div className={`own-note${clearance.level === 'none' ? ' is-bad' : ''}`}>
              {capFirst(clearance.label)}
              {clearance.reason ? ` — ${clearance.reason}` : ''}. Hết hạn chế khi bác sĩ nâng mức hoặc kết thúc điều trị.
            </div>
          )}
          {(diet || followUp) && (
            <div className="own-hh-extra">
              {diet && (
                <span>
                  <b>Ăn uống:</b> {diet.diet === 'sick' ? `chế độ bệnh "${diet.label}"` : diet.label}
                  {diet.note ? ` — ${diet.note}` : ''}
                </span>
              )}
              {followUp && <FollowUpPill date={followUp} />}
            </div>
          )}
          {latest && (
            <button type="button" className="own-link-btn self-start text-sm font-semibold" onClick={() => openExam(latest._id)}>
              Xem chi tiết lần khám: chẩn đoán, đơn thuốc, chế độ ăn →
            </button>
          )}
        </div>
      </section>

      <div>
        <Segmented
          value={shownTab}
          onChange={setTab}
          options={[
            { value: 'treatments', label: `Điều trị (${plans.length})` },
            { value: 'injuries', label: `Chấn thương (${marks.length})` },
            { value: 'exams', label: `Lịch sử khám (${exams.length})` },
            { value: 'care', label: 'Chăm sóc định kỳ' },
          ]}
        />
      </div>

      {shownTab === 'treatments' && (
      <Card title="Điều trị & đơn thuốc" icon={<MedicineBoxOutlined />} extra={plans.some((t) => t.status === 'ongoing') && <Pill tone="info">{plans.filter((t) => t.status === 'ongoing').length} đang điều trị</Pill>}>
        {plans.length === 0 ? (
          <EmptyNote>Ngựa chưa có phác đồ điều trị nào.</EmptyNote>
        ) : (
          // Each prescription in full: every medicine with its dose, how and when it is given, from when to when.
          <div className="flex flex-col gap-2.5">
            {plans.map((t) => {
              const exam = exams.find((r) => idOf(r) === idOf(t.healthRecord));
              return (
                <div key={t._id} className="flex flex-col gap-1">
                  {exam && (
                    <button type="button" className="own-link-btn text-left text-xs" onClick={() => openExam(exam._id)}>
                      Theo lần khám {fmtDate(exam.date)}: {exam.diagnosis}
                    </button>
                  )}
                  <TreatmentBlock treatment={t} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
      )}

      {shownTab === 'injuries' && (
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
      )}

      {shownTab === 'exams' && showVitals && (
        <Card title="Chỉ số sinh tồn qua các lần khám" icon={<LineChartOutlined />}>
          <VitalsMultiples series={vitalSeries} />
        </Card>
      )}

      {shownTab === 'exams' && (
      <Card title="Lịch sử khám" icon={<FileSearchOutlined />} flush extra={exams.length > 0 && <span className="own-faint text-xs">{exams.length} lần khám</span>}>
        {exams.length === 0 ? (
          <EmptyNote>Chưa có lần khám nào.</EmptyNote>
        ) : (
          <>
            {/* A click opens the exam as the vet filed it: findings, diagnosis, prescriptions, diet, follow-up. */}
            <ul className="own-list">
              {exams.slice(0, examsShown).map((r) => {
                const result = healthOf(r.resultStatus);
                const shown = openExamId === r._id;
                return (
                  <li key={r._id}>
                    <button type="button" className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left" onClick={() => setOpenExamId(shown ? null : r._id)} aria-expanded={shown}>
                      <Row
                        lead={<DateChip date={r.date} sub={dayjs(r.date).format('MM/YY')} />}
                        title={r.diagnosis}
                        sub={[r.examinedBy?.name, vitalsText(r.vitalSigns), r.followUpAt ? `tái khám ${fmtDate(r.followUpAt)}` : null].filter(Boolean).join(' · ') || null}
                        side={
                          <>
                            <Pill tone={result.tone}>{result.label}</Pill>
                            <span className="own-faint text-xs">{shown ? 'Thu gọn' : 'Xem chi tiết'}</span>
                          </>
                        }
                      />
                    </button>
                    {shown && (
                      <div style={{ padding: '4px 16px 16px' }}>
                        <ExamSummary record={r} treatments={plans} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <MoreButton shown={examsShown} total={exams.length} onMore={() => setExamsShown((n) => n + 10)} />
          </>
        )}
      </Card>
      )}

      {shownTab === 'care' && (
        <>
          <Card title="Lịch hẹn của bác sĩ" icon={<CalendarOutlined />} flush>
            <CareSchedule horse={horse} />
          </Card>
          <CareHistoryCard horseId={id} />
        </>
      )}
    </div>
  );
}
