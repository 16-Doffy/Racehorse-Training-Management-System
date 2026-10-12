const RaceEntry = require('../../models/RaceEntry');
const Horse = require('../../models/Horse');
const FinancialRecord = require('../../models/FinancialRecord');
const { runTransaction, operationError } = require('../../utils/transaction');
const { canAccessHorse, FORBIDDEN_HORSE_MESSAGE } = require('../../utils/horseScope');

async function recordAchievement(entry, session) {
  if (entry.status !== 'completed' || !entry.result) return;
  // Only replace this entry, plus its unlinked legacy row with the same name AND date.
  await Horse.updateOne({ _id: entry.horse }, { $pull: { achievements: { $or: [
    { raceEntry: entry._id },
    { raceEntry: null, race: entry.raceName, date: entry.raceDate },
  ] } } }, { session });
  await Horse.updateOne({ _id: entry.horse }, { $push: { achievements: {
    raceEntry: entry._id, race: entry.raceName, result: entry.result, date: entry.raceDate,
  } } }, { session });
}

async function syncPrizeRecord(entry, user, session) {
  let record = entry.financeRecord ? await FinancialRecord.findById(entry.financeRecord).session(session) : null;
  if (!record) record = await FinancialRecord.findOne({ raceEntry: entry._id }).session(session);
  if (!entry.prizeMoney) {
    if (record) await record.deleteOne({ session });
    entry.financeRecord = null;
    return;
  }
  if (!record) record = new FinancialRecord({ recordedBy: user._id });
  Object.assign(record, {
    horse: entry.horse, raceEntry: entry._id, type: 'revenue', category: 'prize', source: 'race_prize',
    amount: entry.prizeMoney, date: entry.raceDate,
    note: `Tiền thưởng ${entry.raceName}${entry.position ? ` — hạng ${entry.position}` : ''}`,
  });
  await record.save({ session });
  entry.financeRecord = record._id;
}

async function recordRaceResult(id, user, body) {
  return runTransaction(async (session) => {
    // Re-read on every transaction retry, so a corrected result never uses an old prize link.
    const entry = await RaceEntry.findById(id).session(session);
    if (!entry) throw operationError(404, 'Race entry not found.');
    if (!(await canAccessHorse(user, entry.horse))) throw operationError(403, FORBIDDEN_HORSE_MESSAGE);
    if (entry.status === 'withdrawn') throw operationError(409, 'Ngựa đã rút khỏi giải này — không có kết quả để nhập.');
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    if (entry.raceDate > endOfToday) throw operationError(409, 'Giải chưa diễn ra — chưa nhập kết quả được.');
    const before = JSON.stringify([entry.status, entry.position, entry.finishTime, entry.prizeMoney, entry.result]);
    if (body.position !== undefined && body.position !== null && body.position !== '') {
      if (!Number.isInteger(Number(body.position)) || Number(body.position) < 1) throw operationError(400, 'Thứ hạng phải là số nguyên từ 1.');
      entry.position = Number(body.position);
    }
    if (body.finishTime !== undefined) {
      const time = String(body.finishTime || '').trim();
      if (time.length > 20) throw operationError(400, 'Thời gian về đích quá dài.');
      entry.finishTime = time || undefined;
    }
    if (body.prizeMoney !== undefined && body.prizeMoney !== null && body.prizeMoney !== '') {
      if (!Number.isFinite(Number(body.prizeMoney)) || Number(body.prizeMoney) < 0) throw operationError(400, 'Tiền thưởng không hợp lệ.');
      entry.prizeMoney = Number(body.prizeMoney);
    }
    const typed = typeof body.result === 'string' ? body.result.trim() : '';
    entry.result = typed || [entry.position ? `Hạng ${entry.position}` : null, entry.finishTime].filter(Boolean).join(' — ') || entry.result;
    if (!entry.result) throw operationError(400, 'Nhập thứ hạng hoặc kết quả.');
    entry.status = 'completed';
    if (before === JSON.stringify([entry.status, entry.position, entry.finishTime, entry.prizeMoney, entry.result])) {
      entry.$session(null);
      return { entry, changed: false };
    }
    // Serialize writers on the entry before creating/updating any linked records.
    await entry.save({ session });
    await syncPrizeRecord(entry, user, session);
    await entry.save({ session });
    await recordAchievement(entry, session);
    entry.$session(null);
    return { entry, changed: true };
  });
}

module.exports = { recordRaceResult, recordAchievement };
