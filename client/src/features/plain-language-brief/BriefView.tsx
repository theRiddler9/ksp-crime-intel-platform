import { useState, useCallback } from 'react';
import clsx from 'clsx';
import {
  FileText, Calendar, MapPin, RefreshCw, Download,
  Sparkles, Clock, AlertTriangle,
} from 'lucide-react';
import { Badge, LoadingSpinner } from '../../components/ui';
import { generateDGPSummary, generatePDF } from '../../services/dgpSummary';
import { KARNATAKA_DISTRICTS } from '../../services/mockData';

// ─── Brief Generator Panel ─────────────────

interface BriefGeneratorProps {
  onGenerate: (content: string) => void;
  isGenerating: boolean;
}

function BriefGenerator({ onGenerate, isGenerating }: BriefGeneratorProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [district, setDistrict] = useState('');

  const handleGenerate = async () => {
    const result = await generateDGPSummary({ dateFrom, dateTo, district });
    onGenerate(result.content);
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={16} className="text-[var(--accent-cyan)]" />
        Generate Intelligence Brief
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">From Date</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">To Date</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-muted)] mb-1">District (optional)</label>
          <select
            value={district}
            onChange={e => setDistrict(e.target.value)}
            className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
          >
            <option value="">All Districts</option>
            {KARNATAKA_DISTRICTS.map(d => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-50"
      >
        {isGenerating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generating with QuickML...
          </>
        ) : (
          <>
            <Sparkles size={16} />
            Generate Brief
          </>
        )}
      </button>
    </div>
  );
}

// ─── Brief Content Renderer ─────────────────

function renderMarkdown(content: string): React.ReactNode {
  // Minimal markdown parser for the brief
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length > 0) {
      const headers = tableRows[0];
      const dataRows = tableRows.slice(2); // skip separator row
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                {headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-left text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                    {h.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} className="border-b border-[var(--border-subtle)]">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-[var(--text-secondary)]">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table detection
    if (line.includes('|') && line.trim().startsWith('|')) {
      inTable = true;
      const cells = line.split('|').filter(c => c.trim() !== '');
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-semibold mt-5 mb-2 text-[var(--text-primary)]">{line.slice(4)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-lg font-bold mt-6 mb-2 gradient-text">{line.slice(3)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold mt-4 mb-2 gradient-text">{line.slice(2)}</h1>);
    }
    // Horizontal rule
    else if (line.trim() === '---') {
      elements.push(<hr key={i} className="border-[var(--border-subtle)] my-4" />);
    }
    // List items
    else if (line.trim().startsWith('- **')) {
      const match = line.match(/- \*\*(.+?)\*\*(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex items-start gap-2 ml-2 my-1.5 text-sm">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <span>
              <strong className="text-[var(--text-primary)]">{match[1]}</strong>
              <span className="text-[var(--text-secondary)]">{match[2]}</span>
            </span>
          </div>
        );
      }
    } else if (line.trim().startsWith('- ')) {
      elements.push(
        <div key={i} className="flex items-start gap-2 ml-2 my-1 text-sm text-[var(--text-secondary)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-cyan)] mt-2 shrink-0" />
          <span>{line.trim().slice(2)}</span>
        </div>
      );
    }
    // Numbered list items
    else if (/^\d+\.\s\*\*/.test(line.trim())) {
      const match = line.match(/(\d+)\.\s\*\*(.+?)\*\*(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="glass-card-sm p-3 my-2">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-[var(--accent-cyan)]/10 flex items-center justify-center text-xs font-bold text-[var(--accent-cyan)] shrink-0">
                {match[1]}
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)] mb-0.5">{match[2]}</div>
                <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{match[3]}</div>
              </div>
            </div>
          </div>
        );
      }
    }
    // Bold text paragraph
    else if (line.includes('**')) {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      elements.push(
        <p key={i} className="text-sm text-[var(--text-secondary)] my-1 leading-relaxed">
          {parts.map((part, j) =>
            j % 2 === 1
              ? <strong key={j} className="text-[var(--text-primary)]">{part}</strong>
              : <span key={j}>{part}</span>
          )}
        </p>
      );
    }
    // Italic
    else if (line.startsWith('*') && line.endsWith('*')) {
      elements.push(
        <p key={i} className="text-xs text-[var(--text-muted)] italic my-3 pt-3 border-t border-[var(--border-subtle)]">
          {line.replace(/^\*|\*$/g, '')}
        </p>
      );
    }
    // Regular paragraph
    else if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm text-[var(--text-secondary)] my-1 leading-relaxed">
          {line}
        </p>
      );
    }
  }

  flushTable();
  return <>{elements}</>;
}

// ─── Main Brief View ────────────────────────

export function BriefView() {
  const [briefContent, setBriefContent] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleGenerate = useCallback((content: string) => {
    setIsGenerating(true);
    // Simulate the delay in the service
    setTimeout(() => {
      setBriefContent(content);
      setGeneratedAt(new Date().toISOString());
      setIsGenerating(false);
    }, 100);
  }, []);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      await generatePDF();
      // In production this would trigger a download
      alert('PDF generation triggered via SmartBrowz (mock)');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Intelligence Brief</h1>
        <p>AI-generated plain-language summary powered by QuickML (RAG/LLM)</p>
      </div>

      <BriefGenerator onGenerate={handleGenerate} isGenerating={isGenerating} />

      {isGenerating && (
        <div className="glass-card p-12">
          <LoadingSpinner size="lg" label="QuickML is synthesizing your intelligence brief..." />
        </div>
      )}

      {briefContent && !isGenerating && (
        <div className="glass-card overflow-hidden animate-scale-in">
          {/* Brief Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30">
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-[var(--accent-cyan)]" />
              <span className="text-sm font-semibold">Generated Brief</span>
              {generatedAt && (
                <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  <Clock size={12} />
                  {new Date(generatedAt).toLocaleString('en-IN')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="btn-ghost flex items-center gap-1.5 text-xs py-1.5 disabled:opacity-50"
              >
                <Download size={14} />
                {isExporting ? 'Generating...' : 'Export PDF'}
              </button>
              <button
                onClick={() => handleGenerate(briefContent)}
                className="btn-ghost flex items-center gap-1.5 text-xs py-1.5"
              >
                <RefreshCw size={14} /> Regenerate
              </button>
            </div>
          </div>

          {/* Brief Content */}
          <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
            {renderMarkdown(briefContent)}
          </div>
        </div>
      )}

      {!briefContent && !isGenerating && (
        <div className="glass-card p-16 text-center">
          <Sparkles size={40} className="mx-auto mb-4 text-[var(--accent-cyan)] opacity-50" />
          <h3 className="text-lg font-semibold mb-1">No Brief Generated Yet</h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            Use the generator above to create an AI-powered intelligence summary.
            The brief will analyze recent incidents, flags, and network data to produce a
            DGP-level executive summary.
          </p>
        </div>
      )}
    </div>
  );
}
