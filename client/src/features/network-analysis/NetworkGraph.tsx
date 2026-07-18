import { useState, useEffect, useCallback, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import type cytoscape from 'cytoscape';
import clsx from 'clsx';
import { Search, ZoomIn, ZoomOut, Maximize2, RefreshCw, Filter as FilterIcon } from 'lucide-react';
import { Badge } from '../../components/ui';
import { getNetworkGraph, toCytoscapeElements } from '../../services/networkGraph';
import type { CytoscapeElement, NodeType } from '../../types/network';

// ─── Cytoscape Stylesheet ───────────────────

const cyStylesheet: any = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '9px',
      color: '#94a3b8',
      'text-margin-y': 6,
      'text-max-width': '80px',
      'text-wrap': 'ellipsis',
      width: 28,
      height: 28,
      'border-width': 2,
      'border-opacity': 0.6,
      'background-opacity': 0.9,
    },
  },
  {
    selector: 'node.suspect',
    style: {
      'background-color': '#ef4444',
      'border-color': '#fca5a5',
      shape: 'ellipse',
    },
  },
  {
    selector: 'node.victim',
    style: {
      'background-color': '#3b82f6',
      'border-color': '#93c5fd',
      shape: 'diamond',
    },
  },
  {
    selector: 'node.location',
    style: {
      'background-color': '#10b981',
      'border-color': '#6ee7b7',
      shape: 'round-rectangle',
    },
  },
  {
    selector: 'node.incident',
    style: {
      'background-color': '#f59e0b',
      'border-color': '#fcd34d',
      shape: 'star',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#06b6d4',
      'background-opacity': 1,
      width: 36,
      height: 36,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': '#374151',
      'target-arrow-color': '#374151',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      opacity: 0.5,
      'arrow-scale': 0.6,
    },
  },
  {
    selector: 'edge.mo_similar',
    style: {
      'line-style': 'dashed',
      'line-color': '#8b5cf6',
      'target-arrow-color': '#8b5cf6',
      width: 2,
      opacity: 0.7,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#06b6d4',
      'target-arrow-color': '#06b6d4',
      width: 2.5,
      opacity: 1,
    },
  },
];

// ─── Node Detail Panel ──────────────────────

interface NodeDetailProps {
  data: Record<string, unknown> | null;
  onClose: () => void;
}

function NodeDetail({ data, onClose }: NodeDetailProps) {
  if (!data) return null;

  return (
    <div className="absolute top-4 right-4 w-72 glass-card p-4 animate-slide-in-right z-10">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={clsx('w-3 h-3 rounded-full', {
            'bg-red-500': data.type === 'suspect',
            'bg-blue-500': data.type === 'victim',
            'bg-emerald-500': data.type === 'location',
            'bg-amber-500': data.type === 'incident',
          })} />
          <span className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            {String(data.type)}
          </span>
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          <ZoomOut size={14} />
        </button>
      </div>
      <h4 className="font-semibold mb-2">{String(data.label)}</h4>
      <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
        {!!data.crimeCategory && <div>Crime: {String(data.crimeCategory).replace(/_/g, ' ')}</div>}
        {!!data.severity && (
          <div className="flex items-center gap-1">
            Severity: <Badge variant="severity" severity={data.severity as any} size="sm">{String(data.severity)}</Badge>
          </div>
        )}
        {!!data.district && <div>District: {String(data.district)}</div>}
        {!!data.aliases && (data.aliases as string[]).length > 0 && (
          <div>Aliases: {(data.aliases as string[]).join(', ')}</div>
        )}
        {!!data.incidentCount && <div>Linked Incidents: {String(data.incidentCount)}</div>}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────

interface NetworkGraphProps {
  className?: string;
  height?: string;
}

export function NetworkGraph({ className, height = '500px' }: NetworkGraphProps) {
  const [elements, setElements] = useState<CytoscapeElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Record<string, unknown> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(
    new Set(['suspect', 'victim', 'location', 'incident'])
  );
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    (async () => {
      const data = await getNetworkGraph();
      setElements(toCytoscapeElements(data));
      setLoading(false);
    })();
  }, []);

  const filteredElements = elements.filter(el => {
    if ('source' in el.data) return true; // edges always shown
    return visibleTypes.has(el.data.type as NodeType);
  });

  const handleCyReady = useCallback((cy: cytoscape.Core) => {
    cyRef.current = cy;

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      setSelectedNode(node.data());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
      }
    });

    // Run layout
    cy.layout({
      name: 'cose',
      animate: true,
      animationDuration: 800,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 80,
      gravity: 0.25,
      padding: 30,
    } as any).run();
  }, []);

  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3);
  const handleFit = () => cyRef.current?.fit(undefined, 30);
  const handleReLayout = () => {
    cyRef.current?.layout({
      name: 'cose',
      animate: true,
      animationDuration: 800,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 80,
      gravity: 0.25,
    } as any).run();
  };

  const handleSearch = () => {
    if (!cyRef.current || !searchQuery) return;
    const found = cyRef.current.$(`node[label @*= "${searchQuery}"]`);
    if (found.length > 0) {
      cyRef.current.animate({ fit: { eles: found, padding: 50 } }, { duration: 500 });
      found.select();
      setSelectedNode(found.first().data());
    }
  };

  const toggleType = (type: NodeType) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const nodeTypeLegend: { type: NodeType; color: string; label: string }[] = [
    { type: 'suspect', color: '#ef4444', label: 'Suspects' },
    { type: 'victim', color: '#3b82f6', label: 'Victims' },
    { type: 'location', color: '#10b981', label: 'Locations' },
    { type: 'incident', color: '#f59e0b', label: 'Incidents' },
  ];

  return (
    <div className={clsx('glass-card overflow-hidden relative', className)}>
      {/* Controls */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Network Graph</span>
          <Badge variant="outline">{filteredElements.length} elements</Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-1 bg-[var(--bg-elevated)] rounded-lg px-2.5 py-1.5">
            <Search size={14} className="text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search nodes..."
              className="bg-transparent text-xs text-[var(--text-primary)] outline-none w-32 placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 bg-[var(--bg-elevated)] rounded-lg">
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-white/5 rounded-l-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <ZoomIn size={14} />
            </button>
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <ZoomOut size={14} />
            </button>
            <button onClick={handleFit} className="p-1.5 hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Maximize2 size={14} />
            </button>
            <button onClick={handleReLayout} className="p-1.5 hover:bg-white/5 rounded-r-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Type Filter */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border-subtle)]">
        <span className="text-xs text-[var(--text-muted)]">Show:</span>
        {nodeTypeLegend.map(({ type, color, label }) => (
          <button
            key={type}
            onClick={() => toggleType(type)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
              visibleTypes.has(type)
                ? 'bg-white/5 text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] opacity-50'
            )}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Graph */}
      <div style={{ height }} className="relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-cyan)] animate-spin" />
          </div>
        ) : (
          <CytoscapeComponent
            elements={filteredElements}
            stylesheet={cyStylesheet}
            style={{ width: '100%', height: '100%' }}
            cy={(cy) => handleCyReady(cy)}
            boxSelectionEnabled={false}
          />
        )}

        {/* Node Detail Overlay */}
        <NodeDetail data={selectedNode} onClose={() => setSelectedNode(null)} />
      </div>
    </div>
  );
}
