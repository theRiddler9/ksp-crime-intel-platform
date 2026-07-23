/**
 * Step 4: Flags Catalyst Function
 * Lists and serves pending flags for alert-review UI with filtering options.
 */

const DataStoreClient = require('../shared/db');
const { success, error } = require('../shared/response');

const db = new DataStoreClient();

async function handler(req, res) {
  try {
    const method = req.method || 'GET';
    const query = req.query || {};

    if (method === 'GET') {
      const { status, flag_type, severity, jurisdiction_id } = query;
      let flags = await db.find('flags');

      if (status) {
        flags = flags.filter(f => f.status.toUpperCase() === status.toUpperCase());
      }
      if (flag_type) {
        flags = flags.filter(f => f.flag_type.toUpperCase() === flag_type.toUpperCase());
      }
      if (severity) {
        flags = flags.filter(f => f.severity.toUpperCase() === severity.toUpperCase());
      }
      if (jurisdiction_id) {
        flags = flags.filter(f => f.jurisdiction_id === jurisdiction_id);
      }

      // Sort by created_at descending
      flags.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      return success(res, {
        total_flags: flags.length,
        pending_count: flags.filter(f => f.status === 'PENDING').length,
        acknowledged_count: flags.filter(f => f.status === 'ACKNOWLEDGED').length,
        escalated_count: flags.filter(f => f.status === 'ESCALATED').length,
        dismissed_count: flags.filter(f => f.status === 'DISMISSED').length,
        flags
      }, 200, 'Flags retrieved successfully');
    }

    if (method === 'POST') {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const flagId = payload.flag_id || `FLAG_${Date.now()}`;

      const newFlag = await db.insert('flags', {
        flag_id: flagId,
        flag_type: payload.flag_type || 'HOTSPOT',
        severity: payload.severity || 'MEDIUM',
        title: payload.title || 'Automated Crime Intelligence Alert',
        summary: payload.summary || 'Surfaced by system detection pipeline',
        confidence_score: parseFloat(payload.confidence_score || 0.85),
        target_type: payload.target_type || 'LOCATION',
        target_id: payload.target_id || 'UNKNOWN',
        jurisdiction_id: payload.jurisdiction_id || 'BENGALURU_CITY',
        evidence_payload: payload.evidence_payload || {},
        status: 'PENDING'
      });

      return success(res, newFlag, 201, 'Flag created successfully');
    }

    return error(res, `Method ${method} not allowed`, 405);

  } catch (err) {
    console.error(`[FlagsFunction] Internal error: ${err.stack}`);
    return error(res, 'Failed to process flags request', 500, err.message);
  }
}

module.exports = { handler };
