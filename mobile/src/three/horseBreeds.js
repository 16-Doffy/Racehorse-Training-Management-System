/**
 * Horse breeds and coat colours, and how the 3D horse looks for each.
 *
 * There is one 3D model, with neutral grey textures; each horse paints it: its coat colour on the
 * body, the colour of its mane and tail on the hair. The Manager picks the breed when adding a horse
 * and the coat follows from it (they can still change the coat); every screen that shows the horse
 * in 3D paints it from the horse's `breed` and `color`, so whoever is assigned the horse sees the
 * same horse.
 *
 * The values stored on the horse are the English names already in the data ('Thoroughbred',
 * 'Bay'). Horses typed in by hand before still match: `coatFor` also reads Vietnamese, with or
 * without accents.
 *
 * The same file is client/src/features/horses/horse3d/horseBreeds.js and
 * mobile/src/three/horseBreeds.js; mobile's tests fail when the two differ.
 */

/**
 * `body` and `hair` multiply the model's grey textures (linear RGB, 0–1); `roughness` is the body's
 * (a dark coat needs some shine to read as a coat rather than a silhouette); `swatch` is the colour
 * shown in lists; `hint` says what the coat looks like.
 */
export const COATS = {
  bay: { value: 'Bay', label: 'Hồng', hint: 'thân nâu đỏ, bờm và đuôi đen', swatch: '#6e2f17', body: [0.1, 0.03, 0.012], hair: [0.035, 0.03, 0.026], roughness: 0.75 },
  darkBay: { value: 'Dark Bay', label: 'Nâu sẫm', hint: 'nâu gần đen, bờm đen', swatch: '#3a1d10', body: [0.045, 0.02, 0.011], hair: [0.028, 0.024, 0.02], roughness: 0.7 },
  chestnut: { value: 'Chestnut', label: 'Hạt dẻ', hint: 'đỏ đồng, bờm cùng màu', swatch: '#9a3f1c', body: [0.2, 0.052, 0.018], hair: [0.3, 0.09, 0.035], roughness: 0.75 },
  black: { value: 'Black', label: 'Đen tuyền', hint: 'đen từ đầu tới đuôi', swatch: '#141414', body: [0.035, 0.033, 0.033], hair: [0.03, 0.03, 0.03], roughness: 0.55 },
  grey: { value: 'Grey', label: 'Xám trắng', hint: 'trắng ánh xám, bờm bạc', swatch: '#e9e7e2', body: [1, 0.98, 0.95], hair: [0.9, 0.9, 0.9], roughness: 0.85 },
  palomino: { value: 'Palomino', label: 'Vàng kim', hint: 'vàng óng, bờm kem', swatch: '#d39b45', body: [0.7, 0.38, 0.11], hair: [1, 0.95, 0.82], roughness: 0.65 },
};

export const DEFAULT_COAT = 'bay';

export const REGIONS = ['Châu Á', 'Châu Âu', 'Châu Mỹ'];

/** The breeds the Manager picks from, each with the coat it is known for. */
export const BREEDS = [
  { value: 'Arabian', label: 'Ả Rập (Arabian)', region: 'Châu Á', origin: 'Bán đảo Ả Rập', coat: 'grey', aliases: ['arabian', 'arab', 'a rap'] },
  { value: 'Akhal-Teke', label: 'Akhal-Teke', region: 'Châu Á', origin: 'Turkmenistan', coat: 'palomino', aliases: ['akhal teke', 'akhal', 'teke'] },
  { value: 'Thoroughbred', label: 'Thuần chủng Anh (Thoroughbred)', region: 'Châu Âu', origin: 'Anh', coat: 'bay', aliases: ['thoroughbred', 'thuan chung', 'tb'] },
  { value: 'Friesian', label: 'Friesian', region: 'Châu Âu', origin: 'Hà Lan', coat: 'black', aliases: ['friesian', 'frisian', 'friesland'] },
  { value: 'Quarter Horse', label: 'Quarter Horse', region: 'Châu Mỹ', origin: 'Mỹ', coat: 'chestnut', aliases: ['quarter horse', 'quarter', 'qh'] },
  { value: 'Standardbred', label: 'Standardbred', region: 'Châu Mỹ', origin: 'Mỹ', coat: 'darkBay', aliases: ['standardbred', 'standard bred'] },
];

// Words people write for each coat, unaccented.
const COAT_WORDS = {
  bay: ['bay', 'hong', 'nau', 'nau do'],
  darkBay: ['dark bay', 'seal brown', 'brown', 'nau sam', 'nau dam', 'nau toi'],
  chestnut: ['chestnut', 'sorrel', 'liver', 'hat de', 'do'],
  black: ['black', 'den', 'o'],
  grey: ['grey', 'gray', 'white', 'xam', 'trang', 'bach'],
  palomino: ['palomino', 'golden', 'gold', 'buckskin', 'dun', 'cream', 'vang'],
};
// Longer phrases first, so 'dark bay' is not read as 'bay' nor 'nâu đỏ' as 'đỏ'.
const COAT_PHRASES = Object.entries(COAT_WORDS)
  .flatMap(([key, list]) => list.map((phrase) => [key, phrase]))
  .sort((a, b) => b[1].split(' ').length - a[1].split(' ').length);

/** Lower case, no accents, words separated by single spaces and padded: ' hat de '. */
function words(text) {
  const plain = String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return plain ? ` ${plain} ` : '';
}

const has = (text, phrase) => text.includes(` ${phrase} `);

/** The catalogue breed a horse's `breed` names, or null. */
export function breedOf(breed) {
  const text = words(breed);
  if (!text) return null;
  return BREEDS.find((b) => has(text, words(b.value).trim()) || b.aliases.some((a) => has(text, a))) || null;
}

/** The coat key a horse's `color` names ('bay', 'black'…), or null. */
export function coatKeyOf(color) {
  const text = words(color);
  if (!text) return null;
  return COAT_PHRASES.find(([, phrase]) => has(text, phrase))?.[0] || null;
}

/**
 * How to paint a horse: its own coat colour when it has one we know, else the coat its breed is
 * known for, else a bay. `from` says which.
 */
export function coatFor({ breed, color } = {}) {
  const own = coatKeyOf(color);
  const fromBreed = breedOf(breed)?.coat;
  const key = own || fromBreed || DEFAULT_COAT;
  return { key, ...COATS[key], from: own ? 'color' : fromBreed ? 'breed' : 'default' };
}

/** The coat value to fill in when the Manager picks a breed. */
export function coatValueOfBreed(breed) {
  const coat = breedOf(breed)?.coat;
  return coat ? COATS[coat].value : null;
}

/** The Vietnamese name of a stored breed or coat, for display; unknown text is shown as typed. */
export function breedLabel(breed) {
  return breedOf(breed)?.label || breed || '';
}

export function coatLabel(color) {
  const key = coatKeyOf(color);
  return key ? COATS[key].label : color || '';
}
