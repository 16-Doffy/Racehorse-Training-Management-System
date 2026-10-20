/**
 * Medicine rows of the prescription form (MedicationEditor) to and from what the API stores.
 * A row: { key, mode: '' | 'stock' | 'manual', inventoryItem, name, amount, unit, dosage, dosageAuto,
 *          route, times, instructions, startDate, endDate, status, prescribedAt, more }
 */
import { fromInputDate, idOf, medTimes, slotOfTime, toInputDate } from './vetFormat';

let seq = 0;
const nextKey = () => {
  seq += 1;
  return `med-${seq}`;
};

export const autoDosage = (amount, unit) => (amount && unit ? `${amount} ${unit}/lần` : '');

/** A blank row: by mouth, morning and evening. */
export const blankMed = () => ({
  key: nextKey(),
  mode: '',
  inventoryItem: '',
  name: '',
  amount: '',
  unit: '',
  dosage: '',
  dosageAuto: true,
  route: 'oral',
  times: ['08:00', '20:00'],
  instructions: '',
  startDate: '',
  endDate: '',
  status: 'ongoing',
  prescribedAt: undefined,
  more: false,
});

/** A stored medicine as a row; `stock` gives the unit of a linked item. */
export function medFromSaved(m, stock = []) {
  const itemId = idOf(m.inventoryItem);
  const unit = stock.find((s) => s._id === itemId)?.unit || m.inventoryItem?.unit || '';
  const amount = m.amount !== undefined && m.amount !== null ? String(m.amount) : '';
  return {
    key: nextKey(),
    mode: itemId ? 'stock' : 'manual',
    inventoryItem: itemId,
    name: m.name || '',
    amount,
    unit,
    dosage: m.dosage || '',
    dosageAuto: !m.dosage || m.dosage === autoDosage(amount, unit),
    route: m.route || 'oral',
    times: medTimes(m),
    instructions: m.instructions || '',
    startDate: toInputDate(m.startDate),
    endDate: toInputDate(m.endDate),
    status: m.status || 'ongoing',
    prescribedAt: m.prescribedAt,
    more: false,
  };
}

/** The first problem with the rows, as a sentence, or null. */
export function medProblem(meds) {
  for (const [i, m] of meds.entries()) {
    const label = `Thuốc ${i + 1}`;
    if (!m.name.trim()) return `${label}: nhập tên thuốc (hoặc bỏ dòng thuốc trống).`;
    if (m.inventoryItem && !(Number(m.amount) > 0)) return `${label}: nhập liều mỗi lần (lớn hơn 0).`;
    if (!m.inventoryItem && !m.dosage.trim()) return `${label}: nhập liều mỗi lần.`;
    if (m.startDate && m.endDate && m.endDate < m.startDate) return `${label}: ngày kết thúc phải sau ngày bắt đầu.`;
  }
  return null;
}

/** A row as the API takes it (health/treatment.controller.js normalizeMedications). */
export function medToPayload(m) {
  const times = [...new Set(m.times)].sort();
  const out = {
    name: m.name.trim(),
    dosage: (m.inventoryItem && m.dosageAuto ? autoDosage(m.amount, m.unit) : m.dosage.trim()) || autoDosage(m.amount, m.unit),
    route: m.route || 'oral',
    times,
    timeSlots: [...new Set(times.map(slotOfTime))],
    specificTimes: times.join(', '),
    frequency: times.length ? `${times.length} lần/ngày` : 'Theo chỉ dẫn',
    instructions: m.instructions.trim() || undefined,
    startDate: m.startDate ? fromInputDate(m.startDate) : undefined,
    endDate: m.endDate ? fromInputDate(m.endDate, '23:59') : undefined,
    status: m.status || 'ongoing',
    prescribedAt: m.prescribedAt,
  };
  if (m.inventoryItem) {
    out.inventoryItem = m.inventoryItem;
    out.amount = Number(m.amount);
  }
  return out;
}
