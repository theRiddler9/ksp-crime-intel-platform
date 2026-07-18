// ──────────────────────────────────────────────
// Flag types — ML-generated alerts for review
// ──────────────────────────────────────────────

import type { SeverityLevel } from './incident';

export type FlagType =
  | 'hotspot'           // HDBSCAN cluster detected
  | 'anomaly'           // statistical anomaly in crime pattern
  | 'mo_match'          // MO similarity match across incidents
  | 'trend_spike'       // unusual spike in a crime type / area
  | 'repeat_offender'   // known offender re-appearing
  | 'network_cluster';  // dense subgraph in suspect network

export type FlagStatus =
  | 'pending'
  | 'acknowledged'
  | 'escalated'
  | 'dismissed';

export type ReviewAction = 'acknowledge' | 'escalate' | 'dismiss';

export interface Flag {
  id: string;
  type: FlagType;
  severity: SeverityLevel;
  title: string;
  description: string;
  relatedIncidentIds: string[];
  relatedOffenderIds: string[];
  affectedArea: string;          // district or station name
  status: FlagStatus;
  confidenceScore: number;       // 0–1, from ML model
  riskScore: number;             // 0–100, from Zia AutoML
  detectedAt: string;            // ISO 8601
  reviewedAt?: string;
  reviewedBy?: string;
  reviewAction?: ReviewAction;
  reviewReason?: string;
  metadata: Record<string, unknown>;
}

export interface FlagStats {
  total: number;
  pending: number;
  acknowledged: number;
  escalated: number;
  dismissed: number;
  bySeverity: Record<SeverityLevel, number>;
  byType: Record<FlagType, number>;
}

export interface ReviewDecisionPayload {
  flagId: string;
  action: ReviewAction;
  reason?: string;
}
