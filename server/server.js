const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { port, enableSensorSimulator } = require('./src/config/env');
const { initSocket } = require('./src/realtime/socketServer');
const { startSensorSimulator } = require('./src/realtime/sensorSimulator');

async function start() {
  await connectDB();

  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
    if (enableSensorSimulator) {
      startSensorSimulator();
    } else {
      console.log('[simulator] disabled (set ENABLE_SENSOR_SIMULATOR=true to enable)');
    }
  });
}

start();
