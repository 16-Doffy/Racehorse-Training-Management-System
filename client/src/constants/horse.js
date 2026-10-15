// A horse's sex as the server stores it (models/Horse.js HORSE_SEXES).
export const HORSE_SEX_LABELS = {
  stallion: 'Ngựa đực giống',
  mare: 'Ngựa cái',
  gelding: 'Ngựa thiến',
  colt: 'Ngựa đực non',
  filly: 'Ngựa cái non',
};
export const horseSexOptions = Object.entries(HORSE_SEX_LABELS).map(([value, label]) => ({ value, label }));

export const formatVnd = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('vi-VN')} ₫`);
