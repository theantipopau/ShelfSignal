'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');

const { config, validate } = require('./config');
const { authenticateToken } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const watchlistRoutes = require('./routes/watchlist');
const signalRoutes = require('./routes/signals');
const retailerRoutes = require('./routes/retailers');
const db = require('./config/database');

validate();

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Request ID for tracing (spec section 17).
app.use((req, res, next) => {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(morgan('tiny'));

app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: config.env });
});

app.get('/health/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not_ready', reason: 'database unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/retailers', retailerRoutes);

// Devices (FCM token registration) — foundation for the push pipeline.
app.post('/api/devices', authenticateToken, async (req, res, next) => {
  try {
    const { token, platform } = req.body || {};
    if (!token || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation_error', message: 'token and platform (ios|android) are required' },
      });
    }
    await db.query(
      `INSERT INTO device_tokens (user_id, platform, token) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET last_seen_at = NOW()`,
      [req.user.id, platform, token],
    );
    res.status(201).json({ success: true, data: { registered: true } });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/devices/:id', authenticateToken, async (req, res, next) => {
  try {
    await db.query('DELETE FROM device_tokens WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'not_found', message: 'Route not found' } });
});

app.use(errorHandler);

module.exports = app;
