'use strict';

/**
 * functions/shared/dataStoreClient.js
 *
 * Thin wrapper around Catalyst's Data Store SDK. Every Function imports this
 * instead of calling the Catalyst SDK directly — keeps connection setup,
 * query helpers, and error handling in one place.
 *
 * Usage:
 *   const { getDataStore, run, findOne, findMany, insert, update } = require('../shared/dataStoreClient');
 */

const catalyst = require('zcatalyst-sdk-node');

/**
 * Returns an initialized Data Store instance bound to the current request/
 * execution context. Must be called with the Catalyst `context` object
 * passed into your Function's handler.
 */
function getDataStore(context) {
  const app = catalyst.initialize(context);
  return app.datastore();
}

/**
 * Run a raw zcql query. Prefer the typed helpers below for simple cases;
 * use this for joins/aggregates that don't map cleanly to a single table.
 *
 * @param {object} context - Catalyst function context
 * @param {string} zcqlQuery - e.g. "SELECT * FROM incidents WHERE status = 'open'"
 */
async function run(context, zcqlQuery) {
  const app = catalyst.initialize(context);
  const zcql = app.zcql();
  try {
    const result = await zcql.executeZCQLQuery(zcqlQuery);
    return result;
  } catch (err) {
    throw new Error(`[dataStoreClient.run] query failed: ${err.message}`);
  }
}

/**
 * Fetch a single row by primary key.
 */
async function findOne(context, tableName, id) {
  const datastore = getDataStore(context);
  const table = datastore.table(tableName);
  try {
    const row = await table.getRow(id);
    return row || null;
  } catch (err) {
    if (err.message && err.message.includes('not found')) return null;
    throw new Error(`[dataStoreClient.findOne] ${tableName}#${id} failed: ${err.message}`);
  }
}

/**
 * Fetch multiple rows matching a simple equality filter set.
 * For anything beyond flat equality (ranges, joins), use run() with zcql.
 *
 * @param {object} filters - e.g. { status: 'pending' }
 * @param {object} opts - { limit, orderBy, orderDir }
 */
async function findMany(context, tableName, filters = {}, opts = {}) {
  const { limit = 100, orderBy, orderDir = 'DESC' } = opts;

  const whereClauses = Object.entries(filters)
    .map(([key, value]) => `${key} = '${String(value).replace(/'/g, "''")}'`)
    .join(' AND ');

  let query = `SELECT * FROM ${tableName}`;
  if (whereClauses) query += ` WHERE ${whereClauses}`;
  if (orderBy) query += ` ORDER BY ${orderBy} ${orderDir}`;
  query += ` LIMIT ${limit}`;

  const result = await run(context, query);
  return result.map((row) => row[tableName]);
}

/**
 * Insert a row. Returns the inserted row including its generated ID.
 */
async function insert(context, tableName, rowData) {
  const datastore = getDataStore(context);
  const table = datastore.table(tableName);
  try {
    const inserted = await table.insertRow(rowData);
    return inserted;
  } catch (err) {
    throw new Error(`[dataStoreClient.insert] ${tableName} failed: ${err.message}`);
  }
}

/**
 * Bulk insert — used by crosslink-on-insert / flag-detector when writing
 * multiple junction rows or multiple flags in one pass.
 */
async function insertMany(context, tableName, rows) {
  const datastore = getDataStore(context);
  const table = datastore.table(tableName);
  try {
    const inserted = await table.insertRows(rows);
    return inserted;
  } catch (err) {
    throw new Error(`[dataStoreClient.insertMany] ${tableName} failed: ${err.message}`);
  }
}

/**
 * Update a row by ID. Used e.g. by review-decision to flip flags.status.
 */
async function update(context, tableName, id, patch) {
  const datastore = getDataStore(context);
  const table = datastore.table(tableName);
  try {
    const updated = await table.updateRow({ ROWID: id, ...patch });
    return updated;
  } catch (err) {
    throw new Error(`[dataStoreClient.update] ${tableName}#${id} failed: ${err.message}`);
  }
}

module.exports = {
  getDataStore,
  run,
  findOne,
  findMany,
  insert,
  insertMany,
  update,
};
