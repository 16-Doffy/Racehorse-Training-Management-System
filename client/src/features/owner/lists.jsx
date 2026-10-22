import { useState } from 'react';
import { AlertOutlined, CalendarOutlined, FlagOutlined, MedicineBoxOutlined, SafetyCertificateOutlined, ToolOutlined, TrophyOutlined } from '@ant-design/icons';
import { DateChip, EmptyNote, MoreButton, Pill, Row } from './kit';
import { RACE_STATUS, SESSION_STATUS_LABELS, SESSION_TONES, daysFromToday, fmtDate, fmtTime, relDay, weekday } from './ownerFormat';
import { horseName } from './ownerInsights';

const ATTENTION_ICONS = { exam: <SafetyCertificateOutlined />, health: <MedicineBoxOutlined />, care: <CalendarOutlined />, race: <FlagOutlined /> };

/** The "needs a look" list (ownerInsights.attentionItems): the most serious first, six at a time. */
export function AttentionList({ items, emptyText = 'Không có gì cần bạn để ý — các chiến mã đều ổn.' }) {
  const [shown, setShown] = useState(6);
  if (!items.length) return <EmptyNote>{emptyText}</EmptyNote>;
  return (
    <>
      <ul className="own-list">
        {items.slice(0, shown).map((it) => (
          <li key={it.key}>
            <Row to={it.to} lead={<span className={`own-icon is-${it.tone === 'neutral' ? 'brass' : it.tone}`}>{ATTENTION_ICONS[it.kind] || <AlertOutlined />}</span>} title={it.title} sub={it.sub} />
          </li>
        ))}
      </ul>
      <MoreButton shown={shown} total={items.length} onMore={() => setShown((n) => n + 6)} />
    </>
  );
}

const CARE_KINDS = [
  ['vaccination', 'Tiêm phòng', 'nextVaccinationDue'],
  ['deworming', 'Tẩy giun', 'nextDewormingDue'],
  ['farrier', 'Đóng móng', 'nextFarrierDue'],
  ['exam', 'Khám định kỳ', 'nextExamDue'],
];

/** The horse's routine care, the vet's next dates: overdue in red, this week in amber. */
export function CareSchedule({ horse }) {
  const schedule = horse?.careSchedule || {};
  return (
    <ul className="own-list">
      {CARE_KINDS.map(([key, label, field]) => {
        const due = schedule[field];
        const days = due ? daysFromToday(due) : null;
        const tone = days === null ? 'neutral' : days < 0 ? 'bad' : days <= 7 ? 'watch' : 'good';
        return (
          <li key={key}>
            <Row
              lead={<span className={`own-icon is-${tone === 'neutral' ? 'brass' : tone}`}>{key === 'farrier' ? <ToolOutlined /> : key === 'exam' ? <SafetyCertificateOutlined /> : <MedicineBoxOutlined />}</span>}
              title={label}
              sub={due ? `Hẹn ngày ${fmtDate(due)}` : 'Bác sĩ chưa lên lịch'}
              side={due && <Pill tone={tone}>{days < 0 ? `Quá hạn ${-days} ngày` : relDay(due)}</Pill>}
            />
          </li>
        );
      })}
    </ul>
  );
}

/** Coming sessions and races (ownerInsights.agendaItems), each with its day, time and status. */
export function AgendaList({ items, horsesById, showHorse = true, emptyText = 'Chưa có buổi tập hay giải đua nào sắp tới.' }) {
  if (!items.length) return <EmptyNote>{emptyText}</EmptyNote>;
  return (
    <ul className="own-list">
      {items.map((it) => {
        const race = it.kind === 'race';
        const status = race ? RACE_STATUS[it.status] : { label: SESSION_STATUS_LABELS[it.status] || it.status, tone: SESSION_TONES[it.status] };
        const when = race ? relDay(it.at) : `${fmtTime(it.at)} · ${relDay(it.at)}`;
        return (
          <li key={it.key}>
            <Row
              to={it.to}
              lead={<DateChip date={it.at} sub={weekday(it.at)} />}
              title={
                <span className="inline-flex items-center gap-1.5">
                  {race && <TrophyOutlined className="own-watch" />}
                  {it.title}
                </span>
              }
              sub={[showHorse ? horseName(it.horse, horsesById) : null, race ? it.venue || 'Giải đua' : 'Buổi tập', when].filter(Boolean).join(' · ')}
              side={status && <Pill tone={status.tone}>{status.label}</Pill>}
            />
          </li>
        );
      })}
    </ul>
  );
}
