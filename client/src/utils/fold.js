/** Text without Vietnamese accents, lower case: what a search box compares, so "hoang kim" finds "Hoàng Kim". */
export const fold = (text = '') =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
