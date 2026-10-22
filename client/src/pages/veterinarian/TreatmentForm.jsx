import { useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import vetApi from '../../api/veterinarianApi';
import PrescriptionFields, { dailyLoadText } from '../../components/veterinarian/PrescriptionFields';
import useConfirm from '../../components/veterinarian/useConfirm';
import usePrescription from '../../components/veterinarian/usePrescription';
import { prescribableCatalog } from '../../components/veterinarian/medicineCatalog';
import { templateFromForm } from '../../components/veterinarian/prescriptionTemplates';
import { BusyButton, Callout, Field, HealthPill, HorseCell, LevelPill, LoadingBlock, PageHead, Section, VetModal } from '../../components/veterinarian/ui';
import { clearanceOf, errorText, fmtDate, idOf } from '../../components/veterinarian/vetFormat';
import { message } from '../../lib/antdStatic';
import { useHealthRecords, useInventory, useRxTemplates, useVetHorses, useVetRefresh } from '../../hooks/useVetData';


/** Saving the form as a template, under a name (the same name again updates the vet's own one). */
function SaveTemplateModal({ initial, ownNames, onSave, onHide }) {
  const [name, setName] = useState(initial.name || '');
  const [condition, setCondition] = useState(initial.condition || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const updating = ownNames.has(name.trim().toLowerCase());

  const submit = async () => {
    if (!name.trim()) return setError('Đặt tên cho toa mẫu, VD: Viêm gân chân trước.');
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), condition: condition.trim() });
      onHide();
    } catch (err) {
      setError(errorText(err, 'Không lưu được toa mẫu.'));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <VetModal
      show
      onHide={onHide}
      busy={busy}
      icon="bi-bookmark-plus"
      title="Lưu thành toa mẫu"
      onSubmit={submit}
      footer={
        <>
          <Button variant="vet-outline" onClick={onHide} disabled={busy}>
            Hủy
          </Button>
          <BusyButton type="submit" busy={busy}>
            {updating ? 'Cập nhật toa mẫu' : 'Lưu toa mẫu'}
          </BusyButton>
        </>
      }
    >
      <div className="d-flex flex-column gap-3">
        <Field label="Tên toa mẫu" required hint={updating ? 'Bạn đã có toa mẫu tên này — lưu sẽ cập nhật toa đó.' : 'Mọi bác sĩ đều thấy và dùng được toa mẫu này.'}>
          <Form.Control value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Viêm gân chân trước — giai đoạn cấp" autoFocus />
        </Field>
        <Field label="Dùng cho (triệu chứng / chẩn đoán)">
          <Form.Control value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="VD: Sưng nóng gân gấp, đau khi sờ nắn" />
        </Field>
        <div className="vet-small vet-muted">Lưu thuốc, liều, giờ dùng, số ngày, y lệnh chăm sóc và mức vận động của đơn đang soạn.</div>
        {error && (
          <Callout tone="bad" icon="bi-exclamation-circle-fill">
            {error}
          </Callout>
        )}
      </div>
    </VetModal>
  );
}

/** `source`: the ongoing prescription this one replaces (copied in; it ends when this one is saved). */
function TreatmentEditor({ source, presetHorseId, presetRecordId, horses, catalog, customTemplates }) {
  const navigate = useNavigate();
  const location = useLocation();
  const refresh = useVetRefresh();
  const userId = useSelector((state) => state.auth.user?._id);
  const [confirm, confirmDialog] = useConfirm();
  const rx = usePrescription({ from: source, catalog, customTemplates, userId, confirm });

  const [horseId, setHorseId] = useState(() => presetHorseId || '');
  const [recordId, setRecordId] = useState(() => presetRecordId || '');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const recordsQ = useHealthRecords(horseId, { enabled: Boolean(horseId) });
  const records = recordsQ.data || [];
  const horse = horses.find((h) => h._id === horseId) || (source?.horse && typeof source.horse === 'object' ? source.horse : null);
  const clearance = clearanceOf(horse);
  const fixedHorse = Boolean(source) || Boolean(presetHorseId && horse);
  const linkedRecord = (recordId && records.some((r) => r._id === recordId) ? recordId : '') || records[0]?._id || '';
  const backTo = location.state?.from || (horseId ? `/veterinarian/horses/${horseId}` : '/veterinarian/treatments');
  const { chosen } = rx;
  const ownNames = new Set(customTemplates.filter((t) => idOf(t.createdBy) === userId).map((t) => t.name.trim().toLowerCase()));

  const deleteTemplate = async (template) => {
    const ok = await confirm({ title: 'Xóa toa mẫu', body: `Xóa toa mẫu “${template.name}”? Các đơn đã kê từ toa này không bị ảnh hưởng.`, confirmLabel: 'Xóa', danger: true });
    if (!ok) return;
    try {
      await vetApi.deletePrescriptionTemplate(template._id);
      rx.setTemplateKey('');
      message.success('Đã xóa toa mẫu.');
      refresh();
    } catch (err) {
      message.error(errorText(err, 'Không xóa được toa mẫu.'));
    }
  };

  const saveTemplate = async ({ name, condition }) => {
    const payload = templateFromForm({ name, condition, start: rx.start, end: rx.end, level: rx.level, reason: rx.reason, care: rx.care, meds: rx.meds });
    const res = await vetApi.savePrescriptionTemplate(payload);
    await refresh();
    if (res?.data?._id) rx.setTemplateKey(`c:${res.data._id}`);
    message.success(`Đã lưu toa mẫu “${name}”.`);
  };

  const submit = async () => {
    if (!horseId) return setError('Chọn ngựa cần điều trị.');
    const problem = rx.problem();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const body = rx.payload();
    const { level, named } = rx;
    try {
      let healthRecord = linkedRecord;
      if (!healthRecord) {
        // A treatment follows an exam; a horse never examined gets a record of this prescription.
        const rec = await vetApi.createHealthRecord({
          horse: horseId,
          diagnosis: `Kê đơn điều trị${chosen ? `: ${chosen.name}` : named[0] ? `: ${named[0].name}` : ''}`,
          resultStatus: level === 'none' ? 'injured' : 'monitoring',
        });
        healthRecord = rec.data?._id;
      }
      await vetApi.createTreatment({ horse: horseId, healthRecord, status: 'ongoing', ...body, ...(source ? { replaces: source._id } : {}) });
      await refresh();
      message.success(source ? `Đã kê đơn mới cho ${horse?.name || 'ngựa'} — đơn cũ đã kết thúc, việc của nhân viên chăm sóc đổi theo đơn mới.` : `Đã kê đơn cho ${horse?.name || 'ngựa'} — đơn đã gửi tới nhân viên chăm sóc.`);
      navigate(backTo);
    } catch (err) {
      setError(errorText(err, 'Không lưu được đơn.'));
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="vet-ui" style={{ maxWidth: 980 }}>
      <PageHead
        back={{ label: location.state?.from ? 'Điều trị' : horse?.name || 'Điều trị', to: backTo }}
        title={source ? `Kê đơn mới thay đơn cũ · ${horse?.name || 'ngựa'}` : horse && fixedHorse ? `Kê đơn · ${horse.name}` : 'Kê đơn & phác đồ'}
        subtitle="Bác sĩ kê đơn; đơn chuyển thành việc hằng ngày cho nhân viên chăm sóc — họ lấy thuốc trong kho và cho ngựa dùng đúng giờ. Đơn đã kê không sửa được."
      />
      {source && (
        <Callout tone="info" icon="bi-arrow-repeat" className="mb-3">
          Thuốc, y lệnh và mức vận động của đơn đang áp dụng (từ {fmtDate(source.startDate || source.createdAt)}) đã được chép sẵn — sửa theo ý bạn. Khi lưu, đơn cũ kết thúc và đơn mới thay thế; nhân viên chăm sóc nhận việc theo đơn mới.
        </Callout>
      )}

      <Form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <section className="vet-card">
          <div className="vet-card-body">
            <Section title="Ngựa">
              {fixedHorse && horse ? (
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <HorseCell horse={horse} />
                  <HealthPill status={horse.healthStatus} />
                  {clearance.restricted && <LevelPill level={clearance.level} short />}
                </div>
              ) : (
                <Field label="Ngựa cần điều trị" required>
                  <Form.Select
                    value={horseId}
                    onChange={(e) => {
                      setHorseId(e.target.value);
                      setRecordId('');
                    }}
                    autoFocus
                  >
                    <option value="">Chọn ngựa…</option>
                    {horses.map((h) => (
                      <option key={h._id} value={h._id}>
                        {h.name}
                      </option>
                    ))}
                  </Form.Select>
                </Field>
              )}
              {horseId && (
                <div className="mt-3">
                  {recordsQ.isLoading ? (
                    <div className="vet-small vet-faint">Đang tìm phiếu khám…</div>
                  ) : records.length > 0 ? (
                    <Field label="Theo phiếu khám" hint="Đơn gắn với một lần khám của ngựa.">
                      <Form.Select value={linkedRecord} onChange={(e) => setRecordId(e.target.value)}>
                        {records.map((r) => (
                          <option key={r._id} value={r._id}>
                            {fmtDate(r.date || r.createdAt)} — {r.diagnosis}
                          </option>
                        ))}
                      </Form.Select>
                    </Field>
                  ) : (
                    <Callout tone="watch" icon="bi-clipboard2">
                      Ngựa chưa có phiếu khám — khi lưu, hệ thống tạo một phiếu ghi nhận kèm đơn này.
                    </Callout>
                  )}
                </div>
              )}
            </Section>

            <PrescriptionFields rx={rx} catalog={catalog} hasCustomTemplates={customTemplates.length > 0} busy={busy} onTemplateApplied={() => setError(null)} onDeleteTemplate={deleteTemplate} />

            {error && (
              <Callout tone="bad" icon="bi-exclamation-circle-fill" className="mt-3">
                {error}
              </Callout>
            )}
          </div>
          <div className="vet-form-footer">
            <span className="vet-small vet-muted me-auto">{dailyLoadText(rx)}</span>
            <Button variant="vet-ghost" onClick={() => setSavingTemplate(true)} disabled={busy || (!rx.named.length && !rx.care.trim())}>
              <i className="bi bi-bookmark-plus" aria-hidden="true" /> Lưu thành toa mẫu
            </Button>
            <Button variant="vet-ghost" onClick={() => navigate(backTo)} disabled={busy}>
              Hủy
            </Button>
            <BusyButton type="submit" busy={busy}>
              {source ? 'Kê đơn mới thay đơn cũ' : 'Kê đơn'}
            </BusyButton>
          </div>
        </section>
      </Form>

      {savingTemplate && (
        <SaveTemplateModal
          initial={chosen?.own ? { name: chosen.name, condition: chosen.condition } : { name: '', condition: chosen?.condition || '' }}
          ownNames={ownNames}
          onSave={saveTemplate}
          onHide={() => setSavingTemplate(false)}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/**
 * A new prescription (/veterinarian/treatments/new), optionally taking over from an ongoing one
 * (?replace=<id>), copied into the form. An issued prescription is never edited: the old edit link
 * (/:id/edit) offers that replacement instead.
 */
export default function TreatmentForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sourceId = params.get('replace');
  const sourceQ = useQuery({ queryKey: ['vet', 'treatment', sourceId || id], queryFn: () => vetApi.getTreatmentById(sourceId || id).then((res) => res.data), enabled: Boolean(sourceId || id) });
  const horsesQ = useVetHorses();
  const stockQ = useInventory();
  const templatesQ = useRxTemplates();

  if (((sourceId || id) && sourceQ.isLoading) || horsesQ.isLoading || stockQ.isLoading) {
    return (
      <div className="vet-ui" style={{ maxWidth: 980 }}>
        <LoadingBlock rows={4} height={80} />
      </div>
    );
  }
  const source = sourceQ.data;
  const problem = sourceQ.error || horsesQ.error;
  const ended = (sourceId || id) && source?.status && source.status !== 'ongoing';
  if (problem || ended || id) {
    const horseId = idOf(source?.horse);
    return (
      <div className="vet-ui" style={{ maxWidth: 980 }}>
        <Callout
          tone={problem ? 'bad' : 'watch'}
          icon={problem ? 'bi-exclamation-octagon' : 'bi-lock'}
          action={
            <div className="d-flex flex-wrap gap-2">
              {!problem && !ended && horseId && (
                <Button size="sm" variant="vet" onClick={() => navigate(`/veterinarian/treatments/new?horseId=${horseId}&replace=${id}`, { replace: true })}>
                  Kê đơn mới thay đơn này
                </Button>
              )}
              <Button size="sm" variant="vet-outline" onClick={() => navigate('/veterinarian/treatments')}>
                Về danh sách điều trị
              </Button>
            </div>
          }
        >
          {problem
            ? errorText(problem, 'Không mở được đơn.')
            : ended
              ? 'Đơn này đã kết thúc — kê đơn mới nếu ngựa cần điều trị tiếp.'
              : 'Đơn đã kê không sửa được: kết thúc đơn, hoặc kê đơn mới thay thế (thuốc và y lệnh của đơn cũ được chép sẵn).'}
        </Callout>
      </div>
    );
  }
  return (
    <TreatmentEditor
      key={`${params.get('horseId') || 'new'}-${sourceId || ''}`}
      source={sourceId ? source : null}
      presetHorseId={params.get('horseId') || idOf(source?.horse)}
      presetRecordId={params.get('recordId') || idOf(source?.healthRecord)}
      horses={horsesQ.data || []}
      catalog={prescribableCatalog(stockQ.data, source)}
      customTemplates={templatesQ.data || []}
    />
  );
}
