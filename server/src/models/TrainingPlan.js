const mongoose = require('mongoose');
const clubPolicy = require('../config/clubPolicy');

const PHASES = ['base_building', 'strength', 'speed', 'peak', 'recovery'];
const INTENSITIES = ['light', 'moderate', 'high'];
const SURFACES = ['turf', 'dirt', 'synthetic', 'sand'];
const KINDS = ['walk', 'canter', 'hill', 'breeze', 'trial'];
const DAY_MS = 24 * 60 * 60 * 1000;

// One day of a phase's normal week. Days not listed are rest days.
const templateDaySchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday … 6 = Saturday
    // The main workout is in the morning; an afternoon slot is for light work (walk, easy canter).
    slot: { type: String, enum: ['morning', 'afternoon'], default: 'morning' },
    kind: { type: String, enum: KINDS, required: true },
    // Optional overrides of the kind's default workout (constants/training.js SESSION_KINDS).
    distanceM: { type: Number },
    reps: { type: Number },
    targetSpeedKmh: { type: Number },
    targetHeartRateMax: { type: Number },
  },
  { _id: false }
);

// One stage of the cycle: how many weeks, what it works on, and what a normal week looks like.
const phaseSchema = new mongoose.Schema(
  {
    key: { type: String, enum: PHASES, required: true },
    weeks: { type: Number, min: 1, max: 12, required: true },
    startDate: { type: Date }, // set from the plan's start and the phases before it
    endDate: { type: Date },
    distanceTarget: { type: Number }, // meters
    weeklyVolumeKm: { type: Number },
    intensity: { type: String, enum: INTENSITIES },
    surface: { type: String, enum: SURFACES },
    week: [templateDaySchema],
  },
  { _id: false }
);

/**
 * A training cycle for one horse, usually aimed at one race: base → strength → speed → peak, then
 * recovery after the race, each phase some weeks long with its own normal week of work.
 *
 * The flat fields (phase, distanceTarget, weeklyVolumeKm, intensity, surface) describe the phase
 * the horse is in now; they are kept up to date from `phases` so the screens that read them (the
 * owner's training page, the vet's lock dialog) need no change. A plan written before phases
 * existed has only those fields and reads as a single phase.
 */
const trainingPlanSchema = new mongoose.Schema(
  {
    horse: { type: mongoose.Schema.Types.ObjectId, ref: 'Horse', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    phase: { type: String, enum: PHASES, required: true },
    distanceTarget: { type: Number, required: true }, // meters
    // "Khối lượng" — weekly training volume/load.
    weeklyVolumeKm: { type: Number, required: true },
    intensity: { type: String, enum: INTENSITIES, default: 'moderate' },
    surface: { type: String, enum: SURFACES, required: true },
    goal: { type: String },
    targetRace: { type: mongoose.Schema.Types.ObjectId, ref: 'RaceEntry', default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    phases: [phaseSchema],
    // Time sessions are booked at when a week is generated: early morning, 1.5 h after breakfast.
    sessionTime: { type: String, default: () => clubPolicy.morningTime, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    afternoonTime: { type: String, default: () => clubPolicy.afternoonTime, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    notes: { type: String },
    status: { type: String, enum: ['draft', 'active', 'completed', 'cancelled'], default: 'draft' },
  },
  { timestamps: true }
);

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** The phase covering `at` (the first one before the plan starts, the last one after it ends). */
function currentPhaseIndex(phases, at = new Date()) {
  if (!phases.length) return -1;
  const i = phases.findIndex((p) => at >= p.startDate && at <= p.endDate);
  if (i >= 0) return i;
  return at < phases[0].startDate ? 0 : phases.length - 1;
}

/**
 * The plan's phases with their dates. A plan from before phases existed becomes one phase spanning
 * its own dates (4 weeks when it has no end date).
 */
function phasesOf(plan) {
  if (plan.phases?.length) return plan.phases.map((p) => (p.toObject ? p.toObject() : { ...p }));
  const start = startOfDay(plan.startDate || plan.createdAt || new Date());
  const weeks = plan.endDate ? Math.max(1, Math.ceil((new Date(plan.endDate) - start + 1) / (7 * DAY_MS))) : 4;
  return [
    {
      key: plan.phase,
      weeks,
      startDate: start,
      endDate: new Date(start.getTime() + weeks * 7 * DAY_MS - 1),
      distanceTarget: plan.distanceTarget,
      weeklyVolumeKm: plan.weeklyVolumeKm,
      intensity: plan.intensity,
      surface: plan.surface,
      week: [],
    },
  ];
}

// Lays the phases end to end from the start date, fills what a phase leaves blank from the plan,
// and mirrors the current phase into the flat fields.
trainingPlanSchema.pre('validate', function layOutPhases() {
  if (!this.phases?.length || !this.startDate) return;
  let cursor = startOfDay(this.startDate).getTime();
  for (const p of this.phases) {
    p.startDate = new Date(cursor);
    cursor += p.weeks * 7 * DAY_MS;
    p.endDate = new Date(cursor - 1);
    if (p.distanceTarget == null) p.distanceTarget = this.distanceTarget;
    if (!p.surface) p.surface = this.surface;
    if (!p.intensity) p.intensity = this.intensity || 'moderate';
  }
  this.endDate = this.phases[this.phases.length - 1].endDate;

  const now = this.phases[currentPhaseIndex(this.phases)];
  this.phase = now.key;
  if (now.distanceTarget != null) this.distanceTarget = now.distanceTarget;
  if (now.weeklyVolumeKm != null) this.weeklyVolumeKm = now.weeklyVolumeKm;
  this.intensity = now.intensity;
  if (now.surface) this.surface = now.surface;
});

const TrainingPlan = mongoose.model('TrainingPlan', trainingPlanSchema);
module.exports = TrainingPlan;
module.exports.phasesOf = phasesOf;
module.exports.currentPhaseIndex = currentPhaseIndex;
module.exports.SESSION_KIND_VALUES = KINDS;
