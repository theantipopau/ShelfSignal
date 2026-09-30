'use strict';

require('dotenv').config();
const app = require('./app');
const { config } = require('./config');

if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`ShelfSignal API listening on port ${config.port} (${config.env})`);
  });

  const shutdown = async () => {
    server.close(async () => {
      const db = require('./config/database');
      await db.close();
      process.exit(0);
    });
    // Force-exit safety net.
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
