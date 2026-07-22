/**
 * Catalyst Cron Job: Nightly Batch Scoring
 * Recomputes spatial-temporal hotspots, risk scores, and refreshes Catalyst Cache
 * to ensure fast O(1) dashboard reads.
 */

const DataStoreClient = require('../../functions/shared/db');
const CacheClient = require('../../functions/shared/cache');
const { runPythonScript, fallbackHotspotClustering } = require('../../functions/shared/pythonBridge');

const db = new DataStoreClient();
const cache = new CacheClient();

async function handler() {
  console.log(`[Cron:NightlyBatchScoring] Starting batch recomputation job at ${new Date().toISOString()}...`);

  try {
    const allIncidents = await db.find('incidents');

    // 1. Recompute full-dataset spatial clusters
    let hotspots = [];
    const pyRes = await runPythonScript('models/hotspot_clustering.py', { incidents: allIncidents });
    if (pyRes.success && Array.isArray(pyRes.result)) {
      hotspots = pyRes.result;
    } else {
      hotspots = fallbackHotspotClustering(allIncidents);
    }

    // 2. Update Catalyst Cache keys
    await cache.put('hotspot_scores_statewide', hotspots, 86400 * 7); // 7-day TTL

    // 3. Pre-cache district risk forecast scores
    const districtGroups = new Map();
    allIncidents.forEach(inc => {
      const dist = inc.district_id || 'BENGALURU_CITY';
      if (!districtGroups.has(dist)) districtGroups.set(dist, []);
      districtGroups.get(dist).push(inc);
    });

    for (const [districtId, incList] of districtGroups.entries()) {
      const distHotspots = fallbackHotspotClustering(incList);
      await cache.put(`risk_forecast:${districtId}`, {
        district_id: districtId,
        total_incidents_30d: incList.length,
        hotspot_count: distHotspots.length,
        risk_score_avg: parseFloat((distHotspots.reduce((acc, h) => acc + h.risk_score, 0) / (distHotspots.length || 1)).toFixed(2)),
        hotspots: distHotspots,
        updated_at: new Date().toISOString()
      }, 86400);
    }

    console.log(`[Cron:NightlyBatchScoring] Batch scoring finished successfully. Refreshed cache for ${districtGroups.size} districts.`);

    return {
      status: 'success',
      total_incidents_processed: allIncidents.length,
      hotspots_recomputed: hotspots.length,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    console.error(`[Cron:NightlyBatchScoring] Job failed with error: ${err.stack}`);
    return {
      status: 'error',
      message: err.message
    };
  }
}

module.exports = { handler };
