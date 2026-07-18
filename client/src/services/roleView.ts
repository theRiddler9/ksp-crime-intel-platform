// ──────────────────────────────────────────────
// Role-view service — calls role-view Function
// TODO: Replace mock calls with Catalyst SDK
// ──────────────────────────────────────────────

import type { UserRole, ConstablePayload, SHOPayload, SPPayload, AnalystPayload, DGPPayload } from '../types/role';
import { simulateDelay } from './api';
import {
  mockIncidentSummaries, mockFlags, mockFlagStats,
  mockNetworkGraph, mockHotspots, mockDistrictRisks,
  mockTrendData, mockDashboardStats,
} from './mockData';

export async function getConstablePayload(): Promise<ConstablePayload> {
  await simulateDelay(400);
  const summaries = mockIncidentSummaries();
  return {
    stationIncidents: summaries.filter(i => i.policeStation === 'Cubbon Park PS').slice(0, 20),
    myBeatArea: { lat: 12.9716, lng: 77.5946, radius: 2000 },
    recentCount: 12,
    pendingFIRs: 3,
  };
}

export async function getSHOPayload(): Promise<SHOPayload> {
  await simulateDelay(500);
  const stats = mockDashboardStats();
  return {
    stationIncidents: mockIncidentSummaries().filter(i => i.policeStation === 'Koramangala PS').slice(0, 40),
    flags: mockFlags().filter(f => f.status === 'pending').slice(0, 10),
    flagStats: mockFlagStats(),
    trendData: mockTrendData(),
    hotspots: mockHotspots().filter(h => h.location.district === 'Bengaluru Urban'),
    stationStats: {
      totalIncidents: stats.incidentsThisMonth,
      pendingInvestigations: 18,
      closureRate: stats.closureRate,
      avgResponseTime: stats.avgResponseTimeHrs,
    },
  };
}

export async function getSPPayload(): Promise<SPPayload> {
  await simulateDelay(500);
  return {
    districtIncidents: mockIncidentSummaries().filter(i => i.district === 'Bengaluru Urban'),
    flags: mockFlags(),
    flagStats: mockFlagStats(),
    networkData: mockNetworkGraph(),
    hotspots: mockHotspots(),
    districtRisks: mockDistrictRisks(),
    trendData: mockTrendData(),
    escalatedFlags: mockFlags().filter(f => f.status === 'escalated'),
  };
}

export async function getAnalystPayload(): Promise<AnalystPayload> {
  await simulateDelay(600);
  return {
    allIncidents: mockIncidentSummaries(),
    flags: mockFlags(),
    flagStats: mockFlagStats(),
    networkData: mockNetworkGraph(),
    hotspots: mockHotspots(),
    districtRisks: mockDistrictRisks(),
    trendData: mockTrendData(),
    moMatches: [
      { incidentA: 'INC-2025-001', incidentB: 'INC-2025-015', similarityScore: 0.87 },
      { incidentA: 'INC-2025-003', incidentB: 'INC-2025-022', similarityScore: 0.82 },
      { incidentA: 'INC-2025-007', incidentB: 'INC-2025-031', similarityScore: 0.79 },
    ],
  };
}

export async function getDGPPayload(): Promise<DGPPayload> {
  await simulateDelay(500);
  const stats = mockDashboardStats();
  return {
    stateOverview: {
      totalIncidents: stats.totalIncidents,
      totalDistricts: 15,
      criticalFlags: mockFlags().filter(f => f.severity === 'critical' && f.status === 'pending').length,
      overallCrimeRate: 14.2,
      changeFromLastMonth: stats.changeFromLastMonth,
    },
    districtRisks: mockDistrictRisks(),
    trendData: mockTrendData(),
    escalatedFlags: mockFlags().filter(f => f.status === 'escalated'),
    briefAvailable: true,
  };
}

export async function getRolePayload(role: UserRole) {
  switch (role) {
    case 'constable': return getConstablePayload();
    case 'sho': return getSHOPayload();
    case 'sp': return getSPPayload();
    case 'analyst': return getAnalystPayload();
    case 'dgp': return getDGPPayload();
  }
}
