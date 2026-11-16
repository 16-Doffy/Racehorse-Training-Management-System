import { Modal } from 'antd';
import { ClockCircleOutlined, PlayCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import SessionVideo from '../training/SessionVideo';
import { SESSION_KINDS, sessionTargets } from '../training/trainingVocab';
import { HorseAvatar, Pill } from './kit';
import { INTENSITY_LABELS, ratingTone, sessionKind } from './ownerFormat';
import { WEEKDAY_FULL, hasVideo, sessionLook, startOf } from './trainingLook';

const num = (v, unit) => (v || v === 0 ? `${v} ${unit}` : '—');

/** A part of the workout in a line: "Phi chậm · 10 phút · 1.200 m · 30 km/h · tim ≤ 160". */
function partLine(p) {
  return [
    p.durationMinutes && `${p.durationMinutes} phút`,
    p.distanceM && `${p.distanceM.toLocaleString('vi-VN')} m`,
    p.targetSpeedKmh && `${p.targetSpeedKmh} km/h`,
    p.targetHeartRateMax && `tim ≤ ${p.targetHeartRateMax}`,
    p.restMinutes && `nghỉ ${p.restMinutes} phút`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Where the video stands when there is none to play. */
function noVideo(s) {
  if (s.status === 'in_progress') return 'Buổi đang diễn ra — xem trực tiếp ở đầu trang. Video có ngay khi buổi kết thúc.';
  if (['scheduled', 'ready', 'blocked'].includes(s.status)) return 'Video có sau khi buổi tập kết thúc; bạn sẽ nhận được thông báo.';
  if (s.status === 'missed') return 'Buổi này lỡ giờ, ngựa không tập nên không có video.';
  if (s.status === 'cancelled') return `Buổi này đã hủy${s.cancelReason ? `: ${s.cancelReason}` : ''}.`;
  return 'Buổi này không có số đo cảm biến từng lần (nhập số tay) nên không có video.';
}

/**
 * One session of the owner's horse, opened from the timetable: what it was and how it went, its video
 * when the sensors followed it, the workout in its parts, and what the trainer said. Read-only.
 */
export default function SessionDetail({ session, horse, plan, onClose }) {
  const s = session;
  const look = s ? sessionLook(s) : null;
  const at = s ? dayjs(startOf(s)) : null;
  const done = s && ['completed', 'evaluated', 'aborted'].includes(s.status);
  const m = s?.metrics || {};
  const target = s ? sessionTargets(s) : {};
  const facts = !s
    ? []
    : done
      ? [
          ['Thời gian', s.actualStartAt ? `${dayjs(s.actualStartAt).format('HH:mm')}${s.actualEndAt ? ` – ${dayjs(s.actualEndAt).format('HH:mm')}` : ''}` : at.format('HH:mm')],
          ['Quãng đường', m.distance ? `${m.distance.toLocaleString('vi-VN')} m` : '—'],
          ['Tốc độ tối đa', num(m.maxSpeed, 'km/h')],
          ['Nhịp tim TB', num(m.avgHeartRate, 'bpm')],
          ['Điểm HLV', s.performanceRating ? `${s.performanceRating}/10` : 'Chưa chấm'],
        ]
      : [
          ['Giờ tập', at.format('HH:mm')],
          ['Cường độ', INTENSITY_LABELS[s.intensity] || '—'],
          ['Cự ly mục tiêu', target.distance ? `${target.distance.toLocaleString('vi-VN')} m` : '—'],
          ['Tốc độ mục tiêu', num(target.speed, 'km/h')],
          ['Nhịp tim tối đa', num(target.heartRateMax, 'bpm')],
        ];
  const parts = s?.segments || [];

  return (
    <Modal open={Boolean(s)} onCancel={onClose} footer={null} width={1000} destroyOnHidden centered wrapClassName="own-ui" title={null}>
      {s && (
        <div className="own-sd">
          <header className="own-sd-head">
            <HorseAvatar horse={horse || s.horse} size={44} />
            <div className="min-w-0">
              <div className="own-sd-kind">{sessionKind(s)}</div>
              <div className="own-sd-when">
                {horse?.name || s.horse?.name || 'Ngựa'} · {WEEKDAY_FULL[at.day()]} {at.format('DD/MM/YYYY')} · {at.format('HH:mm')}
              </div>
            </div>
            <div className="own-sd-tags">
              <Pill tone={look.tone === 'live' ? 'bad' : look.tone}>{look.label}</Pill>
              {s.performanceRating ? (
                <Pill tone={ratingTone(s.performanceRating)} dot={false}>
                  {s.performanceRating}/10
                </Pill>
              ) : null}
            </div>
          </header>

          <div className="own-video-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <div className="own-video-fact-label">{label}</div>
                <div className="own-video-fact-value">{value}</div>
              </div>
            ))}
          </div>

          {(s.outcome?.summary || (s.status === 'aborted' && s.abortReason) || (s.status === 'blocked' && s.blockedReason)) && (
            <p className={`own-sd-note is-${look.tone === 'live' ? 'info' : look.tone}`}>
              {s.status === 'aborted' ? `Dừng giữa chừng: ${s.abortReason}` : s.status === 'blocked' ? `Chưa tập được: ${s.blockedReason}` : s.outcome.summary}
            </p>
          )}

          <section className="own-sd-section">
            <h3 className="own-sd-title">
              <VideoCameraOutlined /> Video buổi tập
            </h3>
            {hasVideo(s) ? <SessionVideo session={s} horse={horse} plan={plan} /> : <div className="own-sd-empty">{noVideo(s)}</div>}
            {s.videoUrl && (
              <a href={s.videoUrl} target="_blank" rel="noreferrer" className="own-link-btn mt-2 inline-flex items-center gap-1">
                <PlayCircleOutlined /> Video HLV quay gửi kèm
              </a>
            )}
          </section>

          <div className="own-sd-grid">
            <section className="own-sd-section">
              <h3 className="own-sd-title">
                <ClockCircleOutlined /> Bài tập
              </h3>
              {parts.length ? (
                <ol className="own-sd-parts">
                  {parts.map((p, i) => (
                    <li key={i}>
                      <span className="own-sd-part-n">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="own-sd-part-kind">{SESSION_KINDS[p.kind]?.label || p.kind}</div>
                        <div className="own-sd-part-sub">{[partLine(p), p.note].filter(Boolean).join(' · ') || '—'}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="own-sd-part-sub">
                  {[target.distance && `${target.distance.toLocaleString('vi-VN')} m`, target.speed && `${target.speed} km/h`, target.heartRateMax && `tim ≤ ${target.heartRateMax} bpm`].filter(Boolean).join(' · ') ||
                    'HLV chưa ghi chi tiết bài tập.'}
                </div>
              )}
            </section>
            <section className="own-sd-section">
              <h3 className="own-sd-title">Nhận xét của HLV</h3>
              {s.trainerComment ? <div className="own-quote">{s.trainerComment}</div> : <div className="own-sd-empty">{done ? 'HLV chưa nhận xét buổi này.' : 'Có sau khi buổi tập kết thúc.'}</div>}
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}
