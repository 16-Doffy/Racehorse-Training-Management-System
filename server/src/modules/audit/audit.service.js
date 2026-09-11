const AuditLog = require('../../models/AuditLog');

/** Fire-and-forget audit trail write. Never throws into the caller's request flow. */
async function logAction({ actorId, action, targetModel, targetId, metadata }) {
  try {
    await AuditLog.create({ actor: actorId, action, targetModel, targetId, metadata });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}

module.exports = { logAction };
