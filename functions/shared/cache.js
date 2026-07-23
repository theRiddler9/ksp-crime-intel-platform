'use strict';

/**
 * functions/shared/cacheClient.js
 *
 * Wrapper around Catalyst Cache. Owns the key-naming convention so every
 * writer (flag-detector, nightly-batch-scoring) and every reader (role-view)
 * agrees on the exact same key shape. See catalyst-config docs for the
 * key design:
 *
 *   hotspot:{district_id}:{date_bucket}
 *   risk_score:{location_id}
 *   dashboard_summary:{role}:{district_id}
 *
 * Values are always stored as JSON strings.
 */

const catalyst = require('zcatalyst-sdk-node');

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h — refreshed nightly regardless

function getCache(context) {
  const app = catalyst.initialize(context);
  return app.cache();
}

function hotspotKey(districtId, dateBucket) {
  return `hotspot:${districtId}:${dateBucket}`;
}

function riskScoreKey(locationId) {
  return `risk_score:${locationId}`;
}

function dashboardSummaryKey(role, districtId) {
  return `dashboard_summary:${role}:${districtId}`;
}

async function get(context, key) {
  const cache = getCache(context);
  try {
    const segment = cache.segment(); // default segment
    const value = await segment.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value; // not JSON, return as-is
    }
  } catch (err) {
    // Cache misses/errors should never break a request — caller falls back
    // to Data Store/NoSQL. Log and return null rather than throwing.
    console.warn(`[cacheClient.get] ${key} failed: ${err.message}`);
    return null;
  }
}

async function set(context, key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const cache = getCache(context);
  try {
    const segment = cache.segment();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await segment.put(key, serialized, ttlSeconds);
    return true;
  } catch (err) {
    // Failing to write cache is non-fatal — the next read just falls back
    // to a live query. Surface a warning so it's visible in logs.
    console.warn(`[cacheClient.set] ${key} failed: ${err.message}`);
    return false;
  }
}

/**
 * Patch (incremental update) — used by flag-detector after a single
 * incident. Merges into any existing cached object rather than overwriting
 * the whole key, so a per-incident update doesn't clobber a district-wide
 * cache entry written by the nightly cron.
 */
async function patch(context, key, partialValue, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const existing = (await get(context, key)) || {};
  const merged = { ...existing, ...partialValue, updated_at: new Date().toISOString() };
  await set(context, key, merged, ttlSeconds);
  return merged;
}

async function del(context, key) {
  const cache = getCache(context);
  try {
    const segment = cache.segment();
    await segment.delete(key);
    return true;
  } catch (err) {
    console.warn(`[cacheClient.del] ${key} failed: ${err.message}`);
    return false;
  }
}

module.exports = {
  hotspotKey,
  riskScoreKey,
  dashboardSummaryKey,
  get,
  set,
  patch,
  del,
};
