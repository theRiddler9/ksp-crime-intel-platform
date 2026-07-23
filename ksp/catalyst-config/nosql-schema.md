# Catalyst NoSQL Schema — Relationship Graph Store

The Catalyst NoSQL database stores graph-style relationship edges to support multi-hop network queries (`network-analysis`) and Modus Operandi (MO) similarity traversals without heavy SQL joins.

## Collections & Edge Structures

### 1. `suspect_suspect_edges`
Connects suspects/offenders who co-occurred in FIRs or share network links.
```json
{
  "edge_id": "sse_8f9a2b1c",
  "source_offender_id": "OFF_0012",
  "target_offender_id": "OFF_0045",
  "relation_type": "CO_ACCUSED",
  "shared_incidents": ["FIR_2026_0012", "FIR_2026_0089"],
  "weight": 2.0,
  "last_seen": "2026-07-15T14:30:00Z"
}
```

### 2. `suspect_location_edges`
Tracks suspect presence across stations, hot spots, and incident coordinates.
```json
{
  "edge_id": "sle_3d4e5f6a",
  "offender_id": "OFF_0012",
  "location_id": "LOC_560001",
  "district_id": "BENGALURU_CITY",
  "incident_count": 3,
  "crime_types": ["THEFT_CHAIN_SNATCHING", "BURGLARY"],
  "weight": 3.0,
  "updated_at": "2026-07-20T11:15:00Z"
}
```

### 3. `suspect_victim_edges`
Tracks direct connections between suspects and victims across cases.
```json
{
  "edge_id": "sve_1a2b3c4d",
  "offender_id": "OFF_0012",
  "victim_id": "VIC_9901",
  "relation_type": "TARGETED",
  "associated_fir": "FIR_2026_0012",
  "created_at": "2026-07-10T09:00:00Z"
}
```

### 4. `mo_cluster_edges`
Links incidents and offenders sharing highly similar Modus Operandi signatures based on TF-IDF cosine similarity calculations.
```json
{
  "edge_id": "moe_77ab88cd",
  "source_fir": "FIR_2026_0102",
  "target_fir": "FIR_2026_0155",
  "shared_mo_tags": ["OTP_FRAUD", "SIM_SWAP", "BANK_IMPERSONATION"],
  "similarity_score": 0.892,
  "auto_linked": true,
  "verified_by_investigator": false,
  "created_at": "2026-07-22T18:00:00Z"
}
```

## Performance & Query Specifications
- Indexed fields: `offender_id`, `location_id`, `source_fir`, `target_fir`.
- 2-hop traversal query time threshold: `< 50ms`.
- Graph visualizer payload format: Compatible with Cytoscape.js and `react-force-graph` nodes/edges JSON array format.
