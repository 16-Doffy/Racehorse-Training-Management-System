const InventoryItem = require('../../models/InventoryItem');
const FeedingSchedule = require('../../models/FeedingSchedule');
const Treatment = require('../../models/Treatment');
const { pushNotification } = require('../alerts/notification.service');
const { logAction } = require('../audit/audit.service');
const { ROLES } = require('../../constants/roles');

/**
 * Stock as the stable actually uses it. A ration item or a dose of medicine points at one
 * inventory item with an amount in that item's unit; feeding the horse or giving the dose takes
 * that amount out of stock. A task the stock can't cover can't be ticked — the groom asks the
 * Manager for more instead (see dailyTask.controller completeTask).
 */

// Below this many days of use left, the Manager and trainers are warned.
const LOW_STOCK_DAYS = 3;
const RENOTIFY_MS = 24 * 60 * 60 * 1000;

const round = (n) => Math.round(n * 1000) / 1000;

/** Items a list of task supplies needs that stock can't cover right now, one entry per item. */
function shortagesFrom(supplies, stockById) {
  const needed = new Map();
  for (const s of supplies || []) {
    if (!s.inventoryItem || !s.amount) continue;
    const id = String(s.inventoryItem);
    const entry = needed.get(id) || { inventoryItem: s.inventoryItem, name: s.name, unit: s.unit, needed: 0 };
    entry.needed = round(entry.needed + s.amount);
    needed.set(id, entry);
  }
  const missing = [];
  for (const [id, entry] of needed) {
    const item = stockById.get(id);
    const available = item ? item.quantity : 0;
    if (available < entry.needed) {
      missing.push({ ...entry, name: item?.name || entry.name, unit: item?.unit || entry.unit, available, short: round(entry.needed - available) });
    }
  }
  return missing;
}

async function stockMap(ids) {
  const items = await InventoryItem.find({ _id: { $in: [...new Set(ids.map(String))] } }).select('name unit quantity');
  return new Map(items.map((i) => [String(i._id), i]));
}

/**
 * `supplyStatus` for each pending task that needs supplies: { ok, missing: [...] }. One stock
 * query for the whole list. Tasks are returned as plain objects (with their computed `timing`).
 */
async function withSupplyStatus(tasks) {
  const ids = tasks.flatMap((t) => (t.status === 'pending' ? (t.supplies || []).map((s) => s.inventoryItem).filter(Boolean) : []));
  const stock = ids.length ? await stockMap(ids) : new Map();
  return tasks.map((t) => {
    const plain = typeof t.toJSON === 'function' ? t.toJSON() : t;
    if (t.status !== 'pending' || !(t.supplies || []).some((s) => s.inventoryItem)) return plain;
    const missing = shortagesFrom(t.supplies, stock);
    return { ...plain, supplyStatus: { ok: missing.length === 0, missing } };
  });
}

/**
 * Takes a task's supplies out of stock, all or nothing. Each decrement only applies while enough is
 * left (so two grooms can't both take the last bag); if one fails, the ones already taken are put
 * back. Returns { ok: true } or { ok: false, missing }.
 */
async function consumeSupplies(supplies, { actor, task }) {
  const lines = (supplies || []).filter((s) => s.inventoryItem && s.amount > 0);
  if (lines.length === 0) return { ok: true, consumed: [] };

  const taken = [];
  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const res = await InventoryItem.updateOne({ _id: line.inventoryItem, quantity: { $gte: line.amount } }, { $inc: { quantity: -line.amount } });
    if (res.modifiedCount !== 1) {
      for (const done of taken) {
        // eslint-disable-next-line no-await-in-loop
        await InventoryItem.updateOne({ _id: done.inventoryItem }, { $inc: { quantity: done.amount } });
      }
      const missing = shortagesFrom(lines, await stockMap(lines.map((l) => l.inventoryItem)));
      return { ok: false, missing };
    }
    taken.push(line);
  }

  await logAction({
    actorId: actor._id,
    action: 'inventory.consume',
    targetModel: 'DailyTask',
    targetId: task._id,
    metadata: { items: taken.map((l) => ({ item: l.inventoryItem, amount: l.amount, unit: l.unit })) },
  });
  await warnLowStock(taken.map((l) => l.inventoryItem));
  return { ok: true, consumed: taken };
}

/**
 * Daily use of every stock item from the rations and the ongoing treatments, and how many days the
 * current stock lasts at that rate. What the Manager plans restocking with.
 */
async function computeForecast() {
  const [items, rations, treatments] = await Promise.all([
    InventoryItem.find({ isProposed: { $ne: true } }).select('name unit quantity category stableBlock lowStockNotifiedAt'),
    FeedingSchedule.find({ 'items.inventoryItem': { $ne: null } }).populate('horse', 'name').select('horse mealTime items'),
    Treatment.find({ status: 'ongoing', 'medications.inventoryItem': { $ne: null } }).populate('horse', 'name').select('horse medications'),
  ]);

  const usage = new Map();
  const use = (id, amount, entry) => {
    const key = String(id);
    const u = usage.get(key) || { daily: 0, usedBy: [] };
    u.daily = round(u.daily + amount);
    u.usedBy.push(entry);
    usage.set(key, u);
  };
  for (const r of rations) {
    for (const it of r.items) {
      if (it.inventoryItem && it.amount) use(it.inventoryItem, it.amount, { horse: r.horse?.name, kind: 'ration', meal: r.mealTime, amount: it.amount });
    }
  }
  for (const t of treatments) {
    for (const m of t.medications) {
      if (!m.inventoryItem || !m.amount) continue;
      const doses = Math.max((m.times || []).length, 1);
      use(m.inventoryItem, m.amount * doses, { horse: t.horse?.name, kind: 'medication', medicine: m.name, amount: m.amount, doses });
    }
  }

  return items.map((item) => {
    const u = usage.get(String(item._id));
    const dailyUsage = u?.daily || 0;
    return {
      _id: item._id,
      name: item.name,
      unit: item.unit,
      category: item.category,
      stableBlock: item.stableBlock,
      quantity: item.quantity,
      dailyUsage,
      daysLeft: dailyUsage > 0 ? Math.floor(item.quantity / dailyUsage) : null,
      usedBy: u?.usedBy || [],
      lowStockNotifiedAt: item.lowStockNotifiedAt,
    };
  });
}

/**
 * Tells the Manager and the trainers about stock that has run out or will within LOW_STOCK_DAYS,
 * at most once a day per item. With `itemIds`, only those items are checked (after a deduction).
 */
async function warnLowStock(itemIds) {
  const forecast = await computeForecast();
  const wanted = itemIds ? new Set(itemIds.map(String)) : null;
  const now = Date.now();
  for (const f of forecast) {
    if (wanted && !wanted.has(String(f._id))) continue;
    const used = f.dailyUsage > 0;
    const low = (used && f.daysLeft < LOW_STOCK_DAYS) || (used && f.quantity <= 0);
    if (!low) continue;
    if (f.lowStockNotifiedAt && now - new Date(f.lowStockNotifiedAt).getTime() < RENOTIFY_MS) continue;

    const message =
      f.quantity <= 0
        ? `📦 "${f.name}" đã hết — đang được dùng cho ${f.usedBy.length} khẩu phần/đơn thuốc. Cần nhập thêm ngay.`
        : `📦 "${f.name}" chỉ còn ${f.quantity} ${f.unit}, đủ dùng khoảng ${f.daysLeft} ngày (mỗi ngày dùng ${f.dailyUsage} ${f.unit}).`;
    for (const role of [ROLES.MANAGER, ROLES.HEAD_TRAINER]) {
      // eslint-disable-next-line no-await-in-loop
      await pushNotification({ recipientRole: role, type: 'low_stock', severity: f.quantity <= 0 ? 'critical' : 'warning', message });
    }
    // eslint-disable-next-line no-await-in-loop
    await InventoryItem.updateOne({ _id: f._id }, { lowStockNotifiedAt: new Date() });
  }
}

/** Where an item is in use right now — a stock item feeding a ration or an ongoing treatment can't be deleted. */
async function itemInUse(itemId) {
  const [rations, treatments] = await Promise.all([
    FeedingSchedule.find({ 'items.inventoryItem': itemId }).populate('horse', 'name').select('horse mealTime'),
    Treatment.find({ status: 'ongoing', 'medications.inventoryItem': itemId }).populate('horse', 'name').select('horse'),
  ]);
  return [...rations.map((r) => r.horse?.name), ...treatments.map((t) => t.horse?.name)].filter(Boolean);
}

module.exports = { withSupplyStatus, consumeSupplies, computeForecast, warnLowStock, itemInUse, shortagesFrom, stockMap, LOW_STOCK_DAYS };
