// ──────────────────────────────────────────────
// Centralized mock data generators
// Realistic Karnataka crime data for demo
// ──────────────────────────────────────────────

import type {
  Incident, IncidentSummary, Location, Offender, Victim, ModusOperandi,
  CrimeCategory, SeverityLevel, IncidentStatus,
} from '../types/incident';
import type { Flag, FlagType, FlagStatus, FlagStats } from '../types/flag';
import type { GraphNode, GraphEdge, NetworkGraphData } from '../types/network';
import type {
  HotspotScore, TrendDataPoint, DistrictRisk, DashboardStats,
} from '../types/analytics';
import type { User, UserRole } from '../types/role';

// ─── Karnataka geography ────────────────────

export const KARNATAKA_DISTRICTS = [
  { id: 'blr-urban', name: 'Bengaluru Urban', lat: 12.9716, lng: 77.5946 },
  { id: 'blr-rural', name: 'Bengaluru Rural', lat: 13.1287, lng: 77.3827 },
  { id: 'mysuru', name: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  { id: 'hubli', name: 'Hubli-Dharwad', lat: 15.3647, lng: 75.1240 },
  { id: 'mangaluru', name: 'Mangaluru', lat: 12.9141, lng: 74.8560 },
  { id: 'belgaum', name: 'Belagavi', lat: 15.8497, lng: 74.4977 },
  { id: 'gulbarga', name: 'Kalaburagi', lat: 17.3297, lng: 76.8343 },
  { id: 'shimoga', name: 'Shivamogga', lat: 13.9299, lng: 75.5681 },
  { id: 'tumkur', name: 'Tumakuru', lat: 13.3379, lng: 77.1173 },
  { id: 'davangere', name: 'Davangere', lat: 14.4644, lng: 75.9218 },
  { id: 'bellary', name: 'Ballari', lat: 15.1394, lng: 76.9214 },
  { id: 'raichur', name: 'Raichur', lat: 16.2120, lng: 77.3439 },
  { id: 'hassan', name: 'Hassan', lat: 13.0072, lng: 76.0996 },
  { id: 'mandya', name: 'Mandya', lat: 12.5218, lng: 76.8951 },
  { id: 'udupi', name: 'Udupi', lat: 13.3409, lng: 74.7421 },
];

const POLICE_STATIONS = [
  'Cubbon Park PS', 'Whitefield PS', 'Koramangala PS', 'HSR Layout PS',
  'Indiranagar PS', 'Jayanagar PS', 'JP Nagar PS', 'Marathahalli PS',
  'Electronic City PS', 'Yelahanka PS', 'Rajajinagar PS', 'Basavanagudi PS',
  'Vijayanagar PS', 'KR Puram PS', 'Hebbal PS', 'Peenya PS',
  'Devanahalli PS', 'Mysuru North PS', 'Mysuru South PS', 'Hubli PS',
];

const CRIME_CATEGORIES: CrimeCategory[] = [
  'theft', 'burglary', 'robbery', 'assault', 'murder', 'kidnapping',
  'cybercrime', 'fraud', 'narcotics', 'domestic_violence', 'sexual_offense',
  'vehicle_theft', 'chain_snatching', 'extortion',
];

const IPC_SECTIONS: Record<CrimeCategory, string[]> = {
  theft: ['IPC 379', 'IPC 380'],
  burglary: ['IPC 454', 'IPC 457', 'IPC 380'],
  robbery: ['IPC 392', 'IPC 394'],
  assault: ['IPC 323', 'IPC 324', 'IPC 325'],
  murder: ['IPC 302', 'IPC 304'],
  kidnapping: ['IPC 363', 'IPC 364'],
  cybercrime: ['IT Act 66C', 'IT Act 66D', 'IPC 420'],
  fraud: ['IPC 420', 'IPC 468', 'IPC 471'],
  narcotics: ['NDPS Act 20', 'NDPS Act 22'],
  domestic_violence: ['IPC 498A', 'DV Act 2005'],
  sexual_offense: ['IPC 376', 'POCSO Act'],
  arson: ['IPC 435', 'IPC 436'],
  extortion: ['IPC 384', 'IPC 386'],
  vehicle_theft: ['IPC 379', 'MV Act'],
  chain_snatching: ['IPC 356', 'IPC 379'],
  other: ['IPC 34'],
};

const FIRST_NAMES_MALE = [
  'Rajesh', 'Suresh', 'Ramesh', 'Venkatesh', 'Mahesh', 'Deepak', 'Anil',
  'Manjunath', 'Srinivas', 'Prakash', 'Krishna', 'Ravi', 'Naveen', 'Arun',
  'Basavaraj', 'Siddaraju', 'Ganesh', 'Manoj', 'Prasad', 'Shankar',
];

const FIRST_NAMES_FEMALE = [
  'Lakshmi', 'Savitri', 'Meena', 'Priya', 'Anitha', 'Kavitha', 'Suma',
  'Nandini', 'Shobha', 'Geetha', 'Pushpa', 'Roopa', 'Divya', 'Swathi',
];

const LAST_NAMES = [
  'Kumar', 'Gowda', 'Reddy', 'Naik', 'Shetty', 'Patil', 'Hegde',
  'Nayak', 'Swamy', 'Rao', 'Murthy', 'Yadav', 'Sharma', 'Singh',
];

// ─── Utility helpers ────────────────────────

let _idCounter = 1000;
function nextId(prefix: string): string {
  return `${prefix}-${++_idCounter}`;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function randomName(gender: 'male' | 'female'): string {
  const first = gender === 'male' ? pick(FIRST_NAMES_MALE) : pick(FIRST_NAMES_FEMALE);
  return `${first} ${pick(LAST_NAMES)}`;
}

// ─── Generators ────────────────────────────

function generateLocation(): Location {
  const dist = pick(KARNATAKA_DISTRICTS);
  return {
    id: nextId('loc'),
    district: dist.name,
    subdivision: `${dist.name} Sub-Division`,
    policeStation: pick(POLICE_STATIONS),
    beat: `Beat-${randomBetween(1, 12)}`,
    address: `${randomBetween(1, 500)}, ${pick(['MG Road', '100 Feet Road', 'Station Road', 'Lake View Road', 'Ring Road', 'Market Street', 'Temple Road', 'NH-44', 'Old Town Road', 'Industrial Area'])}`,
    coordinates: {
      lat: dist.lat + randomFloat(-0.15, 0.15),
      lng: dist.lng + randomFloat(-0.15, 0.15),
    },
    pincode: `${randomBetween(560001, 590099)}`,
  };
}

function generateOffender(): Offender {
  const name = randomName('male');
  return {
    id: nextId('off'),
    name,
    aliases: Math.random() > 0.5 ? [name.split(' ')[0] + ' bhai'] : [],
    age: randomBetween(18, 55),
    gender: 'male',
    description: pick([
      'Medium build, dark complexion, scar on left cheek',
      'Tall, lean build, tattoo on right arm',
      'Short, stocky build, wears spectacles',
      'Average height, fair complexion, beard',
      'Muscular build, bald head, gold chain',
    ]),
    knownAddresses: [`${randomBetween(1, 200)}, ${pick(KARNATAKA_DISTRICTS).name}`],
    linkedIncidentIds: [],
  };
}

function generateVictim(): Victim {
  const gender = Math.random() > 0.4 ? 'male' : 'female';
  return {
    id: nextId('vic'),
    name: randomName(gender),
    age: randomBetween(18, 70),
    gender,
  };
}

function generateMO(category: CrimeCategory): ModusOperandi {
  const moDescriptions: Record<string, string> = {
    theft: 'Suspect entered through unlocked window during daytime hours',
    burglary: 'Lock broken using iron rod; targeted unoccupied houses',
    robbery: 'Duo on motorcycle snatched bag at traffic signal',
    assault: 'Altercation at public place escalated to physical violence',
    murder: 'Sharp weapon used; body discovered near outskirts',
    cybercrime: 'Phishing SMS with fake bank link, OTP stolen via call',
    fraud: 'Fake investment scheme promising 30% monthly returns',
    vehicle_theft: 'Two-wheeler stolen from parking area using duplicate key',
    chain_snatching: 'Duo on bike targeted lone woman pedestrian',
    narcotics: 'Ganja transported in grain bags via bus',
  };

  return {
    description: moDescriptions[category] || 'Details under investigation',
    tags: pickN(['organized', 'opportunistic', 'repeat_pattern', 'gang_related', 'lone_wolf', 'tech_enabled', 'weapon_involved'], randomBetween(1, 3)),
    weaponsUsed: category === 'murder' || category === 'assault' || category === 'robbery'
      ? pickN(['knife', 'iron rod', 'machete', 'country pistol', 'wooden stick'], randomBetween(0, 2))
      : [],
    timeOfDay: pick(['morning', 'afternoon', 'evening', 'night']),
    entryMethod: ['theft', 'burglary'].includes(category)
      ? pick(['window', 'back door', 'terrace', 'main door (lock pick)'])
      : undefined,
  };
}

function generateIncident(index: number): Incident {
  const category = pick(CRIME_CATEGORIES);
  const severity: SeverityLevel = pick(['critical', 'high', 'medium', 'low']);
  const status: IncidentStatus = pick([
    'reported', 'under_investigation', 'chargesheet_filed', 'closed',
  ]);
  const location = generateLocation();
  const daysBack = randomBetween(0, 180);
  const offenders = Array.from(
    { length: randomBetween(0, 3) },
    generateOffender,
  );

  return {
    id: `INC-${2025}${String(index).padStart(5, '0')}`,
    firNumber: `FIR/${location.district.substring(0, 3).toUpperCase()}/${2025}/${String(randomBetween(100, 9999)).padStart(4, '0')}`,
    crimeCategory: category,
    ipcSections: IPC_SECTIONS[category] || ['IPC 34'],
    title: `${category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} at ${location.policeStation.replace(' PS', '')}`,
    description: `${category.replace(/_/g, ' ')} reported near ${location.address}, ${location.district}. ${offenders.length > 0 ? `${offenders.length} suspect(s) identified.` : 'No suspects identified yet.'}`,
    dateReported: daysAgo(daysBack),
    dateOfOccurrence: daysAgo(daysBack + randomBetween(0, 3)),
    status,
    severity,
    location,
    offenders,
    victims: Array.from({ length: randomBetween(1, 3) }, generateVictim),
    modusOperandi: generateMO(category),
    investigatingOfficer: `IO-${randomName('male')}`,
    stationId: location.policeStation,
    districtId: location.district,
    linkedIncidentIds: [],
    evidenceCount: randomBetween(0, 8),
    createdAt: daysAgo(daysBack),
    updatedAt: daysAgo(Math.max(0, daysBack - randomBetween(0, 10))),
  };
}

function generateFlag(index: number, relatedIncidents: string[]): Flag {
  const type: FlagType = pick([
    'hotspot', 'anomaly', 'mo_match', 'trend_spike',
    'repeat_offender', 'network_cluster',
  ]);
  const severity: SeverityLevel = pick(['critical', 'high', 'medium', 'low']);
  const status: FlagStatus = pick(['pending', 'pending', 'pending', 'acknowledged', 'escalated', 'dismissed']); // bias toward pending

  const flagDescriptions: Record<FlagType, string> = {
    hotspot: 'HDBSCAN detected dense crime cluster — 12+ incidents within 2km radius over 30 days',
    anomaly: 'Unusual spike in reported incidents — 3.2σ above rolling average for this area',
    mo_match: 'MO similarity score 0.87 between two unlinked burglary cases — possible serial offender',
    trend_spike: '47% increase in vehicle theft in this district compared to previous quarter',
    repeat_offender: 'Known offender with 4 prior cases re-appeared in new incident network',
    network_cluster: 'Dense subgraph detected — 8 suspects connected through 3 shared locations',
  };

  return {
    id: `FLG-${String(index).padStart(4, '0')}`,
    type,
    severity,
    title: `${type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Alert — ${pick(KARNATAKA_DISTRICTS).name}`,
    description: flagDescriptions[type],
    relatedIncidentIds: pickN(relatedIncidents, randomBetween(1, 5)),
    relatedOffenderIds: [],
    affectedArea: pick(KARNATAKA_DISTRICTS).name,
    status,
    confidenceScore: randomFloat(0.6, 0.99),
    riskScore: randomBetween(40, 98),
    detectedAt: daysAgo(randomBetween(0, 30)),
    reviewedAt: status !== 'pending' ? daysAgo(randomBetween(0, 5)) : undefined,
    reviewedBy: status !== 'pending' ? randomName('male') : undefined,
    reviewAction: status === 'acknowledged' ? 'acknowledge'
      : status === 'escalated' ? 'escalate'
      : status === 'dismissed' ? 'dismiss' : undefined,
    reviewReason: status === 'dismissed' ? 'Duplicate alert, already under investigation' : undefined,
    metadata: {},
  };
}

// ─── Pre-generated datasets ────────────────

const _incidentCache: Incident[] = [];
const _flagCache: Flag[] = [];

function getIncidents(): Incident[] {
  if (_incidentCache.length === 0) {
    for (let i = 1; i <= 150; i++) {
      _incidentCache.push(generateIncident(i));
    }
    // Create some cross-links
    for (let i = 0; i < 20; i++) {
      const a = pick(_incidentCache);
      const b = pick(_incidentCache);
      if (a.id !== b.id) {
        a.linkedIncidentIds.push(b.id);
        b.linkedIncidentIds.push(a.id);
      }
    }
  }
  return _incidentCache;
}

function getFlags(): Flag[] {
  if (_flagCache.length === 0) {
    const incidentIds = getIncidents().map(i => i.id);
    for (let i = 1; i <= 45; i++) {
      _flagCache.push(generateFlag(i, incidentIds));
    }
  }
  return _flagCache;
}

// ─── Public API ─────────────────────────────

export const mockIncidents = getIncidents;

export function mockIncidentSummaries(): IncidentSummary[] {
  return getIncidents().map(i => ({
    id: i.id,
    firNumber: i.firNumber,
    crimeCategory: i.crimeCategory,
    title: i.title,
    severity: i.severity,
    status: i.status,
    dateReported: i.dateReported,
    district: i.location.district,
    policeStation: i.location.policeStation,
  }));
}

export const mockFlags = getFlags;

export function mockFlagStats(): FlagStats {
  const flags = getFlags();
  return {
    total: flags.length,
    pending: flags.filter(f => f.status === 'pending').length,
    acknowledged: flags.filter(f => f.status === 'acknowledged').length,
    escalated: flags.filter(f => f.status === 'escalated').length,
    dismissed: flags.filter(f => f.status === 'dismissed').length,
    bySeverity: {
      critical: flags.filter(f => f.severity === 'critical').length,
      high: flags.filter(f => f.severity === 'high').length,
      medium: flags.filter(f => f.severity === 'medium').length,
      low: flags.filter(f => f.severity === 'low').length,
    },
    byType: {
      hotspot: flags.filter(f => f.type === 'hotspot').length,
      anomaly: flags.filter(f => f.type === 'anomaly').length,
      mo_match: flags.filter(f => f.type === 'mo_match').length,
      trend_spike: flags.filter(f => f.type === 'trend_spike').length,
      repeat_offender: flags.filter(f => f.type === 'repeat_offender').length,
      network_cluster: flags.filter(f => f.type === 'network_cluster').length,
    },
  };
}

export function mockNetworkGraph(): NetworkGraphData {
  const incidents = getIncidents().slice(0, 30);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addedNodeIds = new Set<string>();

  for (const inc of incidents) {
    // Incident node
    if (!addedNodeIds.has(inc.id)) {
      nodes.push({
        id: inc.id,
        type: 'incident',
        label: inc.firNumber,
        metadata: { crimeCategory: inc.crimeCategory, severity: inc.severity },
      });
      addedNodeIds.add(inc.id);
    }

    // Location node
    const locId = `loc-${inc.location.district.replace(/\s/g, '-').toLowerCase()}`;
    if (!addedNodeIds.has(locId)) {
      nodes.push({
        id: locId,
        type: 'location',
        label: inc.location.district,
        metadata: { district: inc.location.district },
      });
      addedNodeIds.add(locId);
    }
    edges.push({
      id: nextId('edge'),
      source: inc.id,
      target: locId,
      relationship: 'occurred_at',
      weight: 1,
      metadata: {},
    });

    // Offender nodes
    for (const off of inc.offenders) {
      if (!addedNodeIds.has(off.id)) {
        nodes.push({
          id: off.id,
          type: 'suspect',
          label: off.name,
          metadata: { aliases: off.aliases, incidentCount: 1 },
        });
        addedNodeIds.add(off.id);
      }
      edges.push({
        id: nextId('edge'),
        source: off.id,
        target: inc.id,
        relationship: 'accused_in',
        weight: 0.9,
        metadata: {},
      });
    }

    // Victim nodes
    for (const vic of inc.victims.slice(0, 1)) {
      if (!addedNodeIds.has(vic.id)) {
        nodes.push({
          id: vic.id,
          type: 'victim',
          label: vic.name,
          metadata: {},
        });
        addedNodeIds.add(vic.id);
      }
      edges.push({
        id: nextId('edge'),
        source: vic.id,
        target: inc.id,
        relationship: 'victim_of',
        weight: 0.8,
        metadata: {},
      });
    }
  }

  // Add some MO-similarity edges between incidents
  for (let i = 0; i < 10; i++) {
    const a = pick(incidents);
    const b = pick(incidents);
    if (a.id !== b.id) {
      edges.push({
        id: nextId('edge'),
        source: a.id,
        target: b.id,
        relationship: 'mo_similar',
        weight: randomFloat(0.6, 0.95),
        metadata: { moSimilarityScore: randomFloat(0.6, 0.95) },
      });
    }
  }

  return { nodes, edges };
}

export function mockHotspots(): HotspotScore[] {
  return KARNATAKA_DISTRICTS.map((d, i) => ({
    id: `hs-${i}`,
    clusterId: i,
    location: {
      lat: d.lat + randomFloat(-0.05, 0.05),
      lng: d.lng + randomFloat(-0.05, 0.05),
      district: d.name,
      area: `${d.name} Central`,
    },
    density: randomBetween(5, 40),
    riskLevel: pick<SeverityLevel>(['critical', 'high', 'medium', 'low']),
    radius: randomBetween(500, 3000),
    crimeTypes: pickN(CRIME_CATEGORIES, randomBetween(1, 4)),
    score: randomBetween(20, 98),
    lastUpdated: daysAgo(0),
  }));
}

export function mockTrendData(): TrendDataPoint[] {
  const points: TrendDataPoint[] = [];
  for (let i = 90; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const base = 15 + Math.sin(i / 7) * 5;
    points.push({
      date: date.toISOString().split('T')[0],
      total: Math.max(0, Math.round(base + randomFloat(-3, 3))),
      byCategory: {
        theft: randomBetween(2, 8),
        assault: randomBetween(1, 5),
        burglary: randomBetween(0, 4),
        cybercrime: randomBetween(1, 6),
        fraud: randomBetween(0, 3),
      },
    });
  }
  return points;
}

export function mockDistrictRisks(): DistrictRisk[] {
  return KARNATAKA_DISTRICTS.map(d => {
    const riskScore = randomBetween(15, 95);
    return {
      districtId: d.id,
      districtName: d.name,
      riskScore,
      riskLevel: riskScore > 75 ? 'critical' as const
        : riskScore > 50 ? 'high' as const
        : riskScore > 30 ? 'medium' as const
        : 'low' as const,
      incidentCount: randomBetween(10, 200),
      trend: pick(['rising', 'stable', 'declining'] as const),
      changePercent: randomFloat(-25, 40),
      topCrimes: pickN(CRIME_CATEGORIES, 3),
      predictedNextMonth: randomBetween(10, 180),
    };
  }).sort((a, b) => b.riskScore - a.riskScore);
}

export function mockDashboardStats(): DashboardStats {
  return {
    totalIncidents: getIncidents().length,
    pendingFlags: getFlags().filter(f => f.status === 'pending').length,
    activeHotspots: randomBetween(5, 12),
    closureRate: randomFloat(55, 78),
    avgResponseTimeHrs: randomFloat(2, 18),
    incidentsToday: randomBetween(3, 15),
    incidentsThisWeek: randomBetween(25, 80),
    incidentsThisMonth: randomBetween(100, 250),
    changeFromLastMonth: randomFloat(-15, 25),
  };
}

export function mockUser(role: UserRole): User {
  const stationByRole: Record<UserRole, string> = {
    constable: 'Cubbon Park PS',
    sho: 'Koramangala PS',
    sp: 'SP Office, Bengaluru',
    analyst: 'Crime Analysis Cell, Bengaluru',
    dgp: 'DGP Office, Bengaluru',
  };

  const nameByRole: Record<UserRole, string> = {
    constable: 'PC Ramesh Kumar',
    sho: 'Insp. Manjunath Gowda',
    sp: 'SP Arun Reddy IPS',
    analyst: 'Dr. Priya Shetty',
    dgp: 'DGP Srinivas Rao IPS',
  };

  return {
    id: `usr-${role}`,
    name: nameByRole[role],
    role,
    email: `${role}@ksp.gov.in`,
    badgeNumber: `KSP-${String(randomBetween(10000, 99999))}`,
    station: stationByRole[role],
    district: 'Bengaluru Urban',
  };
}

export function mockBriefContent(): string {
  return `## Daily Intelligence Summary — Karnataka State Police
### ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

**Prepared for:** Director General of Police, Karnataka

---

### Executive Summary

Over the past 24 hours, **${randomBetween(12, 28)} new incidents** were reported across the state, with **${randomBetween(2, 5)} flagged as high-priority** by the automated threat-assessment system. Bengaluru Urban continues to report the highest volume, though a notable cluster of vehicle thefts has emerged in the Hubli-Dharwad corridor.

### Key Developments

1. **Emerging Vehicle Theft Cluster (Hubli-Dharwad):** HDBSCAN analysis detected a new spatial cluster of **${randomBetween(6, 12)} vehicle thefts** within a 3km radius near Hubli Railway Station over the past 14 days. MO similarity scoring (0.84) suggests a coordinated ring. **Recommended action:** Deploy dedicated mobile patrol; request SP Hubli-Dharwad to activate local informant network.

2. **Cybercrime Spike (Bengaluru Urban):** A **${randomBetween(30, 55)}% week-over-week increase** in phishing-related complaints, primarily targeting senior citizens. Common vector: fake KYC update SMS linking to cloned bank portals. **Recommended action:** Coordinate with Cyber Crime PS for awareness campaign; share IOCs with banking sector CERT.

3. **Network Cluster — Repeat Offender Group (Mysuru):** Graph analysis identified **${randomBetween(4, 8)} interconnected suspects** with prior records, appearing in ${randomBetween(3, 6)} recent burglary cases. Central node: a previously convicted offender released 4 months ago. **Recommended action:** Brief Mysuru SP for coordinated surveillance operation.

### Statistical Overview (Last 30 Days)

| Metric | Current | Previous Month | Change |
|--------|---------|---------------|--------|
| Total FIRs | ${randomBetween(400, 600)} | ${randomBetween(380, 550)} | ${pick(['+', '-'])}${randomBetween(2, 12)}% |
| Case Closure Rate | ${randomBetween(55, 72)}% | ${randomBetween(50, 68)}% | ${pick(['+', '-'])}${randomBetween(1, 8)}% |
| Avg Response Time | ${randomBetween(3, 8)}h | ${randomBetween(4, 10)}h | ${pick(['+', '-'])}${randomBetween(5, 20)}% |
| Active Hotspots | ${randomBetween(6, 14)} | ${randomBetween(5, 12)} | ${pick(['+', '-'])}${randomBetween(1, 4)} |

### Flags Requiring Attention

- **${randomBetween(3, 8)} pending flags** await review (${randomBetween(1, 3)} critical severity)
- **${randomBetween(1, 3)} escalated flags** require SP-level decision
- Oldest unreviewed flag: **${randomBetween(2, 7)} days** — recommend prioritization

---

*This brief was auto-generated by the KSP Crime Intel Platform using QuickML synthesis over structured incident, flag, and network data. All statistical claims are derived from verified Data Store records.*
`;
}
