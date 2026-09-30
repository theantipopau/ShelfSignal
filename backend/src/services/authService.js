'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { config } = require('../config');
const { AppError, UnauthorizedError, ValidationError, NotFoundError } = require('../utils/errorHandler');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Register with email + password. Uses CITEXT for case-insensitive uniqueness.
 */
async function register({ email, password, displayName }) {
  const normEmail = normaliseEmail(email);
  if (!EMAIL_RE.test(normEmail)) throw new ValidationError('A valid email is required');
  if (!password || password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  const existing = await db.query('SELECT id FROM users WHERE email = $1', [normEmail]);
  if (existing.length > 0) {
    throw new AppError('An account with this email already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, postcode, is_adult, created_at`,
    [normEmail, passwordHash, displayName || null],
  );
  return { user, token: signToken(user) };
}

async function login({ email, password }) {
  const normEmail = normaliseEmail(email);
  const [user] = await db.query(
    'SELECT id, email, display_name, password_hash, postcode, is_adult FROM users WHERE email = $1',
    [normEmail],
  );

  // Constant-shape failure: same error for unknown email and wrong password.
  if (!user) {
    // Still burn a hash comparison to avoid trivially timing user existence.
    await bcrypt.compare(password || '', '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await bcrypt.compare(password || '', user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  const safeUser = {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    postcode: user.postcode,
    is_adult: user.is_adult,
  };
  return { user: safeUser, token: signToken(safeUser) };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

async function getMe(userId) {
  const [user] = await db.query(
    'SELECT id, email, display_name, postcode, is_adult, created_at FROM users WHERE id = $1',
    [userId],
  );
  if (!user) throw new UnauthorizedError('User not found');
  return user;
}

async function updateMe(userId, { displayName, postcode, isAdult }) {
  const [user] = await db.query(
    `UPDATE users
     SET display_name = COALESCE($2, display_name),
         postcode = COALESCE($3, postcode),
         is_adult = COALESCE($4, is_adult),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, display_name, postcode, is_adult`,
    [userId, displayName || null, postcode || null, isAdult == null ? null : Boolean(isAdult)],
  );
  if (!user) throw new NotFoundError('User not found');
  return user;
}

/** GDPR/APP-style deletion: removes the user and cascades their data. */
async function deleteMe(userId) {
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
  return { deleted: true };
}

module.exports = {
  register,
  login,
  getMe,
  updateMe,
  deleteMe,
  signToken,
  normaliseEmail,
};
