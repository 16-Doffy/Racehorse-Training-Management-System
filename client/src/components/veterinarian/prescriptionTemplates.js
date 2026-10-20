/**
 * Prescription templates: picked in the prescription form, a template fills in the medicines (dose,
 * route, times, days), the care orders and the training level for a common condition; the vet then
 * adjusts them for the horse. Built-in ones are below; vets save their own on the server
 * (GET/POST/DELETE /health/prescription-templates), in the same shape.
 *
 * Doses are for a horse of about 500 kg — a starting point, to be adjusted to the horse's weight and
 * the diagnosis. Medicine names are matched against the club's medicine list (`match` are words of
 * the name), so a filled-in medicine is linked to the stock the groom gives it from.
 */
import { autoDosage, blankMed } from './medicationForm';
import { findMedicine, plain } from './medicineCatalog';
import { addDays, fromInputDate, startOfDay, toInputDate } from './vetFormat';

const BUTE = { name: 'Phenylbutazone (Bute) 1g', match: ['phenylbutazone', 'bute'], amount: 1, unit: 'viên', route: 'oral', times: ['08:00', '20:00'] };
const BANAMINE = { name: 'Flunixin meglumine (Banamine) tiêm', match: ['flunixin', 'banamine'], amount: 10, unit: 'ml', route: 'iv' };
const PENICILLIN = { name: 'Kháng sinh Penicillin tiêm', match: ['penicillin'], amount: 30, unit: 'ml', route: 'im', times: ['08:00', '20:00'] };
const ANTISEPTIC = { name: 'Dung dịch sát trùng (Antiseptic Solution)', match: ['sat trung', 'antiseptic'], amount: 50, unit: 'ml', route: 'topical' };
const GEL = { name: 'Gel kháng viêm bôi ngoài', match: ['gel khang viem'], amount: 10, unit: 'ml', route: 'topical' };
const COLD_PACK = { name: 'Túi chườm lạnh (Cold Therapy Pack)', match: ['chuom lanh', 'cold therapy'], amount: 1, unit: 'túi', route: 'topical' };
const VET_WRAP = { name: 'Băng cuốn thú y (Vet Wrap)', match: ['bang cuon', 'vet wrap'], amount: 1, unit: 'cuộn', route: 'topical', times: ['08:00'] };

export const BUILT_IN_TEMPLATES = [
  {
    key: 'tendon-strain',
    name: 'Viêm gân / căng cơ',
    condition: 'Chấn thương phần mềm ở chân: sưng nóng, đau khi sờ nắn',
    days: 7,
    trainingLevel: 'none',
    lockReason: 'Viêm gân — nghỉ tại chuồng, băng ép',
    careInstructions: 'Chườm lạnh vùng sưng 20 phút sáng và chiều, băng ép chân đau, nghỉ tại chuồng; báo bác sĩ nếu sưng tăng.',
    medications: [
      { ...BUTE, days: 5, instructions: 'Trộn vào thức ăn tinh, không cho khi bụng đói.' },
      { ...GEL, times: ['08:00', '16:00'], instructions: 'Bôi lên vùng sưng sau khi chườm lạnh.' },
      { ...COLD_PACK, times: ['08:00', '16:00'], days: 3, instructions: 'Chườm 20 phút mỗi lần.' },
    ],
  },
  {
    key: 'colic',
    name: 'Đau bụng (colic) nhẹ',
    condition: 'Bồn chồn, ngoái nhìn bụng, giảm nhu động ruột',
    days: 2,
    trainingLevel: 'none',
    lockReason: 'Đau bụng — theo dõi tại chuồng',
    careInstructions: 'Ngừng thức ăn tinh 12 giờ, cho uống nước đầy đủ; dắt đi bộ nhẹ 15 phút mỗi 2 giờ; theo dõi phân, báo ngay nếu ngựa lăn lộn hoặc đau tăng.',
    medications: [{ ...BANAMINE, times: ['08:00', '20:00'], instructions: 'Tiêm chậm; bỏ liều nếu ngựa đã hết đau.' }],
  },
  {
    key: 'skin-wound',
    name: 'Vết thương ngoài da / trầy xước',
    condition: 'Vết trầy, rách da nông',
    days: 5,
    trainingLevel: 'light',
    lockReason: 'Vết thương ngoài da — chỉ đi bộ nhẹ',
    careInstructions: 'Giữ vết thương sạch, khô; theo dõi sưng, chảy dịch, mùi hôi; báo bác sĩ nếu vết thương rỉ máu lại.',
    medications: [
      { ...ANTISEPTIC, times: ['08:00', '18:00'], instructions: 'Rửa sạch vết thương rồi để khô.' },
      { name: 'Gạc y tế (Sterile Gauze)', match: ['gac y te', 'gauze'], amount: 2, unit: 'miếng', route: 'topical', times: ['08:00', '18:00'], instructions: 'Đắp sau khi sát trùng.' },
      { ...VET_WRAP, instructions: 'Thay băng mỗi sáng.' },
    ],
  },
  {
    key: 'deep-wound',
    name: 'Vết thương sâu / nhiễm trùng',
    condition: 'Vết thương sâu, sưng nóng, nguy cơ nhiễm trùng',
    days: 7,
    trainingLevel: 'none',
    lockReason: 'Vết thương nhiễm trùng — nghỉ tại chuồng',
    careInstructions: 'Rửa vết thương 2 lần/ngày, đo thân nhiệt sáng và chiều; báo ngay nếu sốt trên 38,5 °C hoặc vết thương có mủ.',
    medications: [
      { ...PENICILLIN, days: 5, instructions: 'Tiêm bắp, đổi bên cổ mỗi lần tiêm.' },
      { name: 'Vắc-xin uốn ván (Tetanus Vaccine)', match: ['uon van', 'tetanus'], amount: 1, unit: 'liều', route: 'im', times: ['08:00'], days: 1, instructions: 'Tiêm nhắc nếu mũi gần nhất đã quá 6 tháng.' },
      { ...ANTISEPTIC, times: ['08:00', '18:00'], instructions: 'Rửa vết thương.' },
      { ...BUTE, days: 3, instructions: 'Trộn vào thức ăn.' },
    ],
  },
  {
    key: 'hoof-abscess',
    name: 'Áp xe / bầm móng',
    condition: 'Đi khập khiễng, móng nóng, đau khi gõ móng',
    days: 7,
    trainingLevel: 'none',
    lockReason: 'Áp xe móng — nghỉ tại chuồng',
    careInstructions: 'Ngâm móng nước ấm 15 phút mỗi sáng, băng móng giữ khô sạch; lót chuồng khô.',
    medications: [
      { name: 'Dung dịch vệ sinh móng (Hoof Cleaning Solution)', match: ['ve sinh mong', 'hoof cleaning'], amount: 50, unit: 'ml', route: 'topical', times: ['08:00'], instructions: 'Pha vào nước ngâm móng.' },
      { ...BUTE, days: 3, instructions: 'Trộn vào thức ăn.' },
      { ...VET_WRAP, instructions: 'Băng móng sau khi ngâm.' },
    ],
  },
  {
    key: 'respiratory',
    name: 'Sốt / viêm đường hô hấp',
    condition: 'Sốt, ho, chảy nước mũi',
    days: 5,
    trainingLevel: 'none',
    lockReason: 'Sốt, viêm hô hấp — nghỉ và cách ly',
    careInstructions: 'Cách ly, đo thân nhiệt sáng và chiều, chuồng thông thoáng, cho uống nước ấm; báo bác sĩ nếu sốt không giảm sau 2 ngày.',
    medications: [
      { ...PENICILLIN, instructions: 'Tiêm bắp, đổi bên mỗi lần.' },
      { ...BANAMINE, times: ['08:00'], days: 3, instructions: 'Chỉ tiêm khi thân nhiệt trên 38,5 °C.' },
    ],
  },
  {
    key: 'post-race',
    name: 'Mỏi cơ sau thi đấu',
    condition: 'Cơ căng, mỏi sau buổi chạy nặng hoặc thi đấu',
    days: 3,
    trainingLevel: 'light',
    lockReason: 'Hồi phục sau thi đấu — đi bộ thả lỏng',
    careInstructions: 'Đi bộ thả lỏng 20 phút sáng và chiều, xoa bóp cơ chân; cho uống điện giải.',
    medications: [
      { ...GEL, times: ['08:00', '16:00'], instructions: 'Xoa lên cơ chân sau khi đi bộ.' },
      { ...COLD_PACK, times: ['16:00'], days: 2, instructions: 'Chườm chân 15 phút sau buổi đi bộ chiều.' },
    ],
  },
  {
    key: 'deworming',
    name: 'Tẩy giun định kỳ',
    condition: 'Tẩy giun theo lịch',
    days: 1,
    trainingLevel: 'high',
    careInstructions: 'Cho dùng trước bữa sáng; theo dõi phân 2 ngày sau khi tẩy.',
    medications: [
      { name: 'Thuốc tẩy giun (Dewormer)', match: ['tay giun', 'dewormer', 'ivermectin'], amount: 1, unit: 'tuýp', route: 'oral', times: ['07:00'], days: 1, instructions: 'Bơm vào miệng, phía sau lưỡi.' },
    ],
  },
];

const dayCount = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / 86400000) + 1;

/**
 * What the form looks like with a template applied, from the treatment's start (an input date):
 * { meds, end, level, reason, care }. A medicine on the club list is linked to it, with the dose in
 * that item's unit; one that is not is written in by name.
 */
export function formFromTemplate(template, catalog, start) {
  const from = fromInputDate(start) || new Date();
  const endAfter = (days) => (days ? toInputDate(addDays(from, days - 1)) : '');
  const meds = (template.medications || []).map((m) => {
    const item = findMedicine(catalog, m);
    const linked = Boolean(item && (!m.unit || plain(item.unit) === plain(m.unit)));
    const amount = linked && m.amount ? String(m.amount) : '';
    const ownDays = m.days && m.days !== template.days ? m.days : null;
    return {
      ...blankMed(),
      mode: linked ? 'stock' : 'manual',
      inventoryItem: linked ? item._id : '',
      name: linked ? item.name : m.name,
      unit: linked ? item.unit : '',
      amount,
      dosage: m.dosage || (linked ? autoDosage(amount, item.unit) : [m.amount, m.unit].filter(Boolean).join(' ')),
      dosageAuto: linked && !m.dosage,
      route: m.route || 'oral',
      times: [...(m.times || [])].sort(),
      instructions: m.instructions || '',
      endDate: ownDays ? endAfter(ownDays) : '',
      more: false,
    };
  });
  return { meds, end: endAfter(template.days), level: template.trainingLevel || 'high', reason: template.lockReason || '', care: template.careInstructions || '' };
}

/** The form as a template to save: the same medicines, times and days, counted from its start. */
export function templateFromForm({ name, condition, start, end, level, reason, care, meds }) {
  const from = fromInputDate(start) || new Date();
  return {
    name: name.trim(),
    condition: condition?.trim() || undefined,
    days: end ? dayCount(from, fromInputDate(end)) : undefined,
    trainingLevel: level,
    lockReason: level === 'high' ? undefined : reason.trim() || undefined,
    careInstructions: care.trim() || undefined,
    medications: meds
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name.trim(),
        inventoryItem: m.inventoryItem || null,
        amount: m.inventoryItem && Number(m.amount) > 0 ? Number(m.amount) : undefined,
        unit: m.unit || undefined,
        dosage: !m.inventoryItem || !m.dosageAuto ? m.dosage.trim() || undefined : undefined,
        route: m.route || 'oral',
        times: m.times,
        days: m.endDate ? dayCount(fromInputDate(m.startDate) || from, fromInputDate(m.endDate)) : undefined,
        instructions: m.instructions.trim() || undefined,
      })),
  };
}
