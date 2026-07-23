'use strict';

/**
 * functions/shared/nosqlClient.js
 *
 * Wrapper around Catalyst NoSQL, modeling the graph described in
 * catalyst-config/nosql-schema.md (two collections: nodes, edges).
 *
 * This is the ONLY place that should know the raw NoSQL collection names —
 * crosslink-on-insert, mo_similarity_matcher's Node caller, and role-view
 * all go through these functions instead of touching collections directly.
 */

const catalyst = require('zcatalyst-sdk-node');

const NODES_TABLE = 'nodes';
const EDGES_TABLE = 'edges';

function getNoSQL(context) {
  const app = catalyst.initialize(context);
  return app.nosql();
}

/** Deterministic node_id so upserts are idempotent. See nosql-schema.md. */
function buildNodeId(nodeType, refId) {
  return `${nodeType}_${refId}`;
}

function buildEdgeId(incidentId, fromNodeId, toNodeId) {
  return `edge_${incidentId}_${fromNodeId}_${toNodeId}`;
}

/**
 * Upsert a node. Idempotent — safe to call repeatedly for the same person/location.
 */
async function upsertNode(context, { nodeType, refId, displayName }) {
  const nosql = getNoSQL(context);
  const nodeId = buildNodeId(nodeType, refId);
  const table = nosql.table(NODES_TABLE);

  const now = new Date().toISOString();
  try {
    const existing = await table.get(nodeId).catch(() => null);
    if (existing) {
      await table.update(nodeId, { display_name: displayName, updated_at: now });
    } else {
      await table.insert({
        node_id: nodeId,
        node_type: nodeType,
        ref_id: refId,
        display_name: displayName,
        created_at: now,
        updated_at: now,
      });
    }
    return nodeId;
  } catch (err) {
    throw new Error(`[nosqlClient.upsertNode] ${nodeId} failed: ${err.message}`);
  }
}

/**
 * Write an edge. If the same relationship already exists (rare — same
 * incident reprocessed), increments weight instead of duplicating.
 */
async function writeEdge(context, { fromNodeId, toNodeId, relationType, incidentId, weight = 1 }) {
  const nosql = getNoSQL(context);
  const table = nosql.table(EDGES_TABLE);
  const edgeId = buildEdgeId(incidentId, fromNodeId, toNodeId);

  try {
    const existing = await table.get(edgeId).catch(() => null);
    if (existing) {
      await table.update(edgeId, { weight: (existing.weight || 1) + weight });
    } else {
      await table.insert({
        edge_id: edgeId,
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        relation_type: relationType,
        incident_id: incidentId,
        weight,
        created_at: new Date().toISOString(),
      });
    }
    return edgeId;
  } catch (err) {
    throw new Error(`[nosqlClient.writeEdge] ${edgeId} failed: ${err.message}`);
  }
}

/**
 * One-hop expansion: all edges where the given node is either endpoint.
 * Used to build 2-3 hop traversal by calling this repeatedly on the frontier.
 */
async function getEdgesForNode(context, nodeId, { relationType } = {}) {
  const nosql = getNoSQL(context);
  const table = nosql.table(EDGES_TABLE);

  try {
    const outgoing = await table.query(`from_node_id = '${nodeId}'`);
    const incoming = await table.query(`to_node_id = '${nodeId}'`);
    let edges = [...outgoing, ...incoming];
    if (relationType) {
      edges = edges.filter((e) => e.relation_type === relationType);
    }
    return edges;
  } catch (err) {
    throw new Error(`[nosqlClient.getEdgesForNode] ${nodeId} failed: ${err.message}`);
  }
}

/**
 * Multi-hop network expansion, used by network-analysis (via role-view)
 * and mo_similarity_matcher for proximity checks.
 *
 * Returns { nodes: [...], edges: [...] } — a renderable subgraph.
 */
async function expandNetwork(context, startNodeId, hops = 2) {
  const visitedNodeIds = new Set([startNodeId]);
  const collectedEdges = [];
  let frontier = [startNodeId];

  for (let hop = 0; hop < hops; hop += 1) {
    const nextFrontier = [];
    for (const nodeId of frontier) {
      const edges = await getEdgesForNode(context, nodeId);
      for (const edge of edges) {
        collectedEdges.push(edge);
        const neighbor = edge.from_node_id === nodeId ? edge.to_node_id : edge.from_node_id;
        if (!visitedNodeIds.has(neighbor)) {
          visitedNodeIds.add(neighbor);
          nextFrontier.push(neighbor);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  const nosql = getNoSQL(context);
  const nodesTable = nosql.table(NODES_TABLE);
  const nodes = await Promise.all(
    [...visitedNodeIds].map((id) => nodesTable.get(id).catch(() => null))
  );

  return {
    nodes: nodes.filter(Boolean),
    edges: collectedEdges,
  };
}

/**
 * All edges tied to a single incident — used to render a per-incident
 * subgraph (network-analysis drill-down) or to rebuild context for the
 * MO matcher.
 */
async function getEdgesForIncident(context, incidentId) {
  const nosql = getNoSQL(context);
  const table = nosql.table(EDGES_TABLE);
  try {
    return await table.query(`incident_id = ${incidentId}`);
  } catch (err) {
    throw new Error(`[nosqlClient.getEdgesForIncident] incident ${incidentId} failed: ${err.message}`);
  }
}

module.exports = {
  buildNodeId,
  buildEdgeId,
  upsertNode,
  writeEdge,
  getEdgesForNode,
  expandNetwork,
  getEdgesForIncident,
};
