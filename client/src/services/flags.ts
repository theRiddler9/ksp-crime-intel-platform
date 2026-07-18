// ──────────────────────────────────────────────
// Flags service — calls flags Function
// TODO: Replace mock calls with Catalyst SDK
// ──────────────────────────────────────────────

import type { Flag, FlagStats } from '../types/flag';
import { simulateDelay } from './api';
import { mockFlags, mockFlagStats } from './mockData';

export async function getFlags(): Promise<Flag[]> {
  await simulateDelay(300);
  return mockFlags();
}

export async function getPendingFlags(): Promise<Flag[]> {
  await simulateDelay(200);
  return mockFlags().filter(f => f.status === 'pending');
}

export async function getEscalatedFlags(): Promise<Flag[]> {
  await simulateDelay(200);
  return mockFlags().filter(f => f.status === 'escalated');
}

export async function getFlagById(id: string): Promise<Flag | null> {
  await simulateDelay(150);
  return mockFlags().find(f => f.id === id) ?? null;
}

export async function getFlagStats(): Promise<FlagStats> {
  await simulateDelay(200);
  return mockFlagStats();
}
