/**
 * The diets a vet orders on an exam for a horse that is not fit (server: modules/feeding/dietOrder.js).
 * 'plan': it eats as its training plan says (only under monitoring); the others are sick diets, each
 * with what the groom reads beside the meal (`care`) and what it does to the ration (`does`).
 */
export const DIET_KINDS = {
  plan: { label: 'Theo kế hoạch tập', icon: 'bi-calendar2-check', does: 'Khẩu phần theo buổi tập như bình thường.', care: '' },
  rest: { label: 'Nghỉ chuồng', icon: 'bi-house-heart', does: 'Nhiều cỏ thô, rất ít thức ăn tinh, bỏ dầu và điện giải.', care: 'Nhiều cỏ thô giữ tiêu hóa, rất ít thức ăn tinh.' },
  colic: { label: 'Đau bụng (colic)', icon: 'bi-activity', does: 'Ít cỏ, chia đều 3 bữa, không thức ăn tinh.', care: 'Cỏ ngâm ướt, chia nhỏ; không cho thức ăn tinh. Ngựa bỏ ăn hoặc không đi phân thì báo bác sĩ ngay.' },
  laminitis: { label: 'Viêm móng', icon: 'bi-exclamation-diamond', does: 'Cỏ ít đường chia đều, không ngũ cốc.', care: 'Ngâm cỏ khô 30–60 phút rồi chắt nước cho bớt đường; không ngũ cốc, không cỏ tươi.' },
  respiratory: { label: 'Bệnh hô hấp', icon: 'bi-wind', does: 'Như nghỉ chuồng, cỏ nhúng ướt cho hết bụi.', care: 'Nhúng ướt cỏ khô cho hết bụi, đặt máng ăn thấp; không rũ cỏ trong chuồng.' },
  ulcer: { label: 'Dạ dày', icon: 'bi-droplet-half', does: 'Cỏ chia đều cả ngày, ưu tiên linh lăng, rất ít thức ăn tinh.', care: 'Không để ngựa đói quá 5 giờ; cho ăn cỏ (ưu tiên linh lăng) trước thức ăn tinh.' },
};
export const SICK_DIET_ORDER = ['rest', 'colic', 'laminitis', 'respiratory', 'ulcer'];
export const DIET_NOTE_MAX = 300;
// The week back to the training ration after an illness (server: dietOrder.js RAMP).
export const RAMP_TEXT = 'thức ăn tinh tăng dần trong 7 ngày (50% → 75% → 90% → 100%)';
