import { useState, useEffect } from 'react';
import {
  Shield, ClipboardList, TrendingUp, AlertTriangle,
  Clock, CheckCircle,
} from 'lucide-react';
import { StatsCard, Badge, DataTable } from '../components/ui';
import { CrimeMap } from '../features/crime-map/CrimeMap';
import { TrendChart } from '../features/risk-forecast/RiskForecast';
import { AlertReview } from '../features/alert-review/AlertReview';
import { getSHOPayload } from '../services/roleView';
import type { SHOPayload } from '../types/role';
import type { IncidentSummary } from '../types/incident';

export function SHOView() {
  const [data, setData] = useState<SHOPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts'>('overview');

  useEffect(() => {
    getSHOPayload().then(d => { setData(d); setLoading(false); });
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
      key: 'severity', header: 'Severity', sortable: true,
      render: (item: IncidentSummary) => <Badge variant="severity" severity={item.severity}>{item.severity}</Badge>,
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
        <h1>Station House Officer Dashboard</h1>
        <p>Station-level overview and flag management</p>
      </div>

      {/* Stats */}
      <div className="dashboard-grid">
        <StatsCard
          label="Total Incidents"
          value={data.stationStats.totalIncidents}
          icon={ClipboardList}
          trend={5.2}
          accentColor="#06b6d4"
        />
        <StatsCard
          label="Pending Investigations"
          value={data.stationStats.pendingInvestigations}
          icon={Clock}
          accentColor="#f59e0b"
        />
        <StatsCard
          label="Closure Rate"
          value={`${data.stationStats.closureRate.toFixed(1)}%`}
          icon={CheckCircle}
          trend={-1.8}
          accentColor="#10b981"
        />
        <StatsCard
          label="Pending Flags"
          value={data.flagStats.pending}
          icon={AlertTriangle}
          accentColor="#ef4444"
        />
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1 w-fit">
        {(['overview', 'alerts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === tab
                ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          {/* Map + Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CrimeMap districtFilter="Bengaluru Urban" height="350px" hotspots={data.hotspots} />
            <TrendChart data={data.trendData} height={310} />
          </div>

          {/* Incident Table */}
          <div className="glass-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-semibold">Station Incidents</h3>
              <Badge variant="outline">{data.stationIncidents.length} total</Badge>
            </div>
            <DataTable
              data={data.stationIncidents as unknown as Record<string, unknown>[]}
              columns={incidentColumns as any}
              keyExtractor={(item: any) => item.id}
              maxRows={10}
            />
          </div>
        </>
      )}

      {activeTab === 'alerts' && (
        <AlertReview flags={data.flags} />
      )}
    </div>
  );
}
