/**
 * Step 6: Review Decision Catalyst Function
 * Records officer sign-off decision (Acknowledge / Escalate / Dismiss)
 * and triggers Catalyst Circuit workflow execution.
 */

const DataStoreClient = require('../shared/db');
const CacheClient = require('../shared/cache');
const { success, error } = require('../shared/response');

const db = new DataStoreClient();
const cache = new CacheClient();

async function handler(req, res) {
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

    const { flag_id, reviewer_id, reviewer_role, decision, action_type, assigned_to, reason } = payload;

    // 1. Validate Mandatory Review Input (Stage 6 Procedure)
    if (!flag_id || !decision || !reason) {
      return error(res, 'flag_id, decision, and mandatory reason are required', 400);
    }

    const ALLOWED_DECISIONS = ['ACKNOWLEDGE', 'ESCALATE', 'DISMISS'];
    if (!ALLOWED_DECISIONS.includes(decision.toUpperCase())) {
      return error(res, `Decision must be one of: ${ALLOWED_DECISIONS.join(', ')}`, 400);
    }

    const flag = await db.findById('flags', 'flag_id', flag_id);
    if (!flag) {
      return error(res, `Flag with ID ${flag_id} not found`, 404);
    }

    const decisionId = `DEC_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const normalizedDecision = decision.toUpperCase();

    // 2. Record Decision in Relational Data Store
    const decisionRecord = await db.insert('review_decisions', {
      decision_id: decisionId,
      flag_id,
      reviewer_id: reviewer_id || 'OFFICER_CURRENT',
      reviewer_role: reviewer_role || 'SHO',
      decision: normalizedDecision,
      action_type: action_type || (normalizedDecision === 'ACKNOWLEDGE' ? 'PATROL_DEPLOYMENT' : null),
      assigned_to: assigned_to || null,
      reason
    });

    // 3. Update Flag Status
    await db.update('flags', 'flag_id', flag_id, {
      status: normalizedDecision === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : (normalizedDecision === 'ESCALATE' ? 'ESCALATED' : 'DISMISSED')
    });

    // 4. Simulate Catalyst Circuit Execution (circuits/review-escalation-flow.json)
    const circuitExecution = {
      circuit_id: 'review-escalation-flow',
      execution_id: `exec_${Date.now()}`,
      status: 'RUNNING',
      branches_executed: []
    };

    if (normalizedDecision === 'ACKNOWLEDGE') {
      circuitExecution.branches_executed.push('Branch_Acknowledge_GroundAction');
      circuitExecution.action_assigned = {
        action_type: action_type || 'PATROL_DEPLOYMENT',
        assigned_to: assigned_to || 'BEAT_CONSTABLE_04',
        target_hotspot: flag.target_id
      };
      circuitExecution.status = 'COMPLETED';
    } else if (normalizedDecision === 'ESCALATE') {
      circuitExecution.branches_executed.push('Branch_Escalate_DistrictSP_Notification');
      circuitExecution.notification = {
        type: 'MAIL_PUSH_ALERT',
        recipient_role: 'DISTRICT_SP',
        subject: `ESCALATED ALERT: ${flag.title}`,
        message: `Flag ${flag_id} escalated by ${reviewer_id} (${reviewer_role}). Reason: ${reason}`
      };
      circuitExecution.status = 'COMPLETED';
    } else if (normalizedDecision === 'DISMISS') {
      circuitExecution.branches_executed.push('Branch_Dismiss_FeedbackAudit');
      circuitExecution.feedback_logged = {
        flag_id,
        rejection_reason: reason,
        model_feedback_entry: true
      };
      circuitExecution.status = 'COMPLETED';
    }

    // 5. Invalidate cached role views so dashboard reflects updated status immediately
    await cache.delete(`role_payload_${reviewer_role}_${flag.jurisdiction_id}_STATION_HAL`);

    return success(res, {
      message: `Review decision '${normalizedDecision}' recorded successfully.`,
      decision_record: decisionRecord,
      circuit_execution: circuitExecution
    }, 200);

  } catch (err) {
    console.error(`[ReviewDecision] Internal error: ${err.stack}`);
    return error(res, 'Failed to record review decision', 500, err.message);
  }
}

module.exports = { handler };
