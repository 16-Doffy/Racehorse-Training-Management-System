import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarOutlined, HeartOutlined, MedicineBoxOutlined, RightOutlined } from '@ant-design/icons';
import { Card, ClearancePill, EmptyNote, HealthPill, HorseAvatar, HorsePicker, LoadFailed, OwnerPage, PageHead, Pill } from './kit';
import HealthDetail from './HealthDetail';
import { careDue, fmtDate, idOf, relDay } from './ownerFormat';
import { horseName } from './ownerInsights';
import { useHorseParam, useMyHorses, useOwnerSummary, useTreatments } from './useOwnerData';

// The four ways a horse can be, as the filter tiles show them.
const GROUPS = [
  { key: 'eligible', label: 'Đủ điều kiện', tone: 'good' },
  { key: 'monitoring', label: 'Cần theo dõi', tone: 'watch' },
  { key: 'sick', label: 'Chấn thương · Cách ly', tone: 'bad' },
  { key: 'unexamined', label: 'Chưa khám', tone: 'neutral' },
];
// Routine care shown ahead: the coming month, and anything overdue.
const CARE_AHEAD_DAYS = 30;

/**
 * The health of the owner's horses. All of them: the four states as filters, a row a horse with the
 * vet's last word, and beside them the treatments going on and the routine care coming up. One horse,
 * picked: its health in full (HealthDetail).
 */
export default function OwnerHealth() {
  const { horses, isLoading, isError, refetch } = useMyHorses();
  const { rows } = useOwnerSummary();
  const { treatments } = useTreatments();
  const [horseId, setHorse] = useHorseParam(horses);
  const [group, setGroup] = useState(null);

  const horsesById = useMemo(() => new Map(horses.map((h) => [idOf(h), h])), [horses]);
  const rowOf = useMemo(() => new Map(rows.map((r) => [idOf(r.horse), r])), [rows]);
  const picked = horseId ? horsesById.get(horseId) : null;
  const examinedOf = (id) => (rowOf.has(id) ? Boolean(rowOf.get(id).health.lastExam) : true);
  const groupOf = (h) => (!examinedOf(idOf(h)) ? 'unexamined' : ['injured', 'quarantined'].includes(h.healthStatus) ? 'sick' : h.healthStatus === 'monitoring' ? 'monitoring' : 'eligible');
  const counts = Object.fromEntries(GROUPS.map((g) => [g.key, horses.filter((h) => groupOf(h) === g.key).length]));
  const RANK = { sick: 0, monitoring: 1, unexamined: 2, eligible: 3 };
  const shown = horses
    .filter((h) => !group || groupOf(h) === group)
    .sort((a, b) => RANK[groupOf(a)] - RANK[groupOf(b)] || a.name.localeCompare(b.name, 'vi'));
  const ongoing = treatments.filter((t) => t.status === 'ongoing' && horsesById.has(idOf(t.horse)));
  const care = horses
    .flatMap((h) => careDue(h).map((c) => ({ ...c, horse: h })))
    .filter((c) => c.days <= CARE_AHEAD_DAYS)
    .sort((a, b) => a.days - b.days);

  return (
    <OwnerPage>
      <PageHead eyebrow="Chủ sở hữu" title="Sức khỏe" sub="Kết luận của bác sĩ, điều trị và lịch chăm sóc của từng chiến mã." />
      <HorsePicker horses={horses} value={horseId} onChange={setHorse} />

      {picked ? (
        <HealthDetail key={horseId} horse={picked} examined={examinedOf(horseId)} />
      ) : (
        <>
          <div className="own-hs-tiles" role="group" aria-label="Lọc theo tình trạng">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`own-hs-tile is-${g.tone}${group === g.key ? ' is-active' : ''}`}
                onClick={() => setGroup(group === g.key ? null : g.key)}
                aria-pressed={group === g.key}
              >
                <span className="own-hs-tile-n">{counts[g.key]}</span>
                <span className="own-hs-tile-label">{g.label}</span>
              </button>
            ))}
          </div>

          <div className="own-grid-main">
            <Card
              title={group ? GROUPS.find((g) => g.key === group).label : 'Tất cả chiến mã'}
              icon={<HeartOutlined />}
              flush
              extra={
                group ? (
                  <button type="button" className="own-link-btn" onClick={() => setGroup(null)}>
                    Bỏ lọc
                  </button>
                ) : null
              }
            >
              {horses.length === 0 ? (
                isError && !isLoading ? <LoadFailed what="danh sách chiến mã" onRetry={refetch} /> : <EmptyNote>{isLoading ? 'Đang tải…' : 'Bạn chưa có chiến mã nào.'}</EmptyNote>
              ) : shown.length === 0 ? (
                <EmptyNote>Không có chiến mã nào ở tình trạng này.</EmptyNote>
              ) : (
                <ul className="own-list">
                  {shown.map((h) => {
                    const id = idOf(h);
                    const exam = rowOf.get(id)?.health.lastExam;
                    return (
                      <li key={id}>
                        <Link className="own-row own-hs-row" to={`/owner/health?horse=${id}`}>
                          <HorseAvatar horse={h} size={36} />
                          <div className="own-row-main">
                            <div className="own-row-title">{h.name}</div>
                            <div className="own-row-sub own-hs-sub">{exam ? `Khám ${relDay(exam.date)} · ${exam.diagnosis}` : 'Chưa có lần khám nào'}</div>
                          </div>
                          <div className="own-row-side">
                            <HealthPill status={h.healthStatus} examined={examinedOf(id)} />
                            <ClearancePill horse={h} />
                          </div>
                          <RightOutlined className="own-hl-go" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="flex min-w-0 flex-col gap-4">
              <Card title="Đang điều trị" icon={<MedicineBoxOutlined />} flush extra={ongoing.length ? <Pill tone="info">{ongoing.length}</Pill> : null}>
                {ongoing.length === 0 ? (
                  <EmptyNote>Không có ngựa nào đang điều trị.</EmptyNote>
                ) : (
                  <ul className="own-list">
                    {ongoing.map((t) => (
                      <li key={t._id}>
                        <Link className="own-row own-hs-row" to={`/owner/health?horse=${idOf(t.horse)}`}>
                          <HorseAvatar horse={horsesById.get(idOf(t.horse)) || t.horse} size={30} />
                          <div className="own-row-main">
                            <div className="own-row-title">{horseName(t.horse, horsesById)}</div>
                            <div className="own-row-sub own-hs-sub">
                              {t.medications?.length ? t.medications.map((m) => m.name).join(', ') : 'Chăm sóc theo y lệnh'}
                              {t.endDate ? ` · tới ${fmtDate(t.endDate)}` : ''}
                            </div>
                          </div>
                          {t.isTrainingLocked && (
                            <div className="own-row-side">
                              <Pill tone="bad">Khóa tập</Pill>
                            </div>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card title="Lịch chăm sóc sắp tới" icon={<CalendarOutlined />} flush extra={<span className="own-faint text-xs">{CARE_AHEAD_DAYS} ngày tới</span>}>
                {care.length === 0 ? (
                  <EmptyNote>Không có lịch chăm sóc nào trong {CARE_AHEAD_DAYS} ngày tới.</EmptyNote>
                ) : (
                  <ul className="own-list">
                    {care.slice(0, 8).map((c) => (
                      <li key={`${idOf(c.horse)}-${c.key}`}>
                        <Link className="own-row own-hs-row" to={`/owner/health?horse=${idOf(c.horse)}`}>
                          <HorseAvatar horse={c.horse} size={30} />
                          <div className="own-row-main">
                            <div className="own-row-title">{c.label}</div>
                            <div className="own-row-sub">
                              {c.horse.name} · {fmtDate(c.due)}
                            </div>
                          </div>
                          <div className="own-row-side">
                            <Pill tone={c.days < 0 ? 'bad' : c.days <= 7 ? 'watch' : 'neutral'}>{c.days < 0 ? `Quá hạn ${-c.days} ngày` : relDay(c.due)}</Pill>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </OwnerPage>
  );
}
