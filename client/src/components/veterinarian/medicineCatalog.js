/**
 * The club's medical stock, as the vet needs it. Medicines are the groom's to keep and give: the vet
 * only picks them by name when prescribing (stock goes down when the groom gives a dose). Examination
 * tools — stethoscope, thermometer, needles — stay with the vet, on the vet's tools page.
 *
 * Both live in the stock list's 'medicine' category; a tool is counted by the piece.
 */
const TOOL_UNITS = ['cái', 'chiếc', 'bộ', 'đôi'];
export const TOOL_UNIT_OPTIONS = TOOL_UNITS;

const medical = (item) => item?.category === 'medicine' && item.isActive !== false;

/** An examination tool the vet keeps (by the piece). */
export const isExamTool = (item) => medical(item) && TOOL_UNITS.includes(String(item.unit || '').trim().toLowerCase());

/** A medicine the vet can prescribe (and the groom gives from stock). */
export const isPrescribable = (item) => medical(item) && !item.isProposed && !isExamTool(item);

/** The medicines a prescription picks from, by name, plus any item an existing one (`treatment`) still links. */
export function prescribableCatalog(items, treatment) {
  const linked = new Set((treatment?.medications || []).map((m) => String(m.inventoryItem?._id || m.inventoryItem || '')).filter(Boolean));
  return (items || []).filter((i) => isPrescribable(i) || linked.has(i._id)).sort((a, b) => a.name.localeCompare(b.name));
}

/** Lower case, no accents, single spaces: what names are compared on. */
export const plain = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The catalogue item a medicine is: by its id, by its exact name, or by one of the words a template gives. */
export function findMedicine(catalog, { inventoryItem, name, match } = {}) {
  if (inventoryItem) {
    const byId = catalog.find((i) => i._id === String(inventoryItem));
    if (byId) return byId;
  }
  const wanted = plain(name);
  if (wanted) {
    const byName = catalog.find((i) => plain(i.name) === wanted);
    if (byName) return byName;
  }
  for (const word of match || []) {
    const hit = catalog.find((i) => plain(i.name).includes(plain(word)));
    if (hit) return hit;
  }
  return null;
}
