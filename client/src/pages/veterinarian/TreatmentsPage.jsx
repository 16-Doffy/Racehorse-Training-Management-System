import { useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DetailDrawer, { useDetailDrawer } from '../../components/veterinarian/DetailDrawer';
import HorsePickerModal from '../../components/veterinarian/HorsePickerModal';
import TrainingLevelModal from '../../components/veterinarian/TrainingLevelModal';
import { periodOf } from '../../components/veterinarian/TreatmentList';
import useConfirm from '../../components/veterinarian/useConfirm';
import { endTreatment } from '../../components/veterinarian/vetActions';
import { ActionMenu, Callout, EmptyNote, FilterChips, HorseAvatar, LoadingBlock, PageHead, Progress, SearchBox, StatTiles } from '../../components/veterinarian/ui';
import { LEVEL_META, fmtShort, idOf, isMedActive, medTimes, routeLabel, treatmentLevel } from '../../components/veterinarian/vetFormat';
import { useCareOrders, useInjuries, useTreatments, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const HERE = '/veterinarian/treatments';
// The medicine's icon by how it is given.
const ROUTE_ICON = { oral: 'bi-capsule', im: 'bi-eyedropper', iv: 'bi-eyedropper', sc: 'bi-eyedropper', topical: 'bi-droplet-half', eye: 'bi-eye' };

/** Where a running prescription stands, in a sentence and a colour. */
function stateOf(t) {
  if (t.status !== 'ongoing') return { tone: 'neutral', icon: 'bi-archive', text: t.replacedBy ? `Đã thay bằng đơn mới · ${fmtShort(t.endDate || t.updatedAt)}` : `Đã kết thúc · ${fmtShort(t.endDate || t.updatedAt)}` };
  const p = periodOf(t);
  if (p.late) return { tone: 'bad', icon: 'bi-exclamation-triangle-fill', text: 'Đã quá ngày kết thúc dự kiến', late: true };
  return { tone: 'good', icon: 'bi-play-circle-fill', text: p.pct !== null ? `Đang dùng · ${p.label}` : `Đang dùng · ${p.label}, chưa hẹn ngày kết thúc` };
}

/** What the prescription does to training, in plain words. */
function trainingOf(t) {
  const level = treatmentLevel(t);
  if (level === 'high') return { tone: 'faint', icon: 'bi-check2', text: 'Không ảnh hưởng việc tập' };
  return { tone: level === 'none' ? 'bad' : 'watch', icon: level === 'none' ? 'bi-lock-fill' : 'bi-exclamation-triangle-fill', text: level === 'none' ? 'Ngựa không được tập' : LEVEL_META[level].label, reason: t.lockReason };
}

/**
 * One prescription as a card that reads top to bottom: the horse and where the prescription stands, the
 * medicines (how much, how, when), what it does to training, its period and today's doses, then what the vet
 * can do — end it (first when it ran past its end), replace it, change the training level.
 */
function RxCard({ t, progress, onOpen, onOpenExam, onEnd, onReplace, onLevel, onHorse }) {
  const ongoing = t.status === 'ongoing';
  const state = stateOf(t);
  const training = trainingOf(t);
  const period = periodOf(t);
  const meds = (t.medications || []).filter((m) => (ongoing ? isMedActive(m) : true));
  const p = progress?.progress;
  const notGiven = (p?.missed || 0) + (p?.notDone || 0);

  return (
    <article className={`vet-rx-card${ongoing ? '' : ' is-ended'}${state.late ? ' is-late' : ''}`}>
      <header className="vet-rx-card-head">
        <button type="button" className="vet-rx-card-horse" onClick={onHorse} title={`Chỉ xem đơn của ${t.horse?.name || 'ngựa'}`}>
          <HorseAvatar horse={t.horse} size={38} />
          <span style={{ minWidth: 0 }}>
            <span className="vet-rx-card-name">{t.horse?.name || 'Ngựa'}</span>
            <span className="vet-rx-card-by">
              Kê {fmtShort(t.startDate || t.createdAt)}
              {t.prescribedBy?.name ? ` · BS ${t.prescribedBy.name}` : ''}
            </span>
          </span>
        </button>
        <span className={`vet-rx-state vet-tone-${state.tone}`}>
          <i className={`bi ${state.icon}`} aria-hidden="true" /> {state.text}
        </span>
      </header>

      {/* The medicines: what, how much, how, when. */}
      <div className="vet-rx-card-body">
        <div className="vet-rx-card-label">Thuốc ({meds.length})</div>
        {meds.length ? (
          <ul className="vet-rx-meds">
            {meds.map((m, i) => {
              const times = medTimes(m);
              return (
                <li key={m._id || i}>
                  <i className={`bi ${ROUTE_ICON[m.route] || 'bi-capsule'} vet-faint`} aria-hidden="true" />
                  <span className="vet-rx-med-name">{m.name}</span>
                  <span className="vet-rx-med-how">
                    {[m.dosage, routeLabel(m.route)?.toLowerCase(), times.length ? times.join(', ') : m.frequency].filter(Boolean).join(' · ')}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="vet-small vet-faint">Không kê thuốc.</div>
        )}
        {t.careInstructions && (
          <>
            <div className="vet-rx-card-label mt-2">Y lệnh chăm sóc</div>
            <div className="vet-rx-care">{t.careInstructions}</div>
          </>
        )}
      </div>

      {/* Three facts side by side: training, period, today. */}
      <div className="vet-rx-facts">
        <div>
          <div className="vet-rx-card-label">Tập luyện</div>
          <div className={`vet-rx-fact vet-text-${training.tone}`} title={training.reason || undefined}>
            <i className={`bi ${training.icon}`} aria-hidden="true" /> {training.text}
          </div>
          {training.reason && <div className="vet-small vet-faint text-truncate">{training.reason}</div>}
        </div>
        <div>
          <div className="vet-rx-card-label">Thời gian</div>
          <div className="vet-rx-fact vet-tnum">{period.range}</div>
          {ongoing && period.pct !== null && <Progress value={period.pct} max={100} tone={period.late ? 'bad' : 'info'} />}
        </div>
        <div>
          <div className="vet-rx-card-label">Liều hôm nay</div>
          {!ongoing ? (
            <div className="vet-rx-fact vet-faint">—</div>
          ) : p?.total > 0 ? (
            <>
              <div className={`vet-rx-fact vet-tnum ${notGiven ? 'vet-text-bad' : ''}`}>
                Đã cho {p.done}/{p.total} liều
              </div>
              <Progress value={p.done} max={p.total} tone={notGiven ? 'bad' : 'good'} />
              {notGiven > 0 && <div className="vet-small vet-text-bad">{notGiven} liều chưa cho được</div>}
            </>
          ) : (
            <div className="vet-rx-fact vet-faint" title="Nhân viên chăm sóc không có liều nào phải cho hôm nay">
              {state.late ? 'Không còn liều — đơn đã qua ngày kết thúc' : 'Hôm nay không có liều'}
            </div>
          )}
        </div>
      </div>

      <footer className="vet-rx-card-foot" onClick={(e) => e.stopPropagation()}>
        {ongoing ? (
          <>
            <Button size="sm" variant={state.late ? 'vet' : 'vet-outline'} onClick={() => onEnd(t)}>
              <i className="bi bi-stop-circle" aria-hidden="true" /> Kết thúc đơn
            </Button>
            <Button size="sm" variant="vet-outline" onClick={() => onReplace(t)}>
              <i className="bi bi-arrow-left-right" aria-hidden="true" /> Kê đơn thay thế
            </Button>
          </>
        ) : (
          <Button size="sm" variant="vet-outline" onClick={() => onOpen(t)}>
            Xem chi tiết
          </Button>
        )}
        <span className="ms-auto" />
        <ActionMenu
          items={[
            { label: 'Xem chi tiết đơn', icon: 'bi-card-text', onClick: () => onOpen(t) },
            t.healthRecord && { label: 'Phiếu khám của đơn', icon: 'bi-clipboard2-pulse', onClick: () => onOpenExam(t) },
            ongoing && { label: 'Đổi mức tập', icon: 'bi-speedometer2', onClick: () => onLevel(t) },
          ]}
        />
      </footer>
    </article>
  );
}

/**
 * Every prescription as a card: what is being given now (with today's doses as the groom records them) and
 * what has ended, searched by horse or medicine. Tiles on top count what needs the vet (past their end, holding
 * the horse back) and filter to it. A card opens in a drawer on this page; ending, replacing or changing the
 * training level happen here as well.
 */
export default function TreatmentsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refresh = useVetRefresh();
  const [confirm, confirmDialog] = useConfirm();
  const drawer = useDetailDrawer();
  const treatmentsQ = useTreatments();
  const ordersQ = useCareOrders();
  const horsesQ = useVetHorses();
  const injuriesQ = useInjuries();
  const [status, setStatus] = useState('ongoing');
  const [tile, setTile] = useState(null);
  const [horseFilter, setHorseFilter] = useState(params.get('horseId') || 'all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);

  const horses = useMemo(() => horsesQ.data || [], [horsesQ.data]);
  const treatments = useMemo(() => treatmentsQ.data || [], [treatmentsQ.data]);
  const horseById = useMemo(() => new Map(horses.map((h) => [h._id, h])), [horses]);
  const horseOf = (t) => horseById.get(idOf(t.horse)) || t.horse;
  const progressOf = (id) => (ordersQ.data || []).find((row) => row._id === id);
  const ongoingList = treatments.filter((t) => t.status === 'ongoing');
  const late = ongoingList.filter((t) => periodOf(t).late);
  const holding = ongoingList.filter((t) => treatmentLevel(t) !== 'high');
  const today = (ordersQ.data || []).reduce(
    (acc, r) => ({ done: acc.done + (r.progress?.done || 0), total: acc.total + (r.progress?.total || 0), missed: acc.missed + (r.progress?.missed || 0) + (r.progress?.notDone || 0) }),
    { done: 0, total: 0, missed: 0 }
  );
  const TILE_MATCH = { late: (t) => periodOf(t).late, holding: (t) => treatmentLevel(t) !== 'high' };

  const q = query.trim().toLowerCase();
  const shown = treatments
    .filter((t) => (status === 'ongoing' ? t.status === 'ongoing' : t.status !== 'ongoing'))
    .filter((t) => status !== 'ongoing' || !tile || !TILE_MATCH[tile] || TILE_MATCH[tile](t))
    .filter((t) => horseFilter === 'all' || idOf(t.horse) === horseFilter)
    .filter((t) => !q || horseOf(t)?.name?.toLowerCase().includes(q) || (t.medications || []).some((m) => m.name?.toLowerCase().includes(q)) || t.careInstructions?.toLowerCase().includes(q))
    .map((t) => ({ ...t, horse: horseOf(t) }))
    .sort((a, b) =>
      status === 'ongoing'
        ? Number(periodOf(b).late) - Number(periodOf(a).late) || (a.horse?.name || '').localeCompare(b.horse?.name || '')
        : new Date(b.endDate || b.updatedAt) - new Date(a.endDate || a.updatedAt)
    );

  // A prescription is not edited: a new one, started from it, takes over.
  const replace = (t) => navigate(`${HERE}/new?horseId=${idOf(t.horse)}&replace=${t._id}`, { state: { from: HERE } });
  const end = async (t) => {
    if (await endTreatment(t, { confirm, refresh })) drawer.close();
  };
  const level = (t) => {
    const horse = horseOf(t);
    if (horse?._id) setDialog({ type: 'level', horse });
  };
  const pickTile = (key) => {
    setTile(key);
    if (key) setStatus('ongoing');
  };

  return (
    <div className="vet-ui">
      <PageHead
        title="Điều trị & đơn thuốc"
        subtitle="Các đơn thuốc bác sĩ đã kê: thuốc gì, cho tới khi nào, ảnh hưởng việc tập ra sao, hôm nay đã cho đủ liều chưa."
        actions={
          <Button variant="vet" onClick={() => setDialog({ type: 'pick' })}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Kê đơn mới
          </Button>
        }
      />

      {!treatmentsQ.isLoading && (
        <StatTiles
          value={tile}
          onChange={pickTile}
          items={[
            { key: 'all', static: true, label: 'Đang dùng', value: ongoingList.length, icon: 'bi-capsule', tone: 'info', hint: `${treatments.length - ongoingList.length} đơn đã kết thúc` },
            { key: 'late', label: 'Quá ngày kết thúc', value: late.length, icon: 'bi-exclamation-triangle', tone: late.length ? 'bad' : 'neutral', hint: late.length ? 'Nên kết thúc hoặc kê đơn mới' : 'Không có' },
            { key: 'holding', label: 'Đang hạn chế tập', value: holding.length, icon: 'bi-lock', tone: holding.length ? 'watch' : 'neutral', hint: 'Đơn khóa hoặc giảm mức tập' },
            {
              key: 'today',
              static: true,
              label: 'Liều hôm nay',
              value: today.total ? `${today.done}/${today.total}` : '0',
              icon: 'bi-clock-history',
              tone: today.missed ? 'bad' : 'good',
              hint: today.total ? (today.missed ? `${today.missed} liều chưa cho được` : 'Nhân viên đang cho đúng giờ') : 'Hôm nay không có liều nào',
            },
          ]}
        />
      )}

      <div className="vet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Tìm ngựa, tên thuốc, y lệnh…" />
        <FilterChips
          value={status}
          onChange={(v) => {
            setStatus(v);
            setTile(null);
          }}
          options={[
            { value: 'ongoing', label: 'Đang dùng', count: ongoingList.length },
            { value: 'ended', label: 'Đã kết thúc', count: treatments.length - ongoingList.length },
          ]}
        />
        <Form.Select size="sm" value={horseFilter} onChange={(e) => setHorseFilter(e.target.value)} style={{ width: 200 }} aria-label="Lọc theo ngựa">
          <option value="all">Tất cả ngựa</option>
          {horses.map((h) => (
            <option key={h._id} value={h._id}>
              {h.name}
            </option>
          ))}
        </Form.Select>
        {(horseFilter !== 'all' || tile) && (
          <Button
            size="sm"
            variant="vet-ghost"
            onClick={() => {
              setHorseFilter('all');
              setTile(null);
            }}
          >
            Bỏ lọc
          </Button>
        )}
        <Button size="sm" variant="vet-ghost" className="vet-icon-btn ms-auto" onClick={refresh} title="Làm mới" aria-label="Làm mới">
          <i className="bi bi-arrow-clockwise" aria-hidden="true" />
        </Button>
      </div>

      {treatmentsQ.isError && (
        <Callout tone="bad" icon="bi-wifi-off" className="mb-3">
          {treatmentsQ.error?.message || 'Không tải được danh sách điều trị.'}
        </Callout>
      )}

      {treatmentsQ.isLoading ? (
        <LoadingBlock rows={3} height={120} />
      ) : shown.length === 0 ? (
        <div className="vet-card">
          <EmptyNote
            icon="bi-capsule"
            title={q || tile || horseFilter !== 'all' ? 'Không có đơn nào phù hợp' : status === 'ongoing' ? 'Không có đơn nào đang dùng' : 'Chưa có đơn đã kết thúc'}
            action={
              status === 'ongoing' &&
              !q &&
              !tile && (
                <Button size="sm" variant="vet" onClick={() => setDialog({ type: 'pick' })}>
                  Kê đơn mới
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="vet-rx-grid">
          {shown.map((t) => (
            <RxCard
              key={t._id}
              t={t}
              progress={progressOf(t._id)}
              onOpen={(x) => drawer.openOnly({ type: 'treatment', treatment: x })}
              onOpenExam={(x) => drawer.openOnly({ type: 'exam', id: idOf(x.healthRecord) })}
              onEnd={end}
              onReplace={replace}
              onLevel={level}
              onHorse={() => setHorseFilter(idOf(t.horse))}
            />
          ))}
        </div>
      )}

      <DetailDrawer drawer={drawer} horseOf={horseOf} progressOf={progressOf} onEnd={end} onReplace={replace} onLevel={level} />

      {dialog?.type === 'pick' && (
        <HorsePickerModal
          title="Kê đơn cho ngựa nào?"
          horses={horses}
          onHide={() => setDialog(null)}
          onPick={(h) => {
            setDialog(null);
            navigate(`${HERE}/new?horseId=${h._id}`, { state: { from: HERE } });
          }}
        />
      )}
      {dialog?.type === 'level' && (
        <TrainingLevelModal
          horse={dialog.horse}
          treatments={treatments.filter((t) => idOf(t.horse) === dialog.horse._id)}
          injuries={(injuriesQ.data || []).filter((m) => idOf(m.horse) === dialog.horse._id)}
          latestRecord={null}
          onHide={() => setDialog(null)}
          onDone={refresh}
        />
      )}
      {confirmDialog}
    </div>
  );
}
