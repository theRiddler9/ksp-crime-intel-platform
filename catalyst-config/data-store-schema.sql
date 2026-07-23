-- =============================================================================
-- Karnataka State Police (KSP) FIR System Database Schema
-- Official Entity Relationship Diagram (ERD) & Operational Data Store Schema
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Master Lookup Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS State (
    StateID INT PRIMARY KEY AUTO_INCREMENT,
    StateName VARCHAR(128) NOT NULL,
    NationalityID INT DEFAULT 1,
    Active BIT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS District (
    DistrictID INT PRIMARY KEY AUTO_INCREMENT,
    DistrictName VARCHAR(128) NOT NULL,
    StateID INT NOT NULL,
    Active BIT DEFAULT 1,
    FOREIGN KEY (StateID) REFERENCES State(StateID)
);

CREATE TABLE IF NOT EXISTS UnitType (
    UnitTypeID INT PRIMARY KEY AUTO_INCREMENT,
    UnitTypeName VARCHAR(128) NOT NULL, -- e.g., Police Station, Circle Office, District Office
    CityDistState VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS Unit (
    UnitID INT PRIMARY KEY AUTO_INCREMENT, -- PoliceStationID
    UnitName VARCHAR(128) NOT NULL,
    TypeID INT NOT NULL,
    ParentUnit INT,
    NationalityID INT DEFAULT 1,
    StateID INT NOT NULL,
    DistrictID INT NOT NULL,
    Active BIT DEFAULT 1,
    FOREIGN KEY (TypeID) REFERENCES UnitType(UnitTypeID),
    FOREIGN KEY (StateID) REFERENCES State(StateID),
    FOREIGN KEY (DistrictID) REFERENCES District(DistrictID)
);

CREATE TABLE IF NOT EXISTS Rank (
    RankID INT PRIMARY KEY AUTO_INCREMENT,
    RankName VARCHAR(128) NOT NULL, -- Constable, Head Constable, Inspector, DSP, SP
    Hierarchy INT NOT NULL,
    Active BIT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Designation (
    DesignationID INT PRIMARY KEY AUTO_INCREMENT,
    DesignationName VARCHAR(128) NOT NULL, -- Investigating Officer, SHO, SP, Analyst, DGP
    Active BIT DEFAULT 1,
    SortOrder INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Employee (
    EmployeeID INT PRIMARY KEY AUTO_INCREMENT,
    DistrictID INT NOT NULL,
    UnitID INT NOT NULL,
    RankID INT NOT NULL,
    DesignationID INT NOT NULL,
    KGID VARCHAR(32) UNIQUE NOT NULL, -- Karnataka Government ID
    FirstName VARCHAR(128) NOT NULL,
    EmployeeDOB DATE,
    GenderID INT,
    BloodGroupID INT,
    PhysicallyChallenged BIT DEFAULT 0,
    AppointmentDate DATE,
    FOREIGN KEY (DistrictID) REFERENCES District(DistrictID),
    FOREIGN KEY (UnitID) REFERENCES Unit(UnitID),
    FOREIGN KEY (RankID) REFERENCES Rank(RankID),
    FOREIGN KEY (DesignationID) REFERENCES Designation(DesignationID)
);

CREATE TABLE IF NOT EXISTS CaseCategory (
    CaseCategoryID INT PRIMARY KEY AUTO_INCREMENT,
    LookupValue VARCHAR(64) NOT NULL -- FIR (1), UDR (3), Zero FIR (8), PAR (4)
);

CREATE TABLE IF NOT EXISTS GravityOffence (
    GravityOffenceID INT PRIMARY KEY AUTO_INCREMENT,
    LookupValue VARCHAR(64) NOT NULL -- Heinous, Non-Heinous
);

CREATE TABLE IF NOT EXISTS CrimeHead (
    CrimeHeadID INT PRIMARY KEY AUTO_INCREMENT,
    CrimeGroupName VARCHAR(128) NOT NULL, -- e.g. Crimes Against Body, Property Offence, Cybercrime
    Active BIT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS CrimeSubHead (
    CrimeSubHeadID INT PRIMARY KEY AUTO_INCREMENT,
    CrimeHeadID INT NOT NULL,
    CrimeHeadName VARCHAR(128) NOT NULL, -- e.g. Murder, Theft, Burglary, Chain Snatching
    SeqID INT DEFAULT 1,
    FOREIGN KEY (CrimeHeadID) REFERENCES CrimeHead(CrimeHeadID)
);

CREATE TABLE IF NOT EXISTS CaseStatusMaster (
    CaseStatusID INT PRIMARY KEY AUTO_INCREMENT,
    CaseStatusName VARCHAR(128) NOT NULL -- Under Investigation, Charge Sheeted, Closed, Undetected
);

CREATE TABLE IF NOT EXISTS Court (
    CourtID INT PRIMARY KEY AUTO_INCREMENT,
    CourtName VARCHAR(256) NOT NULL,
    DistrictID INT NOT NULL,
    StateID INT NOT NULL,
    Active BIT DEFAULT 1,
    FOREIGN KEY (DistrictID) REFERENCES District(DistrictID),
    FOREIGN KEY (StateID) REFERENCES State(StateID)
);

CREATE TABLE IF NOT EXISTS Act (
    ActCode VARCHAR(64) PRIMARY KEY, -- IPC, NDPS, IT_ACT, BNS
    ActDescription VARCHAR(256) NOT NULL,
    ShortName VARCHAR(64) NOT NULL,
    Active BIT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Section (
    ActCode VARCHAR(64) NOT NULL,
    SectionCode VARCHAR(64) NOT NULL, -- e.g. 302, 379, 420, 303
    SectionDescription VARCHAR(256) NOT NULL,
    Active BIT DEFAULT 1,
    PRIMARY KEY (ActCode, SectionCode),
    FOREIGN KEY (ActCode) REFERENCES Act(ActCode)
);

-- -----------------------------------------------------------------------------
-- Core Case Management Tables (Karnataka Police ERD Specification)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS CaseMaster (
    CaseMasterID INT PRIMARY KEY AUTO_INCREMENT,
    CrimeNo VARCHAR(64) UNIQUE NOT NULL, -- Format: 1 digit Category (1) + 4 digit Dist + 4 digit Unit + 4 digit Year + 5 digit Serial (e.g. 104430006202600001)
    CaseNo VARCHAR(32) NOT NULL, -- Format: YYYY + 5-digit Serial (e.g. 202600001 - Last 9 digits of CrimeNo)
    CrimeRegisteredDate DATE NOT NULL,
    PolicePersonID INT NOT NULL, -- Employee.EmployeeID (Officer who registered FIR)
    PoliceStationID INT NOT NULL, -- Unit.UnitID (Police Station)
    CaseCategoryID INT NOT NULL, -- CaseCategory.CaseCategoryID
    GravityOffenceID INT NOT NULL, -- GravityOffence.GravityOffenceID
    CrimeMajorHeadID INT NOT NULL, -- CrimeHead.CrimeHeadID
    CrimeMinorHeadID INT NOT NULL, -- CrimeSubHead.CrimeSubHeadID
    CaseStatusID INT NOT NULL, -- CaseStatusMaster.CaseStatusID
    CourtID INT,
    IncidentFromDate DATETIME NOT NULL,
    IncidentToDate DATETIME,
    InfoReceivedPSDate DATETIME NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    BriefFacts TEXT NOT NULL,
    mo_tags JSON, -- Standardized Modus Operandi tags
    FOREIGN KEY (PolicePersonID) REFERENCES Employee(EmployeeID),
    FOREIGN KEY (PoliceStationID) REFERENCES Unit(UnitID),
    FOREIGN KEY (CaseCategoryID) REFERENCES CaseCategory(CaseCategoryID),
    FOREIGN KEY (GravityOffenceID) REFERENCES GravityOffence(GravityOffenceID),
    FOREIGN KEY (CrimeMajorHeadID) REFERENCES CrimeHead(CrimeHeadID),
    FOREIGN KEY (CrimeMinorHeadID) REFERENCES CrimeSubHead(CrimeSubHeadID),
    FOREIGN KEY (CaseStatusID) REFERENCES CaseStatusMaster(CaseStatusID),
    FOREIGN KEY (CourtID) REFERENCES Court(CourtID)
);

CREATE TABLE IF NOT EXISTS ComplainantDetails (
    ComplainantID INT PRIMARY KEY AUTO_INCREMENT,
    CaseMasterID INT NOT NULL,
    ComplainantName VARCHAR(128) NOT NULL,
    AgeYear INT,
    OccupationID INT,
    ReligionID INT,
    CasteID INT,
    GenderID INT,
    FOREIGN KEY (CaseMasterID) REFERENCES CaseMaster(CaseMasterID)
);

CREATE TABLE IF NOT EXISTS ActSectionAssociation (
    CaseMasterID INT NOT NULL,
    ActID VARCHAR(64) NOT NULL,
    SectionID VARCHAR(64) NOT NULL,
    ActOrderID INT DEFAULT 1,
    SectionOrderID INT DEFAULT 1,
    PRIMARY KEY (CaseMasterID, ActID, SectionID),
    FOREIGN KEY (CaseMasterID) REFERENCES CaseMaster(CaseMasterID)
);

CREATE TABLE IF NOT EXISTS Victim (
    VictimMasterID INT PRIMARY KEY AUTO_INCREMENT,
    CaseMasterID INT NOT NULL,
    VictimName VARCHAR(128) NOT NULL,
    AgeYear INT,
    GenderID INT,
    VictimPolice VARCHAR(8) DEFAULT '0', -- 1 if Victim is police, else 0
    FOREIGN KEY (CaseMasterID) REFERENCES CaseMaster(CaseMasterID)
);

CREATE TABLE IF NOT EXISTS Accused (
    AccusedMasterID INT PRIMARY KEY AUTO_INCREMENT,
    CaseMasterID INT NOT NULL,
    AccusedName VARCHAR(128) NOT NULL,
    AgeYear INT,
    GenderID INT,
    PersonID VARCHAR(16) DEFAULT 'A1', -- A1, A2, A3...
    FOREIGN KEY (CaseMasterID) REFERENCES CaseMaster(CaseMasterID)
);

CREATE TABLE IF NOT EXISTS ArrestSurrender (
    ArrestSurrenderID INT PRIMARY KEY AUTO_INCREMENT,
    CaseMasterID INT NOT NULL,
    ArrestSurrenderTypeID INT NOT NULL,
    ArrestSurrenderDate DATE NOT NULL,
    ArrestSurrenderStateId INT NOT NULL,
    ArrestSurrenderDistrictId INT NOT NULL,
    PoliceStationID INT NOT NULL,
    IOID INT NOT NULL, -- Investigating Officer EmployeeID
    CourtID INT,
    AccusedMasterID INT NOT NULL,
    IsAccused BIT DEFAULT 1,
    IsComplainantAccused BIT DEFAULT 0,
    FOREIGN KEY (CaseMasterID) REFERENCES CaseMaster(CaseMasterID),
    FOREIGN KEY (PoliceStationID) REFERENCES Unit(UnitID),
    FOREIGN KEY (IOID) REFERENCES Employee(EmployeeID),
    FOREIGN KEY (AccusedMasterID) REFERENCES Accused(AccusedMasterID)
);

CREATE TABLE IF NOT EXISTS ChargesheetDetails (
    CSID INT PRIMARY KEY AUTO_INCREMENT,
    CaseMasterID INT NOT NULL,
    csdate DATETIME NOT NULL,
    cstype CHAR(1) NOT NULL, -- A -> Chargesheet, B -> False Case, C -> Undetected
    PolicePersonID INT NOT NULL,
    FOREIGN KEY (CaseMasterID) REFERENCES CaseMaster(CaseMasterID),
    FOREIGN KEY (PolicePersonID) REFERENCES Employee(EmployeeID)
);

-- -----------------------------------------------------------------------------
-- Operational Intelligence & Review Tables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS flags (
    ROWID BIGINT PRIMARY KEY AUTO_INCREMENT,
    flag_id VARCHAR(64) UNIQUE NOT NULL,
    flag_type VARCHAR(32) NOT NULL, -- HOTSPOT, EMERGING_TREND, ANOMALY, MO_LINK
    severity VARCHAR(16) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    title VARCHAR(256) NOT NULL,
    summary TEXT NOT NULL,
    confidence_score DECIMAL(5, 4) NOT NULL,
    target_type VARCHAR(32) NOT NULL, -- LOCATION, SUSPECT, CATEGORY, JURISDICTION
    target_id VARCHAR(64) NOT NULL,
    jurisdiction_id VARCHAR(64) NOT NULL,
    evidence_payload JSON NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING', -- PENDING, ACKNOWLEDGED, ESCALATED, DISMISSED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_decisions (
    ROWID BIGINT PRIMARY KEY AUTO_INCREMENT,
    decision_id VARCHAR(64) UNIQUE NOT NULL,
    flag_id VARCHAR(64) NOT NULL,
    reviewer_id VARCHAR(64) NOT NULL,
    reviewer_role VARCHAR(32) NOT NULL, -- Constable, SHO, SP, Analyst, DGP
    decision VARCHAR(32) NOT NULL, -- ACKNOWLEDGE, ESCALATE, DISMISS
    action_type VARCHAR(64), -- PATROL_DEPLOYMENT, INVESTIGATION_ASSIGNMENT
    assigned_to VARCHAR(64),
    reason TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (flag_id) REFERENCES flags(flag_id)
);

CREATE TABLE IF NOT EXISTS action_outcomes (
    ROWID BIGINT PRIMARY KEY AUTO_INCREMENT,
    outcome_id VARCHAR(64) UNIQUE NOT NULL,
    decision_id VARCHAR(64) NOT NULL,
    outcome_status VARCHAR(32) NOT NULL,
    incident_reduction_pct DECIMAL(5, 2) DEFAULT 0.00,
    notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (decision_id) REFERENCES review_decisions(decision_id)
);
