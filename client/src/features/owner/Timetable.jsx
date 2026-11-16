import { Fragment } from 'react';
import { LeftOutlined, RightOutlined, VideoCameraOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { HorseAvatar } from './kit';
import { sessionKind } from './ownerFormat';
import { WEEKDAY_SHORT, hasVideo, mondayOf, sessionLook, slotOf, startOf } from './trainingLook';

const SLOTS = [
  { key: 'morning', label: 'Sáng' },
  { key: 'afternoon', label: 'Chiều' },
];
const LEGEND = [
  { tone: 'good', label: 'Đạt chỉ tiêu' },
  { tone: 'watch', label: 'Chưa đạt' },
  { tone: 'bad', label: 'Dừng giữa chừng' },
  { tone: 'neutral', label: 'Lỡ giờ / đã hủy' },
  { tone: 'info', label: 'Sắp tới' },
];

/**
 * One session on the timetable: its hour, its work, where it stands; a click opens it. With several horses
 * (`horse`), the horse comes first — its coat and its name — so a glance finds it.
 */
function Chip({ session, horse, onOpen }) {
  const look = sessionLook(session);
  const video = hasVideo(session);
  const time = dayjs(startOf(session)).format('HH:mm');
  return (
    <button
      type="button"
      className={`own-tt-chip is-${look.tone}${session.status === 'cancelled' ? ' is-off' : ''}${horse ? ' has-horse' : ''}`}
      onClick={() => onOpen(session)}
      title={`${horse ? `${horse.name} · ` : ''}${sessionKind(session)} · ${dayjs(startOf(session)).format('HH:mm DD/MM')} · ${look.label}`}
    >
      {horse ? (
        <>
          <span className="own-tt-who">
            <HorseAvatar horse={horse} size={20} />
            <span className="own-tt-who-name">{horse.name}</span>
          </span>
          <span className="own-tt-line">
            <span className="own-tt-time">{time}</span> · {sessionKind(session)}
          </span>
        </>
      ) : (
        <>
          <span className="own-tt-chip-top">
            <span className="own-tt-time">{time}</span>
            {video && <VideoCameraOutlined className="own-tt-video" aria-label="Có video" />}
          </span>
          <span className="own-tt-kind">{sessionKind(session)}</span>
        </>
      )}
      <span className="own-tt-state">
        {look.tone === 'live' && <span className="own-live-dot is-small" aria-hidden="true" />}
        {look.label}
        {session.performanceRating ? ` · ${session.performanceRating}/10` : ''}
        {horse && video && <VideoCameraOutlined className="own-tt-video" aria-label="Có video" />}
      </span>
    </button>
  );
}

/**
 * The week's training as a timetable: a column a day (Monday first), a row for the morning and one for
 * the afternoon, each session in its cell; the week before and after a click away. On a narrow screen
 * the days stack. `horseOf(s)`: the horse of each session when several horses show (its coat and name
 * lead each session, and a cell lists them by time, then by horse).
 */
export default function Timetable({ sessions, weekStart, onWeek, onOpen, horseOf }) {
  const start = mondayOf(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => start.add(i, 'day'));
  const end = start.add(7, 'day');
  const today = dayjs().startOf('day');
  const inWeek = sessions
    .filter((s) => !dayjs(startOf(s)).isBefore(start) && dayjs(startOf(s)).isBefore(end))
    .sort((a, b) => new Date(startOf(a)) - new Date(startOf(b)) || String(horseOf?.(a)?.name || '').localeCompare(String(horseOf?.(b)?.name || ''), 'vi'));
  const cell = (day, slot) => inWeek.filter((s) => dayjs(startOf(s)).isSame(day, 'day') && slotOf(s) === slot);
  const ofDay = (day) => inWeek.filter((s) => dayjs(startOf(s)).isSame(day, 'day'));
  const count = (pred) => inWeek.filter(pred).length;
  const summary = [
    `${inWeek.length} buổi`,
    count((s) => ['completed', 'evaluated'].includes(s.status)) && `${count((s) => ['completed', 'evaluated'].includes(s.status))} đã tập`,
    count((s) => s.status === 'missed') && `${count((s) => s.status === 'missed')} lỡ giờ`,
    count((s) => ['scheduled', 'ready', 'blocked'].includes(s.status)) && `${count((s) => ['scheduled', 'ready', 'blocked'].includes(s.status))} sắp tới`,
  ].filter(Boolean);
  const isThisWeek = start.isSame(mondayOf(today), 'day');
  const chip = (s) => <Chip key={s._id} session={s} horse={horseOf?.(s) || null} onOpen={onOpen} />;

  return (
    <div className="own-tt-wrap">
      <div className="own-tt-bar">
        <div className="own-tt-nav">
          <button type="button" className="own-tt-step" onClick={() => onWeek(start.subtract(7, 'day'))} aria-label="Tuần trước">
            <LeftOutlined />
          </button>
          <span className="own-tt-range">
            {start.format('DD/MM')} – {start.add(6, 'day').format('DD/MM/YYYY')}
          </span>
          <button type="button" className="own-tt-step" onClick={() => onWeek(start.add(7, 'day'))} aria-label="Tuần sau">
            <RightOutlined />
          </button>
          {!isThisWeek && (
            <button type="button" className="own-tt-today" onClick={() => onWeek(today)}>
              Tuần này
            </button>
          )}
        </div>
        <span className="own-tt-summary">{inWeek.length ? summary.join(' · ') : 'Tuần này không có buổi tập'}</span>
      </div>

      {/* Wide: the timetable itself. */}
      <div className="own-tt" role="table" aria-label={`Lịch tập tuần ${start.format('DD/MM')}`}>
        <div className="own-tt-corner" />
        {days.map((d) => (
          <div key={d.format('YYYYMMDD')} className={`own-tt-head${d.isSame(today, 'day') ? ' is-today' : ''}`} role="columnheader">
            <span className="own-tt-dow">{WEEKDAY_SHORT[d.day()]}</span>
            <span className="own-tt-date">{d.format('DD/MM')}</span>
          </div>
        ))}
        {SLOTS.map((slot) => (
          <Fragment key={slot.key}>
            <div className={`own-tt-slot is-${slot.key}`} role="rowheader">
              {slot.label}
            </div>
            {days.map((d) => {
              const list = cell(d, slot.key);
              const rest = slot.key === 'morning' && !ofDay(d).length;
              return (
                <div key={`${slot.key}-${d.format('YYYYMMDD')}`} className={`own-tt-cell is-${slot.key}${d.isSame(today, 'day') ? ' is-today' : ''}`} role="cell">
                  {list.map(chip)}
                  {rest && <span className="own-tt-rest">Nghỉ</span>}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {/* Narrow: a day under the other. */}
      <div className="own-tt-list">
        {days.map((d) => {
          const list = ofDay(d);
          return (
            <div key={d.format('YYYYMMDD')} className={`own-tt-day${d.isSame(today, 'day') ? ' is-today' : ''}`}>
              <div className="own-tt-day-head">
                <b>{WEEKDAY_SHORT[d.day()]}</b> {d.format('DD/MM')}
              </div>
              <div className="own-tt-day-body">{list.length ? list.map(chip) : <span className="own-tt-rest">Nghỉ</span>}</div>
            </div>
          );
        })}
      </div>

      <div className="own-tt-legend">
        {LEGEND.map((l) => (
          <span key={l.tone}>
            <i className={`own-tt-swatch is-${l.tone}`} aria-hidden="true" />
            {l.label}
          </span>
        ))}
        <span>
          <VideoCameraOutlined /> Có video xem lại
        </span>
      </div>
    </div>
  );
}
