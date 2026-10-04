'use strict';

const crypto = require('crypto');
const db = require('../config/database');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errorHandler');

const MAX_MEMBERS_PER_HOUSEHOLD = 8;
const INVITE_TTL_HOURS = 168; // 7 days

/**
 * Households (Master Prompt section 9.9): creation, secure invites,
 * owner/member roles, membership removal, and the shared watchlist.
 *
 * Privacy rule: private items stay private unless explicitly shared.
 * The shared watchlist only exposes items whose owner explicitly set
 * visibility = 'shared' inside a household the caller belongs to.
 */

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Membership row for this user in this household, or null. */
async function getMembership(userId, householdId) {
  const [row] = await db.query(
    'SELECT * FROM household_members WHERE household_id = $1 AND user_id = $2',
    [householdId, userId],
  );
  return row || null;
}

/** Membership row or throw 404 — used so foreign household IDs are indistinguishable. */
async function requireMembership(userId, householdId) {
  const membership = await getMembership(userId, householdId);
  if (!membership) throw new NotFoundError('Household not found');
  return membership;
}

async function requireOwner(userId, householdId) {
  const membership = await requireMembership(userId, householdId);
  if (membership.role !== 'owner') {
    throw new ForbiddenError('Only the household owner can do that');
  }
  return membership;
}

/** Create a household and enrol the creator as owner (atomic). */
async function createHousehold(userId, { name }) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new ValidationError('name is required');
  if (trimmed.length > 128) throw new ValidationError('name must be 128 characters or fewer');

  const existing = await db.query('SELECT id FROM household_members WHERE user_id = $1', [userId]);
  if (existing.length >= 1) {
    throw new ValidationError('You already belong to a household — leave it before creating another');
  }

  return db.withTransaction(async (client) => {
    // client.query is the raw pg client — it returns a result object,
    // not a rows array (unlike db.query). Destructure `.rows`.
    const [household] = (await client.query(
      'INSERT INTO households (name, owner_user_id) VALUES ($1, $2) RETURNING *',
      [trimmed, userId],
    )).rows;
    await client.query(
      `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [household.id, userId],
    );
    return household;
  });
}

/** Households the caller belongs to, with their own role and member count. */
async function listHouseholds(userId) {
  return db.query(
    `SELECT h.id, h.name, h.owner_user_id, h.created_at,
            hm.role,
            (SELECT COUNT(*) FROM household_members m WHERE m.household_id = h.id) AS member_count,
            (SELECT COUNT(*) FROM watch_items w
               WHERE w.owner_user_id = h.owner_user_id AND w.visibility = 'shared') AS shared_item_count
     FROM households h
     JOIN household_members hm ON hm.household_id = h.id AND hm.user_id = $1
     ORDER BY h.created_at DESC`,
    [userId],
  );
}

async function getHousehold(userId, householdId) {
  const membership = await requireMembership(userId, householdId);
  const [household] = await db.query(
    `SELECT h.id, h.name, h.owner_user_id, h.created_at, h.updated_at
     FROM households h WHERE h.id = $1`,
    [householdId],
  );
  if (!household) throw new NotFoundError('Household not found');

  const members = await db.query(
    `SELECT hm.user_id, hm.role, hm.joined_at, u.email, u.display_name
     FROM household_members hm
     JOIN users u ON u.id = hm.user_id
     WHERE hm.household_id = $1
     ORDER BY CASE hm.role WHEN 'owner' THEN 0 ELSE 1 END, hm.joined_at`,
    [householdId],
  );

  const invites = membership.role === 'owner' ? await listInvites(householdId) : [];

  return { ...household, role: membership.role, members, invites };
}

/** Create an invite. The raw token is returned exactly once (never stored). */
async function createInvite(userId, householdId, { email = null, expiresInHours = INVITE_TTL_HOURS } = {}) {
  await requireOwner(userId, householdId);

  const [counts] = await db.query(
    'SELECT COUNT(*) AS n FROM household_members WHERE household_id = $1',
    [householdId],
  );
  if (Number(counts.n) >= MAX_MEMBERS_PER_HOUSEHOLD) {
    throw new ValidationError(`Households are capped at ${MAX_MEMBERS_PER_HOUSEHOLD} members`);
  }

  const pending = await db.query(
    `SELECT COUNT(*) AS n FROM household_invites
     WHERE household_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`,
    [householdId],
  );
  if (Number(pending.n) >= 5) {
    throw new ValidationError('Too many pending invites — revoke one first');
  }

  const token = crypto.randomBytes(24).toString('base64url');
  const ttl = Math.max(1, Math.min(720, Number(expiresInHours) || INVITE_TTL_HOURS));
  const expiresAt = new Date(Date.now() + ttl * 3600 * 1000).toISOString();

  const [invite] = await db.query(
    `INSERT INTO household_invites (household_id, token_hash, invited_by, invitee_email, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, household_id, invitee_email, role, expires_at, created_at`,
    [householdId, hashToken(token), userId, email, expiresAt],
  );

  return { ...invite, token };
}

/** Pending invites for a household (owner only) — never exposes token hashes. */
async function listInvites(householdId) {
  return db.query(
    `SELECT i.id, i.household_id, i.invitee_email, i.role, i.expires_at, i.created_at,
            u.email AS invited_by_email
     FROM household_invites i
     JOIN users u ON u.id = i.invited_by
     WHERE i.household_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
       AND i.expires_at > NOW()
     ORDER BY i.created_at DESC`,
    [householdId],
  );
}

async function revokeInvite(userId, householdId, inviteId) {
  await requireOwner(userId, householdId);
  const result = await db.query(
    `UPDATE household_invites SET revoked_at = NOW()
     WHERE id = $1 AND household_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
     RETURNING id`,
    [inviteId, householdId],
  );
  if (!result.length) throw new NotFoundError('Invite not found');
  return { revoked: true };
}

/**
 * Accept an invite. Idempotent: if the user is already a member the invite is
 * marked accepted and the existing membership is returned.
 */
async function acceptInvite(userId, token) {
  if (!token || typeof token !== 'string') throw new ValidationError('token is required');

  const [invite] = await db.query(
    `SELECT * FROM household_invites WHERE token_hash = $1`,
    [hashToken(token)],
  );
  if (!invite) throw new NotFoundError('Invite not found');
  if (invite.revoked_at) throw new ValidationError('Invite was revoked');
  if (invite.accepted_at) throw new ValidationError('Invite was already used');
  if (new Date(invite.expires_at).getTime() < Date.now()) throw new ValidationError('Invite expired');

  const existing = await getMembership(userId, invite.household_id);
  if (existing) {
    await db.query('UPDATE household_invites SET accepted_at = NOW() WHERE id = $1', [invite.id]);
    return { household_id: invite.household_id, role: existing.role, already_member: true };
  }

  const [counts] = await db.query(
    'SELECT COUNT(*) AS n FROM household_members WHERE household_id = $1',
    [invite.household_id],
  );
  if (Number(counts.n) >= MAX_MEMBERS_PER_HOUSEHOLD) {
    throw new ValidationError(`Households are capped at ${MAX_MEMBERS_PER_HOUSEHOLD} members`);
  }

  const membership = await db.withTransaction(async (client) => {
    // Raw client query → result object; destructure `.rows` (see productService).
    const [row] = (await client.query(
      `INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, $3) RETURNING *`,
      [invite.household_id, userId, invite.role || 'member'],
    )).rows;
    await client.query('UPDATE household_invites SET accepted_at = NOW() WHERE id = $1', [invite.id]);
    return row;
  });

  return { household_id: membership.household_id, role: membership.role, already_member: false };
}

/** Owner removes a member (never the owner themselves). Members may leave. */
async function removeMember(userId, householdId, targetUserId) {
  const membership = await requireMembership(userId, householdId);
  const [household] = await db.query('SELECT owner_user_id FROM households WHERE id = $1', [householdId]);
  if (!household) throw new NotFoundError('Household not found');

  const self = targetUserId === userId;
  if (!self && membership.role !== 'owner') {
    throw new ForbiddenError('Only the household owner can remove members');
  }
  if (targetUserId === household.owner_user_id) {
    throw new ForbiddenError('The owner cannot be removed — transfer ownership first');
  }

  const result = await db.query(
    'DELETE FROM household_members WHERE household_id = $1 AND user_id = $2 RETURNING user_id',
    [householdId, targetUserId],
  );
  if (!result.length) throw new NotFoundError('Member not found in this household');
  return { removed: true, user_id: targetUserId };
}

/**
 * Transfer ownership to another member (spec 9.9 "ownership transfer").
 * The caller must be the current owner and the target must already be a
 * member. Both role flips and the household's owner_user_id move inside one
 * transaction, so the household never has zero owners or two owners.
 */
async function transferOwnership(userId, householdId, targetUserId) {
  await requireOwner(userId, householdId);
  if (!targetUserId || typeof targetUserId !== 'string') {
    throw new ValidationError('userId of the new owner is required');
  }
  if (targetUserId === userId) {
    throw new ValidationError('You already own this household');
  }

  return db.withTransaction(async (client) => {
    // Raw client query → result object; destructure `.rows` (see productService).
    const [target] = (await client.query(
      'SELECT user_id FROM household_members WHERE household_id = $1 AND user_id = $2',
      [householdId, targetUserId],
    )).rows;
    if (!target) throw new ValidationError('That user is not a member of this household');

    await client.query(
      `UPDATE household_members SET role = 'member' WHERE household_id = $1 AND user_id = $2`,
      [householdId, userId],
    );
    await client.query(
      `UPDATE household_members SET role = 'owner' WHERE household_id = $1 AND user_id = $2`,
      [householdId, targetUserId],
    );
    const [household] = (await client.query(
      'UPDATE households SET owner_user_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, owner_user_id, updated_at',
      [targetUserId, householdId],
    )).rows;
    return { ...household, previous_owner_user_id: userId };
  });
}

/**
 * Shared watchlist (spec 9.9): items owned by household members that the owner
 * explicitly marked shared. Private items are never returned here.
 */
async function listSharedItems(userId) {
  const membership = await requireMembershipOfAny(userId);
  if (!membership) return [];

  return db.query(
    `SELECT w.id, w.product_id, w.visibility, w.status, w.snoozed_until, w.created_at,
            w.owner_user_id, u.display_name AS owner_name,
            p.canonical_name, p.brand, p.variant, p.category, p.unit, p.net_quantity,
            p.pack_count, p.verification_status,
            (SELECT pb.barcode FROM product_barcodes pb WHERE pb.product_id = p.id LIMIT 1) AS barcode,
            (SELECT po.observed_price
               FROM price_observations po
               JOIN retailer_products rp ON rp.id = po.retailer_product_id
               WHERE rp.product_id = w.product_id AND po.availability_status = 'available'
               ORDER BY po.observed_at DESC LIMIT 1) AS current_price
     FROM watch_items w
     JOIN users u ON u.id = w.owner_user_id
     JOIN products p ON p.id = w.product_id
     WHERE w.visibility = 'shared'
       AND w.owner_user_id IN (
         SELECT m.user_id FROM household_members m
         WHERE m.household_id = $1
       )
       AND w.owner_user_id <> $2
     ORDER BY w.created_at DESC`,
    [membership.household_id, userId],
  );
}

/** Any household this user belongs to (a user may only be in one). */
async function requireMembershipOfAny(userId) {
  const [row] = await db.query(
    'SELECT household_id, role FROM household_members WHERE user_id = $1 LIMIT 1',
    [userId],
  );
  return row || null;
}

module.exports = {
  MAX_MEMBERS_PER_HOUSEHOLD,
  hashToken,
  getMembership,
  requireMembership,
  createHousehold,
  listHouseholds,
  getHousehold,
  createInvite,
  listInvites,
  revokeInvite,
  acceptInvite,
  removeMember,
  transferOwnership,
  listSharedItems,
  requireMembershipOfAny,
};
