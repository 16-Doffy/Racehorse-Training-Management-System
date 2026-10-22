// The details a vet records with routine care, by kind: what a vaccine protects against and which
// shot of the course it was, how a dewormer was given and the egg count behind it, what the farrier
// did to which feet. Keys are stored; labels go into the horse's timeline. The client keeps the same
// lists (client/src/constants/care.js).

const VACCINE_TARGETS = {
  influenza: 'Cúm ngựa',
  tetanus: 'Uốn ván',
  ehv: 'Herpes (EHV-1/4)',
  encephalomyelitis: 'Viêm não tủy',
  west_nile: 'Tây sông Nile',
  rabies: 'Dại',
  strangles: 'Viêm hạch (Strangles)',
};
const SHOT_TYPES = { primary_1: 'Mũi cơ bản 1', primary_2: 'Mũi cơ bản 2', booster: 'Mũi nhắc lại' };
const CARE_ROUTES = { im: 'Tiêm bắp', sc: 'Tiêm dưới da', intranasal: 'Nhỏ mũi', oral: 'Uống (gel)', feed: 'Trộn thức ăn' };
const REACTIONS = { none: 'Không phản ứng', swelling: 'Sưng chỗ tiêm', fever: 'Sốt nhẹ', lethargy: 'Mệt, bỏ ăn', other: 'Phản ứng khác' };
const FARRIER_WORK = { trim: 'Gọt sửa móng', new_shoes: 'Đóng móng mới', reset: 'Đóng lại móng cũ', corrective: 'Móng chỉnh hình', remove: 'Tháo móng' };
const LIMBS = { fore_left: 'Trước trái', fore_right: 'Trước phải', hind_left: 'Sau trái', hind_right: 'Sau phải' };
const HOOF_CONDITIONS = { good: 'Móng tốt', cracked: 'Nứt móng', thin_sole: 'Đế móng mỏng', abscess: 'Áp xe móng', thrush: 'Thối gót', laminitis: 'Viêm lá móng' };

// Which details each kind of care takes.
const DETAIL_FIELDS = {
  vaccination: ['targets', 'shotType', 'route', 'site', 'lotExpiry', 'reaction'],
  deworming: ['activeIngredient', 'route', 'weightKg', 'fecEpg', 'reaction'],
  farrier: ['farrierName', 'work', 'limbs', 'hoofCondition'],
};

const labels = (keys, vocabulary) => (keys || []).map((k) => vocabulary[k]).filter(Boolean).join(', ');

/** The details of a care event as short phrases, for the timeline. */
function careDetails(e) {
  const allFour = (e.limbs || []).length === 4;
  return [
    e.targets?.length && `Phòng: ${labels(e.targets, VACCINE_TARGETS)}`,
    SHOT_TYPES[e.shotType],
    e.activeIngredient && `Hoạt chất: ${e.activeIngredient}`,
    CARE_ROUTES[e.route],
    e.site && `Vị trí: ${e.site}`,
    e.weightKg && `Liều theo ${e.weightKg} kg`,
    typeof e.fecEpg === 'number' && `Trứng giun ${e.fecEpg} EPG`,
    e.work?.length && labels(e.work, FARRIER_WORK),
    e.limbs?.length && (allFour ? 'Cả 4 chân' : labels(e.limbs, LIMBS)),
    e.hoofCondition?.length && labels(e.hoofCondition, HOOF_CONDITIONS),
    e.farrierName && `Thợ móng: ${e.farrierName}`,
    e.reaction && e.reaction !== 'none' && REACTIONS[e.reaction],
  ].filter(Boolean);
}

module.exports = { VACCINE_TARGETS, SHOT_TYPES, CARE_ROUTES, REACTIONS, FARRIER_WORK, LIMBS, HOOF_CONDITIONS, DETAIL_FIELDS, careDetails };
