'use strict';

/**
 * Promote (or demote with --revoke) a user to administrator.
 * Usage: npm run make-admin -- someone@example.com [--revoke]
 * Requires DATABASE_URL, like the migration runner.
 */

require('dotenv').config();
const db = require('../src/config/database');

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');
  if (!email || email.startsWith('--')) {
    console.error('Usage: npm run make-admin -- <email> [--revoke]');
    process.exit(2);
  }
  const rows = await db.query('UPDATE users SET role = $2 WHERE email = $1 RETURNING email, role', [
    email,
    revoke ? 'user' : 'admin',
  ]);
  if (!rows.length) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }
  console.log(`${rows[0].email} is now ${rows[0].role}`);
  await db.close?.();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
