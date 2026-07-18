// ──────────────────────────────────────────────
// Review decision service — calls review-decision Function
// TODO: Replace mock calls with Catalyst SDK
// ──────────────────────────────────────────────

import type { ReviewDecisionPayload } from '../types/flag';
import { simulateDelay } from './api';

export async function submitReviewDecision(
  payload: ReviewDecisionPayload,
): Promise<{ success: boolean; circuitTriggered: boolean }> {
  // TODO: POST to review-decision Function → triggers Circuit
  await simulateDelay(500);
  console.log('[Mock] Review decision submitted:', payload);
  return {
    success: true,
    circuitTriggered: payload.action === 'escalate',
  };
}
