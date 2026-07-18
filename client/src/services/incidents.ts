// ──────────────────────────────────────────────
// Incidents service — calls intake-incident Function
// TODO: Replace mock calls with Catalyst SDK
// ──────────────────────────────────────────────

import type { Incident, IncidentSummary } from '../types/incident';
import { simulateDelay } from './api';
import { mockIncidents, mockIncidentSummaries } from './mockData';

export async function getIncidents(): Promise<IncidentSummary[]> {
  await simulateDelay(300);
  return mockIncidentSummaries();
}

export async function getIncidentById(id: string): Promise<Incident | null> {
  await simulateDelay(200);
  return mockIncidents().find(i => i.id === id) ?? null;
}

export async function getIncidentsByDistrict(district: string): Promise<IncidentSummary[]> {
  await simulateDelay(300);
  return mockIncidentSummaries().filter(i => i.district === district);
}

export async function getIncidentsByStation(station: string): Promise<IncidentSummary[]> {
  await simulateDelay(300);
  return mockIncidentSummaries().filter(i => i.policeStation === station);
}

export async function getRecentIncidents(days: number = 7): Promise<IncidentSummary[]> {
  await simulateDelay(300);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return mockIncidentSummaries().filter(
    i => new Date(i.dateReported) >= cutoff,
  );
}

export async function submitIncident(
  _data: Partial<Incident>,
): Promise<{ success: boolean; id: string }> {
  // TODO: POST to intake-incident Function
  await simulateDelay(500);
  return { success: true, id: `INC-${Date.now()}` };
}
