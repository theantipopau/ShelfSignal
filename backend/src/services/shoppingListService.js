'use strict';

const db = require('../config/database');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errorHandler');

/**
 * Shopping list (spec 9.10) — a supporting feature. Items belong to one user;
 * `shared: true` attaches the owner's household so every member can see and
 * complete them. Everything else stays private to the owner.
 */

async function householdIdFor(userId) {
  const [row] = await db.query('SELECT household_id FROM household_members WHERE user_id = $1 LIMIT 1', [userId]);
  return row ? row.household_id : null;
}

const COLUMNS = `s.id, s.owner_user_id, s.household_id, s.product_id, s.title, s.quantity,
  s.retailer_slug, s.note, s.status, s.completed_by, s.completed_at, s.created_at`;

/** Visible = my own items + items shared with a household I belong to. */
async function list(userId, { status } = {}) {
  const householdId = await householdIdFor(userId);
  const params = [userId];
  let visible = 's.owner_user_id = $1';
  if (householdId) {
    params.push(householdId);
    visible = `(s.owner_user_id = $1 OR s.household_id = $${params.length})`;
  }
  let statusClause = '';
  if (status === 'done' || status === 'open') {
    params.push(status);
    statusClause = ` AND s.status = $${params.length}`;
  }
  return db.query(
    `SELECT ${COLUMNS},
            (SELECT pb.barcode FROM product_barcodes pb WHERE pb.product_id = s.product_id LIMIT 1) AS barcode
     FROM shopping_list_items s
     WHERE ${visible}${statusClause}
     ORDER BY s.retailer_slug, s.created_at DESC`,
    params,
  );
}

async function create(userId, { productId, title, quantity, retailerSlug, note, shared } = {}) {
  let resolvedTitle = typeof title === 'string' ? title.trim() : '';
  let resolvedProduct = null;
  if (productId) {
    const [p] = await db.query('SELECT id, canonical_name, brand, variant FROM products WHERE id = $1', [productId]);
    if (!p) throw new NotFoundError('Product not found');
    resolvedProduct = p.id;
    if (!resolvedTitle) resolvedTitle = [p.brand, p.canonical_name, p.variant].filter(Boolean).join(' ');
  }
  if (!resolvedTitle) throw new ValidationError('title or productId is required');
  if (resolvedTitle.length > 200) throw new ValidationError('title must be 200 characters or fewer');

  const qty = quantity == null ? 1 : Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new ValidationError('quantity must be a whole number from 1 to 99');
  if (note && String(note).length > 500) throw new ValidationError('note must be 500 characters or fewer');

  let householdId = null;
  if (shared) {
    householdId = await householdIdFor(userId);
    if (!householdId) throw new ValidationError('Join or create a household to share list items');
  }

  const [row] = await db.query(
    `INSERT INTO shopping_list_items (owner_user_id, household_id, product_id, title, quantity, retailer_slug, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, owner_user_id, household_id, product_id, title, quantity, retailer_slug, note, status, created_at`,
    [userId, householdId, resolvedProduct, resolvedTitle, qty, retailerSlug || null, note || null],
  );
  return row;
}

async function loadVisible(userId, id) {
  const householdId = await householdIdFor(userId);
  const params = [id, userId];
  let visible = 's.owner_user_id = $2';
  if (householdId) {
    params.push(householdId);
    visible = `(s.owner_user_id = $2 OR s.household_id = $3)`;
  }
  const [row] = await db.query(`SELECT ${COLUMNS} FROM shopping_list_items s WHERE s.id = $1 AND ${visible}`, params);
  if (!row) throw new NotFoundError('Shopping list item not found');
  return row;
}

/** Owner may edit anything; other household members may only complete/reopen. */
async function update(userId, id, patch = {}) {
  const item = await loadVisible(userId, id);
  const isOwner = item.owner_user_id === userId;
  const editsContent = ['quantity', 'note', 'retailerSlug', 'shared'].some((k) => patch[k] !== undefined);
  if (!isOwner && editsContent) throw new ForbiddenError('Only the owner can edit this item');

  let quantity = item.quantity;
  if (patch.quantity !== undefined) {
    quantity = Number(patch.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new ValidationError('quantity must be a whole number from 1 to 99');
    }
  }
  let status = item.status;
  if (patch.status !== undefined) {
    if (!['open', 'done'].includes(patch.status)) throw new ValidationError("status must be 'open' or 'done'");
    status = patch.status;
  }
  let householdId = item.household_id;
  if (patch.shared !== undefined) {
    householdId = patch.shared ? await householdIdFor(userId) : null;
    if (patch.shared && !householdId) throw new ValidationError('Join or create a household to share list items');
  }

  const done = status === 'done';
  const [row] = await db.query(
    `UPDATE shopping_list_items
     SET quantity = $2, note = $3, retailer_slug = $4, household_id = $5, status = $6,
         completed_by = $7, completed_at = $8
     WHERE id = $1
     RETURNING id, owner_user_id, household_id, product_id, title, quantity, retailer_slug, note, status, completed_by, completed_at, created_at`,
    [
      id,
      quantity,
      patch.note !== undefined ? patch.note || null : item.note,
      patch.retailerSlug !== undefined ? patch.retailerSlug || null : item.retailer_slug,
      householdId,
      status,
      done ? item.completed_by || userId : null,
      done ? item.completed_at || new Date().toISOString() : null,
    ],
  );
  return row;
}

async function remove(userId, id) {
  const item = await loadVisible(userId, id);
  if (item.owner_user_id !== userId) throw new ForbiddenError('Only the owner can delete this item');
  await db.query('DELETE FROM shopping_list_items WHERE id = $1', [id]);
  return { deleted: true };
}

module.exports = { list, create, update, remove };
