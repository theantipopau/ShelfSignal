'use strict';

const { Pool } = require('pg');

let pool = null;

/**
 * Lazily create the pg pool. Allows tests to pass their own pool/connection.
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => {
      // Do not crash the process on idle-client errors; log and continue.
      console.error('Unexpected error on idle pg client:', err.message);
    });
  }
  return pool;
}

/** Override the module pool (used by tests). */
function setPool(customPool) {
  pool = customPool;
}

/**
 * Query helper. Normalises pg's result into a plain row array.
 * Uses PostgreSQL $1..$n placeholders (not `?`).
 */
async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result.rows;
}

async function connect() {
  const client = await getPool().connect();
  return client;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run `fn` inside a transaction. fn receives a client with `.query`.
 * Rolls back on error, commits on success.
 */
async function withTransaction(fn) {
  const client = await connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, connect, withTransaction, close, setPool, getPool };
