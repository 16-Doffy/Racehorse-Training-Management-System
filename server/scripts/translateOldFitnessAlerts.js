// One-off migration: rewrites the `message` text of pre-existing fitness_alert notifications from
// the old raw English format ("Fitness threshold exceeded (heart rate 204.9 bpm, speed 81 km/h)
// during session <id>.") to the current Vietnamese format with the horse's real name, matching
// exactly what alertEvaluator.js now generates for new alerts. Only touches `message` — every
// other field (severity, isRead, createdAt, horse ref...) is left untouched.
//
// Usage: MONGO_URI=<target db> node server/scripts/translateOldFitnessAlerts.js
const mongoose = require('mongoose');
const { mongoUri } = require('../src/config/env');
const Notification = require('../src/models/Notification');
const Horse = require('../src/models/Horse');

const OLD_FORMAT = /^Fitness threshold exceeded \((.+)\) during session/;

function translateExceededPart(part) {
  return part
    .split(', ')
    .map((piece) => {
      const hr = piece.match(/^heart rate ([\d.]+) bpm$/);
      if (hr) return `nhịp tim ${hr[1]} bpm`;
      const sp = piece.match(/^speed ([\d.]+) km\/h$/);
      if (sp) return `tốc độ ${sp[1]} km/h`;
      return piece; // unrecognized shape — leave as-is rather than lose the value
    })
    .join(', ');
}

async function run() {
  await mongoose.connect(mongoUri);
  console.log(`[migrate] connected to ${mongoUri.replace(/\/\/.*@/, '//<redacted>@')}`);

  const candidates = await Notification.find({ type: 'fitness_alert', message: OLD_FORMAT }).populate(
    'horse',
    'name',
  );
  console.log(`[migrate] found ${candidates.length} old-format fitness_alert notifications`);

  let updated = 0;
  for (const n of candidates) {
    const match = n.message.match(OLD_FORMAT);
    if (!match) continue;
    const horseName = n.horse?.name || 'Ngựa';
    const newMessage = `${horseName} vượt ngưỡng thể lực (${translateExceededPart(match[1])}) trong buổi tập đang diễn ra.`;
    await Notification.updateOne({ _id: n._id }, { message: newMessage });
    updated += 1;
  }

  console.log(`[migrate] updated ${updated} notifications`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
