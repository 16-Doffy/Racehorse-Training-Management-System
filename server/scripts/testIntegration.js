const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
if (!process.env.TEST_MONGO_URI) {
  console.error('TEST_MONGO_URI is required: use an isolated local MongoDB replica set.');
  process.exit(1);
}
const dir = path.resolve(__dirname, '../test/integration');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.test.js')).map((name) => path.join(dir, name));
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
