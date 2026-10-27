/**
 * Which part of the stable a horse belongs in, by its health (Stall.type): the normal zones for
 * healthy horses, the isolation zone for a horse the vet quarantined (an illness that may spread),
 * the recovery stalls for an injured one.
 *
 * Returns null when the horse is where it belongs, else { level, message }:
 *   - 'block': a quarantined horse anywhere but an isolation stall — placing it there is refused;
 *   - 'warn': an isolation stall taken by a horse that is not quarantined (the place is kept for sick
 *     horses), or an injured horse in a normal stall while recovery stalls exist — shown to the Manager
 *     as something to move, never refused.
 */
function placementProblem(horse, stall, { recoveryStalls = false } = {}) {
  if (!horse || !stall) return null;
  const type = stall.type || 'standard';
  const name = horse.name || 'Ngựa';
  if (horse.healthStatus === 'quarantined' && type !== 'isolation') {
    return { level: 'block', message: `${name} đang cách ly (bệnh có thể lây) — chỉ xếp vào chuồng khu cách ly.` };
  }
  if (type === 'isolation' && horse.healthStatus !== 'quarantined') {
    return { level: 'warn', message: `${name} không bị cách ly mà đang ở chuồng cách ly ${stall.code} — chuyển về khu thường để giữ chỗ cho ngựa bệnh.` };
  }
  if (horse.healthStatus === 'injured' && type === 'standard' && recoveryStalls) {
    return { level: 'warn', message: `${name} đang chấn thương — nên chuyển sang chuồng hồi phục.` };
  }
  return null;
}

/**
 * The vet has just quarantined a horse: unless it already stands in an isolation stall, the Manager
 * is told to move it there (and the map lists it under "Cần xử lý").
 */
async function askToIsolate(horseId) {
  // Required here: placement.js is also loaded by the stable controllers these modules load.
  const StableAssignment = require('../../models/StableAssignment');
  const Horse = require('../../models/Horse');
  const { pushNotification } = require('../alerts/notification.service');
  const { ROLES } = require('../../constants/roles');
  const [horse, assignment] = await Promise.all([
    Horse.findById(horseId).select('name healthStatus'),
    StableAssignment.findOne({ horse: horseId }).populate('stall', 'code type'),
  ]);
  if (!horse || horse.healthStatus !== 'quarantined' || assignment?.stall?.type === 'isolation') return;
  const where = assignment ? `đang ở ${assignment.stall?.code || assignment.stableBlock}` : 'chưa có chuồng';
  await pushNotification({
    recipientRole: ROLES.MANAGER,
    horse: horse._id,
    type: 'horse_assigned',
    severity: 'warning',
    message: `🦠 Bác sĩ kết luận ${horse.name} cần cách ly (${where}) — chuyển ngựa sang chuồng khu cách ly.`,
  });
}

module.exports = { placementProblem, askToIsolate };
