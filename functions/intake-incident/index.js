'use strict';

/**
 * functions/intake-incident/index.js
 *
 * Single entry point for new incidents/FIRs (Step 1 of the pipeline).
 * ONLY responsibility: validate + persist. No enrichment here —
 * crosslink-on-insert picks up from the Data Store Signal fired by this
 * insert.
 */

const { validateIncidentIntake, ValidationError } = require('../shared/validation');
const { insert, insertMany, findOne } = require('../shared/dataStoreClient');

module.exports = async (req, res) => {
  const context = req.context; // Catalyst execution context

  try {
    const payload = req.body;

    // 1. Validate — throws ValidationError with field-level detail on failure
    validateIncidentIntake(payload);

    // 2. Resolve or reuse location
    //    (kept simple here — a real implementation would look up an existing
    //    location within some radius before inserting a duplicate point)
    const location = await insert(context, 'locations', {
      district_id: payload.location.district_id,
      latitude: payload.location.latitude,
      longitude: payload.location.longitude,
      address_text: payload.location.address_text || null,
    });

    // 3. Insert the incident itself
    const incident = await insert(context, 'incidents', {
      fir_number: payload.fir_number,
      incident_type: payload.incident_type,
      location_id: location.ROWID,
      reported_at: payload.reported_at,
      occurred_at: payload.occurred_at,
      narrative_text: payload.narrative_text || '',
      status: 'open',
      created_by: payload.created_by,
    });

    // 4. Resolve offenders — reuse existing offender_id if given, else create
    const offenderLinks = [];
    for (const o of payload.offenders || []) {
      let offenderId = o.offender_id;
      if (!offenderId) {
        const created = await insert(context, 'offenders', {
          name: o.name,
          aliases: o.aliases || '',
          identifiers: o.identifiers || '',
          risk_notes: o.risk_notes || '',
        });
        offenderId = created.ROWID;
      } else {
        const existing = await findOne(context, 'offenders', offenderId);
        if (!existing) {
          throw new ValidationError('Invalid offender_id reference', [
            { field: 'offenders', message: `offender_id ${offenderId} not found` },
          ]);
        }
      }
      offenderLinks.push({
        incident_id: incident.ROWID,
        offender_id: offenderId,
        role_in_incident: o.role_in_incident || 'suspect',
      });
    }
    if (offenderLinks.length > 0) {
      await insertMany(context, 'incident_offenders', offenderLinks);
    }

    // 5. Resolve victims — same pattern as offenders
    const victimLinks = [];
    for (const v of payload.victims || []) {
      let victimId = v.victim_id;
      if (!victimId) {
        const created = await insert(context, 'victims', {
          name: v.name || '',
          contact_info: v.contact_info || '',
        });
        victimId = created.ROWID;
      }
      victimLinks.push({ incident_id: incident.ROWID, victim_id: victimId });
    }
    if (victimLinks.length > 0) {
      await insertMany(context, 'incident_victims', victimLinks);
    }

    // 6. Done. crosslink-on-insert (Signal) picks up from here automatically.
    res.status(201).send({
      success: true,
      incident_id: incident.ROWID,
      fir_number: incident.fir_number,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).send({
        success: false,
        error: err.message,
        field_errors: err.fieldErrors,
      });
      return;
    }
    console.error('[intake-incident] unexpected error:', err);
    res.status(500).send({ success: false, error: 'Internal error during incident intake' });
  }
};
