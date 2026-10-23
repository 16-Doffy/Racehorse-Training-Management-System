import { useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import DetailDrawer, { useDetailDrawer } from '../../components/veterinarian/DetailDrawer';
import HorsePickerModal from '../../components/veterinarian/HorsePickerModal';
import TrainingLevelModal from '../../components/veterinarian/TrainingLevelModal';
import TreatmentList from '../../components/veterinarian/TreatmentList';
import useConfirm from '../../components/veterinarian/useConfirm';
import { endTreatment } from '../../components/veterinarian/vetActions';
import { Callout, EmptyNote, FilterChips, LoadingBlock, PageHead, Pill, SearchBox, VetCard } from '../../components/veterinarian/ui';
import { idOf } from '../../components/veterinarian/vetFormat';
import { useCareOrders, useInjuries, useTreatments, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const HERE = '/veterinarian/treatments';

/**
 * Every treatment as one table: what is being given now (with today's doses as the groom records them)
 * and what has ended, searched by horse or medicine. A line opens the treatment in a drawer on this
 * page — its exam too — and ending, replacing or changing the training level happen here as well;
 * nothing sends the vet to the horse's page.
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
  const [horseFilter, setHorseFilter] = useState(params.get('horseId') || 'all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);

  const horses = useMemo(() => horsesQ.data || [], [horsesQ.data]);
  const treatments = useMemo(() => treatmentsQ.data || [], [treatmentsQ.data]);
  const horseById = useMemo(() => new Map(horses.map((h) => [h._id, h])), [horses]);
  const horseOf = (t) => horseById.get(idOf(t.horse)) || t.horse;
  const progressOf = (id) => (ordersQ.data || []).find((row) => row._id === id);
  const ongoingCount = treatments.filter((t) => t.status === 'ongoing').length;
  const today = (ordersQ.data || []).reduce((acc, r) => ({ done: acc.done + (r.progress?.done || 0), total: acc.total + (r.progress?.total || 0), missed: acc.missed + (r.progress?.missed || 0) }), { done: 0, total: 0, missed: 0 });

  const q = query.trim().toLowerCase();
  const shown = treatments
    .filter((t) => (status === 'ongoing' ? t.status === 'ongoing' : t.status !== 'ongoing'))
    .filter((t) => horseFilter === 'all' || idOf(t.horse) === horseFilter)
    .filter((t) => !q || horseOf(t)?.name?.toLowerCase().includes(q) || (t.medications || []).some((m) => m.name?.toLowerCase().includes(q)) || t.careInstructions?.toLowerCase().includes(q))
    .map((t) => ({ ...t, horse: horseOf(t) }))
    .sort((a, b) =>
      status === 'ongoing'
        ? (a.horse?.name || '').localeCompare(b.horse?.name || '') || new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt)
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

  return (
    <div className="vet-ui">
      <PageHead
        title="Điều trị & đơn thuốc"
        subtitle={
          treatmentsQ.isLoading ? (
            'Đang tải…'
          ) : (
            <span className="d-inline-flex flex-wrap align-items-center gap-2">
              <span>
                <strong className="vet-tnum">{ongoingCount}</strong> phác đồ đang áp dụng
              </span>
              {today.total > 0 && (
                <span>
                  · hôm nay đã cho{' '}
                  <strong className="vet-tnum">
                    {today.done}/{today.total}
                  </strong>{' '}
                  liều
                </span>
              )}
              {today.missed > 0 && <Pill tone="bad">{today.missed} liều bỏ lỡ</Pill>}
            </span>
          )
        }
        actions={
          <Button variant="vet" onClick={() => setDialog({ type: 'pick' })}>
            <i className="bi bi-plus-lg" aria-hidden="true" /> Kê đơn mới
          </Button>
        }
      />

      <div className="vet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Tìm ngựa, tên thuốc, y lệnh…" />
        <FilterChips
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ongoing', label: 'Đang điều trị', count: ongoingCount },
            { value: 'ended', label: 'Đã kết thúc', count: treatments.length - ongoingCount },
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
        {horseFilter !== 'all' && (
          <Button size="sm" variant="vet-ghost" onClick={() => setHorseFilter('all')}>
            Bỏ lọc ngựa
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

      <VetCard flush>
        {treatmentsQ.isLoading ? (
          <LoadingBlock rows={3} height={56} />
        ) : shown.length === 0 ? (
          <EmptyNote
            icon="bi-capsule"
            title={q ? 'Không tìm thấy đơn nào' : status === 'ongoing' ? 'Không có phác đồ nào đang áp dụng' : 'Chưa có phác đồ đã kết thúc'}
            action={
              status === 'ongoing' &&
              !q && (
                <Button size="sm" variant="vet" onClick={() => setDialog({ type: 'pick' })}>
                  Kê đơn mới
                </Button>
              )
            }
          />
        ) : (
          <TreatmentList
            treatments={shown}
            progressOf={progressOf}
            showHorse
            onOpen={(t) => drawer.openOnly({ type: 'treatment', treatment: t })}
            onOpenExam={(t) => drawer.openOnly({ type: 'exam', id: idOf(t.healthRecord) })}
            onEnd={end}
            onReplace={replace}
            onLevel={level}
            onHorse={(t) => setHorseFilter(idOf(t.horse))}
          />
        )}
      </VetCard>

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
