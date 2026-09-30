'use strict';

/**
 * Minimal, dependency-free migration runner.
 * Applies pending migrations in filename order inside a transaction and
 * records them in the `schema_migrations` table.
 *
 * Usage: node src/migrations/run.js
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const MIGRATIONS_DIR = __dirname;

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listApplied() {
  const rows = await db.query('SELECT name FROM schema_migrations ORDER BY name');
  return new Set(rows.map((r) => r.name));
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.js$/.test(f))
    .sort();
}

async function runMigrations({ log = console.log } = {}) {
  await ensureMigrationsTable();
  const applied = await listApplied();
  const files = listMigrationFiles();

  for (const file of files) {
    if (applied.has(file)) {
      log(`= ${file} (already applied)`);
      continue;
    }
    const migration = require(path.join(MIGRATIONS_DIR, file));
    log(`Applying ${file}...`);
    // 001 does not have CITEXT; install extension first via raw pool if needed.
    await db.query('CREATE EXTENSION IF NOT EXISTS citext').catch(() => {});
    await db.withTransaction(async (client) => {
      await migration.up(client);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    log(`Applied ${file}`);
  }
  log('Migrations up to date.');
}

async function runSeeds({ log = console.log } = {}) {
  const seedFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^seed_.*\.js$/.test(f))
    .sort();

  for (const file of seedFiles) {
    const seed = require(path.join(MIGRATIONS_DIR, file));
    log(`Seeding ${file}...`);
    await seed.up();
    log(`Seeded ${file}`);
  }
}

if (require.main === module) {
  const arg = process.argv[2] || 'up';
  runMigrations()
    .then(() => {
      if (arg === 'seed') return runSeeds();
    })
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { runMigrations, runSeeds };
