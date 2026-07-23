-- ============================================================================
-- KSP Crime Intel Platform — Data Store Schema (Relational)
-- Target: Zoho Catalyst Data Store
-- ============================================================================
-- Ordering matters: tables are created in dependency order (referenced
-- tables before referencing tables) so this file can be run top-to-bottom
-- on a fresh Data Store with foreign keys enabled.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. REFERENCE / LOOKUP DATA
-- ----------------------------------------------------------------------------

CREATE TABLE districts (
    district_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(100)    NOT NULL,
    station_code    VARCHAR(20)     NOT NULL UNIQUE,
    state           VARCHAR(50)     DEFAULT 'Kerala',
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE locations (
    location_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    district_id     INTEGER         NOT NULL,
    latitude        DECIMAL(9,6)    NOT NULL,
    longitude       DECIMAL(9,6)    NOT NULL,
    address_text    VARCHAR(255),
    location_type   VARCHAR(30),        -- e.g. residential, commercial, public_space, transit
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (district_id) REFERENCES districts(district_id)
);

-- Index: crime-map and risk-forecast both filter/aggregate by district first,
-- then narrow to a bounding box — this index supports that access pattern.
CREATE INDEX idx_locations_district ON locations(district_id);


-- ----------------------------------------------------------------------------
-- 2. USERS / ROLES
-- ----------------------------------------------------------------------------
-- Catalyst Authentication issues the session/identity; this table maps that
-- identity to a role + jurisdiction so role-view and API Gateway can do
-- server-side authorization (never trust the client's role claim alone).

CREATE TABLE users (
    user_id         VARCHAR(50)     PRIMARY KEY,   -- Catalyst Auth user ID (ZUID)
    full_name       VARCHAR(100)    NOT NULL,
    role            VARCHAR(20)     NOT NULL,       -- constable | sho | sp | analyst | dgp
    district_id     INTEGER,                        -- jurisdiction scope (NULL for dgp = statewide)
    badge_number     VARCHAR(30)    UNIQUE,
    is_active       BOOLEAN         DEFAULT 1,
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (district_id) REFERENCES districts(district_id),
    CHECK (role IN ('constable', 'sho', 'sp', 'analyst', 'dgp'))
);

CREATE INDEX idx_users_role ON users(role);


-- ----------------------------------------------------------------------------
-- 3. CORE ENTITIES: PEOPLE
-- ----------------------------------------------------------------------------
-- Offenders/victims are deduplicated, reusable entities — NOT embedded fields
-- on incidents — because the same person can appear across multiple cases,
-- and that reuse is exactly what network-analysis and MO-matching depend on.

CREATE TABLE offenders (
    offender_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(100)    NOT NULL,
    aliases         TEXT,               -- comma-separated or JSON array as text
    date_of_birth   DATE,
    id_number       VARCHAR(50),        -- Aadhaar/other ID if available, keep nullable
    known_address   VARCHAR(255),
    risk_notes      TEXT,               -- free text, analyst-maintained
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_offenders_name ON offenders(name);

CREATE TABLE victims (
    victim_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(100)    NOT NULL,
    contact_phone   VARCHAR(20),
    contact_address VARCHAR(255),
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP
);


-- ----------------------------------------------------------------------------
-- 4. INCIDENTS — the system of record, single writer: intake-incident
-- ----------------------------------------------------------------------------

CREATE TABLE incidents (
    incident_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    fir_number      VARCHAR(50)     UNIQUE,
    incident_type   VARCHAR(50)     NOT NULL,   -- theft | assault | burglary | robbery | homicide | ...
    location_id     INTEGER         NOT NULL,
    reported_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    occurred_at     DATETIME        NOT NULL,
    narrative_text  TEXT,                        -- raw FIR narrative — feeds QuickML/RAG, keep unabridged
    modus_operandi  VARCHAR(255),                -- short structured MO tag(s), feeds mo_similarity_matcher
    status          VARCHAR(20)     NOT NULL DEFAULT 'open',  -- open | under_review | closed
    severity        VARCHAR(20),                 -- low | medium | high | critical (initial triage, human or rule-based)
    created_by      VARCHAR(50)     NOT NULL,    -- FK to users.user_id (constable who filed it)
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES locations(location_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    CHECK (status IN ('open', 'under_review', 'closed'))
);

-- The two hottest read paths in the whole system: map queries filtered by
-- time window, and the pending-flags queue (see flags table below).
CREATE INDEX idx_incidents_location_time ON incidents(location_id, occurred_at);
CREATE INDEX idx_incidents_type ON incidents(incident_type);
CREATE INDEX idx_incidents_status ON incidents(status);


-- ----------------------------------------------------------------------------
-- 5. JUNCTIONS — many-to-many incident <-> people
-- ----------------------------------------------------------------------------

CREATE TABLE incident_offenders (
    incident_id         INTEGER     NOT NULL,
    offender_id         INTEGER     NOT NULL,
    role_in_incident    VARCHAR(30) DEFAULT 'suspect',  -- suspect | accused | convicted
    added_at            DATETIME    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (incident_id, offender_id),
    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id),
    FOREIGN KEY (offender_id) REFERENCES offenders(offender_id)
);

CREATE TABLE incident_victims (
    incident_id     INTEGER     NOT NULL,
    victim_id       INTEGER     NOT NULL,
    added_at        DATETIME    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (incident_id, victim_id),
    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id),
    FOREIGN KEY (victim_id) REFERENCES victims(victim_id)
);

-- These indexes support crosslink-on-insert's read pattern: "give me all
-- people tied to this incident" right after intake writes it.
CREATE INDEX idx_incident_offenders_offender ON incident_offenders(offender_id);
CREATE INDEX idx_incident_victims_victim ON incident_victims(victim_id);


-- ----------------------------------------------------------------------------
-- 6. FLAGS — machine-generated, written by flag-detector
-- ----------------------------------------------------------------------------

CREATE TABLE flags (
    flag_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id     INTEGER         NOT NULL,
    flag_type       VARCHAR(30)     NOT NULL,   -- hotspot | mo_match | anomaly | risk_score
    score           DECIMAL(5,4),                -- 0.0000–1.0000 confidence/risk value
    details         TEXT,                        -- JSON-as-text: model output, matched incident ids, etc.
    generated_by    VARCHAR(40)     NOT NULL,    -- e.g. 'hotspot_clustering_v1', 'zia_automl'
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending',  -- pending | acknowledged | escalated | dismissed
    assigned_district_id INTEGER,                -- denormalized for fast queue filtering by jurisdiction
    created_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id),
    FOREIGN KEY (assigned_district_id) REFERENCES districts(district_id),
    CHECK (status IN ('pending', 'acknowledged', 'escalated', 'dismissed')),
    CHECK (flag_type IN ('hotspot', 'mo_match', 'anomaly', 'risk_score'))
);

-- Primary queue query for alert-review: WHERE status = 'pending' ORDER BY created_at
CREATE INDEX idx_flags_status_created ON flags(status, created_at);
CREATE INDEX idx_flags_incident ON flags(incident_id);
CREATE INDEX idx_flags_district ON flags(assigned_district_id, status);


-- ----------------------------------------------------------------------------
-- 7. REVIEW DECISIONS — immutable audit trail, written by review-decision
-- ----------------------------------------------------------------------------

CREATE TABLE review_decisions (
    decision_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    flag_id         INTEGER         NOT NULL,
    decided_by      VARCHAR(50)     NOT NULL,    -- FK to users.user_id
    decision        VARCHAR(20)     NOT NULL,    -- acknowledge | escalate | dismiss
    reason          TEXT,
    decided_at      DATETIME        DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flag_id) REFERENCES flags(flag_id),
    FOREIGN KEY (decided_by) REFERENCES users(user_id),
    CHECK (decision IN ('acknowledge', 'escalate', 'dismiss'))
);

CREATE INDEX idx_review_decisions_flag ON review_decisions(flag_id);
CREATE INDEX idx_review_decisions_decided_at ON review_decisions(decided_at);


-- ----------------------------------------------------------------------------
-- 8. ACTION OUTCOMES — what happened after a decision, for audit + ML feedback
-- ----------------------------------------------------------------------------

CREATE TABLE action_outcomes (
    outcome_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id     INTEGER         NOT NULL,
    outcome_type    VARCHAR(30),        -- e.g. 'arrest_made', 'no_further_action', 'false_positive_confirmed'
    notes           TEXT,
    recorded_by     VARCHAR(50),
    recorded_at     DATETIME        DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (decision_id) REFERENCES review_decisions(decision_id),
    FOREIGN KEY (recorded_by) REFERENCES users(user_id)
);

CREATE INDEX idx_action_outcomes_decision ON action_outcomes(decision_id);


-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. flags.status duplicates state also derivable from review_decisions.
--    This is intentional: the alert-review queue does a single indexed
--    lookup (WHERE status = 'pending') instead of a join + latest-decision
--    subquery on every page load. review_decisions remains the append-only
--    source of truth; flags.status is a denormalized "current state" cache
--    updated by review-decision whenever a new decision is recorded.
--
-- 2. narrative_text on incidents is intentionally NOT normalized out into
--    a separate table — dgp-summary/QuickML needs raw text with minimal
--    joins to build RAG context quickly.
--
-- 3. Only intake-incident writes to incidents/offenders/victims/junctions.
--    Only flag-detector writes to flags (review-decision only updates
--    flags.status). Only review-decision writes to review_decisions and
--    action_outcomes. Keep this single-writer discipline even as the
--    codebase grows — it's what keeps the Signal chain predictable.
-- ============================================================================
