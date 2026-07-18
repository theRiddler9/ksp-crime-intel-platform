// ──────────────────────────────────────────────
// Role & auth types
// ──────────────────────────────────────────────

import type { IncidentSummary } from './incident';
import type { Flag, FlagStats } from './flag';
import type { HotspotScore, TrendDataPoint, DistrictRisk } from './analytics';
import type { NetworkGraphData } from './network';

export type UserRole = 'constable' | 'sho' | 'sp' | 'analyst' | 'dgp';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  badgeNumber: string;
  station: string;
  district: string;
  avatarUrl?: string;
}

/** What each role sees on their dashboard — shaped by `role-view` Function */
export interface RoleFeatureAccess {
  crimeMap: boolean;
  networkAnalysis: boolean;
  riskForecast: boolean;
  alertReview: boolean;
  plainLanguageBrief: boolean;
  incidentSubmission: boolean;
  fullIncidentList: boolean;
}

export const ROLE_FEATURES: Record<UserRole, RoleFeatureAccess> = {
  constable: {
    crimeMap: true,
    networkAnalysis: false,
    riskForecast: false,
    alertReview: false,
    plainLanguageBrief: false,
    incidentSubmission: true,
    fullIncidentList: false,
  },
  sho: {
    crimeMap: true,
    networkAnalysis: false,
    riskForecast: true,
    alertReview: true,
    plainLanguageBrief: false,
    incidentSubmission: true,
    fullIncidentList: true,
  },
  sp: {
    crimeMap: true,
    networkAnalysis: true,
    riskForecast: true,
    alertReview: true,
    plainLanguageBrief: false,
    incidentSubmission: false,
    fullIncidentList: true,
  },
  analyst: {
    crimeMap: true,
    networkAnalysis: true,
    riskForecast: true,
    alertReview: true,
    plainLanguageBrief: false,
    incidentSubmission: false,
    fullIncidentList: true,
  },
  dgp: {
    crimeMap: true,
    networkAnalysis: false,
    riskForecast: true,
    alertReview: true,
    plainLanguageBrief: true,
    incidentSubmission: false,
    fullIncidentList: false,
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  constable: 'Constable',
  sho: 'Station House Officer',
  sp: 'Superintendent of Police',
  analyst: 'Crime Analyst',
  dgp: 'Director General of Police',
};

export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  constable: 'PC',
  sho: 'SHO',
  sp: 'SP',
  analyst: 'Analyst',
  dgp: 'DGP',
};

// ─── Per-role payload shapes from role-view Function ───

export interface ConstablePayload {
  stationIncidents: IncidentSummary[];
  myBeatArea: { lat: number; lng: number; radius: number };
  recentCount: number;
  pendingFIRs: number;
}

export interface SHOPayload {
  stationIncidents: IncidentSummary[];
  flags: Flag[];
  flagStats: FlagStats;
  trendData: TrendDataPoint[];
  hotspots: HotspotScore[];
  stationStats: {
    totalIncidents: number;
    pendingInvestigations: number;
    closureRate: number;
    avgResponseTime: number;
  };
}

export interface SPPayload {
  districtIncidents: IncidentSummary[];
  flags: Flag[];
  flagStats: FlagStats;
  networkData: NetworkGraphData;
  hotspots: HotspotScore[];
  districtRisks: DistrictRisk[];
  trendData: TrendDataPoint[];
  escalatedFlags: Flag[];
}

export interface AnalystPayload {
  allIncidents: IncidentSummary[];
  flags: Flag[];
  flagStats: FlagStats;
  networkData: NetworkGraphData;
  hotspots: HotspotScore[];
  districtRisks: DistrictRisk[];
  trendData: TrendDataPoint[];
  moMatches: Array<{
    incidentA: string;
    incidentB: string;
    similarityScore: number;
  }>;
}

export interface DGPPayload {
  stateOverview: {
    totalIncidents: number;
    totalDistricts: number;
    criticalFlags: number;
    overallCrimeRate: number;
    changeFromLastMonth: number;
  };
  districtRisks: DistrictRisk[];
  trendData: TrendDataPoint[];
  escalatedFlags: Flag[];
  briefAvailable: boolean;
}
