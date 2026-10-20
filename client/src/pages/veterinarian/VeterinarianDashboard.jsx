import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import PageHeroBanner from '../../components/common/PageHeroBanner';
import HealthAlert from '../../components/veterinarian/HealthAlert';
import CareModal from '../../components/veterinarian/CareModal';
import ExamRequestModal from '../../components/veterinarian/ExamRequestModal';
import HorsePickerModal from '../../components/veterinarian/HorsePickerModal';
import IncidentModal from '../../components/veterinarian/IncidentModal';
import { ActionMenu, Callout, EmptyNote, FilterChips, HorseAvatar, LevelPill, LoadingBlock, Pill, Progress, VetCard } from '../../components/veterinarian/ui';
import {
  CARE_KINDS,
  CARE_ORDER,
  CLEARANCE_SOURCE,
  PRIORITY_META,
  ago,
  clearanceOf,
  daysUntil,
  dueInfo,
  fmtDate,
  fmtDateTime,
  idOf,
  incidentCategory,
  incidentImages,
  incidentSeverity,
} from '../../components/veterinarian/vetFormat';
import { incidentStatusOf } from '../../constants/care';
import useSocket from '../../hooks/useSocket';
import { useCareOrders, useClearances, useExamRequests, useIncidents, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const KIND_FILTERS = [
  { value: 'incident', label: 'Sự cố' },
  { value: 'request', label: 'Yêu cầu khám' },
  { value: 'clearance', label: 'Cần khám' },
  { value: 'care', label: 'Chăm sóc định kỳ' },
];
// How far ahead routine care shows up in the queue.
const CARE_AHEAD_DAYS = 3;

const joinVi = (parts) => (parts.length > 1 ? `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}` : parts[0]);

/**
 * Everything waiting for the vet, in one queue, most urgent first: groom incidents, exam requests,
 * horses whose last exam no longer clears them, and routine care falling due. Each row has one main
 * action; the rest sits in its "…" menu.
 */
function buildQueue({ horses, requests, incidents, clearances }) {
  const items = [];
  for (const task of incidents) {
    const severity = task.incidentReport?.severity || 'medium';
    items.push({ key: `incident-${task._id}`, kind: 'incident', horseId: idOf(task.horse), rank: severity === 'high' ? 0 : severity === 'medium' ? 2 : 4, at: task.incidentReport?.reportedAt || task.updatedAt, task });
  }
  for (const request of requests) {
    items.push({ key: `request-${request._id}`, kind: 'request', horseId: idOf(request.horse), rank: PRIORITY_META[request.priority]?.rank ?? 2, at: request.createdAt, request });
  }
  // A horse already asked about is answered by the same exam: one row is enough.
  const examWanted = new Set(requests.map((r) => idOf(r.horse)));
  for (const row of clearances) {
    const horseId = idOf(row.horse);
    if (row.status === 'valid' || examWanted.has(horseId)) continue;
    examWanted.add(horseId);
    items.push({ key: `clearance-${horseId}`, kind: 'clearance', horseId, rank: row.status === 'due_soon' ? 5 : 3, at: row.lastExam?.date, clearance: row });
  }
  for (const horse of horses) {
    for (const careKind of CARE_ORDER) {
      const due = horse.careSchedule?.[CARE_KINDS[careKind].field];
      if (!due || daysUntil(due) > CARE_AHEAD_DAYS) continue;
      if (careKind === 'exam' && examWanted.has(horse._id)) continue;
      items.push({ key: `care-${horse._id}-${careKind}`, kind: 'care', horseId: horse._id, rank: daysUntil(due) < 0 ? 4 : 6, at: due, careKind, due });
    }
  }
  return items.sort((a, b) => a.rank - b.rank || new Date(a.at || 0) - new Date(b.at || 0));
}

function QueueRow({ icon, tone, horse, onOpenHorse, pills, text, meta, primary, secondary, menu }) {
  return (
    <div className="vet-row">
      <span className={`vet-kind-icon vet-tone-${tone}`} aria-hidden="true">
        <i className={`bi ${icon}`} />
      </span>
      <div className="vet-row-main">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <button type="button" className="vet-link vet-row-title" style={{ color: 'var(--vet-ink)' }} onClick={onOpenHorse}>
            {horse?.name || 'Ngựa'}
          </button>
          {pills}
        </div>
        {text && <div className="vet-muted vet-clamp-2 mt-1">{text}</div>}
        {meta && <div className="vet-small vet-faint mt-1">{meta}</div>}
      </div>
      <div className="vet-row-actions">
        {secondary}
        {primary}
        <ActionMenu items={menu} />
      </div>
    </div>
  );
}

export default function VeterinarianDashboard() {
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const refresh = useVetRefresh();
  const horsesQ = useVetHorses();
  const requestsQ = useExamRequests();
  const incidentsQ = useIncidents();
  const clearancesQ = useClearances();
  const ordersQ = useCareOrders();
  const { alerts, clearAlert, clearAllAlerts } = useSocket();
  const [filter, setFilter] = useState('all');
  const [dialog, setDialog] = useState(null);

  const horses = useMemo(() => horsesQ.data || [], [horsesQ.data]);
  const horseById = useMemo(() => new Map(horses.map((h) => [h._id, h])), [horses]);
  const queue = useMemo(
    () => buildQueue({ horses, requests: requestsQ.data || [], incidents: incidentsQ.data || [], clearances: clearancesQ.data || [] }),
    [horses, requestsQ.data, incidentsQ.data, clearancesQ.data]
  );
  const counts = KIND_FILTERS.reduce((acc, k) => ({ ...acc, [k.value]: queue.filter((i) => i.kind === k.value).length }), {});
  const shown = filter === 'all' ? queue : queue.filter((i) => i.kind === filter);
  const restricted = horses.filter((h) => clearanceOf(h).restricted);
  const orders = (ordersQ.data || []).filter((r) => r.tasks?.length || r.medications?.length || r.careInstructions);
  const loading = horsesQ.isLoading || requestsQ.isLoading || incidentsQ.isLoading || clearancesQ.isLoading;
  const failed = [horsesQ, requestsQ, incidentsQ, clearancesQ].find((q) => q.isError);

  const close = () => setDialog(null);
  const openHorse = (id) => navigate(`/veterinarian/horses/${id}`);
  const examine = (id) => navigate(`/veterinarian/examinations/new/${id}`);
  const horseOf = (item, fallback) => horseById.get(item.horseId) || fallback;

  const summary = [
    counts.incident && `${counts.incident} sự cố`,
    counts.request && `${counts.request} yêu cầu khám`,
    counts.clearance && `${counts.clearance} ngựa cần khám`,
    counts.care && `${counts.care} việc chăm sóc đến hạn`,
  ].filter(Boolean);
  const count = (status) => horses.filter((h) => h.healthStatus === status).length;

  const renderItem = (item) => {
    if (item.kind === 'incident') {
      const { task } = item;
      const report = task.incidentReport || {};
      const severity = incidentSeverity(report.severity);
      const photos = incidentImages(report).length;
      return (
        <QueueRow
          key={item.key}
          icon="bi-exclamation-octagon"
          tone={severity.tone}
          horse={horseOf(item, task.horse)}
          onOpenHorse={() => openHorse(item.horseId)}
          pills={
            <>
              <Pill tone={severity.tone}>Sự cố · {severity.label}</Pill>
              <Pill>{incidentCategory(report.category)}</Pill>
              {incidentStatusOf(report) === 'acknowledged' && <Pill tone="info">Đã tiếp nhận</Pill>}
            </>
          }
          text={report.description}
          meta={`${task.assignedTo?.name || 'Nhân viên chăm sóc'} báo ${ago(report.reportedAt || task.updatedAt)}${photos ? ` · ${photos} ảnh` : ''}`}
          primary={
            <Button size="sm" variant="vet" onClick={() => setDialog({ type: 'incident', task })}>
              Xử lý
            </Button>
          }
          menu={[
            { label: 'Khám ngựa này', icon: 'bi-clipboard2-pulse', onClick: () => examine(item.horseId) },
            { label: 'Hồ sơ ngựa', icon: 'bi-journal-medical', onClick: () => openHorse(item.horseId) },
          ]}
        />
      );
    }
    if (item.kind === 'request') {
      const { request } = item;
      const priority = PRIORITY_META[request.priority] || PRIORITY_META.normal;
      const accepted = Boolean(request.acceptedAt);
      return (
        <QueueRow
          key={item.key}
          icon="bi-clipboard2-pulse"
          tone={request.priority === 'normal' ? 'info' : priority.tone}
          horse={horseOf(item, request.horse)}
          onOpenHorse={() => openHorse(item.horseId)}
          pills={
            <>
              <Pill tone={request.priority === 'normal' ? 'info' : priority.tone}>Yêu cầu khám{request.priority !== 'normal' ? ` · ${priority.label}` : ''}</Pill>
              {accepted ? (
                <Pill tone="good" icon="bi-calendar-check">
                  {request.scheduledFor ? `Hẹn ${fmtDateTime(request.scheduledFor)}` : 'Đã nhận'}
                </Pill>
              ) : (
                <Pill>Chưa nhận</Pill>
              )}
            </>
          }
          text={request.reason}
          meta={`${request.requestedBy?.name || 'HLV'} gửi ${ago(request.createdAt)}`}
          secondary={
            !accepted && (
              <Button size="sm" variant="vet-outline" onClick={() => setDialog({ type: 'request', request, mode: 'accept' })}>
                Nhận & hẹn
              </Button>
            )
          }
          primary={
            <Button size="sm" variant="vet" onClick={() => examine(item.horseId)}>
              Khám ngay
            </Button>
          }
          menu={[
            accepted && { label: 'Đổi lịch hẹn', icon: 'bi-calendar-event', onClick: () => setDialog({ type: 'request', request, mode: 'accept' }) },
            { label: 'Từ chối yêu cầu', icon: 'bi-x-circle', onClick: () => setDialog({ type: 'request', request, mode: 'decline' }), danger: true },
            { divider: true },
            { label: 'Hồ sơ ngựa', icon: 'bi-journal-medical', onClick: () => openHorse(item.horseId) },
          ]}
        />
      );
    }
    if (item.kind === 'clearance') {
      const { clearance: c } = item;
      const overdue = typeof c.ageDays === 'number' ? c.ageDays - (c.clearanceDays || 14) : 0;
      const label = c.status === 'never' ? 'Chưa khám lần nào' : c.status === 'expired' ? `Quá hạn khám ${Math.max(overdue, 1)} ngày` : 'Sắp hết hạn khám';
      const text =
        c.status === 'never'
          ? 'Cần một phiếu khám trước khi ngựa được xếp buổi tập nặng.'
          : `Khám gần nhất ${fmtDate(c.lastExam?.date)}${c.lastExam?.diagnosis ? ` — ${c.lastExam.diagnosis}` : ''}. Phiếu khám có giá trị ${c.clearanceDays || 14} ngày.`;
      return (
        <QueueRow
          key={item.key}
          icon="bi-calendar2-x"
          tone={c.status === 'due_soon' ? 'watch' : 'bad'}
          horse={horseOf(item, c.horse)}
          onOpenHorse={() => openHorse(item.horseId)}
          pills={<Pill tone={c.status === 'due_soon' ? 'watch' : 'bad'}>{label}</Pill>}
          text={text}
          primary={
            <Button size="sm" variant="vet" onClick={() => examine(item.horseId)}>
              Khám
            </Button>
          }
          menu={[{ label: 'Hồ sơ ngựa', icon: 'bi-journal-medical', onClick: () => openHorse(item.horseId) }]}
        />
      );
    }
    const horse = horseOf(item, null);
    const meta = CARE_KINDS[item.careKind];
    const info = dueInfo(item.due, CARE_AHEAD_DAYS);
    return (
      <QueueRow
        key={item.key}
        icon={meta.icon}
        tone={info.tone}
        horse={horse}
        onOpenHorse={() => openHorse(item.horseId)}
        pills={
          <Pill tone={info.tone}>
            {meta.label} · {info.rel.toLowerCase()}
          </Pill>
        }
        meta={`Hạn ${fmtDate(item.due)}`}
        primary={
          item.careKind === 'exam' ? (
            <Button size="sm" variant="vet" onClick={() => examine(item.horseId)}>
              Khám
            </Button>
          ) : (
            <Button size="sm" variant="vet" onClick={() => setDialog({ type: 'care', horse, kind: item.careKind, mode: 'record' })}>
              Ghi nhận
            </Button>
          )
        }
        menu={[
          { label: 'Dời ngày hẹn', icon: 'bi-calendar-event', onClick: () => setDialog({ type: 'care', horse, kind: item.careKind, mode: 'due' }) },
          { label: 'Hồ sơ ngựa', icon: 'bi-journal-medical', onClick: () => openHorse(item.horseId) },
        ]}
      />
    );
  };

  return (
    <div className="vet-ui">
      <HealthAlert alerts={alerts} onDismiss={clearAlert} onDismissAll={clearAllAlerts} />

      <PageHeroBanner
        eyebrow="TEAM 8 • Y TẾ & THÚ Y"
        roleLabel="Bác sĩ Thú y"
        title={`Xin chào, ${user?.name || 'Bác sĩ'}`}
        subtitle={loading ? 'Đang tải việc hôm nay…' : summary.length ? `Hôm nay có ${joinVi(summary)} đang chờ bạn.` : 'Không có việc gấp — đàn ngựa đang ổn định.'}
        stats={
          horses.length
            ? [
                { label: 'Theo dõi', value: `${horses.length} ngựa` },
                { label: 'Đủ điều kiện', value: count('eligible') },
                { label: 'Hạn chế tập', value: restricted.length },
                { label: 'Chấn thương', value: count('injured') },
                { label: 'Cách ly', value: count('quarantined') },
              ]
            : []
        }
        actionButton={
          <div className="d-flex flex-wrap gap-2">
            <Button variant="vet-hero-outline" onClick={() => setDialog({ type: 'pick', purpose: 'treat' })}>
              <i className="bi bi-capsule" aria-hidden="true" /> Kê đơn
            </Button>
            <Button variant="vet-hero" onClick={() => setDialog({ type: 'pick', purpose: 'exam' })}>
              <i className="bi bi-clipboard2-pulse" aria-hidden="true" /> Khám bệnh
            </Button>
          </div>
        }
      />

      {failed && (
        <Callout
          tone="bad"
          icon="bi-wifi-off"
          className="mb-3"
          action={
            <Button size="sm" variant="vet-outline" onClick={refresh}>
              Thử lại
            </Button>
          }
        >
          {failed.error?.message || 'Không tải được dữ liệu.'}
        </Callout>
      )}

      <div className="vet-grid-2">
        <VetCard
          title="Việc cần xử lý"
          icon="bi-list-check"
          count={loading ? null : queue.length}
          flush
          extra={
            <Button size="sm" variant="vet-ghost" className="vet-icon-btn" onClick={refresh} title="Làm mới" aria-label="Làm mới">
              <i className="bi bi-arrow-clockwise" aria-hidden="true" />
            </Button>
          }
        >
          {queue.length > 0 && (
            <div className="px-3 pt-3 pb-2">
              <FilterChips
                value={filter}
                onChange={setFilter}
                options={[{ value: 'all', label: 'Tất cả', count: queue.length }, ...KIND_FILTERS.filter((k) => counts[k.value]).map((k) => ({ ...k, count: counts[k.value] }))]}
              />
            </div>
          )}
          {loading ? (
            <LoadingBlock rows={4} height={64} />
          ) : shown.length === 0 ? (
            <EmptyNote icon="bi-check2-circle" title="Không còn việc nào chờ xử lý">
              Sự cố, yêu cầu khám và lịch chăm sóc mới sẽ hiện ở đây.
            </EmptyNote>
          ) : (
            <div className="vet-list">{shown.map(renderItem)}</div>
          )}
        </VetCard>

        <div className="vet-stack">
          <VetCard title="Hạn chế tập luyện" icon="bi-lock" count={horsesQ.isLoading ? null : restricted.length} flush>
            {horsesQ.isLoading ? (
              <LoadingBlock rows={2} height={44} />
            ) : restricted.length === 0 ? (
              <EmptyNote icon="bi-unlock" title="Không ngựa nào bị hạn chế tập" />
            ) : (
              <div className="vet-list">
                {restricted.map((h) => {
                  const c = clearanceOf(h);
                  return (
                    <div key={h._id} className="vet-row is-clickable" role="button" tabIndex={0} onClick={() => openHorse(h._id)} onKeyDown={(e) => e.key === 'Enter' && openHorse(h._id)}>
                      <HorseAvatar horse={h} size={34} />
                      <div className="vet-row-main">
                        <div className="d-flex flex-wrap align-items-center gap-2">
                          <span className="vet-row-title">{h.name}</span>
                          <LevelPill level={c.level} short />
                        </div>
                        <div className="vet-small vet-muted vet-clamp-1">{c.reason || CLEARANCE_SOURCE[c.source] || ''}</div>
                      </div>
                      <i className="bi bi-chevron-right vet-faint" aria-hidden="true" />
                    </div>
                  );
                })}
              </div>
            )}
          </VetCard>

          <VetCard
            title="Y lệnh hôm nay"
            icon="bi-capsule"
            count={ordersQ.isLoading ? null : orders.length}
            flush
            extra={
              <button type="button" className="vet-link vet-small" onClick={() => navigate('/veterinarian/treatments')}>
                Điều trị
              </button>
            }
          >
            {ordersQ.isLoading ? (
              <LoadingBlock rows={2} height={44} />
            ) : orders.length === 0 ? (
              <EmptyNote icon="bi-capsule" title="Hôm nay không có y lệnh cần theo dõi" />
            ) : (
              <div className="vet-list">
                {orders.map((row) => {
                  const p = row.progress || {};
                  const horseId = idOf(row.horse);
                  return (
                    <div key={row._id} className="vet-row is-clickable" role="button" tabIndex={0} onClick={() => openHorse(horseId)} onKeyDown={(e) => e.key === 'Enter' && openHorse(horseId)}>
                      <HorseAvatar horse={horseById.get(horseId) || row.horse} size={34} />
                      <div className="vet-row-main">
                        <div className="d-flex align-items-center justify-content-between gap-2">
                          <span className="vet-row-title text-truncate">{row.horse?.name || 'Ngựa'}</span>
                          <span className="vet-small vet-tnum vet-muted">{p.total ? `${p.done}/${p.total} đã làm` : 'Chưa có việc'}</span>
                        </div>
                        {p.total > 0 && (
                          <div className="mt-1">
                            <Progress value={p.done} max={p.total} tone={p.missed || p.notDone ? 'bad' : 'good'} />
                          </div>
                        )}
                        {(p.missed > 0 || p.notDone > 0 || !p.total) && (
                          <div className={`vet-small mt-1 ${p.total ? 'vet-text-bad' : 'vet-faint'}`}>
                            {!p.total
                              ? 'Hôm nay không còn liều nào: đã qua giờ cho thuốc, hoặc ngựa chưa có người chăm sóc phụ trách.'
                              : [p.missed && `${p.missed} bỏ lỡ`, p.notDone && `${p.notDone} không cho được`].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </VetCard>
        </div>
      </div>

      {dialog?.type === 'request' && <ExamRequestModal request={dialog.request} mode={dialog.mode} onHide={close} onDone={refresh} />}
      {dialog?.type === 'incident' && <IncidentModal task={dialog.task} onHide={close} onDone={refresh} />}
      {dialog?.type === 'care' && dialog.horse && <CareModal horse={dialog.horse} kind={dialog.kind} initialMode={dialog.mode} onHide={close} onDone={refresh} />}
      {dialog?.type === 'pick' && (
        <HorsePickerModal
          title={dialog.purpose === 'exam' ? 'Khám ngựa nào?' : 'Kê đơn cho ngựa nào?'}
          horses={horses}
          onHide={close}
          onPick={(h) => {
            close();
            navigate(dialog.purpose === 'exam' ? `/veterinarian/examinations/new/${h._id}` : `/veterinarian/treatments/new?horseId=${h._id}`);
          }}
        />
      )}
    </div>
  );
}
