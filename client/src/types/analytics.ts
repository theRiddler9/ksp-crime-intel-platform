// ──────────────────────────────────────────────
// Analytics / ML scoring types
// ──────────────────────────────────────────────

import type { CrimeCategory, SeverityLevel } from './incident';

export interface HotspotScore {
  id: string;
  clusterId: number;
  location: {
    lat: number;
    lng: number;
    district: string;
    area: string;
  };
  density: number;          // incident count in cluster
  riskLevel: SeverityLevel;
  radius: number;           // meters
  crimeTypes: CrimeCategory[];
  score: number;            // 0–100
  lastUpdated: string;
}

export interface TrendDataPoint {
  date: string;             // ISO date (YYYY-MM-DD)
  total: number;
  byCategory: Partial<Record<CrimeCategory, number>>;
  district?: string;
}

export interface DistrictRisk {
  districtId: string;
  districtName: string;
  riskScore: number;        // 0–100
  riskLevel: SeverityLevel;
  incidentCount: number;
  trend: 'rising' | 'stable' | 'declining';
  changePercent: number;    // positive = rising
  topCrimes: CrimeCategory[];
  predictedNextMonth: number;
}

export interface RiskForecastData {
  districts: DistrictRisk[];
  stateAverage: number;
  generatedAt: string;
  modelConfidence: number;  // 0–1
}

export interface AnomalyDetection {
  id: string;
  type: 'spike' | 'unusual_pattern' | 'spatial_cluster' | 'temporal_anomaly';
  description: string;
  affectedArea: string;
  severity: SeverityLevel;
  score: number;
  detectedAt: string;
}

export interface DashboardStats {
  totalIncidents: number;
  pendingFlags: number;
  activeHotspots: number;
  closureRate: number;
  avgResponseTimeHrs: number;
  incidentsToday: number;
  incidentsThisWeek: number;
  incidentsThisMonth: number;
  changeFromLastMonth: number;
}
