const { getIO } = require('../../realtime/socketServer');
const { pushNotification } = require('../alerts/notification.service');
const { ROLES } = require('../../constants/roles');

const CATEGORY_LABELS = { feed: 'thức ăn', medicine: 'thuốc & vật tư y tế', equipment: 'dụng cụ' };

/** "250 kg (10 bao)", "247 kg (9 bao + 22 kg)" — the amount in the unit it is used in, and in packs. */
function amountText(item, quantity) {
  const base = `${quantity} ${item.unit}`;
  if (!item.packUnit || !item.packSize) return base;
  const packs = Math.floor(quantity / item.packSize + 1e-9);
  if (!packs) return base;
  const rest = Math.round((quantity - packs * item.packSize) * 100) / 100;
  return `${base} (${packs} ${item.packUnit}${rest > 0 ? ` + ${rest} ${item.unit}` : ''})`;
}

/**
 * Tells every open screen that stock changed, so the groom's supplies list, a meal blocked for lack
 * of feed and the Manager's storeroom reload at once instead of on their next poll. No payload but
 * what changed: each screen reloads what it shows.
 */
function emitInventoryChanged(change = {}) {
  try {
    getIO().emit('inventory:changed', { at: new Date().toISOString(), ...change });
  } catch {
    // No socket server (a script, a unit test): there is no open screen to tell.
  }
}

/** Router middleware: after any write under /inventory that succeeded, the open screens reload. */
function broadcastWrites(req, res, next) {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode < 300) emitInventoryChanged({ itemId: req.path.split('/')[1] || null, method: req.method });
  });
  return next();
}

/**
 * The grooms hear, live, when the Manager stocks something: they are the ones who measure the feed
 * and give the medicine, and a meal or a dose may have been waiting on it. Notifying them never fails
 * the stock write it follows.
 */
async function tellGrooms(message) {
  try {
    await pushNotification({ recipientRole: ROLES.GROOM, type: 'stock_update', severity: 'info', message });
  } catch (err) {
    console.error('[inventory] could not notify the grooms:', err.message);
  }
}

/** A new item in the storeroom (not a proposal waiting for the Manager's decision). */
const announceNewItem = (item) =>
  item.isProposed
    ? null
    : tellGrooms(
        `📦 Kho có mặt hàng mới (${CATEGORY_LABELS[item.category] || 'vật tư'}): "${item.name}" — ${
          item.quantity > 0 ? `đang có ${amountText(item, item.quantity)}` : 'chưa có hàng, chờ nhập kho'
        }.`
      );

/** A delivery counted into stock. */
const announceDelivery = (item, quantity, total) =>
  tellGrooms(`📦 Kho vừa nhập thêm ${amountText(item, quantity)} "${item.name}" — tồn hiện tại ${amountText(item, total)}.`);

module.exports = { emitInventoryChanged, broadcastWrites, announceNewItem, announceDelivery, amountText };
