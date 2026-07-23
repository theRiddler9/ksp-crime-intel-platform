# Karnataka State Crime Records Bureau (SCRB) Crime Intel Platform

> **Proactive Crime Intelligence & Predictive Policing Platform built on Zoho Catalyst Serverless Architecture**

---

## 📁 Repository Structure

```
ksp-crime-intel-platform/
│
├── client/                              # React SPA → Catalyst Web Client Hosting
│   └── src/
│       ├── views-by-role/               # Constable, SHO, SP, Analyst, DGP routes
│       ├── features/                    # Crime Map, Network Graph, Alert Review, RAG Brief
│       ├── components/                  # Reusable UI cards, tables, badges
│       ├── services/                    # Catalyst SDK / API Gateway API calls
│       └── types/                       # TypeScript Data Store & NoSQL contracts
│
├── functions/                           # Catalyst Serverless HTTP Functions (Node.js)
│   ├── intake-incident/                 # Step 1: FIR Intake & Validation endpoint
│   │   └── index.js
│   ├── role-view/                       # Step 5: Role-gated payload builder
│   │   └── index.js
│   ├── flags/                           # Step 4: Serves pending intelligence flags
│   │   └── index.js
│   ├── review-decision/                 # Step 6: Records officer review & executes Circuit
│   │   └── index.js
│   ├── dgp-summary/                     # Step 5: QuickML plain-language executive brief
│   │   └── index.js
│   └── shared/                          # Common DB, NoSQL, Cache & Python bridge modules
│       ├── db.js
│       ├── nosql.js
│       ├── cache.js
│       ├── pythonBridge.js
│       ├── validators.js
│       └── response.js
│
├── event-functions/                     # Catalyst Signals-triggered Functions
│   ├── crosslink-on-insert/             # Step 2–3: Graph edge extraction & MO matching
│   │   └── index.js
│   └── flag-detector/                   # Step 4: Spatial clustering & anomaly surfacing
│       └── index.js
│
├── circuits/                            # Catalyst Circuits Workflow Definitions
│   └── review-escalation-flow.json      # Step 6: Acknowledge / Escalate / Dismiss branches
│
├── cron-jobs/                           # Catalyst Cron Scheduled Jobs
│   └── nightly-batch-scoring/           # Recomputes hotspots & refreshes Catalyst Cache
│       └── index.js
│
├── intelligence/                        # Machine Learning & AI Track
│   ├── data_generation/
│   │   └── generate_synthetic_crimes.py # Karnataka synthetic FIR data generator
│   ├── models/
│   │   ├── hotspot_clustering.py        # Spatial grid / HDBSCAN clustering model
│   │   ├── trend_anomaly_detector.py    # 30-day baseline spike detector
│   │   ├── mo_similarity_matcher.py     # Modus Operandi TF-IDF similarity matcher
│   │   └── incident_anomaly_detector.py # Rare crime & outlier detector
│   ├── zia-automl/
│   │   └── risk_model_config.md         # Zia AutoML training & feature docs
│   └── notebooks/                       # Offline EDA & analysis
│
├── catalyst-config/
│   ├── catalyst.json                    # Project configuration
│   ├── data-store-schema.sql            # Catalyst Data Store SQL schema
│   └── nosql-schema.md                  # NoSQL relationship graph specification
│
├── docs/
│   ├── architecture.md                  # Complete technical architecture
│   ├── demo_script.md                   # Hackathon demo walk-through script
│   └── prototype_brief.md               # Executive prototype brief (Deliverable #1)
│
└── README.md                            # Setup & execution instructions (Deliverable #2)
```

---

## 🚀 Getting Started & Execution Instructions

### Prerequisites
- **Node.js**: `v18.x` or higher
- **Python**: `3.9+`
- **Zoho Catalyst CLI**: `npm install -g zcatalyst-cli`

---

### Step 1: Clone & Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-org/ksp-crime-intel-platform.git
cd ksp-crime-intel-platform

# Install root & function dependencies
npm install
```

---

### Step 2: Generate Synthetic Karnataka Crime Data

Generate ~150 synthetic FIRs across Bengaluru City, Mysuru, Hubballi-Dharwad, and Mangaluru:

```bash
python intelligence/data_generation/generate_synthetic_crimes.py
```

This creates `synthetic_ksp_crimes.json` used by intelligence models for testing.

---

### Step 3: Test ML Intelligence Models Locally

Test the Python ML models:

```bash
# Test spatial hotspot clustering
python intelligence/models/hotspot_clustering.py < synthetic_ksp_crimes.json

# Test 30-day trend anomaly detection
python intelligence/models/trend_anomaly_detector.py < synthetic_ksp_crimes.json
```

---

### Step 4: Run Catalyst Local Development Server

Start the Catalyst serverless functions locally:

```bash
catalyst serve
```

Local API Gateway endpoints will be available at `http://localhost:3000/server/`:

| Endpoint | Method | Description |
|---|---|---|
| `/server/intake-incident/` | POST | Submit new FIR entry |
| `/server/role-view/?role=SHO&station_id=STATION_HAL` | GET | Role-gated dashboard payload |
| `/server/flags/` | GET / POST | List pending intelligence flags |
| `/server/review-decision/` | POST | Record officer review decision |
| `/server/dgp-summary/` | GET | QuickML plain-language summary |

---

### Step 5: Deploy to Zoho Catalyst Cloud

```bash
# Login to Zoho Catalyst
catalyst login

# Deploy all serverless functions, event functions, circuits, cron jobs, and web client
catalyst deploy
```

---

## 🏛️ Operational Stage Mapping

| Stage | Platform Component | System Action |
|---|---|---|
| **Stage 1: Station Entry** | `intake-incident` Function | Validates mandatory fields, checks duplicates, writes to Data Store. |
| **Stage 2: Upward Transmission** | `crosslink-on-insert` Signal | Auto-transmits data to District & SCRB without re-entry. |
| **Stage 3: Linking** | `nosql.js` + `mo_similarity_matcher.py` | Populates NoSQL graph edges and surfaces MO similarity links. |
| **Stage 4: Pattern Surfacing** | `flag-detector` + `hotspot_clustering.py` | Surfaces spatial hotspots & emerging 30-day trend spikes. |
| **Stage 5: Role-Based Views** | `role-view` Function | Server-side shapes payloads for Constable, SHO, SP, Analyst, DGP. |
| **Stage 6: Human Review** | `review-decision` + `review-escalation-flow.json` | Requires officer sign-off (`ACKNOWLEDGE`, `ESCALATE`, `DISMISS`). |
| **Stage 7: Ground Action** | `review_decisions` & `action_outcomes` | Dispatches patrol routes and logs preventive deployment. |
| **Stage 8: Feedback Loop** | `cron-jobs/nightly-batch-scoring` | Logs rejection reasons into feedback dataset and updates Cache. |

---

## 🛡️ License & Compliance
Confidential & Proprietary — Developed for Karnataka State Police (KSP) & State Crime Records Bureau (SCRB). Protected under Govt of Karnataka security guidelines.
