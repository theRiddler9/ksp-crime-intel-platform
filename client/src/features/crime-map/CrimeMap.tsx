import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMap } from 'react-leaflet';
import clsx from 'clsx';
import { Filter, Layers, ChevronDown, X } from 'lucide-react';
import { Badge } from '../../components/ui';
import { mockIncidents, mockHotspots, KARNATAKA_DISTRICTS } from '../../services/mockData';
import type { Incident, CrimeCategory, SeverityLevel } from '../../types/incident';
import type { HotspotScore } from '../../types/analytics';
import 'leaflet/dist/leaflet.css';

// ─── Map Resizer ────────────────────────────

function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// ─── Severity colors ────────────────────────

const severityColors: Record<SeverityLevel, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#10b981',
};

const hotspotColors: Record<SeverityLevel, string> = {
  critical: 'rgba(239, 68, 68, 0.2)',
  high: 'rgba(245, 158, 11, 0.15)',
  medium: 'rgba(59, 130, 246, 0.12)',
  low: 'rgba(16, 185, 129, 0.1)',
};

// ─── Main Component ─────────────────────────

interface CrimeMapProps {
  districtFilter?: string;
  className?: string;
  height?: string;
  showControls?: boolean;
  incidents?: Incident[];
  hotspots?: HotspotScore[];
}

export function CrimeMap({
  districtFilter,
  className,
  height = '500px',
  showControls = true,
  incidents: propIncidents,
  hotspots: propHotspots,
}: CrimeMapProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSeverities, setSelectedSeverities] = useState<SeverityLevel[]>(['critical', 'high', 'medium', 'low']);
  const [selectedCategories, setSelectedCategories] = useState<CrimeCategory[]>([]);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const incidents = propIncidents || mockIncidents();
  const hotspots = propHotspots || mockHotspots();

  const filteredIncidents = useMemo(() => {
    let filtered = incidents;
    if (districtFilter) {
      filtered = filtered.filter(i => i.location.district === districtFilter);
    }
    if (selectedSeverities.length < 4) {
      filtered = filtered.filter(i => selectedSeverities.includes(i.severity));
    }
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(i => selectedCategories.includes(i.crimeCategory));
    }
    return filtered;
  }, [incidents, districtFilter, selectedSeverities, selectedCategories]);

  const center: [number, number] = districtFilter
    ? (() => {
        const d = KARNATAKA_DISTRICTS.find(d => d.name === districtFilter);
        return d ? [d.lat, d.lng] : [12.9716, 77.5946];
      })()
    : [12.9716, 77.5946];

  const zoom = districtFilter ? 11 : 7;

  const toggleSeverity = (s: SeverityLevel) => {
    setSelectedSeverities(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s],
    );
  };

  return (
    <div className={clsx('glass-card overflow-hidden', className)}>
      {/* Controls Bar */}
      {showControls && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Crime Map</span>
            <Badge variant="outline">
              {filteredIncidents.length} incidents
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHotspots(!showHotspots)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                showHotspots
                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
              )}
            >
              Hotspots
            </button>
            <button
              onClick={() => setShowIncidents(!showIncidents)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                showIncidents
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
              )}
            >
              Incidents
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                showFilters
                  ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5'
              )}
            >
              <Filter size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Filter Panel */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 animate-slide-up">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Severity</div>
              <div className="flex gap-1.5">
                {(['critical', 'high', 'medium', 'low'] as SeverityLevel[]).map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSeverity(s)}
                    className={clsx(
                      'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all',
                      selectedSeverities.includes(s)
                        ? `severity-${s}`
                        : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-subtle)]'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map */}
      <div style={{ height }}>
        <MapContainer
          center={center}
          zoom={zoom}
          className="w-full h-full"
          zoomControl={true}
        >
          <MapResizer />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* Hotspot Circles */}
          {showHotspots && hotspots.map(hs => (
            <Circle
              key={hs.id}
              center={[hs.location.lat, hs.location.lng]}
              radius={hs.radius}
              pathOptions={{
                fillColor: severityColors[hs.riskLevel],
                fillOpacity: 0.2,
                color: severityColors[hs.riskLevel],
                weight: 1,
                opacity: 0.5,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-bold text-[var(--text-primary)]">{hs.location.area}</div>
                  <div className="text-[var(--text-secondary)]">Risk Score: {hs.score}/100</div>
                  <div className="text-[var(--text-secondary)]">Density: {hs.density} incidents</div>
                  <div className="text-[var(--text-secondary)]">Types: {hs.crimeTypes.join(', ')}</div>
                </div>
              </Popup>
            </Circle>
          ))}

          {/* Incident Markers */}
          {showIncidents && filteredIncidents.map(inc => (
            <CircleMarker
              key={inc.id}
              center={[inc.location.coordinates.lat, inc.location.coordinates.lng]}
              radius={6}
              pathOptions={{
                fillColor: severityColors[inc.severity],
                fillOpacity: 0.8,
                color: '#fff',
                weight: 1,
                opacity: 0.3,
              }}
              eventHandlers={{
                click: () => setSelectedIncident(inc),
              }}
            >
              <Popup>
                <div className="text-sm min-w-[200px]">
                  <div className="font-bold mb-1">{inc.title}</div>
                  <div className="text-[var(--text-secondary)] space-y-0.5">
                    <div>FIR: {inc.firNumber}</div>
                    <div>Category: {inc.crimeCategory.replace(/_/g, ' ')}</div>
                    <div>Status: {inc.status.replace(/_/g, ' ')}</div>
                    <div>Station: {inc.location.policeStation}</div>
                    <div>Date: {new Date(inc.dateReported).toLocaleDateString('en-IN')}</div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] flex items-center gap-4">
        <div className="text-xs text-[var(--text-muted)]">Legend:</div>
        {(['critical', 'high', 'medium', 'low'] as SeverityLevel[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: severityColors[s] }} />
            <span className="text-xs text-[var(--text-secondary)] capitalize">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
