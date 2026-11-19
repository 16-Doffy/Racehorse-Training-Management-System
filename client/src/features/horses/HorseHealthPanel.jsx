import { useState } from 'react';
import { Empty, Skeleton } from 'antd';
import { AlertOutlined, CalendarOutlined, CoffeeOutlined, DownOutlined, LockOutlined, MedicineBoxOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { healthRecordApi, treatmentApi, injuryMarkerApi } from '../health/healthApi';
import ExamSummary, { FollowUpPill, TreatmentBlock } from '../health/ExamSummary';
import { daysFromNow } from '../health/healthDates';
import { healthMeta, isActiveInjury, levelMeta, recoveryMeta, shortBodyPart } from '../../components/veterinarian/vetFormat';
import '../health/healthView.css';

/**
 * The horse's health as the trainer needs it, read-only (the vet writes all of it): the last exam in full —
 * what was found, the diagnosis, what was prescribed, the diet, the follow-up — beside what it means for
 * training now; then every exam (a click opens it) and every prescription.
 */
export default function HorseHealthPanel({ horse }) {
  const id = horse?._id;
  const [open, setOpen] = useState(null);
  const records = useQuery({ queryKey: ['health-records', 'horse', id], queryFn: () => healthRecordApi.list({ horse: id }), enabled: Boolean(id) });
  const treatments = useQuery({ queryKey: ['treatments', 'horse', id], queryFn: () => treatmentApi.list({ horse: id }), enabled: Boolean(id) });
  const injuries = useQuery({ queryKey: ['injuries', 'horse', id], queryFn: () => injuryMarkerApi.list({ horse: id }), enabled: Boolean(id) });

  if (records.isLoading || treatments.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  const exams = records.data?.data || [];
  const rxs = (treatments.data?.data || []).slice().sort((a, b) => (b.status === 'ongoing') - (a.status === 'ongoing') || new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt));
  const marks = (injuries.data?.data || []).filter(isActiveInjury);
  const latest = exams[0];
  const ongoing = rxs.filter((t) => t.status === 'ongoing');
  const clearance = horse.trainingClearance || { level: 'high' };
  const level = levelMeta(clearance.level);
  const diet = horse.feedingDiet;
  const followUp = horse.careSchedule?.nextExamDue;
  const health = healthMeta(horse.healthStatus);

  return (
    <div className="hv-panel">
      <div className="hv-top">
        <section className="hv-card">
          <h3 className="hv-card-title">
            Lần khám gần nhất
            {exams.length > 1 && <span className="hv-muted text-xs font-normal">{exams.length} lần khám</span>}
          </h3>
          {latest ? <ExamSummary record={latest} treatments={rxs} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bác sĩ chưa khám ngựa này." />}
        </section>

        {/* What it means for training now. */}
        <section className="hv-card">
          <h3 className="hv-card-title">
            Tình trạng & lưu ý
            <span className={`hv-pill is-${health.tone}`}>{health.label}</span>
          </h3>
          <div className="hv-facts">
            <div className={`hv-fact is-${level.tone}`}>
              <LockOutlined className="hv-fact-icon" />
              <div>
                <b>{clearance.restricted ? level.label : 'Tập bình thường'}</b>
                {clearance.restricted ? `${clearance.reason || 'Theo phác đồ của bác sĩ'}${clearance.since ? ` · từ ${dayjs(clearance.since).format('DD/MM')}` : ''}. Hết hạn chế khi bác sĩ nâng mức hoặc kết thúc điều trị.` : 'Bác sĩ không hạn chế mức tập.'}
              </div>
            </div>
            <div className={`hv-fact is-${followUp ? (daysFromNow(followUp).days <= 2 ? 'watch' : 'info') : 'good'}`}>
              <CalendarOutlined className="hv-fact-icon" />
              <div>
                <b>{followUp ? `Tái khám ${dayjs(followUp).format('DD/MM/YYYY')}` : 'Không có lịch tái khám'}</b>
                {followUp ? `${daysFromNow(followUp).text} — chừa thời gian trong lịch tập, chờ kết luận rồi mới tăng cường độ.` : 'Bác sĩ chưa hẹn khám lại.'}
              </div>
            </div>
            {diet && (
              <div className={`hv-fact is-${diet.diet === 'sick' ? 'watch' : 'info'}`}>
                <CoffeeOutlined className="hv-fact-icon" />
                <div>
                  <b>{diet.diet === 'sick' ? `Chế độ ăn theo y lệnh: ${diet.label}` : diet.label}</b>
                  {[diet.care, diet.note ? `Lưu ý bác sĩ: ${diet.note}` : null].filter(Boolean).join(' ')}
                </div>
              </div>
            )}
            <div className={`hv-fact is-${ongoing.length ? 'info' : 'good'}`}>
              <MedicineBoxOutlined className="hv-fact-icon" />
              <div>
                <b>{ongoing.length ? `${ongoing.length} đơn đang điều trị` : 'Không có đơn đang điều trị'}</b>
                {ongoing.length ? ongoing.flatMap((t) => (t.medications || []).map((m) => m.name)).join(', ') || 'Chăm sóc theo y lệnh' : 'Ngựa không dùng thuốc nào.'}
              </div>
            </div>
            {marks.length > 0 && (
              <div className="hv-fact is-bad">
                <AlertOutlined className="hv-fact-icon" />
                <div>
                  <b>{marks.length} chấn thương chưa khỏi</b>
                  {marks.map((m) => `${shortBodyPart(m.bodyPart)} (${recoveryMeta(m.recoveryStatus).label.toLowerCase()})`).join('; ')}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {exams.length > 1 && (
        <section className="hv-card">
          <h3 className="hv-card-title">Lịch sử khám</h3>
          <ul className="hv-history">
            {exams.map((r) => {
              const shown = open === r._id;
              const result = healthMeta(r.resultStatus);
              return (
                <li key={r._id}>
                  <button type="button" className="hv-history-row" onClick={() => setOpen(shown ? null : r._id)} aria-expanded={shown}>
                    <span className="hv-history-date">{dayjs(r.date).format('DD/MM')}</span>
                    <span className="hv-history-diag">{r.diagnosis}</span>
                    {r.followUpAt && <FollowUpPill date={r.followUpAt} />}
                    <span className={`hv-pill is-${result.tone}`}>{result.label}</span>
                    {shown ? <DownOutlined /> : <RightOutlined />}
                  </button>
                  {shown && (
                    <div className="hv-history-open">
                      <ExamSummary record={r} treatments={rxs} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {rxs.length > 0 && (
        <section className="hv-card">
          <h3 className="hv-card-title">
            Đơn điều trị
            {ongoing.length > 0 && <span className="hv-pill is-info">{ongoing.length} đang điều trị</span>}
          </h3>
          <div className="flex flex-col gap-2.5">
            {rxs.map((t) => (
              <TreatmentBlock key={t._id} treatment={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
