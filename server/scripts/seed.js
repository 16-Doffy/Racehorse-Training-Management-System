/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { mongoUri } = require('../src/config/env');
const { ROLES } = require('../src/constants/roles');

const User = require('../src/models/User');
const Horse = require('../src/models/Horse');
const RaceEntry = require('../src/models/RaceEntry');
const InjuryMarker = require('../src/models/InjuryMarker');
const Treatment = require('../src/models/Treatment');
const ExamRequest = require('../src/models/ExamRequest');
const TrainingPlan = require('../src/models/TrainingPlan');
const TrainingSession = require('../src/models/TrainingSession');
const HealthRecord = require('../src/models/HealthRecord');
const StableAssignment = require('../src/models/StableAssignment');
const DailyTask = require('../src/models/DailyTask');
const FeedingSchedule = require('../src/models/FeedingSchedule');
const InventoryItem = require('../src/models/InventoryItem');
const Notification = require('../src/models/Notification');
const { syncCareTasks } = require('../src/modules/health/treatmentCare.service');
const { generatePlanWeek, mondayOf } = require('../src/modules/training/trainingPlan.service');
const { suggestPhases } = require('../src/constants/training');
const { INVENTORY_ITEMS } = require('./data/inventoryItems');

const DEMO_PASSWORD = '123456';

async function upsertUser({ name, email, role, phone }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return User.findOneAndUpdate(
    { email },
    { name, email, role, phone, passwordHash, isActive: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function run() {
  await mongoose.connect(mongoUri);
  console.log(`[seed] connected to ${mongoUri}`);

  // Remove legacy gmail test accounts if present
  await User.deleteMany({ email: { $in: ['nvy@gmail.com', 'nvhuan@gmail.com', 'nvsoc@gmail.com', 'nvchu@gmail.com'] } });

  const manager = await upsertUser({ name: 'Nguyen Van Quan Ly', email: 'manager@demo.com', role: ROLES.MANAGER, phone: '0900000001' });
  const trainer = await upsertUser({ name: 'Tran Huan Luyen', email: 'trainer@demo.com', role: ROLES.HEAD_TRAINER, phone: '0900000002' });
  const vet = await upsertUser({ name: 'Le Bac Si', email: 'vet@demo.com', role: ROLES.VETERINARIAN, phone: '0900000003' });
  const groom = await upsertUser({ name: 'Pham Cham Soc', email: 'groom@demo.com', role: ROLES.GROOM, phone: '0900000004' });
  const owner = await upsertUser({ name: 'Hoang Chu So Huu', email: 'owner@demo.com', role: ROLES.OWNER, phone: '0900000005' });
  const trainer2 = await upsertUser({ name: 'Vu Huan Luyen Hai', email: 'trainer2@demo.com', role: ROLES.HEAD_TRAINER, phone: '0900000006' });
  const vet2 = await upsertUser({ name: 'Do Bac Si Hai', email: 'vet2@demo.com', role: ROLES.VETERINARIAN, phone: '0900000007' });

  console.log('[seed] demo users ready (password for all: 123456):');
  [manager, trainer, vet, groom, owner, trainer2, vet2].forEach((u) => console.log(`  - ${u.role}: ${u.email}`));

  await TrainingPlan.deleteMany({});
  await TrainingSession.deleteMany({});
  await HealthRecord.deleteMany({});
  await StableAssignment.deleteMany({});
  await DailyTask.deleteMany({});
  await FeedingSchedule.deleteMany({});
  await InventoryItem.deleteMany({});
  await Notification.deleteMany({});
  // Everything that points at a horse goes too, or it is left referring to horses that no longer exist.
  await ExamRequest.deleteMany({});
  await Treatment.deleteMany({});
  await InjuryMarker.deleteMany({});
  await RaceEntry.deleteMany({});
  await Horse.deleteMany({});

  const horseNames = [
    { name: 'Thunder Bolt', breed: 'Thoroughbred', color: 'Bay', weightKg: 480 },
    { name: 'Silver Arrow', breed: 'Thoroughbred', color: 'Grey', weightKg: 465 },
    { name: 'Golden Wind', breed: 'Arabian', color: 'Chestnut', weightKg: 450 },
    { name: 'Midnight Star', breed: 'Thoroughbred', color: 'Black', weightKg: 470 },
  ];

  const horses = [];
  for (const h of horseNames) {
    // Midnight Star is assigned to trainer2 and vet2 for RBAC scope testing;
    // Golden Wind, Silver Arrow, and Thunder Bolt are assigned to trainer (Tran Huan Luyen) and vet (Le Bac Si).
    const isSecondStaff = h.name === 'Midnight Star';
    const horse = await Horse.create({
      ...h,
      dob: new Date('2021-03-15'),
      owner: owner._id,
      assignedTrainer: isSecondStaff ? trainer2._id : trainer._id,
      assignedVet: isSecondStaff ? vet2._id : vet._id,
      healthStatus: 'eligible',
      achievements: [{ race: 'Spring Derby 2025', result: '2nd', date: new Date('2025-04-10') }],
      careSchedule: {
        // First horse is deliberately overdue on vaccination so the care scheduler has something
        // to demo immediately after seeding; the rest are scheduled comfortably in the future.
        nextVaccinationDue: horses.length === 0 ? new Date(Date.now() - 2 * 86400000) : new Date(Date.now() + 30 * 86400000),
        nextDewormingDue: new Date(Date.now() + 45 * 86400000),
        nextFarrierDue: new Date(Date.now() + 20 * 86400000),
      },
    });
    horses.push(horse);

    // Seed assignment notifications so staff have unread alerts in their top-bar notification bell upon login
    await Notification.create([
      {
        recipientUser: horse.assignedTrainer,
        horse: horse._id,
        type: 'horse_assigned',
        severity: 'info',
        message: `🐎 Bạn được phân công huấn luyện ngựa "${horse.name}".`,
      },
      {
        recipientUser: horse.assignedVet,
        horse: horse._id,
        type: 'horse_assigned',
        severity: 'info',
        message: `🐎 Bạn được phân công theo dõi sức khỏe ngựa "${horse.name}".`,
      },
    ]);
  }

  await Promise.all(
    horses.map((h, i) =>
      StableAssignment.create({
        horse: h._id,
        stableBlock: `Block A - Stall ${i + 1}`,
        assignedCaretaker: groom._id,
      })
    )
  );

  // Thunder Bolt is ten weeks into a twelve-week cycle aimed at a race in about three weeks: the
  // phases are counted back from race day the way the plan form proposes them.
  const cycleStart = mondayOf(new Date(Date.now() - 9 * 7 * 86400000));
  const autumnCup = await RaceEntry.create({
    horse: horses[0]._id,
    registeredBy: trainer._id,
    raceName: 'Cúp Mùa Thu',
    raceDate: new Date(cycleStart.getTime() + 12 * 7 * 86400000 + 5 * 86400000), // Saturday of week 13
    distance: 1200,
    status: 'registered',
  });
  const plan = await TrainingPlan.create({
    horse: horses[0]._id,
    createdBy: trainer._id,
    phase: 'speed',
    distanceTarget: 1200,
    weeklyVolumeKm: 15,
    intensity: 'high',
    surface: 'dirt',
    startDate: cycleStart,
    phases: suggestPhases(cycleStart, autumnCup.raceDate).map((p) => ({ ...p, distanceTarget: 1200, surface: 'dirt' })),
    targetRace: autumnCup._id,
    status: 'active',
    goal: 'Đạt 1200m dưới 72 giây, sẵn sàng cho Cúp Mùa Thu.',
    notes: 'Tập trung tăng tốc ở 200m cuối.',
  });

  await TrainingSession.create([
    {
      trainingPlan: plan._id,
      horse: horses[0]._id,
      assignedTo: trainer._id,
      sessionType: 'training',
      objective: 'interval',
      intensity: 'high',
      prescription: { distanceM: 1200, reps: 3, restMinutes: 8, targetSpeedKmh: 62, targetHeartRateMax: 180, durationMinutes: 45 },
      coachNote: 'Giữ nhịp đều 2 hiệp đầu, bung sức hiệp cuối. Chú ý chân trước phải.',
      scheduledAt: new Date(),
      status: 'in_progress',
      metrics: { avgHeartRate: 120, maxHeartRate: 140, maxSpeed: 45, distance: 800 },
    },
    {
      trainingPlan: plan._id,
      horse: horses[0]._id,
      assignedTo: trainer._id,
      sessionType: 'trial_run',
      objective: 'race_simulation',
      intensity: 'high',
      prescription: { distanceM: 1200, targetSpeedKmh: 50, targetHeartRateMax: 175, durationMinutes: 30 },
      coachNote: 'Chạy thử lấy thành tích để chốt suất đăng ký giải.',
      scheduledAt: new Date(Date.now() - 86400000),
      status: 'completed',
      metrics: { avgHeartRate: 110, maxHeartRate: 150, maxSpeed: 52, distance: 1200 },
      trainerComment: 'Strong finish, good recovery time.',
      performanceRating: 8,
      outcome: { met: true, summary: 'Đạt mục tiêu — tốc độ 52/50 km/h, nhịp tim 110/175 bpm, cự ly 1200/1200 m.' },
    },
  ]);

  // A second, lighter plan covering the rest of the roster so the Head Trainer dashboard's
  // fitness chart has more than one horse's worth of data to plot.
  // Silver Arrow: a cycle without a race yet, one week into base work.
  const baseStart = mondayOf(new Date(Date.now() - 7 * 86400000));
  const basePlan = await TrainingPlan.create({
    horse: horses[1]._id,
    createdBy: trainer._id,
    phase: 'base_building',
    distanceTarget: 1600,
    weeklyVolumeKm: 14,
    intensity: 'moderate',
    surface: 'turf',
    startDate: baseStart,
    phases: suggestPhases(baseStart).map((p) => ({ ...p, distanceTarget: 1600, surface: 'turf' })),
    status: 'active',
    goal: 'Xây nền sức bền cho cự ly 1600m.',
  });

  await TrainingSession.create([
    {
      trainingPlan: basePlan._id,
      horse: horses[1]._id,
      assignedTo: trainer._id,
      sessionType: 'training',
      scheduledAt: new Date(Date.now() - 43200000),
      status: 'completed',
      metrics: { avgHeartRate: 128, maxHeartRate: 145, maxSpeed: 48, distance: 900 },
      trainerComment: 'Steady pace, on track for the base-building phase.',
      performanceRating: 7,
    },
    {
      trainingPlan: basePlan._id,
      horse: horses[2]._id,
      assignedTo: trainer._id,
      sessionType: 'training',
      scheduledAt: new Date(Date.now() - 21600000),
      status: 'completed',
      metrics: { avgHeartRate: 132, maxHeartRate: 158, maxSpeed: 55, distance: 1000 },
      trainerComment: 'Good acceleration, watch heart rate recovery next session.',
      performanceRating: 6,
    },
  ]);

  await HealthRecord.create({
    horse: horses[1]._id,
    examinedBy: vet._id,
    diagnosis: 'Routine check-up, no abnormalities found.',
    vitalSigns: { temperatureC: 37.8, heartRate: 36, respiratoryRate: 14 },
    resultStatus: 'eligible',
  });

  // Groom module: today's worklist (one task done, one with an incident), an overdue task from
  // yesterday, approved rations per meal, and area supplies with a few low-stock items.
  const at = (daysFromToday, hour, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const taskDocs = [];
  horses.forEach((h, i) => {
    taskDocs.push(
      { horse: h._id, assignedTo: groom._id, taskType: 'feeding', scheduledDate: at(0, 8), ...(i === 0 && { status: 'completed', completedAt: at(0, 6, 35) }) },
      { horse: h._id, assignedTo: groom._id, taskType: 'cleaning', scheduledDate: at(0, 8) }
    );
  });
  taskDocs.push(
    { horse: horses[0]._id, assignedTo: groom._id, taskType: 'icing', scheduledDate: at(0, 8) },
    { horse: horses[1]._id, assignedTo: groom._id, taskType: 'bathing', scheduledDate: at(0, 8) },
    { horse: horses[2]._id, assignedTo: groom._id, taskType: 'bathing', scheduledDate: at(-1, 8), status: 'completed', completedAt: at(-1, 15) },
    { horse: horses[3]._id, assignedTo: groom._id, taskType: 'icing', scheduledDate: at(-1, 8) }
  );
  const tasks = await DailyTask.create(taskDocs);

  const hoofIncidentTask = tasks.find((t) => String(t.horse) === String(horses[3]._id) && t.taskType === 'cleaning');
  hoofIncidentTask.incidentReport = {
    description: 'Móng bị xước. Móng trước bên trái có vết xước nhẹ, ngựa vẫn ăn uống bình thường',
    severity: 'low',
    images: [],
    reportedAt: at(0, 7, 10),
  };
  await hoofIncidentTask.save();

  // A vet's care order in progress: Golden Wind is on a short course of treatment, which shows up
  // as medication and monitoring tasks on the groom's list (source: vet).
  const tendonCheck = await HealthRecord.create({
    horse: horses[2]._id,
    examinedBy: vet._id,
    diagnosis: 'Gân chân trước hơi ấm sau buổi tập, chưa thấy tổn thương.',
    vitalSigns: { temperatureC: 38.0, heartRate: 40, respiratoryRate: 16 },
    resultStatus: 'eligible',
  });
  const course = await Treatment.create({
    healthRecord: tendonCheck._id,
    horse: horses[2]._id,
    prescribedBy: vet._id,
    medications: [{ name: 'Gel kháng viêm bôi ngoài', dosage: 'bôi chân trước', frequency: '2 lần/ngày' }],
    careInstructions: 'Dắt bộ 15 phút, theo dõi độ ấm của gân chân trước.',
    status: 'ongoing',
  });
  await syncCareTasks(course);

  const rations = {
    morning: [{ type: 'grain', quantity: '2.5kg' }, { type: 'hay', quantity: '3kg' }, { type: 'vitamin', quantity: '30g' }],
    noon: [{ type: 'hay', quantity: '4kg' }, { type: 'carrot', quantity: '0.5kg' }],
    evening: [{ type: 'grain', quantity: '2kg' }, { type: 'hay', quantity: '5kg' }, { type: 'electrolyte', quantity: '50g' }],
  };
  await FeedingSchedule.create(
    horses.flatMap((h, i) =>
      Object.entries(rations).map(([mealTime, items]) => ({
        horse: h._id,
        mealTime,
        // Clock times the daily-task generator uses to schedule one task per meal.
        timeOfDay: { morning: '06:00', noon: '11:30', evening: '17:30' }[mealTime],
        items,
        // Last horse's dinner is left unapproved so the "pending approval" state is visible.
        approvedBy: i === horses.length - 1 && mealTime === 'evening' ? undefined : trainer._id,
      }))
    )
  );

  // The club's stock list (scripts/data/inventoryItems.js), with a few items left low or out on
  // purpose so the warnings and the restock flow show on a fresh seed.
  const demoStock = {
    'Cỏ khô Timothy (Timothy Hay)': 30, 'Bột điện giải (Electrolyte Powder)': 300, 'Vitamin tổng hợp (Multivitamin)': 900,
    'Kháng sinh Penicillin tiêm': 0, 'Gel kháng viêm bôi ngoài': 60, 'Băng cuốn thú y (Vet Wrap)': 5,
  };
  for (const entry of INVENTORY_ITEMS) {
    // One at a time so each item gets the next code of its category (TA-001, YT-001, DC-001…).
    await InventoryItem.create({ ...entry, quantity: demoStock[entry.name] ?? entry.quantity, stableBlock: entry.category === 'feed' ? 'Block A' : undefined });
  }
  await InventoryItem.updateOne(
    { name: 'Cỏ khô Timothy (Timothy Hay)' },
    { $push: { restockRequests: { requestedBy: groom._id, quantity: 40, status: 'pending', requestedAt: at(0, 7, 30), note: 'Cỏ Timothy sắp hết' } } }
  );

  // Rations and the vet's course draw on that stock: oats and hay in kg, electrolytes and vitamins in
  // grams, the gel in ml — feeding the horse or giving a dose takes it out of stock. Carrots stay as
  // plain text, like rations written before the link existed.
  const stockByName = Object.fromEntries((await InventoryItem.find()).map((i) => [i.name, i]));
  const linkFor = {
    grain: (q) => ({ item: stockByName['Yến mạch (Oats)'], amount: parseFloat(q) }),
    hay: (q) => ({ item: stockByName['Cỏ khô Timothy (Timothy Hay)'], amount: parseFloat(q) }),
    electrolyte: (q) => ({ item: stockByName['Bột điện giải (Electrolyte Powder)'], amount: parseFloat(q) }),
    vitamin: (q) => ({ item: stockByName['Vitamin tổng hợp (Multivitamin)'], amount: parseFloat(q) }),
  };
  for (const ration of await FeedingSchedule.find()) {
    ration.items = ration.items.map((it) => {
      const link = linkFor[it.type]?.(it.quantity);
      if (!link?.item) return it;
      return { type: link.item.name, quantity: `${link.amount} ${link.item.unit}`, inventoryItem: link.item._id, amount: link.amount, unit: link.item.unit };
    });
    await ration.save();
  }
  // Golden Wind's course: the gel twice a day, and only light work while it recovers.
  course.medications = [{ name: 'Gel kháng viêm bôi ngoài', dosage: '5 ml bôi chân trước', frequency: '2 lần/ngày', inventoryItem: stockByName['Gel kháng viêm bôi ngoài']._id, amount: 5, times: ['08:00', '18:00'] }];
  course.trainingLevel = 'light';
  await course.save();
  await DailyTask.deleteMany({ treatment: course._id, status: 'pending' });
  await syncCareTasks(course);

  // This week's sessions from both cycles, as the trainer's "Sinh lịch tuần" button would book them.
  let generated = 0;
  for (const p of [plan, basePlan]) {
    await p.populate([{ path: 'horse', select: 'name' }, { path: 'targetRace', select: 'raceName raceDate distance status' }]);
    const week = await generatePlanWeek({ plan: p, weekStart: new Date(), actor: trainer, notify: false });
    generated += week.created?.length || 0;
  }

  console.log(`[seed] created ${horses.length} horses, 2 training plans, ${4 + generated} sessions, 1 health record.`);
  console.log(`[seed] groom data: ${tasks.length} daily tasks, ${horses.length * 3} feeding schedules, ${INVENTORY_ITEMS.length} inventory items.`);
  console.log('[seed] done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
