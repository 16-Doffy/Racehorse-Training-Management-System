const mongoose = require('mongoose');

function operationError(statusCode, message, data) {
  return Object.assign(new Error(message), { statusCode, data });
}

/** Keep every database operation sequential and on the supplied session. Effects run after commit. */
async function runTransaction(work) {
  try {
    return await mongoose.connection.transaction(work, { readPreference: 'primary' });
  } catch (error) {
    if (error.code === 20 && /transaction|replica set/i.test(error.message)) {
      throw operationError(503, 'MongoDB cần chạy replica set để ghi công việc/kho và kết quả/tiền thưởng an toàn. Hãy cấu hình database theo DEPLOYMENT.md rồi thử lại.');
    }
    throw error;
  }
}

/** A failed notification must not turn a committed write into a failed HTTP operation. */
async function afterCommit(label, work) {
  try { await work(); } catch (error) { console.error(`[${label}] post-commit effect failed:`, error.message); }
}

module.exports = { runTransaction, operationError, afterCommit };
