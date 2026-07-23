# Karnataka SCRB Crime Intel Platform — Prototype Brief (Deliverable #1)

## Executive Summary
The **Karnataka State Crime Records Bureau (SCRB) Crime Intelligence Platform** transforms police data processing from reactive incident logging into proactive, data-driven crime prevention. Built natively on **Zoho Catalyst Serverless Infrastructure**, the platform unifies single-point incident intake, automated graph relationship cross-linking, spatial-temporal hotspot detection, machine learning anomaly surfacing, role-gated executive dashboards, and human-in-the-loop review workflows.

---

## Key Operational Innovations

### 1. Single Intake Point with Instant Upward Transmission
- Eliminates manual re-entry and independent station silos.
- Standardized dropdowns for IPC/BNS sections, case categories, and Modus Operandi (MO) tags enforce schema discipline.
- Automated duplicate check prevents double-counting.

### 2. Multi-Hop Relationship Graph Store (NoSQL)
- Automatically extracts entities (Suspects, Victims, Locations) upon FIR insertion.
- Maintains graph edges (`suspect-location`, `suspect-suspect`, `mo-cluster`) supporting 2-3 hop relationship visualizers without expensive SQL joins.

### 3. Explainable AI & Machine Learning Pipeline
- **Hotspot Clustering:** HDBSCAN / spatial grid density analysis compares an area to *itself* over a rolling 30-day window (+50% threshold trigger).
- **MO Similarity Matcher:** Jaccard & Cosine TF-IDF vector similarity highlights matching MO signatures across jurisdictions.
- **Trend Anomaly Detector:** Flags sustained category spikes per district.
- **Zia AutoML:** Tabular risk-scoring model powering predictive risk overlays.
- **QuickML RAG Engine:** Synthesizes structured data into plain-language executive briefs for the DGP Office.

### 4. Role-Gated Dynamic Views (Zero Data Trust in UI)
- Server-side filtering in `role-view` shapes data for Beat Constable, SHO, District SP, SCRB Analyst, and DGP Office.
- Protected victim identities stripped from lower-tier payloads.

### 5. Mandatory Human Review & Closed-Loop Accountability
- No automated decision executes without officer sign-off (`ACKNOWLEDGE`, `ESCALATE`, `DISMISS`).
- Rejection reasons are logged into model feedback audit dataset for continuous recalibration.

---

## Core System Metrics & Impact Indicators

| Operational Stage | Key Metric | Target / Benchmark |
|---|---|---|
| 1. Incident Entry | Data Freshness & Completeness | > 95% first-submission accuracy |
| 3. System Linking | Cross-Jurisdiction Link Accuracy | > 85% investigator confirmation |
| 4. Pattern Surfacing | Predictive Lead Time | 3 to 7 days before escalation |
| 6. Human Review | Review Turnaround Time | < 2 hours for HIGH/CRITICAL flags |
| 7. Ground Action | Incident Reduction Post-Deployment | > 12% drop in repeat offenses |
| 8. Feedback Loop | System Trust Score | > 90% composite confidence |
