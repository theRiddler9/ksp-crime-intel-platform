# Karnataka SCRB Crime Intel Platform — System Architecture

## 1. Executive Guiding Principle

Everything flows through one single intake point (`intake-incident`), gets auto-enriched by Catalyst Event Functions & Signals, gets scored/clustered by Machine Learning models (online + offline), and is served back out through role-shaped read APIs (`role-view`).

Nothing role-specific lives in the write path — role logic is entirely contained within `role-view`.

```
Incident/FIR intake (HTTP)
      │
      ▼
[functions/intake-incident] ──writes──► Data Store (relational: incidents, offenders, locations...)
      │
      ▼ (Signal: on insert)
[event-functions/crosslink-on-insert] ──writes──► NoSQL (graph edges: suspect-victim-location)
      │                                    └──► mo_similarity_matcher.py
      ▼
[event-functions/flag-detector] ──runs──► Python ML (hotspot, trend anomaly, incident anomaly) + Zia AutoML
      │
      ▼
Flags table (Data Store)
      │
      ▼
[functions/review-decision] ──triggers──► Circuits (circuits/review-escalation-flow.json)
      │                                       │
      ▼                                       ▼
  Mail/Push (SP alert)              [functions/dgp-summary] ──► QuickML (plain-language brief)
      │
      ▼
[functions/role-view] ◄── reads Cache (precomputed scores) + Data Store + NoSQL
      │
      ▼
[functions/flags] ◄── serves pending flags for alert-review UI

[cron-jobs/nightly-batch-scoring] ──recomputes──► full dataset risk & hotspots ──► Catalyst Cache
```

---

## 2. Serverless Function Specifications

| Component | Trigger | Role / Responsibility |
|---|---|---|
| `intake-incident` | HTTP POST | Single entry point for FIR intake. Validates mandatory fields, checks duplicates, writes relational rows. |
| `crosslink-on-insert` | Event Signal (`onInsert`) | Extracts suspect/victim/location entities into NoSQL graph edges. Executes MO similarity matcher. |
| `flag-detector` | Event Signal / Chained | Runs spatial clustering (HDBSCAN/DBSCAN), 30-day trend anomaly detector, Zia AutoML. Inserts rows into `flags`. |
| `role-view` | HTTP GET | Reads Cache + Data Store + NoSQL. Server-side role-gated payload builder (`Constable`, `SHO`, `SP`, `Analyst`, `DGP`). |
| `flags` | HTTP GET/POST | Serves pending/acknowledged/escalated/dismissed flag queues for the alert review interface. |
| `review-decision` | HTTP POST | Records human officer sign-off decision (Acknowledge / Escalate / Dismiss). Triggers Catalyst Circuit. |
| `dgp-summary` | HTTP GET | Calls QuickML (RAG over recent FIRs and flags) to output executive plain-language briefs. |
| `nightly-batch-scoring` | Cron (`0 2 * * *`) | Recomputes full-dataset spatial clusters & baseline trend scores, updates Catalyst Cache. |

---

## 3. Storage Layer & Data Security

1. **Relational Data Store:** Primary system of record for `incidents`, `offenders`, `locations`, `flags`, `review_decisions`, `action_outcomes`.
2. **NoSQL Graph Store:** Multi-hop relationship edges (`suspect_suspect_edges`, `suspect_location_edges`, `suspect_victim_edges`, `mo_cluster_edges`) powering Cytoscape.js network visualizer.
3. **Catalyst Cache:** Segmented key-value store holding precomputed hotspot scores (`hotspot_scores_statewide`, `risk_forecast:*`) for O(1) dashboard reads.
4. **Data Security & Privacy:** Victim identification fields are flagged `protected_flag = true` and stripped from non-authorized roles (e.g. Constable payloads).
