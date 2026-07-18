// ──────────────────────────────────────────────
// Network / Graph types — NoSQL graph edges
// ──────────────────────────────────────────────

export type NodeType = 'suspect' | 'victim' | 'location' | 'incident';

export type EdgeRelationship =
  | 'accused_in'       // suspect → incident
  | 'victim_of'        // victim → incident
  | 'occurred_at'      // incident → location
  | 'associated_with'  // suspect → suspect
  | 'resides_at'       // suspect → location
  | 'mo_similar'       // incident → incident (MO match)
  | 'frequents';       // suspect → location

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  metadata: {
    name?: string;
    district?: string;
    crimeCategory?: string;
    severity?: string;
    incidentCount?: number;
    riskScore?: number;
    aliases?: string[];
    [key: string]: unknown;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: EdgeRelationship;
  weight: number;       // 0–1, strength of connection
  metadata: {
    incidentId?: string;
    moSimilarityScore?: number;
    dateEstablished?: string;
    [key: string]: unknown;
  };
}

export interface NetworkGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Cytoscape-compatible element format */
export interface CytoscapeNode {
  data: {
    id: string;
    label: string;
    type: NodeType;
    [key: string]: unknown;
  };
  classes?: string;
}

export interface CytoscapeEdge {
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    weight: number;
    relationship: EdgeRelationship;
    [key: string]: unknown;
  };
  classes?: string;
}

export type CytoscapeElement = CytoscapeNode | CytoscapeEdge;
