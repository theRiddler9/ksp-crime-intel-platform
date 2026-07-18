import { useState, useEffect } from 'react';
import {
  Shield, MapPin, TrendingUp, AlertTriangle,
  Network, Bell, ArrowUpCircle,
} from 'lucide-react';
import { StatsCard, Badge } from '../components/ui';
import { CrimeMap } from '../features/crime-map/CrimeMap';
import { NetworkGraph } from '../features/network-analysis/NetworkGraph';
import { TrendChart, DistrictRiskTable } from '../features/risk-forecast/RiskForecast';
import { AlertReview } from '../features/alert-review/AlertReview';
import { getSPPayload } from '../services/roleView';
import type { SPPayload } from '../types/role';

export function SPView() {
  const [data, setData] = useState<SPPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'network' | 'alerts'>('overview');

  useEffect(() => {
    getSPPayload().then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--border-subtle)] border-t-[var(--accent-cyan)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Superintendent of Police Dashboard</h1>
        <p>District-wide intelligence and escalation management</p>
      </div>

      {/* Stats */}
      <div className="dashboard-grid">
        <StatsCard
          label="District Incidents"
          value={data.districtIncidents.length}
          icon={MapPin}
          trend={7.4}
          accentColor="#06b6d4"
        />
        <StatsCard
          label="Active Hotspots"
          value={data.hotspots.filter(h => h.riskLevel === 'critical' || h.riskLevel === 'high').length}
          icon={AlertTriangle}
          accentColor="#ef4444"
        />
        <StatsCard
          label="Pending Flags"
          value={data.flagStats.pending}
          icon={Bell}
          accentColor="#f59e0b"
        />
        <StatsCard
          label="Escalated"
          value={data.escalatedFlags.length}
          icon={ArrowUpCircle}
          accentColor="#8b5cf6"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1 w-fit">
        {(['overview', 'network', 'alerts'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeTab === tab
                ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab === 'alerts' ? `Alerts (${data.flagStats.pending})` : tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <CrimeMap height="400px" hotspots={data.hotspots} />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <TrendChart data={data.trendData} showCategories height={320} />
            </div>
            <div className="lg:col-span-2">
              <DistrictRiskTable data={data.districtRisks} maxRows={10} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'network' && (
        <NetworkGraph height="550px" />
      )}

      {activeTab === 'alerts' && (
        <AlertReview flags={data.flags} />
      )}
    </div>
  );
}
