/**
 * Step 1: Intake Incident Catalyst Function
 * Single entry point for all new FIRs and incident submissions following the official Karnataka Police ERD schema.
 */

const DataStoreClient = require('../shared/db');
const { validateIncidentPayload, checkDuplicateIncident } = require('../shared/validators');
const { success, error } = require('../shared/response');
const crosslinkHandler = require('../../event-functions/crosslink-on-insert/index');

const db = new DataStoreClient();

async function handler(req, res) {
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};

    // 1. Mandatory Field Validation
    const validation = validateIncidentPayload(payload);
    if (!validation.isValid) {
      return error(res, 'Validation Failed', 400, validation.errors);
    }

    // 2. Duplicate Check
    const existingCases = await db.find('CaseMaster');
    const dupCheck = checkDuplicateIncident(existingCases, payload);
    if (dupCheck.isDuplicate) {
      return error(res, 'Duplicate Incident Flagged', 409, { reason: dupCheck.reason });
    }

    // Extract official KSP ERD identifiers or generate defaults
    const crimeNo = payload.CrimeNo || payload.fir_number;
    const caseNo = payload.CaseNo || (crimeNo ? crimeNo.slice(-9) : `2026${Math.floor(Math.random() * 90000 + 10000)}`);
    const caseMasterId = payload.CaseMasterID || memoryStoreNextId('CaseMaster');

    // 3. Save CaseMaster Primary Record
    const newCaseMaster = await db.insert('CaseMaster', {
      CaseMasterID: caseMasterId,
      CrimeNo: crimeNo,
      CaseNo: caseNo,
      CrimeRegisteredDate: payload.CrimeRegisteredDate || new Date().toISOString().split('T')[0],
      PolicePersonID: payload.PolicePersonID || 101,
      PoliceStationID: payload.PoliceStationID || payload.station_id || 6,
      PoliceStationName: payload.PoliceStationName || payload.station_id || 'STATION_HAL',
      DistrictID: payload.DistrictID || payload.district_id || 4430,
      DistrictName: payload.DistrictName || payload.district_id || 'BENGALURU_CITY',
      CaseCategoryID: payload.CaseCategoryID || 1, // 1 = FIR
      GravityOffenceID: payload.GravityOffenceID || 1,
      CrimeMajorHeadID: payload.CrimeMajorHeadID || 1,
      CrimeMajorHeadName: payload.CrimeMajorHeadName || payload.case_type || 'Property Offence',
      CrimeMinorHeadID: payload.CrimeMinorHeadID || 101,
      CrimeMinorHeadName: payload.CrimeMinorHeadName || payload.case_type || 'Theft',
      CaseStatusID: payload.CaseStatusID || 1, // 1 = Under Investigation
      CourtID: payload.CourtID || 1,
      IncidentFromDate: payload.IncidentFromDate || payload.occurrence_time,
      IncidentToDate: payload.IncidentToDate || null,
      InfoReceivedPSDate: payload.InfoReceivedPSDate || new Date().toISOString(),
      latitude: parseFloat(payload.latitude),
      longitude: parseFloat(payload.longitude),
      BriefFacts: payload.BriefFacts || `FIR ${crimeNo} registered under station ${payload.PoliceStationID || payload.station_id}`,
      mo_tags: payload.mo_tags,
      // Compatibility fields for legacy queries
      incident_id: `INC_${caseMasterId}`,
      fir_number: crimeNo,
      case_type: payload.CrimeMinorHeadName || payload.case_type || 'Theft',
      station_id: String(payload.PoliceStationID || payload.station_id || 'STATION_HAL'),
      district_id: String(payload.DistrictName || payload.district_id || 'BENGALURU_CITY'),
      occurrence_time: payload.IncidentFromDate || payload.occurrence_time,
      status: 'OPEN'
    });

    // 4. Save Complainant Details if provided
    if (payload.ComplainantDetails) {
      const comp = payload.ComplainantDetails;
      await db.insert('ComplainantDetails', {
        ComplainantID: comp.ComplainantID || memoryStoreNextId('ComplainantDetails'),
        CaseMasterID: caseMasterId,
        ComplainantName: comp.ComplainantName || 'Complainant Primary',
        AgeYear: comp.AgeYear || null,
        OccupationID: comp.OccupationID || null,
        ReligionID: comp.ReligionID || null,
        CasteID: comp.CasteID || null,
        GenderID: comp.GenderID || 1
      });
    }

    // 5. Save Accused Details if provided
    let accusedMasterId = null;
    if (payload.Accused) {
      const acc = payload.Accused;
      accusedMasterId = acc.AccusedMasterID || memoryStoreNextId('Accused');
      await db.insert('Accused', {
        AccusedMasterID: accusedMasterId,
        CaseMasterID: caseMasterId,
        AccusedName: acc.AccusedName || 'Unknown Accused',
        AgeYear: acc.AgeYear || null,
        GenderID: acc.GenderID || 1,
        PersonID: acc.PersonID || 'A1'
      });

      // Compatibility entry for offenders table
      await db.insert('offenders', {
        offender_id: `OFF_${accusedMasterId}`,
        name: acc.AccusedName || 'Unknown Accused',
        age: acc.AgeYear || null,
        gender: acc.GenderID === 1 ? 'MALE' : 'FEMALE',
        prior_record_flag: Boolean(acc.prior_record_flag),
        prior_cases_count: acc.prior_cases_count || (acc.prior_record_flag ? 1 : 0),
        risk_tier: acc.prior_record_flag ? 'HIGH' : 'LOW'
      });
    }

    // 6. Save Victim Details if provided
    let victimMasterId = null;
    if (payload.Victim) {
      const vic = payload.Victim;
      victimMasterId = vic.VictimMasterID || memoryStoreNextId('Victim');
      await db.insert('Victim', {
        VictimMasterID: victimMasterId,
        CaseMasterID: caseMasterId,
        VictimName: vic.VictimName || 'Victim Primary',
        AgeYear: vic.AgeYear || null,
        GenderID: vic.GenderID || 1,
        VictimPolice: vic.VictimPolice || '0'
      });
    }

    // 7. Save Act Section Associations
    if (payload.ActSectionAssociation && Array.isArray(payload.ActSectionAssociation)) {
      for (const actSec of payload.ActSectionAssociation) {
        await db.insert('ActSectionAssociation', {
          CaseMasterID: caseMasterId,
          ActID: actSec.ActID || 'IPC',
          SectionID: actSec.SectionID || '379',
          ActOrderID: actSec.ActOrderID || 1,
          SectionOrderID: actSec.SectionOrderID || 1
        });
      }
    }

    // 8. Auto-trigger Event Function Signal (Stage 2 & 3: Crosslinking)
    const signalEvent = {
      event_type: 'DataStore.incidents.onInsert',
      data: {
        incident: newCaseMaster,
        offender_id: accusedMasterId ? `OFF_${accusedMasterId}` : null,
        victim_id: victimMasterId ? `VIC_${victimMasterId}` : null,
        location_id: `LOC_${newCaseMaster.station_id}_${newCaseMaster.latitude}_${newCaseMaster.longitude}`
      }
    };

    setImmediate(async () => {
      try {
        await crosslinkHandler.handler(signalEvent);
      } catch (err) {
        console.error(`[EventSignal] Error executing crosslink handler: ${err.message}`);
      }
    });

    return success(res, {
      message: 'Official KSP FIR intake successful. Data auto-transmitted upward.',
      CaseMasterID: caseMasterId,
      CrimeNo: crimeNo,
      CaseNo: caseNo,
      PoliceStationID: newCaseMaster.PoliceStationID,
      signal_triggered: 'DataStore.incidents.onInsert'
    }, 201);

  } catch (err) {
    console.error(`[IntakeIncident] Internal error: ${err.stack}`);
    return error(res, 'Failed to process official KSP FIR intake', 500, err.message);
  }
}

function memoryStoreNextId(table) {
  return Math.floor(Math.random() * 900000) + 100000;
}

module.exports = { handler };
