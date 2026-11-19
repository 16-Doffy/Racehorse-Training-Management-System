const { test } = require('node:test');
const assert = require('node:assert/strict');

const Horse = require('../src/models/Horse');
const FeedingCalendarDay = require('../src/models/FeedingCalendarDay');
const FeedingSchedule = require('../src/models/FeedingSchedule');
const InventoryItem = require('../src/models/InventoryItem');
const Treatment = require('../src/models/Treatment');
const HealthRecord = require('../src/models/HealthRecord');
const StableAssignment = require('../src/models/StableAssignment');
const CareEvent = require('../src/models/CareEvent');
const clubPolicy = require('../src/config/clubPolicy');
const { costReport, unitPriceOf, dosesPerDay } = require('../src/modules/finance/costReport.service');

/** A query that answers `data` however it is chained (select, sort, populate, lean). */
const query = (data) => {
  const q = { select: () => q, sort: () => q, populate: () => q, lean: () => q, then: (ok, ko) => Promise.resolve(data).then(ok, ko) };
  return q;
};
const stub = (Model, data) => {
  Model.find = () => query(data);
};

test('a stock item is priced per unit it is used in, a pack price split over its size', () => {
  assert.equal(unitPriceOf({ price: 500000, packUnit: 'bao', packSize: 25 }), 20000);
  assert.equal(unitPriceOf({ price: 12000 }), 12000);
  assert.equal(unitPriceOf({ price: null }), null);
  assert.equal(unitPriceOf(null), null);
});

test('doses a day come from the clock times, the parts of the day or the words', () => {
  assert.equal(dosesPerDay({ times: ['08:00', '20:00'] }), 2);
  assert.equal(dosesPerDay({ timeSlots: ['morning', 'noon', 'evening'] }), 3);
  assert.equal(dosesPerDay({ frequency: '2 lần/ngày' }), 2);
  assert.equal(dosesPerDay({}), 1);
});

test('the cost report adds feed, medicines and exams, and the stall, the groom and the care visits, month by month', async () => {
  const H = '000000000000000000000001';
  const HAY = '0000000000000000000000a1';
  const BUTE = '0000000000000000000000b1';
  const now = new Date('2026-03-10T12:00:00');
  stub(Horse, [{ _id: H, name: 'TEST Cost', createdAt: new Date('2025-01-01') }]);
  // Two days in March (one ahead of "now"): 10 kg of hay a day at 500 000 đ a 25 kg bale = 20 000 đ/kg.
  stub(FeedingCalendarDay, [
    { horse: H, date: '2026-03-05', meals: [{ slot: 'morning', items: [{ inventoryItem: HAY, name: 'Cỏ khô', amount: 10, unit: 'kg' }] }] },
    { horse: H, date: '2026-03-20', meals: [{ slot: 'morning', items: [{ inventoryItem: HAY, name: 'Cỏ khô', amount: 10, unit: 'kg' }] }] },
  ]);
  stub(FeedingSchedule, []);
  stub(InventoryItem, [
    { _id: HAY, name: 'Cỏ khô', unit: 'kg', price: 500000, packUnit: 'bao', packSize: 25 },
    { _id: BUTE, name: 'Bute 1g', unit: 'viên', price: 15000 },
  ]);
  // Bute: 1 tablet twice a day for 3 days = 6 tablets; and one medicine with no stock link (no price).
  stub(Treatment, [
    {
      horse: H,
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-02-03'),
      status: 'completed',
      medications: [
        { name: 'Bute 1g', inventoryItem: BUTE, amount: 1, times: ['08:00', '20:00'], startDate: new Date('2026-02-01'), endDate: new Date('2026-02-03') },
        { name: 'Gel bôi', amount: 10, frequency: '1 lần/ngày', startDate: new Date('2026-02-01'), endDate: new Date('2026-02-01') },
      ],
    },
  ]);
  stub(HealthRecord, [{ horse: H, date: new Date('2026-02-01'), diagnosis: 'Viêm gân' }]);
  // In a standard stall with a groom since 1 March; a farrier visit in January.
  stub(StableAssignment, [{ horse: H, stall: { type: 'standard', code: 'A-01' }, assignedCaretaker: 'g1', createdAt: new Date('2026-03-01') }]);
  stub(CareEvent, [{ horse: H, kind: 'farrier', date: new Date('2026-01-15') }]);

  const r = await costReport({ horseIds: [H], year: 2026, now });
  const horse = r.horses[0];
  const rates = clubPolicy.costRates;
  assert.equal(horse.feed, 2 * 10 * 20000, 'both calendar days, at the price per kg');
  assert.equal(horse.months[2].feedAhead, 10 * 20000, 'the day after now is planned');
  assert.equal(horse.medical, 6 * 15000 + rates.exam, 'six tablets and the exam fee');
  assert.deepEqual(horse.missingPrices, ['Gel bôi']);
  const stallDays = 10; // 1–10 March
  assert.equal(horse.upkeep, stallDays * (rates.stallDay.standard + rates.groomDay) + rates.visit.farrier);
  assert.equal(horse.months[0].upkeep, rates.visit.farrier, 'the farrier visit in January');
  assert.equal(horse.total, horse.feed + horse.medical + horse.upkeep);
  assert.equal(r.totals.total, horse.total);
});
