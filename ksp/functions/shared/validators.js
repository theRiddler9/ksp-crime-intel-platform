/**
 * Input & Data Integrity Validation for KSP Crime Intel Platform
 * Follows Official Karnataka Police ERD Schema Specifications.
 */

const ALLOWED_CRIME_MAJOR_HEADS = [
  'Property Offence',
  'Cybercrime',
  'Special & Local Laws',
  'Crimes Against Women',
  'Crimes Against Body'
];

const VALID_MO_TAGS = [
  'chain snatching',
  'OTP fraud',
  'SIM swap',
  'burglary - forced entry',
  'burglary - lock picking',
  'night time theft',
  'two wheeler theft',
  'bank impersonation',
  'cyber phishing',
  'drug trafficking',
  'armed robbery',
  'extortion call',
  'domestic violence'
];

function validateIncidentPayload(payload) {
  const errors = [];

  const firNo = payload.CrimeNo || payload.fir_number;
  if (!firNo || typeof firNo !== 'string' || !firNo.trim()) {
    errors.push('CrimeNo / fir_number is required and must be a valid non-empty string');
  }

  const stationId = payload.PoliceStationID || payload.station_id;
  if (!stationId) {
    errors.push('PoliceStationID / station_id is required');
  }

  const lat = parseFloat(payload.latitude);
  const lng = parseFloat(payload.longitude);

  if (isNaN(lat) || isNaN(lng)) {
    errors.push('Valid latitude and longitude numerical GPS coordinates are required');
  } else {
    if (lat < 11.0 || lat > 19.0 || lng < 74.0 || lng > 79.0) {
      errors.push('Coordinates must fall within Karnataka state geographic boundaries (Lat: 11.0-19.0, Lng: 74.0-79.0)');
    }
  }

  const incDate = payload.IncidentFromDate || payload.occurrence_time;
  if (!incDate || isNaN(Date.parse(incDate))) {
    errors.push('IncidentFromDate / occurrence_time must be a valid ISO timestamp');
  }

  const moTags = payload.mo_tags;
  if (!moTags || !Array.isArray(moTags) || moTags.length === 0) {
    errors.push('At least one standardized Modus Operandi (mo_tags) tag is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

function checkDuplicateIncident(existingIncidents, newPayload) {
  const newFir = newPayload.CrimeNo || newPayload.fir_number;
  const newStation = newPayload.PoliceStationID || newPayload.station_id;
  const newCategory = newPayload.CrimeMinorHeadName || newPayload.case_type || 'General';
  const newTime = new Date(newPayload.IncidentFromDate || newPayload.occurrence_time).getTime();
  const newLat = parseFloat(newPayload.latitude);
  const newLng = parseFloat(newPayload.longitude);

  for (const inc of existingIncidents) {
    const incFir = inc.CrimeNo || inc.fir_number;
    if (incFir === newFir) {
      return { isDuplicate: true, reason: `CrimeNo / FIR number ${newFir} already exists` };
    }

    const incStation = inc.PoliceStationID || inc.station_id;
    const incCategory = inc.CrimeMinorHeadName || inc.case_type || 'General';
    const incTime = new Date(inc.IncidentFromDate || inc.occurrence_time).getTime();
    const timeDiffHours = Math.abs(newTime - incTime) / (1000 * 60 * 60);

    if (String(incStation) === String(newStation) && incCategory === newCategory && timeDiffHours <= 2) {
      const incLat = parseFloat(inc.latitude);
      const incLng = parseFloat(inc.longitude);
      const distKm = haversineDistance(newLat, newLng, incLat, incLng);

      if (distKm <= 0.2) { // within 200 meters
        return {
          isDuplicate: true,
          reason: `Potential duplicate incident FIR found in same station (${newStation}) within ${Math.round(distKm * 1000)}m and ${timeDiffHours.toFixed(1)}h (Ref: ${incFir})`
        };
      }
    }
  }

  return { isDuplicate: false };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

module.exports = {
  validateIncidentPayload,
  checkDuplicateIncident,
  ALLOWED_CRIME_MAJOR_HEADS,
  VALID_MO_TAGS,
  haversineDistance
};
