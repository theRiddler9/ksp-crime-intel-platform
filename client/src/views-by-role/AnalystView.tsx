import { useState, useEffect } from 'react';
import {
  BarChart3, MapPin, Network as NetworkIcon, TrendingUp,
  AlertTriangle, Fingerprint, Search,
} from 'lucide-react';
import { StatsCard, Badge, DataTable } from '../components/ui';
import { CrimeMap } from '../features/crime-map/CrimeMap';
import { NetworkGraph } from '../features/network-analysis/NetworkGraph';
import { TrendChart, DistrictRiskTable } from '../features/risk-forecast/RiskForecast';
import { AlertReview } from '../features/alert-review/AlertReview';
import { getAnalystPayload } from '../services/roleView';
import type { AnalystPayload } from '../types/role';
import type { IncidentSummary } from '../types/incident';

export function AnalystView() {
  const [data, setData] = useState<AnalystPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'map' | 'network' | 'trends' | 'alerts' | 'incidents'>('map');

  useEffect(() => {
    getAnalystPayload().then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--border-subtle)] border-t-[var(--accent-cyan)] rounded-full animate-spin" />
      </div>
    );
  }

  const incidentColumns = [
    {
      key: 'firNumber', header: 'FIR #', sortable: true,
      render: (item: IncidentSummary) => <span className="font-mono text-xs text-[var(--accent-cyan)]">{item.firNumber}</span>,
    },
    {
      key: 'title', header: 'Title', sortable: true,
      render: (item: IncidentSummary) => <span className="text-[var(--text-primary)] font-medium text-xs">{item.title}</span>,
    },
    {
      key: 'crimeCategory', header: 'Type', sortable: true,
      render: (item: IncidentSummary) => <span className="text-xs capitalize">{item.crimeCategory.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'district', header: 'District', sortable: true,
      render: (item: IncidentSummary) => <span className="text-xs">{item.district}</span>,
    },
    {
      key: 'severity', header: 'Severity', sortable: true,
      render: (item: IncidentSummary) => <Badge variant="severity" severity={item.severity}>{item.severity}</Badge>,
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (item: IncidentSummary) => <span className="text-xs capitalize">{item.status.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'dateReported', header: 'Date', sortable: true,
      render: (item: IncidentSummary) => (
        <span className="text-xs">{new Date(item.dateReported).toLocaleDateString('en-IN')}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Crime Analyst Dashboard</h1>
        <p>Full intelligence toolkit — maps, networks, trends, and flag review</p>
      </div>

      {/* Stats */}
      <div className="dashboard-grid">
        <StatsCard
          label="Total Incidents"
          value={data.allIncidents.length}
          icon={BarChart3}
          trend={6.8}
          accentColor="#06b6d4"
        />
        <StatsCard
          label="Active Hotspots"
          value={data.hotspots.filter(h => h.score > 60).length}
          icon={AlertTriangle}
          accentColor="#ef4444"
        />
        <StatsCard
          label="MO Matches"
          value={data.moMatches.length}
          icon={Fingerprint}
          accentColor="#f59e0b"
        />
        <StatsCard
          label="Pending Flags"
          value={data.flagStats.pending}
          icon={Search}
          accentColor="#8b5cf6"
        />
      </div>

      {/* MO Matches Highlight */}
      {data.moMatches.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Fingerprint size={16} className="text-amber-400" />
            Recent MO Pattern Matches
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.moMatches.map((m, i) => (
              <div key={i} className="glass-card-sm p-3 flex items-center justify-between">
                <div className="text-xs">
                  <div className="font-mono text-[var(--accent-cyan)]">{m.incidentA}</div>
                  <div className="text-[var(--text-muted)] my-0.5">↔</div>
                  <div className="font-mono text-[var(--accent-cyan)]">{m.incidentB}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-amber-400">{(m.similarityScore * 100).toFixed(0)}%</div>
                  <div className="text-[10px] text-[var(--text-muted)]">similarity</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1 w-fit flex-wrap">
        {([
          { key: 'map', label: 'Crime Map' },
          { key: 'network', label: 'Network' },
          { key: 'trends', label: 'Trends' },
          { key: 'alerts', label: `Alerts (${data.flagStats.pending})` },
          { key: 'incidents', label: 'All Incidents' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'map' && (
        <CrimeMap height="500px" hotspots={data.hotspots} />
      )}

      {activeTab === 'network' && (
        <NetworkGraph height="550px" />
      )}

      {activeTab === 'trends' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3">
            <TrendChart data={data.trendData} showCategories height={400} />
          </div>
          <div className="lg:col-span-2">
            <DistrictRiskTable data={data.districtRisks} />
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <AlertReview flags={data.flags} />
      )}

      {activeTab === 'incidents' && (
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-sm font-semibold">All Incidents</h3>
            <Badge variant="outline">{data.allIncidents.length} total</Badge>
          </div>
          <DataTable
            data={data.allIncidents as unknown as Record<string, unknown>[]}
            columns={incidentColumns as any}
            keyExtractor={(item: any) => item.id}
            maxRows={25}
          />
        </div>
      )}
    </div>
  );
}
