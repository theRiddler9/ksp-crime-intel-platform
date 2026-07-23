/**
 * Catalyst NoSQL Graph Edge Helper for KSP Crime Intel Platform
 */

const memoryNoSQL = {
  suspect_suspect_edges: [],
  suspect_location_edges: [],
  suspect_victim_edges: [],
  mo_cluster_edges: []
};

class NoSQLClient {
  constructor(catalystApp = null) {
    this.catalystApp = catalystApp;
  }

  async addEdge(collection, edgeData) {
    const edge = {
      edge_id: edgeData.edge_id || `edge_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      created_at: new Date().toISOString(),
      ...edgeData
    };

    if (!memoryNoSQL[collection]) {
      memoryNoSQL[collection] = [];
    }
    memoryNoSQL[collection].push(edge);
    return edge;
  }

  async getEdgesByOffender(offenderId) {
    const suspectEdges = (memoryNoSQL.suspect_suspect_edges || []).filter(
      e => e.source_offender_id === offenderId || e.target_offender_id === offenderId
    );

    const locationEdges = (memoryNoSQL.suspect_location_edges || []).filter(
      e => e.offender_id === offenderId
    );

    const victimEdges = (memoryNoSQL.suspect_victim_edges || []).filter(
      e => e.offender_id === offenderId
    );

    return {
      offender_id: offenderId,
      suspect_network: suspectEdges,
      location_links: locationEdges,
      victim_links: victimEdges
    };
  }

  async getMoClusterEdges(firNumber) {
    return (memoryNoSQL.mo_cluster_edges || []).filter(
      e => e.source_fir === firNumber || e.target_fir === firNumber
    );
  }

  async getFullGraph() {
    const nodes = new Map();
    const edges = [];

    // Collect suspect-suspect edges
    (memoryNoSQL.suspect_suspect_edges || []).forEach(e => {
      nodes.set(e.source_offender_id, { id: e.source_offender_id, label: e.source_offender_id, type: 'SUSPECT' });
      nodes.set(e.target_offender_id, { id: e.target_offender_id, label: e.target_offender_id, type: 'SUSPECT' });
      edges.push({
        id: e.edge_id,
        source: e.source_offender_id,
        target: e.target_offender_id,
        relation: e.relation_type,
        weight: e.weight || 1
      });
    });

    // Collect suspect-location edges
    (memoryNoSQL.suspect_location_edges || []).forEach(e => {
      nodes.set(e.offender_id, { id: e.offender_id, label: e.offender_id, type: 'SUSPECT' });
      nodes.set(e.location_id, { id: e.location_id, label: e.location_id, type: 'LOCATION' });
      edges.push({
        id: e.edge_id,
        source: e.offender_id,
        target: e.location_id,
        relation: 'LOCATED_AT',
        weight: e.weight || 1
      });
    });

    // Collect MO cluster edges
    (memoryNoSQL.mo_cluster_edges || []).forEach(e => {
      nodes.set(e.source_fir, { id: e.source_fir, label: e.source_fir, type: 'INCIDENT' });
      nodes.set(e.target_fir, { id: e.target_fir, label: e.target_fir, type: 'INCIDENT' });
      edges.push({
        id: e.edge_id,
        source: e.source_fir,
        target: e.target_fir,
        relation: 'SIMILAR_MO',
        weight: e.similarity_score
      });
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }

  seedData(initialGraph) {
    Object.keys(initialGraph).forEach(key => {
      if (memoryNoSQL[key]) {
        memoryNoSQL[key] = [...initialGraph[key]];
      }
    });
  }
}

module.exports = NoSQLClient;
