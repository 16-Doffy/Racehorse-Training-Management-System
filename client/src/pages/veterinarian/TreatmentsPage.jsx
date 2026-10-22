import { useMemo, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HorsePickerModal from '../../components/veterinarian/HorsePickerModal';
import TrainingLevelModal from '../../components/veterinarian/TrainingLevelModal';
import TreatmentCard from '../../components/veterinarian/TreatmentCard';
import useConfirm from '../../components/veterinarian/useConfirm';
import { endTreatment } from '../../components/veterinarian/vetActions';
import { Callout, EmptyNote, FilterChips, LoadingBlock, PageHead, Pill, VetCard } from '../../components/veterinarian/ui';
import { clearanceOf, idOf } from '../../components/veterinarian/vetFormat';
import { useCareOrders, useInjuries, useTreatments, useVetHorses, useVetRefresh } from '../../hooks/useVetData';

const HERE = '/veterinarian/treatments';

/**
 * Every treatment in one list: what is being given now (with today's doses as the groom records
 * them) and what has ended. Writing a new one, editing, ending or changing the training level all
 * start here or from the horse's page — the same form and the same dialogs.
 */
export default function TreatmentsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refresh = useVetRefresh();
  const [confirm, confirmDialog] = useConfirm();
  const treatmentsQ = useTreatments();
  const ordersQ = useCareOrders();
  const horsesQ = useVetHorses();
  const injuriesQ = useInjuries();
  const [status, setStatus] = useState('ongoing');
  const [horseFilter, setHorseFilter] = useState(params.get('horseId') || 'all');
  const [dialog, setDialog] = useState(null);

  const horses = useMemo(() => horsesQ.data || [], [horsesQ.data]);
  const treatments = useMemo(() => treatmentsQ.data || [], [treatmentsQ.data]);
  const progressOf = (id) => (ordersQ.data || []).find((row) => row._id === id);
  const horseById = new Map(horses.map((h) => [h._id, h]));
  const ongoingCount = treatments.filter((t) => t.status === 'ongoing').length;
  const today = (ordersQ.data || []).reduce((acc, r) => ({ done: acc.done + (r.progress?.done || 0), total: acc.total + (r.progress?.total || 0), missed: acc.missed + (r.progress?.missed || 0) }), { done: 0, total: 0, missed: 0 });

  const shown = treatments
    .filter((t) => (status === 'ongoing' ? t.status === 'ongoing' : t.status !== 'ongoing'))
    .filter((t) => horseFilter === 'all' || idOf(t.horse) === horseFilter)
    .sort((a, b) =>
      status === 'ongoing'
        ? new Date(b.startDate || b.createdAt) - new Date(a.startDate || a.createdAt)
        : new Date(b.endDate || b.updatedAt) - new Date(a.endDate || a.updatedAt)
    );

  // A prescription is not edited: a new one, started from it, takes over.
  const replace = (t) => navigate(`${HERE}/new?horseId=${idOf(t.horse)}&replace=${t._id}`, { state: { from: HERE } });

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
          <LoadingBlock rows={3} height={90} />
        ) : shown.length === 0 ? (
          <EmptyNote
            icon="bi-capsule"
            title={status === 'ongoing' ? 'Không có phác đồ nào đang áp dụng' : 'Chưa có phác đồ đã kết thúc'}
            action={
              status === 'ongoing' && (
                <Button size="sm" variant="vet" onClick={() => setDialog({ type: 'pick' })}>
                  Kê đơn mới
                </Button>
              )
            }
          />
        ) : (
          shown.map((t) => {
            const horse = horseById.get(idOf(t.horse));
            const clearance = clearanceOf(horse);
            return (
              <TreatmentCard
                key={t._id}
                treatment={{ ...t, horse: horse || t.horse }}
                showHorse
                progress={progressOf(t._id)}
                awaitingReturn={t.status !== 'ongoing' && clearance.source === 'awaiting_return' && String(clearance.treatment) === t._id}
                onOpenHorse={() => navigate(`/veterinarian/horses/${idOf(t.horse)}`)}
                onReplace={() => replace(t)}
                onOpenExam={() => navigate(`/veterinarian/examinations/${idOf(t.healthRecord)}`)}
                onEnd={() => endTreatment({ ...t, horse: horse || t.horse }, { confirm, refresh })}
                onLevel={horse ? () => setDialog({ type: 'level', horse }) : undefined}
              />
            );
          })
        )}
      </VetCard>

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
