import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CrimeMap } from './features/crime-map/CrimeMap';
import { NetworkGraph } from './features/network-analysis/NetworkGraph';
import { RiskForecast } from './features/risk-forecast/RiskForecast';
import { AlertReview } from './features/alert-review/AlertReview';
import { BriefView } from './features/plain-language-brief/BriefView';
import { getCurrentUser, isAuthenticated } from './services/auth';
import { ROLE_FEATURES } from './types/role';
import { mockFlags } from './services/mockData';

// ─── Route Guard ────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// ─── Feature Route Guard ────────────────────

function FeatureRoute({ featureKey, children }: { featureKey: keyof typeof ROLE_FEATURES.constable; children: React.ReactNode }) {
  const user = getCurrentUser();
  if (!user || !ROLE_FEATURES[user.role][featureKey]) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

// ─── Layout Wrapper ─────────────────────────

function AppLayout({ children }: { children: React.ReactNode }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout user={user}>{children}</Layout>;
}

// ─── Standalone Feature Pages ───────────────

function MapPage() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Crime Map</h1>
        <p>Geospatial incident visualization and hotspot analysis across Karnataka</p>
      </div>
      <CrimeMap height="calc(100vh - 220px)" />
    </div>
  );
}

function NetworkPage() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Network Analysis</h1>
        <p>Suspect–victim–location relationship graph and MO-similarity matching</p>
      </div>
      <NetworkGraph height="calc(100vh - 220px)" />
    </div>
  );
}

function AlertsPage() {
  const flags = mockFlags();
  return <AlertReview flags={flags} />;
}

function SubmitPage() {
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <h1>Submit New FIR</h1>
        <p>Report a new incident or First Information Report</p>
      </div>
      <div className="glass-card p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">📋</span>
        </div>
        <h3 className="text-lg font-semibold mb-2">FIR Submission Form</h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-6">
          This form will connect to the <code className="mono text-[var(--accent-cyan)]">intake-incident</code> Catalyst Function
          to validate and persist the FIR data.
        </p>
        <div className="glass-card-sm p-6 max-w-lg mx-auto text-left space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">Crime Category</label>
            <select className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]">
              <option>Select category...</option>
              <option>Theft</option>
              <option>Burglary</option>
              <option>Robbery</option>
              <option>Assault</option>
              <option>Cybercrime</option>
              <option>Fraud</option>
              <option>Vehicle Theft</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">Description</label>
            <textarea
              rows={3}
              placeholder="Describe the incident..."
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">Date of Occurrence</label>
              <input type="date" className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">IPC Section</label>
              <input type="text" placeholder="e.g. IPC 379" className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1 uppercase tracking-wider">Location</label>
            <input type="text" placeholder="Address or area" className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-accent)]" />
          </div>
          <button className="btn-primary w-full py-2.5">
            Submit FIR
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App Root ───────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected — wrapped in Layout */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <AppLayout><DashboardPage /></AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/map" element={
          <ProtectedRoute>
            <AppLayout>
              <FeatureRoute featureKey="crimeMap"><MapPage /></FeatureRoute>
            </AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/network" element={
          <ProtectedRoute>
            <AppLayout>
              <FeatureRoute featureKey="networkAnalysis"><NetworkPage /></FeatureRoute>
            </AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/forecast" element={
          <ProtectedRoute>
            <AppLayout>
              <FeatureRoute featureKey="riskForecast"><RiskForecast /></FeatureRoute>
            </AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/alerts" element={
          <ProtectedRoute>
            <AppLayout>
              <FeatureRoute featureKey="alertReview"><AlertsPage /></FeatureRoute>
            </AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/brief" element={
          <ProtectedRoute>
            <AppLayout>
              <FeatureRoute featureKey="plainLanguageBrief"><BriefView /></FeatureRoute>
            </AppLayout>
          </ProtectedRoute>
        } />
        <Route path="/submit" element={
          <ProtectedRoute>
            <AppLayout>
              <FeatureRoute featureKey="incidentSubmission"><SubmitPage /></FeatureRoute>
            </AppLayout>
          </ProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
