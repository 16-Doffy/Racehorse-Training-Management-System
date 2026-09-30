// What a groom records when completing a task (DailyTask.observation). The API stores these as
// codes whatever the screen sent, so every screen that shows an observation — trainer, owner,
// groom — should turn the code into a label through these maps instead of printing it as-is.
export const APPETITE_LABELS = { full: 'Ăn hết', partial: 'Ăn dở', refused: 'Bỏ ăn' };
export const APPETITE_COLORS = { full: 'green', partial: 'gold', refused: 'red' };

export const MANURE_LABELS = {
  normal: 'Bình thường',
  dry: 'Khô / Táo bón',
  loose: 'Lỏng / Tiêu chảy',
  none: 'Không thấy phân',
};

export const WATER_INTAKE_LABELS = { normal: 'Bình thường', high: 'Uống nhiều', low: 'Uống ít' };
