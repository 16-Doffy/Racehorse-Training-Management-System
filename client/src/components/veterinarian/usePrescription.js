import { useState } from 'react';
import { blankMed, medFromSaved, medProblem, medToPayload } from './medicationForm';
import { BUILT_IN_TEMPLATES, formFromTemplate } from './prescriptionTemplates';
import { fromInputDate, idOf, toInputDate, treatmentLevel } from './vetFormat';

/**
 * A prescription being written: the period, how hard the horse may work meanwhile, the medicines and
 * the care orders, and the template it started from. Shared by the prescription page and the exam
 * form, which both save it as a new Treatment (an issued one is never edited). `from` is the
 * prescription it replaces: its medicines, orders and level are copied, starting today.
 * `confirm` asks before a template replaces what was already written.
 */
export default function usePrescription({ from = null, catalog = [], customTemplates = [], userId, confirm }) {
  const today = toInputDate(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => (from?.endDate && toInputDate(from.endDate) >= today ? toInputDate(from.endDate) : ''));
  const [level, setLevel] = useState(() => (from ? treatmentLevel(from) : 'high'));
  const [reason, setReason] = useState(from?.lockReason || '');
  const [meds, setMeds] = useState(() => {
    const active = (from?.medications || []).filter((m) => !['completed', 'cancelled'].includes(m.status));
    return active.length ? active.map((m) => medFromSaved(m, catalog)) : [blankMed()];
  });
  const [care, setCare] = useState(from?.careInstructions || '');
  const [templateKey, setTemplateKey] = useState('');

  const templates = [...BUILT_IN_TEMPLATES.map((t) => ({ ...t, id: `b:${t.key}` })), ...customTemplates.map((t) => ({ ...t, id: `c:${t._id}`, own: idOf(t.createdBy) === userId }))];
  const chosen = templates.find((t) => t.id === templateKey) || null;
  const named = meds.filter((m) => m.name.trim());
  const dosesPerDay = named.reduce((sum, m) => sum + (m.times.length || 1), 0);
  const empty = !named.length && !care.trim() && level === 'high';

  const applyTemplate = async (id) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return setTemplateKey('');
    if (!empty && confirm) {
      const ok = await confirm({ title: `Dùng toa mẫu “${template.name}”?`, body: 'Thuốc, y lệnh chăm sóc, mức vận động và ngày kết thúc đang soạn sẽ được thay bằng toa mẫu.', confirmLabel: 'Dùng toa mẫu' });
      if (!ok) return undefined;
    }
    const form = formFromTemplate(template, catalog, start);
    setMeds(form.meds.length ? form.meds : [blankMed()]);
    setEnd(form.end);
    setLevel(form.level);
    setReason(form.reason);
    setCare(form.care);
    setTemplateKey(id);
    return undefined;
  };

  /** What stops the prescription from being saved, or null. */
  const problem = () => {
    if (empty) return 'Thêm ít nhất một thuốc, một y lệnh chăm sóc, hoặc chọn mức hạn chế tập.';
    const medError = medProblem(named);
    if (medError) return medError;
    if (level === 'none' && !reason.trim()) return 'Ghi lý do khóa tập — HLV và nhân viên chăm sóc nhận được lý do này.';
    if (end && end < start) return 'Ngày kết thúc phải sau ngày bắt đầu.';
    return null;
  };

  /** The Treatment body (without horse and exam). */
  const payload = () => ({
    startDate: fromInputDate(start),
    endDate: end ? fromInputDate(end, '23:59') : undefined,
    trainingLevel: level,
    lockReason: level === 'high' ? '' : reason.trim(),
    medications: named.map(medToPayload),
    careInstructions: care.trim(),
  });

  return {
    start,
    setStart,
    end,
    setEnd,
    level,
    setLevel,
    reason,
    setReason,
    meds,
    setMeds,
    care,
    setCare,
    templateKey,
    setTemplateKey,
    templates,
    chosen,
    named,
    dosesPerDay,
    empty,
    applyTemplate,
    problem,
    payload,
  };
}
