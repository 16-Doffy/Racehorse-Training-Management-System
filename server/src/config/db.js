const mongoose = require('mongoose');
const { mongoUri } = require('./env');

async function connectDB() {
  try {
    await mongoose.connect(mongoUri);
    console.log(`[db] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
