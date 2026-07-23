'use strict';

/**
 * functions/shared/validation.js
 *
 * Validation used by intake-incident (and any other write path) before data
 * touches the Data Store. Keeps intake-incident "dumb" — validate + persist
 * only, no enrichment logic here (that lives in crosslink-on-insert /
 * flag-detector).
 */

const INCIDENT_TYPES = [
  'theft', 'assault', 'burglary', 'robbery', 'kidnapping',
  'homicide', 'fraud', 'vandalism', 'domestic_violence', 'other',
];

const FLAG_TYPES = ['hotspot', 'mo_match', 'anomaly', 'risk_score'];
const FLAG_STATUSES = ['pending', 'acknowledged', 'escalated', 'dismissed'];
const REVIEW_DECISIONS = ['acknowledge', 'escalate', 'dismiss'];

class ValidationError extends Error {
  constructor(message, fieldErrors = []) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors; // [{ field, message }]
  }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidLatLng(lat, lng) {
  return (
    typeof lat === 'number' && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && lng >= -180 && lng <= 180
  );
}

function isValidDate(value) {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/**
 * Validates the full incident intake payload:
 * {
 *   fir_number, incident_type, reported_at, occurred_at, narrative_text, created_by,
 *   location: { latitude, longitude, district_id, address_text },
 *   offenders: [{ offender_id? , name?, aliases?, role_in_incident }],
 *   victims: [{ victim_id?, name?, contact_info? }]
 * }
 *
 * Throws ValidationError with all collected field errors if invalid.
 */
function validateIncidentIntake(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Payload must be an object', [
      { field: 'root', message: 'missing or non-object payload' },
    ]);
  }

  if (!isNonEmptyString(payload.fir_number)) {
    errors.push({ field: 'fir_number', message: 'required, non-empty string' });
  }

  if (!INCIDENT_TYPES.includes(payload.incident_type)) {
    errors.push({
      field: 'incident_type',
      message: `must be one of: ${INCIDENT_TYPES.join(', ')}`,
    });
  }

  if (!isValidDate(payload.reported_at)) {
    errors.push({ field: 'reported_at', message: 'required, valid ISO date' });
  }

  if (!isValidDate(payload.occurred_at)) {
    errors.push({ field: 'occurred_at', message: 'required, valid ISO date' });
  }

  if (!isNonEmptyString(payload.created_by)) {
    errors.push({ field: 'created_by', message: 'required — user id from auth session' });
  }

  // location
  const loc = payload.location;
  if (!loc || typeof loc !== 'object') {
    errors.push({ field: 'location', message: 'required object' });
  } else {
    if (!isValidLatLng(loc.latitude, loc.longitude)) {
      errors.push({ field: 'location.latitude/longitude', message: 'must be valid coordinates' });
    }
    if (loc.district_id == null || Number.isNaN(Number(loc.district_id))) {
      errors.push({ field: 'location.district_id', message: 'required integer FK' });
    }
  }

  // offenders / victims are optional arrays but must be well-formed if present
  if (payload.offenders && !Array.isArray(payload.offenders)) {
    errors.push({ field: 'offenders', message: 'must be an array if provided' });
  }
  if (payload.victims && !Array.isArray(payload.victims)) {
    errors.push({ field: 'victims', message: 'must be an array if provided' });
  }

  if (errors.length > 0) {
    throw new ValidationError('Incident intake validation failed', errors);
  }

  return true;
}

function validateFlagType(flagType) {
  if (!FLAG_TYPES.includes(flagType)) {
    throw new ValidationError(`Invalid flag_type: ${flagType}`, [
      { field: 'flag_type', message: `must be one of: ${FLAG_TYPES.join(', ')}` },
    ]);
  }
  return true;
}

function validateReviewDecision(decision) {
  if (!REVIEW_DECISIONS.includes(decision)) {
    throw new ValidationError(`Invalid decision: ${decision}`, [
      { field: 'decision', message: `must be one of: ${REVIEW_DECISIONS.join(', ')}` },
    ]);
  }
  return true;
}

module.exports = {
  ValidationError,
  INCIDENT_TYPES,
  FLAG_TYPES,
  FLAG_STATUSES,
  REVIEW_DECISIONS,
  validateIncidentIntake,
  validateFlagType,
  validateReviewDecision,
};
