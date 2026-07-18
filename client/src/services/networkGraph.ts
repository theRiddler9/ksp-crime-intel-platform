// ──────────────────────────────────────────────
// Network graph service — fetches NoSQL graph data
// TODO: Replace mock calls with Catalyst SDK
// ──────────────────────────────────────────────

import type { NetworkGraphData, CytoscapeElement } from '../types/network';
import { simulateDelay } from './api';
import { mockNetworkGraph } from './mockData';

export async function getNetworkGraph(
  _centerId?: string,
): Promise<NetworkGraphData> {
  await simulateDelay(400);
  return mockNetworkGraph();
}

/** Convert our graph data to Cytoscape.js element format */
export function toCytoscapeElements(data: NetworkGraphData): CytoscapeElement[] {
  const nodeElements: CytoscapeElement[] = data.nodes.map(node => ({
    data: {
      id: node.id,
      label: node.label,
      type: node.type,
      ...node.metadata,
    },
    classes: node.type,
  }));

  const edgeElements: CytoscapeElement[] = data.edges.map(edge => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.relationship.replace(/_/g, ' '),
      weight: edge.weight,
      relationship: edge.relationship,
      ...edge.metadata,
    },
    classes: edge.relationship,
  }));

  return [...nodeElements, ...edgeElements];
}
