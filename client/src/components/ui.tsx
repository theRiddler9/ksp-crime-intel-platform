import { type ReactNode } from 'react';
import clsx from 'clsx';
import type { SeverityLevel } from '../types/incident';
import type { FlagStatus } from '../types/flag';

// ─── Badge ─────────────────────────────────

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'severity' | 'status' | 'outline';
  severity?: SeverityLevel;
  status?: FlagStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', severity, status, size = 'sm', className }: BadgeProps) {
  const base = 'inline-flex items-center gap-1 font-semibold rounded-full whitespace-nowrap';
  const sizeClass = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  let colorClass = 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]';

  if (variant === 'severity' && severity) {
    colorClass = `severity-${severity}`;
  } else if (variant === 'status' && status) {
    const statusColors: Record<FlagStatus, string> = {
      pending: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
      acknowledged: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
      escalated: 'bg-red-500/15 text-red-300 border border-red-500/30',
      dismissed: 'bg-gray-500/15 text-gray-400 border border-gray-500/30',
    };
    colorClass = statusColors[status];
  } else if (variant === 'outline') {
    colorClass = 'border border-[var(--border-accent)] text-[var(--accent-cyan)] bg-transparent';
  }

  return (
    <span className={clsx(base, sizeClass, colorClass, className)}>
      {variant === 'severity' && severity && (
        <span className={clsx('w-1.5 h-1.5 rounded-full', {
          'bg-red-400': severity === 'critical',
          'bg-amber-400': severity === 'high',
          'bg-blue-400': severity === 'medium',
          'bg-emerald-400': severity === 'low',
        })} />
      )}
      {children}
    </span>
  );
}

// ─── RoleBadge ──────────────────────────────

import type { UserRole } from '../types/role';
import { ROLE_SHORT_LABELS } from '../types/role';
import { Shield, Eye, Star, BarChart3, Crown } from 'lucide-react';

const roleIcons: Record<UserRole, typeof Shield> = {
  constable: Shield,
  sho: Eye,
  sp: Star,
  analyst: BarChart3,
  dgp: Crown,
};

const roleColors: Record<UserRole, string> = {
  constable: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  sho: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  sp: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  analyst: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  dgp: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
};

interface RoleBadgeProps {
  role: UserRole;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function RoleBadge({ role, showLabel = true, size = 'md' }: RoleBadgeProps) {
  const Icon = roleIcons[role];
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-sm gap-1.5',
    lg: 'px-4 py-1.5 text-base gap-2',
  };
  const iconSizes = { sm: 12, md: 14, lg: 16 };

  return (
    <span className={clsx(
      'inline-flex items-center font-semibold rounded-full border',
      roleColors[role],
      sizeClasses[size],
    )}>
      <Icon size={iconSizes[size]} />
      {showLabel && ROLE_SHORT_LABELS[role]}
    </span>
  );
}

// ─── StatsCard ──────────────────────────────

import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number; // positive = up, negative = down
  trendLabel?: string;
  accentColor?: string;
  className?: string;
}

export function StatsCard({ label, value, icon: Icon, trend, trendLabel, accentColor = 'var(--accent-cyan)', className }: StatsCardProps) {
  const TrendIcon = trend && trend > 0 ? TrendingUp : trend && trend < 0 ? TrendingDown : Minus;
  const trendColor = trend && trend > 0 ? 'text-red-400' : trend && trend < 0 ? 'text-emerald-400' : 'text-gray-400';

  return (
    <div className={clsx('glass-card glass-card-hover p-5', className)}>
      <div className="flex items-start justify-between mb-3">
        <div
          className="p-2.5 rounded-xl"
          style={{ background: `color-mix(in srgb, ${accentColor} 15%, transparent)` }}
        >
          <Icon size={20} style={{ color: accentColor }} />
        </div>
        {trend !== undefined && (
          <div className={clsx('flex items-center gap-1 text-xs font-medium', trendColor)}>
            <TrendIcon size={14} />
            <span>{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div className="text-2xl font-bold tracking-tight mb-1" style={{ color: accentColor }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      {trendLabel && (
        <div className="text-xs text-[var(--text-muted)] mt-1">{trendLabel}</div>
      )}
    </div>
  );
}

// ─── Modal ──────────────────────────────────

import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={clsx(
          'relative w-full glass-card p-6 animate-scale-in',
          sizeClasses[size],
        )}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── LoadingSpinner ─────────────────────────

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps) {
  const sizeClasses = { sm: 'w-5 h-5', md: 'w-8 h-8', lg: 'w-12 h-12' };

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div className={clsx('rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-cyan)] animate-spin', sizeClasses[size])} />
      {label && <p className="text-sm text-[var(--text-secondary)]">{label}</p>}
    </div>
  );
}

// ─── EmptyState ─────────────────────────────

import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-4 rounded-2xl bg-[var(--bg-elevated)] mb-4">
        <Icon size={32} className="text-[var(--text-muted)]" />
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{title}</h3>
      {description && <p className="text-sm text-[var(--text-secondary)] max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── DataTable ──────────────────────────────

import { ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useMemo } from 'react';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  maxRows?: number;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  maxRows,
  emptyMessage = 'No data available',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null || bVal == null) return 0;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const displayed = maxRows ? sorted.slice(0, maxRows) : sorted;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            {columns.map(col => (
              <th
                key={col.key}
                className={clsx(
                  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]',
                  col.sortable && 'cursor-pointer hover:text-[var(--text-secondary)] select-none',
                )}
                style={col.width ? { width: col.width } : undefined}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map(item => (
            <tr
              key={keyExtractor(item)}
              className={clsx(
                'border-b border-[var(--border-subtle)] transition-colors',
                onRowClick && 'cursor-pointer hover:bg-white/[0.02]',
              )}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
            >
              {columns.map(col => (
                <td key={col.key} className="px-4 py-3 text-[var(--text-secondary)]">
                  {col.render ? col.render(item) : String(item[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {maxRows && data.length > maxRows && (
        <div className="px-4 py-2 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)]">
          Showing {maxRows} of {data.length} records
        </div>
      )}
    </div>
  );
}
