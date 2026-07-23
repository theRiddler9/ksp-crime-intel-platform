/**
 * Catalyst Cache Helper for Precomputed Hotspot & Risk Scores
 */

const memoryCache = new Map();

class CacheClient {
  constructor(catalystApp = null) {
    this.catalystApp = catalystApp;
  }

  async get(key) {
    if (this.catalystApp && this.catalystApp.cache) {
      try {
        const segment = this.catalystApp.cache().segment();
        const value = await segment.getValue(key);
        return value ? JSON.parse(value) : null;
      } catch (err) {
        console.warn(`[Cache] Catalyst Segment getValue fallback: ${err.message}`);
      }
    }

    const item = memoryCache.get(key);
    if (!item) return null;
    if (item.expiry && item.expiry < Date.now()) {
      memoryCache.delete(key);
      return null;
    }
    return item.value;
  }

  async put(key, value, ttlSeconds = 86400) {
    if (this.catalystApp && this.catalystApp.cache) {
      try {
        const segment = this.catalystApp.cache().segment();
        await segment.put(key, JSON.stringify(value), ttlSeconds);
        return;
      } catch (err) {
        console.warn(`[Cache] Catalyst Segment put fallback: ${err.message}`);
      }
    }

    memoryCache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000
    });
  }

  async delete(key) {
    if (this.catalystApp && this.catalystApp.cache) {
      try {
        const segment = this.catalystApp.cache().segment();
        await segment.delete(key);
      } catch (err) {
        console.warn(`[Cache] Catalyst Segment delete fallback: ${err.message}`);
      }
    }
    memoryCache.delete(key);
  }

  flushAll() {
    memoryCache.clear();
  }
}

module.exports = CacheClient;
