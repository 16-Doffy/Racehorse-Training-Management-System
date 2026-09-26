/**
 * Copies only the listed keys that are actually present on `source`.
 *
 * Used to whitelist request bodies. Passing req.body straight into create/update let a client set
 * fields the server is meant to own — a session's outcome or readiness snapshot, who created a
 * plan, which horse a record belongs to after the fact.
 */
function pick(source, keys) {
  const out = {};
  if (!source) return out;
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

module.exports = pick;
