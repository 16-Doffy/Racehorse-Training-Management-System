const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { clientOrigins } = require('./config/env');
const { errorHandler, notFound } = require('./middlewares/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const horsesRoutes = require('./modules/horses/horses.routes');
const trainingRoutes = require('./modules/training/training.routes');
const healthRoutes = require('./modules/health/health.routes');
const stableRoutes = require('./modules/stable/stable.routes');
const feedingRoutes = require('./modules/feeding/feeding.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const raceRoutes = require('./modules/race/race.routes');
const financeRoutes = require('./modules/finance/finance.routes');
const notificationRoutes = require('./modules/alerts/notification.routes');
const auditRoutes = require('./modules/audit/audit.routes');

const app = express();

app.use(cors({ origin: clientOrigins, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/v1/health-check', (req, res) => res.json({ success: true, message: 'API is running.' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/horses', horsesRoutes);
app.use('/api/v1/training', trainingRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/stable', stableRoutes);
app.use('/api/v1/feeding', feedingRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/races', raceRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/audit-logs', auditRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
