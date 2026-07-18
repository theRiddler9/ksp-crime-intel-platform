import { useState, useEffect } from 'react';
import {
  Crown, Globe, AlertTriangle, TrendingUp,
  ArrowUpCircle, BarChart3, FileText,
} from 'lucide-react';
import { StatsCard, Badge } from '../components/ui';
import { CrimeMap } from '../features/crime-map/CrimeMap';
import { TrendChart, DistrictRiskTable } from '../features/risk-forecast/RiskForecast';
import { AlertReview } from '../features/alert-review/AlertReview';
import { BriefView } from '../features/plain-language-brief/BriefView';
import { getDGPPayload } from '../services/roleView';
import type { DGPPayload } from '../types/role';

export function DGPView() {
  const [data, setData] = useState<DGPPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'brief' | 'escalated'>('overview');

  useEffect(() => {
    getDGPPayload().then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[var(--border-subtle)] border-t-[var(--accent-cyan)] rounded-full animate-spin" />
      </div>
    );
  }

  const changeDir = data.stateOverview.changeFromLastMonth >= 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Director General of Police Dashboard</h1>
        <p>State-wide executive overview and intelligence briefing</p>
      </div>

      {/* Stats */}
      <div className="dashboard-grid">
        <StatsCard
          label="State-wide Incidents"
          value={data.stateOverview.totalIncidents}
          icon={Globe}
          trend={data.stateOverview.changeFromLastMonth}
          accentColor="#06b6d4"
        />
        <StatsCard
          label="Districts Monitored"
          value={data.stateOverview.totalDistricts}
          icon={BarChart3}
          accentColor="#3b82f6"
        />
        <StatsCard
          label="Critical Flags"
          value={data.stateOverview.criticalFlags}
          icon={AlertTriangle}
          accentColor="#ef4444"
        />
        <StatsCard
          label="Escalated to You"
          value={data.escalatedFlags.length}
          icon={ArrowUpCircle}
          accentColor="#8b5cf6"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-xl p-1 w-fit">
        {([
          { key: 'overview', label: 'State Overview', icon: Globe },
          { key: 'brief', label: 'Intel Brief', icon: FileText },
          { key: 'escalated', label: `Escalated (${data.escalatedFlags.length})`, icon: ArrowUpCircle },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <CrimeMap height="400px" />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3">
              <TrendChart data={data.trendData} height={320} />
            </div>
            <div className="lg:col-span-2">
              <DistrictRiskTable data={data.districtRisks} />
            </div>
          </div>
        </>
      )}

      {activeTab === 'brief' && (
        <BriefView />
      )}

      {activeTab === 'escalated' && (
        <AlertReview flags={data.escalatedFlags} />
      )}
    </div>
  );
}
