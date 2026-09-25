/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { mongoUri } = require('../src/config/env');
const { ROLES } = require('../src/constants/roles');

const User = require('../src/models/User');
const Horse = require('../src/models/Horse');
const TrainingPlan = require('../src/models/TrainingPlan');
const TrainingSession = require('../src/models/TrainingSession');
const HealthRecord = require('../src/models/HealthRecord');
const StableAssignment = require('../src/models/StableAssignment');
const DailyTask = require('../src/models/DailyTask');
const FeedingSchedule = require('../src/models/FeedingSchedule');
const InventoryItem = require('../src/models/InventoryItem');

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

  const manager = await upsertUser({ name: 'Nguyen Van Quan Ly', email: 'manager@demo.com', role: ROLES.MANAGER, phone: '0900000001' });
  const trainer = await upsertUser({ name: 'Tran Huan Luyen', email: 'nvhuan@gmail.com', role: ROLES.HEAD_TRAINER, phone: '0900000002' });
  const vet = await upsertUser({ name: 'Le Bac Si', email: 'nvy@gmail.com', role: ROLES.VETERINARIAN, phone: '0900000003' });
  const groom = await upsertUser({ name: 'Pham Cham Soc', email: 'nvsoc@gmail.com', role: ROLES.GROOM, phone: '0900000004' });
  const owner = await upsertUser({ name: 'Hoang Chu So Huu', email: 'nvchu@gmail.com', role: ROLES.OWNER, phone: '0900000005' });

  // Legacy demo email aliases
  const trainerAlias = await upsertUser({ name: 'Tran Huan Luyen', email: 'trainer@demo.com', role: ROLES.HEAD_TRAINER, phone: '0900000002' });
  const vetAlias = await upsertUser({ name: 'Le Bac Si', email: 'vet@demo.com', role: ROLES.VETERINARIAN, phone: '0900000003' });
  const groomAlias = await upsertUser({ name: 'Pham Cham Soc', email: 'groom@demo.com', role: ROLES.GROOM, phone: '0900000004' });
  const ownerAlias = await upsertUser({ name: 'Hoang Chu So Huu', email: 'owner@demo.com', role: ROLES.OWNER, phone: '0900000005' });

  // Second trainer/vet so assignedTrainer/assignedVet scoping (horseScope.js) is actually
  // exercised locally — with only one of each, every horse trivially "belongs" to them.
  const trainer2 = await upsertUser({ name: 'Vu Huan Luyen Hai', email: 'trainer2@demo.com', role: ROLES.HEAD_TRAINER, phone: '0900000006' });
  const vet2 = await upsertUser({ name: 'Do Bac Si Hai', email: 'vet2@demo.com', role: ROLES.VETERINARIAN, phone: '0900000007' });

  console.log('[seed] demo users ready (password for all: 123456):');
  [manager, trainer, vet, groom, owner, trainerAlias, vetAlias, groomAlias, ownerAlias, trainer2, vet2].forEach((u) => console.log(`  - ${u.role}: ${u.email}`));

  await TrainingPlan.deleteMany({});
  await TrainingSession.deleteMany({});
  await HealthRecord.deleteMany({});
  await StableAssignment.deleteMany({});
  await DailyTask.deleteMany({});
  await FeedingSchedule.deleteMany({});
  await InventoryItem.deleteMany({});
  await Horse.deleteMany({});

  const horseNames = [
    { name: 'Thunder Bolt', breed: 'Thoroughbred', color: 'Bay', weightKg: 480 },
    { name: 'Silver Arrow', breed: 'Thoroughbred', color: 'Grey', weightKg: 465 },
    { name: 'Golden Wind', breed: 'Arabian', color: 'Chestnut', weightKg: 450 },
    { name: 'Midnight Star', breed: 'Thoroughbred', color: 'Black', weightKg: 470 },
  ];

  const horses = [];
  for (const h of horseNames) {
    const idx = horses.length;
    // Assign horses across demo accounts so both nvy@gmail.com and vet@demo.com see assigned horses
    const assignedVetUser = idx === 0 || idx === 1 ? vet._id : idx === 2 ? vetAlias._id : vet2._id;
    const assignedTrainerUser = idx === 0 || idx === 1 ? trainer._id : idx === 2 ? trainerAlias._id : trainer2._id;
    const assignedOwnerUser = idx === 0 || idx === 1 ? owner._id : idx === 2 ? ownerAlias._id : owner._id;

    const horse = await Horse.create({
      ...h,
      dob: new Date('2021-03-15'),
      owner: assignedOwnerUser,
      assignedTrainer: assignedTrainerUser,
      assignedVet: assignedVetUser,
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

  const plan = await TrainingPlan.create({
    horse: horses[0]._id,
    createdBy: trainer._id,
    phase: 'speed',
    distanceTarget: 1200,
    weeklyVolumeKm: 28,
    intensity: 'high',
    surface: 'dirt',
    startDate: new Date(),
    status: 'active',
    notes: 'Focus on final-furlong acceleration ahead of the Spring Derby.',
  });

  await TrainingSession.create([
    {
      trainingPlan: plan._id,
      horse: horses[0]._id,
      assignedTo: trainer._id,
      sessionType: 'training',
      scheduledAt: new Date(),
      status: 'in_progress',
      metrics: { avgHeartRate: 120, maxHeartRate: 140, maxSpeed: 45, distance: 800 },
    },
    {
      trainingPlan: plan._id,
      horse: horses[0]._id,
      assignedTo: trainer._id,
      sessionType: 'trial_run',
      scheduledAt: new Date(Date.now() - 86400000),
      status: 'completed',
      metrics: { avgHeartRate: 110, maxHeartRate: 150, maxSpeed: 52, distance: 1200 },
      trainerComment: 'Strong finish, good recovery time.',
      performanceRating: 8,
    },
  ]);

  // A second, lighter plan covering the rest of the roster so the Head Trainer dashboard's
  // fitness chart has more than one horse's worth of data to plot.
  const basePlan = await TrainingPlan.create({
    horse: horses[1]._id,
    createdBy: trainer._id,
    phase: 'base_building',
    distanceTarget: 800,
    weeklyVolumeKm: 18,
    intensity: 'moderate',
    surface: 'turf',
    startDate: new Date(),
    status: 'active',
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
        items,
        // Last horse's dinner is left unapproved so the "pending approval" state is visible.
        approvedBy: i === horses.length - 1 && mealTime === 'evening' ? undefined : trainer._id,
      }))
    )
  );

  await InventoryItem.create([
    { name: 'Yến mạch cao cấp', category: 'feed', quantity: 120, unit: 'kg', stableBlock: 'Block A' },
    {
      name: 'Cỏ khô Timothy',
      category: 'feed',
      quantity: 8,
      unit: 'bó',
      stableBlock: 'Block A',
      restockRequests: [{ requestedBy: groom._id, quantity: 30, status: 'pending', requestedAt: at(0, 7, 30) }],
    },
    { name: 'Muối điện giải', category: 'feed', quantity: 0, unit: 'gói', stableBlock: 'Block A' },
    { name: 'Vitamin tổng hợp', category: 'medicine', quantity: 6, unit: 'hộp', stableBlock: 'Block A' },
    { name: 'Dung dịch sát trùng Povidine', category: 'medicine', quantity: 15, unit: 'chai' },
    {
      name: 'Túi chườm đá',
      category: 'equipment',
      quantity: 24,
      unit: 'cái',
      stableBlock: 'Block A',
      restockRequests: [{ requestedBy: groom._id, quantity: 12, status: 'approved', requestedAt: at(-3, 9) }],
    },
    { name: 'Băng quấn chân', category: 'equipment', quantity: 9, unit: 'cuộn', stableBlock: 'Block A' },
    { name: 'Bàn chải tắm ngựa', category: 'equipment', quantity: 12, unit: 'cái', stableBlock: 'Block B' },
  ]);

  console.log(`[seed] created ${horses.length} horses, 2 training plans, 4 sessions, 1 health record.`);
  console.log(`[seed] groom data: ${tasks.length} daily tasks, ${horses.length * 3} feeding schedules, 8 inventory items.`);
  console.log('[seed] done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
