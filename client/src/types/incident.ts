// ──────────────────────────────────────────────
// Incident / FIR types — mirrors Data Store schema
// ──────────────────────────────────────────────

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export type IncidentStatus =
  | 'reported'
  | 'under_investigation'
  | 'chargesheet_filed'
  | 'closed'
  | 'reopened';

export type CrimeCategory =
  | 'theft'
  | 'burglary'
  | 'robbery'
  | 'assault'
  | 'murder'
  | 'kidnapping'
  | 'cybercrime'
  | 'fraud'
  | 'narcotics'
  | 'domestic_violence'
  | 'sexual_offense'
  | 'arson'
  | 'extortion'
  | 'vehicle_theft'
  | 'chain_snatching'
  | 'other';

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface Location {
  id: string;
  district: string;
  subdivision: string;
  policeStation: string;
  beat: string;
  address: string;
  coordinates: GeoCoordinates;
  pincode: string;
}

export interface Offender {
  id: string;
  name: string;
  aliases: string[];
  age: number;
  gender: 'male' | 'female' | 'other';
  description: string;
  knownAddresses: string[];
  linkedIncidentIds: string[];
  photoUrl?: string;
}

export interface Victim {
  id: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  contactInfo?: string;
  statement?: string;
}

export interface ModusOperandi {
  description: string;
  tags: string[];
  weaponsUsed: string[];
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' | 'unknown';
  entryMethod?: string;
}

export interface Incident {
  id: string;
  firNumber: string;
  crimeCategory: CrimeCategory;
  ipcSections: string[];
  title: string;
  description: string;
  dateReported: string;     // ISO 8601
  dateOfOccurrence: string; // ISO 8601
  status: IncidentStatus;
  severity: SeverityLevel;
  location: Location;
  offenders: Offender[];
  victims: Victim[];
  modusOperandi: ModusOperandi;
  investigatingOfficer: string;
  stationId: string;
  districtId: string;
  linkedIncidentIds: string[];
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentSummary {
  id: string;
  firNumber: string;
  crimeCategory: CrimeCategory;
  title: string;
  severity: SeverityLevel;
  status: IncidentStatus;
  dateReported: string;
  district: string;
  policeStation: string;
}
