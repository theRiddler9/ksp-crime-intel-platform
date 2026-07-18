import { useState, useEffect } from 'react';
import {
  FilePlus, MapPin, ClipboardList, Clock, AlertCircle,
} from 'lucide-react';
import { StatsCard, Badge, DataTable } from '../components/ui';
import { CrimeMap } from '../features/crime-map/CrimeMap';
import { getConstablePayload } from '../services/roleView';
import type { ConstablePayload } from '../types/role';
import type { IncidentSummary } from '../types/incident';

export function ConstableView() {
  const [data, setData] = useState<ConstablePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConstablePayload().then(d => { setData(d); setLoading(false); });
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
      render: (item: IncidentSummary) => <span className="text-[var(--text-primary)] font-medium">{item.title}</span>,
    },
    {
      key: 'severity', header: 'Severity', sortable: true,
      render: (item: IncidentSummary) => <Badge variant="severity" severity={item.severity}>{item.severity}</Badge>,
    },
    {
      key: 'status', header: 'Status', sortable: true,
      render: (item: IncidentSummary) => (
        <span className="text-xs capitalize">{item.status.replace(/_/g, ' ')}</span>
      ),
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
        <h1>Constable Dashboard</h1>
        <p>Your beat area and station incidents</p>
      </div>

      {/* Stats */}
      <div className="dashboard-grid">
        <StatsCard label="Station Incidents" value={data.stationIncidents.length} icon={ClipboardList} accentColor="#06b6d4" />
        <StatsCard label="Recent Reports" value={data.recentCount} icon={Clock} accentColor="#3b82f6" />
        <StatsCard label="Pending FIRs" value={data.pendingFIRs} icon={AlertCircle} accentColor="#f59e0b" />
      </div>

      {/* Map */}
      <CrimeMap
        districtFilter="Bengaluru Urban"
        height="350px"
      />

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
          maxRows={15}
        />
      </div>
    </div>
  );
}
