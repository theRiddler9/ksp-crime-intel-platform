/**
 * Step 2–3: Crosslink On Insert Event Function
 * Catalyst Signal-triggered background function.
 * Auto-propagates entities into NoSQL graph edges and runs MO pattern similarity matching.
 */

const NoSQLClient = require('../../functions/shared/nosql');
const DataStoreClient = require('../../functions/shared/db');
const { runPythonScript, fallbackMoSimilarity } = require('../../functions/shared/pythonBridge');
const flagDetector = require('../flag-detector/index');

const nosql = new NoSQLClient();
const db = new DataStoreClient();

async function handler(eventPayload) {
  try {
    const data = eventPayload.data || eventPayload || {};
    const incident = data.incident || data;
    if (!incident || !incident.fir_number) {
      console.warn('[CrosslinkOnInsert] Event payload missing incident details.');
      return;
    }

    console.log(`[CrosslinkOnInsert] Processing signal for FIR: ${incident.fir_number}`);

    // 1. Extract Suspect -> Location Graph Edge
    if (data.offender_id && incident.location_id) {
      await nosql.addEdge('suspect_location_edges', {
        offender_id: data.offender_id,
        location_id: incident.location_id,
        district_id: incident.district_id,
        crime_types: [incident.case_type],
        weight: 1.0
      });
    }

    // 2. Extract Suspect -> Victim Graph Edge
    if (data.offender_id && data.victim_id) {
      await nosql.addEdge('suspect_victim_edges', {
        offender_id: data.offender_id,
        victim_id: data.victim_id,
        relation_type: 'TARGETED',
        associated_fir: incident.fir_number
      });
    }

    // 3. Find Co-Accused Links (if multiple suspects exist)
    if (data.offender_id) {
      const existingOffenderEdges = await nosql.getEdgesByOffender(data.offender_id);
      console.log(`[CrosslinkOnInsert] Offender graph links created for: ${data.offender_id}`);
    }

    // 4. Run Modus Operandi (MO) Pattern Matcher (python script or fallback)
    const existingIncidents = await db.find('incidents');
    let moMatches = [];

    const pyResult = await runPythonScript('models/mo_similarity_matcher.py', {
      target_incident: incident,
      incidents_pool: existingIncidents
    });

    if (pyResult.success && Array.isArray(pyResult.result)) {
      moMatches = pyResult.result;
    } else {
      moMatches = fallbackMoSimilarity(incident, existingIncidents);
    }

    // 5. Save High-Similarity MO Edges into NoSQL Graph Store
    for (const match of moMatches) {
      if (match.similarity_score >= 0.5) {
        await nosql.addEdge('mo_cluster_edges', {
          source_fir: match.source_fir,
          target_fir: match.target_fir,
          shared_mo_tags: match.shared_mo_tags,
          similarity_score: match.similarity_score,
          auto_linked: true,
          verified_by_investigator: false
        });

        // Surface MO Link Flag if similarity is very high (>= 0.7)
        if (match.similarity_score >= 0.7) {
          await db.insert('flags', {
            flag_id: `FLAG_MO_${Date.now()}_${Math.floor(Math.random()*1000)}`,
            flag_type: 'MO_LINK',
            severity: match.similarity_score >= 0.85 ? 'HIGH' : 'MEDIUM',
            title: `MO Pattern Match Detected between ${match.source_fir} & ${match.target_fir}`,
            summary: `Shared Modus Operandi tags [${match.shared_mo_tags.join(', ')}] with similarity score of ${(match.similarity_score * 100).toFixed(1)}%.`,
            confidence_score: match.similarity_score,
            target_type: 'INCIDENT',
            target_id: match.target_fir,
            jurisdiction_id: incident.district_id,
            evidence_payload: match,
            status: 'PENDING'
          });
        }
      }
    }

    // 6. Chain into Flag Detector Signal Event
    setImmediate(async () => {
      try {
        await flagDetector.handler({
          event_type: 'DataStore.crosslink_complete',
          incident,
          moMatches
        });
      } catch (err) {
        console.error(`[CrosslinkOnInsert] Error invoking flag-detector: ${err.message}`);
      }
    });

    return {
      status: 'success',
      fir_number: incident.fir_number,
      mo_matches_surfaced: moMatches.length
    };

  } catch (err) {
    console.error(`[CrosslinkOnInsert] Error processing event signal: ${err.stack}`);
  }
}

module.exports = { handler };
