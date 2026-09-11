/** Helpers to keep the { success, data, message } response shape consistent across the API. */

function ok(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, data, message });
}

function created(res, data = null, message = 'Created') {
  return ok(res, data, message, 201);
}

function fail(res, message = 'Error', status = 400, data = null) {
  return res.status(status).json({ success: false, data, message });
}

module.exports = { ok, created, fail };
