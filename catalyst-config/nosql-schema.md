# NoSQL Schema — Graph Edges (Catalyst NoSQL)

## Purpose

Models suspect–victim–location relationships as a graph so `network-analysis`
(frontend) and `mo_similarity_matcher.py` can do cheap multi-hop traversal
("who else is connected to this person/place, 2–3 hops out") without
recursive SQL joins across the Data Store.

Catalyst NoSQL is a document store, not a native graph DB — there is no
traversal engine built in. The graph is modeled manually as two collections,
and all traversal logic lives in application code (Node functions / Python).

**Write ownership:** `event-functions/crosslink-on-insert` is the only writer.
Everything else reads.

---

## Collections

### `nodes`

One document per person or location that appears in any incident.

```json
{
  "node_id":      "string, format: '{node_type}_{ref_id}'  e.g. 'offender_104'",
  "node_type":    "'offender' | 'victim' | 'location'",
  "ref_id":       "integer — FK back to Data Store (offenders.offender_id / victims.victim_id / locations.location_id)",
  "display_name": "string — denormalized for fast rendering without a Data Store round-trip",
  "created_at":   "ISO 8601 datetime",
  "updated_at":   "ISO 8601 datetime"
}
```

`node_id` is deterministic (`offender_104`, `location_37`) so the writer can
upsert idempotently — re-processing the same incident doesn't create
duplicate nodes.

### `edges`

One document per relationship instance, scoped to the incident that created it.

```json
{
  "edge_id":       "string, format: 'edge_{incident_id}_{from_node_id}_{to_node_id}'",
  "from_node_id":  "string — FK to nodes.node_id",
  "to_node_id":    "string — FK to nodes.node_id",
  "relation_type": "'co-offender' | 'victim-of' | 'present-at' | 'co-location'",
  "incident_id":   "integer — FK back to Data Store incidents.incident_id",
  "weight":        "number — default 1; incremented if the same relationship recurs across incidents",
  "created_at":    "ISO 8601 datetime"
}
```

---

## Edge direction convention (fixed — do not deviate)

To keep traversal code predictable, edges are always written in one direction:

| relation_type   | from_node_id     | to_node_id       | meaning |
|---|---|---|---|
| `co-offender`    | offender          | offender          | two offenders linked via a shared incident |
| `victim-of`       | offender           | victim             | offender is accused/suspect against this victim |
| `present-at`        | offender or victim  | location             | person was present at this location for this incident |
| `co-location`         | location             | location              | (rare) two locations linked via a common offender pattern — used by MO matcher only |

`crosslink-on-insert` always writes in this direction. Readers (frontend,
matcher) must query both `from_node_id` and `to_node_id` fields if they need
an undirected traversal (e.g. "everyone connected to X" regardless of who
was `from`).

---

## Expected query patterns (design target — write your indexes/keys for these)

1. **2-hop network expansion** (`network-analysis` feature):
   `edges WHERE from_node_id = X` → collect `to_node_id`s → repeat one more
   level. Implemented as 2–3 sequential key-based lookups, not a join.

2. **"Who else touched this location recently"** (`mo_similarity_matcher.py`):
   `edges WHERE to_node_id = {location_node_id} AND relation_type = 'present-at'`,
   filtered further by `incident_id`'s recency (cross-reference against
   Data Store `incidents.occurred_at` for the matched `incident_id`s).

3. **Co-offender clusters** (`mo_similarity_matcher.py` / `hotspot_clustering.py`
   context building): `edges WHERE relation_type = 'co-offender'` for a given
   offender node, to check if a new incident's offender already has a known
   network.

4. **Render full subgraph for one incident** (`network-analysis` drill-down):
   `edges WHERE incident_id = N` → resolve all referenced `nodes`.

---

## Write flow (from `crosslink-on-insert`)

```
1. New row lands in Data Store `incidents` (Signal fires)
2. Read incident_offenders, incident_victims, location_id for this incident_id
3. For each offender/victim/location involved:
     upsert into `nodes` (idempotent on node_id)
4. Write edges:
     - co-offender edges between every pair of offenders on this incident
     - victim-of edges from each offender to each victim on this incident
     - present-at edges from each offender/victim to the incident's location
5. Invoke mo_similarity_matcher.py with the new node/edge context
     -> may write additional co-location edges or trigger a flag
```

---

## Schema discipline

- Keep this file in sync by hand whenever `crosslink-on-insert` changes what
  it writes — there is no schema enforcement in NoSQL, so drift here means
  silent bugs in `network-analysis` rendering or the MO matcher.
- Mirror `node_type` and `relation_type` enums in `client/src/types/` exactly
  as listed above; do not introduce new values without updating this table.
