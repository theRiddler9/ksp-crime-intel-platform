import { useState, useCallback } from 'react';
import clsx from 'clsx';
import {
  AlertTriangle, Shield, ArrowUpCircle, XCircle, CheckCircle,
  Clock, MapPin, Link2, ChevronDown, ChevronUp,
  Flame, Zap, Fingerprint, TrendingUp, UserX, Network,
} from 'lucide-react';
import { Badge, Modal, LoadingSpinner } from '../../components/ui';
import { submitReviewDecision } from '../../services/reviewDecision';
import type { Flag, FlagType, ReviewAction } from '../../types/flag';
import type { SeverityLevel } from '../../types/incident';

// ─── Flag type icons ────────────────────────

const flagTypeIcons: Record<FlagType, typeof Flame> = {
  hotspot: Flame,
  anomaly: Zap,
  mo_match: Fingerprint,
  trend_spike: TrendingUp,
  repeat_offender: UserX,
  network_cluster: Network,
};

const flagTypeLabels: Record<FlagType, string> = {
  hotspot: 'Hotspot Cluster',
  anomaly: 'Statistical Anomaly',
  mo_match: 'MO Pattern Match',
  trend_spike: 'Trend Spike',
  repeat_offender: 'Repeat Offender',
  network_cluster: 'Network Cluster',
};

const flagTypeColors: Record<FlagType, string> = {
  hotspot: '#ef4444',
  anomaly: '#8b5cf6',
  mo_match: '#f59e0b',
  trend_spike: '#3b82f6',
  repeat_offender: '#ef4444',
  network_cluster: '#06b6d4',
};

// ─── Flag Card ──────────────────────────────

interface FlagCardProps {
  flag: Flag;
  onAction: (flagId: string, action: ReviewAction) => void;
  isProcessing: boolean;
}

function FlagCard({ flag, onAction, isProcessing }: FlagCardProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = flagTypeIcons[flag.type];

  return (
    <div className={clsx(
      'glass-card-sm glass-card-hover p-4 transition-all duration-300',
      flag.severity === 'critical' && 'animate-pulse-glow',
    )}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="p-2 rounded-xl shrink-0"
          style={{ background: `color-mix(in srgb, ${flagTypeColors[flag.type]} 15%, transparent)` }}
        >
          <Icon size={18} style={{ color: flagTypeColors[flag.type] }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
              {flagTypeLabels[flag.type]}
            </span>
            <Badge variant="severity" severity={flag.severity} size="sm">
              {flag.severity}
            </Badge>
          </div>
          <h4 className="text-sm font-semibold leading-snug">{flag.title}</h4>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded-lg hover:bg-white/5 text-[var(--text-muted)] shrink-0"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
        {flag.description}
      </p>

      {/* Meta Row */}
      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] mb-3 flex-wrap">
        <span className="flex items-center gap-1">
          <MapPin size={12} /> {flag.affectedArea}
        </span>
        <span className="flex items-center gap-1">
          <Link2 size={12} /> {flag.relatedIncidentIds.length} linked
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} /> {new Date(flag.detectedAt).toLocaleDateString('en-IN')}
        </span>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mb-3 p-3 bg-[var(--bg-elevated)]/50 rounded-lg text-xs animate-slide-up space-y-2">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Confidence</span>
            <span className="font-mono text-[var(--text-primary)]">{(flag.confidenceScore * 100).toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Risk Score</span>
            <span className="font-mono text-[var(--text-primary)]">{flag.riskScore}/100</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">Related Incidents</span>
            <span className="font-mono text-[var(--text-secondary)]">{flag.relatedIncidentIds.join(', ')}</span>
          </div>
          {flag.reviewedBy && (
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Reviewed By</span>
              <span className="text-[var(--text-primary)]">{flag.reviewedBy}</span>
            </div>
          )}
        </div>
      )}

      {/* Scores Bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1">
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-0.5">
            <span>Confidence</span>
            <span>{(flag.confidenceScore * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-cyan)] rounded-full transition-all duration-500"
              style={{ width: `${flag.confidenceScore * 100}%` }}
            />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-0.5">
            <span>Risk</span>
            <span>{flag.riskScore}</span>
          </div>
          <div className="h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', {
                'bg-red-500': flag.riskScore > 75,
                'bg-amber-500': flag.riskScore > 50 && flag.riskScore <= 75,
                'bg-blue-500': flag.riskScore > 25 && flag.riskScore <= 50,
                'bg-emerald-500': flag.riskScore <= 25,
              })}
              style={{ width: `${flag.riskScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Action Buttons (only for pending) */}
      {flag.status === 'pending' && (
        <div className="flex items-center gap-2">
          <button
            disabled={isProcessing}
            onClick={() => onAction(flag.id, 'acknowledge')}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <CheckCircle size={14} /> Acknowledge
          </button>
          <button
            disabled={isProcessing}
            onClick={() => onAction(flag.id, 'escalate')}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <ArrowUpCircle size={14} /> Escalate
          </button>
          <button
            disabled={isProcessing}
            onClick={() => onAction(flag.id, 'dismiss')}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-muted)] text-xs font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Already reviewed */}
      {flag.status !== 'pending' && (
        <div className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium',
          flag.status === 'acknowledged' && 'bg-emerald-500/10 text-emerald-400',
          flag.status === 'escalated' && 'bg-red-500/10 text-red-400',
          flag.status === 'dismissed' && 'bg-gray-500/10 text-gray-400',
        )}>
          {flag.status === 'acknowledged' && <><CheckCircle size={14} /> Acknowledged</>}
          {flag.status === 'escalated' && <><ArrowUpCircle size={14} /> Escalated</>}
          {flag.status === 'dismissed' && <><XCircle size={14} /> Dismissed</>}
          {flag.reviewedBy && <span className="ml-auto opacity-60">by {flag.reviewedBy}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Main Alert Review ──────────────────────

interface AlertReviewProps {
  flags?: Flag[];
  showOnlyPending?: boolean;
}

export function AlertReview({ flags: propFlags, showOnlyPending = false }: AlertReviewProps) {
  const [flags, setFlags] = useState<Flag[]>(propFlags || []);
  const [filterSeverity, setFilterSeverity] = useState<SeverityLevel | 'all'>('all');
  const [filterType, setFilterType] = useState<FlagType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [decisionModal, setDecisionModal] = useState<{
    flagId: string;
    action: ReviewAction;
  } | null>(null);
  const [decisionReason, setDecisionReason] = useState('');

  const handleAction = useCallback((flagId: string, action: ReviewAction) => {
    if (action === 'escalate' || action === 'dismiss') {
      setDecisionModal({ flagId, action });
      setDecisionReason('');
    } else {
      executeAction(flagId, action);
    }
  }, []);

  const executeAction = async (flagId: string, action: ReviewAction, reason?: string) => {
    setProcessingId(flagId);
    try {
      await submitReviewDecision({ flagId, action, reason });
      setFlags(prev => prev.map(f =>
        f.id === flagId
          ? { ...f, status: action === 'acknowledge' ? 'acknowledged' : action === 'escalate' ? 'escalated' : 'dismissed', reviewAction: action, reviewReason: reason }
          : f
      ));
    } finally {
      setProcessingId(null);
      setDecisionModal(null);
    }
  };

  const filteredFlags = flags.filter(f => {
    if (showOnlyPending && f.status !== 'pending') return false;
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false;
    if (filterType !== 'all' && f.type !== filterType) return false;
    if (filterStatus === 'pending' && f.status !== 'pending') return false;
    return true;
  });

  const pendingCount = flags.filter(f => f.status === 'pending').length;
  const criticalPending = flags.filter(f => f.status === 'pending' && f.severity === 'critical').length;

  // Sort: pending first, then by severity, then by risk score
  const severityOrder: Record<SeverityLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedFlags = [...filteredFlags].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.riskScore - a.riskScore;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Alert Review Queue</h1>
        <p>
          {pendingCount} pending flags
          {criticalPending > 0 && <span className="text-red-400 font-medium"> ({criticalPending} critical)</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="glass-card px-4 py-3 flex items-center gap-4 flex-wrap">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Filters</span>

        <div className="flex gap-1.5">
          {(['all', 'pending'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all',
                filterStatus === s
                  ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[var(--border-subtle)]" />

        <div className="flex gap-1.5">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterSeverity(s)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all',
                filterSeverity === s
                  ? s === 'all'
                    ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30'
                    : `severity-${s}`
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-[var(--text-muted)]">
          {sortedFlags.length} of {flags.length} flags
        </div>
      </div>

      {/* Flag Cards Grid */}
      {sortedFlags.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Shield size={40} className="mx-auto mb-3 text-emerald-400" />
          <h3 className="text-lg font-semibold mb-1">All Clear</h3>
          <p className="text-sm text-[var(--text-secondary)]">No flags match your current filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {sortedFlags.map(flag => (
            <FlagCard
              key={flag.id}
              flag={flag}
              onAction={handleAction}
              isProcessing={processingId === flag.id}
            />
          ))}
        </div>
      )}

      {/* Decision Modal */}
      <Modal
        isOpen={!!decisionModal}
        onClose={() => setDecisionModal(null)}
        title={decisionModal?.action === 'escalate' ? 'Escalate Flag to SP' : 'Dismiss Flag'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            {decisionModal?.action === 'escalate'
              ? 'This will notify the SP and open a Circuit workflow for next-level review.'
              : 'Please provide a reason for dismissal (logged for audit and ML model feedback).'}
          </p>
          <textarea
            value={decisionReason}
            onChange={e => setDecisionReason(e.target.value)}
            placeholder={decisionModal?.action === 'escalate' ? 'Escalation notes (optional)...' : 'Reason for dismissal...'}
            className="w-full h-24 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)] resize-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setDecisionModal(null)} className="btn-ghost">Cancel</button>
            <button
              onClick={() => decisionModal && executeAction(decisionModal.flagId, decisionModal.action, decisionReason)}
              className={decisionModal?.action === 'escalate' ? 'btn-danger' : 'btn-ghost'}
            >
              {decisionModal?.action === 'escalate' ? 'Confirm Escalation' : 'Confirm Dismissal'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
