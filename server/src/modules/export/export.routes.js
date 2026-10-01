const router = require('express').Router();
const { protect } = require('../../middlewares/authMiddleware');
const { authorize } = require('../../middlewares/rbacMiddleware');
const { ROLES } = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const { fail } = require('../../utils/apiResponse');
const FinancialRecord = require('../../models/FinancialRecord');
const Horse = require('../../models/Horse');
const StableAssignment = require('../../models/StableAssignment');

/**
 * CSV downloads for the Club Manager. Written with a UTF-8 byte-order mark so Excel opens the
 * Vietnamese text correctly instead of guessing a legacy code page.
 */

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sendCsv(res, filename, header, rows) {
  const body = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  return res.send(`﻿${body}\r\n`);
}

const stamp = () => new Date().toISOString().slice(0, 10);

const TYPE_LABELS = { cost: 'Chi', revenue: 'Thu' };
const HEALTH_LABELS = { eligible: 'Đủ điều kiện', monitoring: 'Cần theo dõi', injured: 'Chấn thương', quarantined: 'Cách ly' };

// GET /export/finance?from=YYYY-MM-DD&to=YYYY-MM-DD — the ledger for a period (all of it by default).
const exportFinance = asyncHandler(async (req, res) => {
  const range = {};
  for (const [key, op] of [['from', '$gte'], ['to', '$lte']]) {
    if (!req.query[key]) continue;
    const d = new Date(req.query[key]);
    if (Number.isNaN(d.getTime())) return fail(res, `${key} không hợp lệ.`, 400);
    if (key === 'to') d.setHours(23, 59, 59, 999);
    range[op] = d;
  }
  const records = await FinancialRecord.find(Object.keys(range).length ? { date: range } : {})
    .populate('horse', 'name')
    .populate('recordedBy', 'name')
    .sort({ date: 1 });

  return sendCsv(
    res,
    `tai-chinh-${stamp()}.csv`,
    ['Ngày', 'Ngựa', 'Loại', 'Hạng mục', 'Số tiền (VNĐ)', 'Ghi chú', 'Người ghi'],
    records.map((r) => [r.date, r.horse?.name, TYPE_LABELS[r.type] || r.type, r.category, r.amount, r.note, r.recordedBy?.name])
  );
});

// GET /export/horses — the roster with who is responsible for each horse.
const exportHorses = asyncHandler(async (req, res) => {
  const [horses, stalls] = await Promise.all([
    Horse.find()
      .populate('owner', 'name')
      .populate('assignedTrainer', 'name')
      .populate('assignedVet', 'name')
      .sort({ name: 1 }),
    StableAssignment.find().populate('assignedCaretaker', 'name'),
  ]);
  const stallOf = new Map(stalls.map((s) => [String(s.horse), s]));

  return sendCsv(
    res,
    `danh-sach-ngua-${stamp()}.csv`,
    ['Tên ngựa', 'Giống', 'Màu lông', 'Ngày sinh', 'Cân nặng (kg)', 'Chủ sở hữu', 'HLV phụ trách', 'Bác sĩ phụ trách', 'Sức khỏe', 'Chuồng', 'NV chăm sóc', 'Số thành tích'],
    horses.map((h) => {
      const stall = stallOf.get(String(h._id));
      return [
        h.name,
        h.breed,
        h.color,
        h.dob,
        h.weightKg,
        h.owner?.name,
        h.assignedTrainer?.name,
        h.assignedVet?.name,
        HEALTH_LABELS[h.healthStatus] || h.healthStatus,
        stall?.stableBlock,
        stall?.assignedCaretaker?.name,
        (h.achievements || []).length,
      ];
    })
  );
});

router.use(protect, authorize(ROLES.MANAGER));
router.get('/finance', exportFinance);
router.get('/horses', exportHorses);

module.exports = router;
