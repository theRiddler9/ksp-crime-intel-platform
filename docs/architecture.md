# KSP Crime Intel Platform — Architecture

## 1. Guiding principle

Everything flows through one intake point, gets auto-enriched by event functions,
gets scored/clustered by ML (online + offline), and is served back out through
role-shaped read APIs. Nothing role-specific lives in the write path — role
logic is entirely in `role-view`.

```
Incident/FIR intake
      │
      ▼
[intake-incident Function] ──writes──► Data Store (relational)
      │                                       │
      ▼ (Signal: on insert)                   │
[crosslink-on-insert Event Fn] ──writes──► NoSQL (graph edges: suspect–victim–location)
      │                                       │
      ▼                                       │
[flag-detector Event Fn] ──runs──► Python (HDBSCAN/NetworkX) + Zia AutoML
      │                                       │
      ▼                                       │
   Flags table (Data Store) ◄─────────────────┘
      │
      ▼
[review-decision Fn] ──triggers──► Circuit (Acknowledge/Escalate/Dismiss)
      │                                       │
      ▼                                       ▼
  Mail/Push (SP alert)              [dgp-summary Fn] ──► QuickML (RAG/LLM) ──► plain-language brief
      │
      ▼
[role-view Fn] ◄── reads Cache (precomputed scores) + Data Store + NoSQL
      │
      ▼
Frontend (per-role dashboard)

[nightly-batch-scoring Cron] ──recomputes──► hotspot/risk scores ──► Cache
```

---

## 2. Frontend architecture

**Stack:** React + TS + Vite, Tailwind, Zoho Catalyst Web SDK, deployed to Catalyst Web Client Hosting.

### Structure & responsibility
- **`services/`** — the *only* layer allowed to call Catalyst SDK / API Gateway. Every feature calls through here (e.g. `services/incidents.ts`, `services/flags.ts`, `services/roleView.ts`). This keeps auth token handling, retries, and endpoint URLs in one place, and makes it trivial to mock for local dev.
- **`views-by-role/`** — thin route-level containers (`ConstableView`, `SHOView`, `SPView`, `AnalystView`, `DGPView`). Each just calls `role-view` for its own payload shape and composes `features/*` components. No business logic here — the backend already shaped the data for that role.
- **`features/`**
  - `crime-map/` — Mapbox GL (preferred over Leaflet if you need vector tiles/heatmap layers for hotspot density; Leaflet is fine and lighter if budget/time is tight — pick one, don't ship both).
  - `network-analysis/` — react-force-graph (WebGL, handles bigger graphs) or Cytoscape.js (better built-in graph algorithms/layouts, easier for MO-similarity highlighting). For a hackathon/demo scale (hundreds of nodes), Cytoscape.js is usually the safer choice — better documented interaction APIs (click-to-expand suspect network).
  - `risk-forecast/` — Recharts trend lines + choropleth/heat overlay on the map component (reuse `crime-map`'s base layer rather than a second map instance).
  - `alert-review/` — flag queue + Acknowledge/Escalate/Dismiss actions, calling `review-decision`.
  - `plain-language-brief/` — renders QuickML output, with a "Generate PDF" button hitting SmartBrowz.
- **`components/`** — dumb, reusable UI (cards, tables, badges, role-gated nav).
- **`types/`** — mirror the Data Store schema + NoSQL edge shape + Function response contracts. Keep these hand-in-sync with `catalyst-config/data-store-schema.sql`.

### Auth & role gating
- Catalyst Authentication issues the session; role claim comes back on login.
- Route guards in `views-by-role` check role client-side for UX, but **never trust this for data access** — `role-view` Function must re-check role server-side and shape/filter data accordingly (a constable's payload should not even include SP-only fields, not just hide them in UI).

---

## 3. Backend architecture (Catalyst Functions)

| Function | Trigger | Responsibility |
|---|---|---|
| `intake-incident` | HTTP (API Gateway) | Single entry point for new incidents/FIRs. Validates, writes to Data Store. This is the only writer of raw incident data. |
| `crosslink-on-insert` | Signal (on Data Store insert) | Extracts suspect/victim/location entities from the new incident, writes/updates edges in NoSQL graph. Calls `mo_similarity_matcher.py` to find MO-pattern matches against existing incidents. |
| `flag-detector` | Signal (chained after crosslink, or on a schedule) | Runs `hotspot_clustering.py` / `trend_anomaly_detector.py` / `incident_anomaly_detector.py` against recent data + calls Zia AutoML for a risk score. Writes rows to a `flags` table. |
| `role-view` | HTTP | Reads Data Store + NoSQL + Cache, shapes one payload per role. This is where role-based filtering actually lives. |
| `flags` | HTTP | Lists/serves pending flags for `alert-review` UI. |
| `review-decision` | HTTP | Records the human decision (Acknowledge/Escalate/Dismiss), fires the Circuit. |
| `dgp-summary` | HTTP | Calls QuickML (RAG over recent incidents/flags) to generate a plain-language brief for DGP-level consumers. |

**`functions/shared/`** — put your Data Store client, NoSQL client, and any common validation/serialization here so every function imports instead of reimplementing.

### Event Functions vs. Functions — the rule of thumb
- If it's **triggered by user action** → HTTP Function behind API Gateway.
- If it's **triggered by new data existing** → Event Function on a Signal.
Keep `intake-incident` "dumb" (just validate + persist) so the Signal chain is the single place enrichment logic lives. That avoids double-writes if the frontend ever calls intake from two places.

### Circuits
`review-escalation-flow.json` should model exactly three branches per your flag lifecycle: Acknowledge (closes, no further action), Escalate (notifies SP via Mail/Push, opens next-level review), Dismiss (closes with reason, logged for audit — useful for QuickML's summaries and for later auditing false-positive rates on your ML flags).

### Cron
`nightly-batch-scoring` re-runs the clustering/scoring pipeline over the full dataset (not just the incremental one used by `flag-detector`), refreshes `Cache` so dashboard reads are O(1) lookups instead of recompute-on-request. This is what makes `crime-map` and `risk-forecast` fast.

### API Gateway
Single ingress for all Functions — use it for auth token verification, per-role rate limiting (a constable's client shouldn't be able to hammer `dgp-summary`), and centralizing CORS.

---

## 4. Data layer

| Store | Contents | Why this store |
|---|---|---|
| **Data Store (relational)** | incidents, offenders, victims, locations, flags, review decisions, action outcomes | Structured, relational integrity matters here (foreign keys: incident → offender, incident → location). This is your system of record. |
| **NoSQL (graph-style)** | suspect–victim–location edges | Relational joins for network traversal (2–3 hop "who else is connected to this person/place") get expensive fast in SQL; a NoSQL/graph-edge model is what `network-analysis` and `mo_similarity_matcher.py` actually want to query. |
| **Cache** | precomputed hotspot/risk scores | Dashboard and map reads must be fast and frequent; never compute HDBSCAN/AutoML scores on a request thread. Cache is written only by `flag-detector` (incremental) and `nightly-batch-scoring` (full recompute). |

**Schema discipline:** keep `data-store-schema.sql` and `nosql-schema.md` as the actual source of truth, and generate/maintain frontend `types/` from them by hand-review each time either changes — small team, easy to let these drift otherwise.

---

## 5. AI/ML architecture

Two tracks, don't blur them:

**Online (in-request-path via Functions):**
- `mo_similarity_matcher.py` — called inside `crosslink-on-insert`. Needs to be fast (single new incident vs. existing pool) — pre-filter by location/time window before running similarity, don't brute-force the whole Data Store.
- `hotspot_clustering.py` / `trend_anomaly_detector.py` / `incident_anomaly_detector.py` — called inside `flag-detector`. Same principle: incremental scope where possible, leave full-dataset recompute to Cron.
- **Zia AutoML** — tabular risk-scoring, called from `flag-detector` for a per-incident/per-area risk number.
- **QuickML (RAG/LLM)** — called from `dgp-summary` only, on demand — this is a read-time synthesis over already-flagged/reviewed data, not something you run on every incident.

**Offline (in `intelligence/`, not deployed):**
- `data_generation/generate_synthetic_crimes.py` — for demo/training data.
- `notebooks/` — EDA only.
- `zia-automl/risk_model_config.md` — since Zia AutoML is no-code, this is documentation of feature selection/training config, not runnable code — keep it versioned so the model is reproducible/explainable when someone asks "why did this area get flagged high-risk."

**Python inside Node Functions:** Catalyst Functions runtime is Node — so these Python scripts need to run either as a subprocess call from the Node function (fine for a hackathon, adds cold-start latency) or, better if time allows, as their own lightweight scoring service invoked via HTTP from the Function. Given your timeline, subprocess-from-Node is the pragmatic choice; just keep the Python scripts side-effect-free (take data in, return JSON scores out) so swapping the invocation method later is a one-line change in the Function, not a rewrite of the ML code.

---

## 6. Sequencing note (build order)

Given the dependency chain, build in this order so each layer has something real to test against:
1. `data-store-schema.sql` + `intake-incident` (get real data flowing)
2. `crosslink-on-insert` + NoSQL schema (graph edges exist)
3. `flag-detector` + Python clustering (flags exist)
4. `role-view` + `crime-map`/`alert-review` frontend (something is visible)
5. Circuits + Mail/Push (review loop closes)
6. `dgp-summary` + QuickML, Cron + Cache (polish/performance layer — do last, demo still works without it)

This ordering also matches your `docs/prototype_brief.md` deliverable — you can demo end-to-end after step 4 even if steps 5–6 are unfinished.
