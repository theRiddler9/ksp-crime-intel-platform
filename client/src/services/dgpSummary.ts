// ──────────────────────────────────────────────
// DGP Summary service — calls dgp-summary Function (QuickML/RAG)
// TODO: Replace mock calls with Catalyst SDK
// ──────────────────────────────────────────────

import { simulateDelay } from './api';
import { mockBriefContent } from './mockData';

export interface BriefParams {
  dateFrom?: string;
  dateTo?: string;
  district?: string;
}

export async function generateDGPSummary(
  _params: BriefParams = {},
): Promise<{ content: string; generatedAt: string }> {
  // TODO: POST to dgp-summary Function
  await simulateDelay(1500); // Simulate LLM processing time
  return {
    content: mockBriefContent(),
    generatedAt: new Date().toISOString(),
  };
}

export async function generatePDF(): Promise<{ url: string }> {
  // TODO: Call Catalyst SmartBrowz to generate PDF
  await simulateDelay(2000);
  return { url: '#pdf-placeholder' };
}
