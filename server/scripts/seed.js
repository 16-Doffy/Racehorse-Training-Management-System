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
  const trainer = await upsertUser({ name: 'Tran Huan Luyen', email: 'trainer@demo.com', role: ROLES.HEAD_TRAINER, phone: '0900000002' });
  const vet = await upsertUser({ name: 'Le Bac Si', email: 'vet@demo.com', role: ROLES.VETERINARIAN, phone: '0900000003' });
  const groom = await upsertUser({ name: 'Pham Cham Soc', email: 'groom@demo.com', role: ROLES.GROOM, phone: '0900000004' });
  const owner = await upsertUser({ name: 'Hoang Chu So Huu', email: 'owner@demo.com', role: ROLES.OWNER, phone: '0900000005' });

  console.log('[seed] demo users ready (password for all: 123456):');
  [manager, trainer, vet, groom, owner].forEach((u) => console.log(`  - ${u.role}: ${u.email}`));

  await TrainingPlan.deleteMany({});
  await TrainingSession.deleteMany({});
  await HealthRecord.deleteMany({});
  await StableAssignment.deleteMany({});
  await Horse.deleteMany({});

  const horseNames = [
    { name: 'Thunder Bolt', breed: 'Thoroughbred', color: 'Bay', weightKg: 480 },
    { name: 'Silver Arrow', breed: 'Thoroughbred', color: 'Grey', weightKg: 465 },
    { name: 'Golden Wind', breed: 'Arabian', color: 'Chestnut', weightKg: 450 },
    { name: 'Midnight Star', breed: 'Thoroughbred', color: 'Black', weightKg: 470 },
  ];

  const horses = [];
  for (const h of horseNames) {
    const horse = await Horse.create({
      ...h,
      dob: new Date('2021-03-15'),
      owner: owner._id,
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

  owner.ownedHorses = horses.map((h) => h._id);
  await owner.save();

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

  console.log(`[seed] created ${horses.length} horses, 2 training plans, 4 sessions, 1 health record.`);
  console.log('[seed] done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
