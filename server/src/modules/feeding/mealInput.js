const InventoryItem = require('../../models/InventoryItem');
const clubPolicy = require('../../config/clubPolicy');

// The part of the day each meal belongs to: breakfast before 11:00, lunch 11:00–15:59, the
// evening meal from 16:00 — so "lunch at 23:00" cannot be saved.
const SLOT_MINUTES = { morning: [0, 11 * 60], noon: [11 * 60, 16 * 60], evening: [16 * 60, 24 * 60] };
const SLOT_RANGE_TEXT = { morning: 'trước 11:00', noon: 'từ 11:00 đến 15:59', evening: 'từ 16:00 trở đi' };
const SLOT_LABELS = { morning: 'Bữa sáng', noon: 'Bữa trưa', evening: 'Bữa chiều' };
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/** The feed items a set of ration lines names, by id (one query for any number of meals). */
async function stockFor(rawLists) {
  const ids = rawLists.flatMap((items) => (Array.isArray(items) ? items : [])).map((i) => i?.inventoryItem).filter((id) => /^[0-9a-f]{24}$/i.test(String(id || '')));
  const stock = ids.length ? await InventoryItem.find({ _id: { $in: [...new Set(ids.map(String))] } }).select('name unit category isActive') : [];
  return new Map(stock.map((s) => [String(s._id), s]));
}

/**
 * Ration items come from the stock list: each names a food item in stock and an amount per meal in
 * that item's unit. The display text (type, quantity) is written from the item, so screens that
 * only read those keep working. `byId` is the stock the lines name (stockFor).
 */
function readItemsWith(rawItems, byId) {
  if (!Array.isArray(rawItems)) return { message: 'items phải là danh sách.' };
  const items = [];
  for (const [i, raw] of rawItems.entries()) {
    if (!raw) continue;
    if (!raw.inventoryItem) return { message: `Món thứ ${i + 1}: chọn mặt hàng trong kho — món ghi bằng chữ không trừ kho được.` };
    const item = byId.get(String(raw.inventoryItem));
    if (!item) return { message: `Món thứ ${i + 1}: không tìm thấy mặt hàng trong kho.` };
    if (item.category !== 'feed') return { message: `Món thứ ${i + 1}: "${item.name}" không thuộc loại thức ăn.` };
    if (item.isActive === false) return { message: `Món thứ ${i + 1}: "${item.name}" đã ngừng sử dụng.` };
    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { message: `Món thứ ${i + 1}: lượng mỗi bữa phải là số dương.` };
    items.push({ type: item.name, quantity: `${amount} ${item.unit}`, inventoryItem: item._id, amount, unit: item.unit });
  }
  if (!items.length) return { message: 'Khẩu phần cần ít nhất một món chọn từ kho.' };
  return { items };
}

async function readRationItems(rawItems) {
  return readItemsWith(rawItems, await stockFor([rawItems]));
}

/** Whether a horse's meal times, all together, fit their parts of the day and the club's gap between meals. */
function mealSetProblem(clocks) {
  const slots = Object.keys(clocks);
  for (const slot of slots) {
    const clock = clocks[slot];
    if (typeof clock !== 'string' || !CLOCK.test(clock)) return `Giờ cho ăn phải có dạng HH:mm (${SLOT_LABELS[slot].toLowerCase()}).`;
    const [from, to] = SLOT_MINUTES[slot];
    if (minutesOf(clock) < from || minutesOf(clock) >= to) return `${SLOT_LABELS[slot]} phải ${SLOT_RANGE_TEXT[slot]} (đang chọn ${clock}).`;
  }
  const gap = clubPolicy.mealMinGapHours * 60;
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (Math.abs(minutesOf(clocks[slots[i]]) - minutesOf(clocks[slots[j]])) < gap) {
        return `${SLOT_LABELS[slots[i]]} ${clocks[slots[i]]} và ${SLOT_LABELS[slots[j]].toLowerCase()} ${clocks[slots[j]]} cách nhau chưa đủ ${clubPolicy.mealMinGapHours} giờ (quy định CLB).`;
      }
    }
  }
  return null;
}

module.exports = { SLOT_MINUTES, SLOT_RANGE_TEXT, SLOT_LABELS, CLOCK, minutesOf, stockFor, readItemsWith, readRationItems, mealSetProblem };
