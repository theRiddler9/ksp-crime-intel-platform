import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import clsx from 'clsx';
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  ArrowUpRight, ArrowDownRight, ChevronRight,
} from 'lucide-react';
import { Badge, StatsCard } from '../../components/ui';
import { mockTrendData, mockDistrictRisks, mockDashboardStats } from '../../services/mockData';
import type { TrendDataPoint, DistrictRisk } from '../../types/analytics';
import type { SeverityLevel } from '../../types/incident';

// ─── Custom Tooltip ─────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card-sm p-3 text-xs min-w-[160px]">
      <div className="font-semibold text-[var(--text-primary)] mb-1.5">{label}</div>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-[var(--text-secondary)] capitalize">{entry.name}</span>
          </span>
          <span className="font-medium text-[var(--text-primary)]">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Trend Chart ────────────────────────────

interface TrendChartProps {
  data?: TrendDataPoint[];
  height?: number;
  showCategories?: boolean;
}

export function TrendChart({ data, height = 300, showCategories = false }: TrendChartProps) {
  const trendData = data || mockTrendData();

  const chartData = useMemo(() =>
    trendData.map(point => ({
      date: new Date(point.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      Total: point.total,
      ...(showCategories ? point.byCategory : {}),
    })),
  [trendData, showCategories]);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Crime Trend (90 Days)</h3>
        <Badge variant="outline">Daily</Badge>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradTheft" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradAssault" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.07)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(148,163,184,0.1)' }}
            interval={13}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="Total"
            stroke="#06b6d4"
            fill="url(#gradTotal)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#06b6d4', stroke: '#0a0e1a', strokeWidth: 2 }}
          />
          {showCategories && (
            <>
              <Area type="monotone" dataKey="theft" stroke="#f59e0b" fill="url(#gradTheft)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="assault" stroke="#ef4444" fill="url(#gradAssault)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="cybercrime" stroke="#8b5cf6" fill="transparent" strokeWidth={1.5} dot={false} />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── District Risk Table ────────────────────

interface DistrictRiskTableProps {
  data?: DistrictRisk[];
  maxRows?: number;
  onDistrictClick?: (district: DistrictRisk) => void;
}

export function DistrictRiskTable({ data, maxRows = 15, onDistrictClick }: DistrictRiskTableProps) {
  const risks = (data || mockDistrictRisks()).slice(0, maxRows);

  const trendIcon = (trend: string) => {
    if (trend === 'rising') return <ArrowUpRight size={14} className="text-red-400" />;
    if (trend === 'declining') return <ArrowDownRight size={14} className="text-emerald-400" />;
    return <Minus size={14} className="text-gray-400" />;
  };

  const riskBarColor = (level: SeverityLevel) => {
    const colors: Record<SeverityLevel, string> = {
      critical: 'bg-red-500', high: 'bg-amber-500', medium: 'bg-blue-500', low: 'bg-emerald-500',
    };
    return colors[level];
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-semibold">District Risk Rankings</h3>
        <Badge variant="outline">{risks.length} districts</Badge>
      </div>
      <div className="overflow-y-auto max-h-[500px]">
        {risks.map((district, index) => (
          <div
            key={district.districtId}
            onClick={() => onDistrictClick?.(district)}
            className={clsx(
              'flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)] transition-colors',
              onDistrictClick && 'cursor-pointer hover:bg-white/[0.02]',
            )}
          >
            {/* Rank */}
            <div className={clsx(
              'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
              index < 3 ? 'bg-red-500/15 text-red-400' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
            )}>
              {index + 1}
            </div>

            {/* District Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium truncate">{district.districtName}</span>
                {trendIcon(district.trend)}
              </div>
              {/* Risk Bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all duration-700', riskBarColor(district.riskLevel))}
                    style={{ width: `${district.riskScore}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-[var(--text-muted)] w-8 text-right">
                  {district.riskScore}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="text-right shrink-0">
              <div className="text-xs text-[var(--text-secondary)]">{district.incidentCount} cases</div>
              <div className={clsx('text-xs font-medium', {
                'text-red-400': district.changePercent > 10,
                'text-amber-400': district.changePercent > 0 && district.changePercent <= 10,
                'text-emerald-400': district.changePercent <= 0,
              })}>
                {district.changePercent > 0 ? '+' : ''}{district.changePercent.toFixed(1)}%
              </div>
            </div>

            {onDistrictClick && (
              <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Risk Forecast Container ────────────────

interface RiskForecastProps {
  data?: {
    trendData?: TrendDataPoint[];
    districtRisks?: DistrictRisk[];
  };
}

export function RiskForecast({ data }: RiskForecastProps) {
  const stats = mockDashboardStats();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Risk Forecast & Analytics</h1>
        <p>Predictive crime risk scoring and trend analysis across Karnataka</p>
      </div>

      {/* Stats Row */}
      <div className="dashboard-grid">
        <StatsCard
          label="Active Hotspots"
          value={stats.activeHotspots}
          icon={AlertTriangle}
          trend={8.3}
          accentColor="#ef4444"
        />
        <StatsCard
          label="Avg Risk Score"
          value="62.4"
          icon={TrendingUp}
          trend={-3.2}
          accentColor="#f59e0b"
        />
        <StatsCard
          label="Case Closure Rate"
          value={`${stats.closureRate.toFixed(1)}%`}
          icon={TrendingDown}
          trend={-2.1}
          accentColor="#10b981"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3">
          <TrendChart data={data?.trendData} showCategories height={350} />
        </div>
        <div className="lg:col-span-2">
          <DistrictRiskTable data={data?.districtRisks} />
        </div>
      </div>
    </div>
  );
}
