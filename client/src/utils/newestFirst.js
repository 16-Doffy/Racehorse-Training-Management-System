/**
 * The trainer's and the Manager's lists put what was added or changed last at the top: a record
 * just saved, approved or ticked is the first row instead of somewhere down the list. Ordered by
 * `field` when given (e.g. a request's requestedAt), else updatedAt, else createdAt, else the time
 * written into the record's id.
 */
const idTime = (id) => (typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id) ? parseInt(id.slice(0, 8), 16) * 1000 : 0);

export function changedAt(row, field) {
  const at = new Date((field && row?.[field]) || row?.updatedAt || row?.createdAt || 0).getTime();
  return at || idTime(row?._id);
}

export function newestFirst(rows, field) {
  return [...(rows || [])].sort((a, b) => changedAt(b, field) - changedAt(a, field));
}
