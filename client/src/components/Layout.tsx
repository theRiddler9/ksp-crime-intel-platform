import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Map, Network, TrendingUp, Bell, FileText,
  Shield, LogOut, Menu, X, ChevronRight,
  LayoutDashboard, PlusCircle,
} from 'lucide-react';
import type { User } from '../types/role';
import { ROLE_FEATURES, ROLE_LABELS } from '../types/role';
import { RoleBadge } from './ui';
import { logout } from '../services/auth';

interface LayoutProps {
  user: User;
  children: React.ReactNode;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', featureKey: null },
  { to: '/map', icon: Map, label: 'Crime Map', featureKey: 'crimeMap' as const },
  { to: '/network', icon: Network, label: 'Network Analysis', featureKey: 'networkAnalysis' as const },
  { to: '/forecast', icon: TrendingUp, label: 'Risk Forecast', featureKey: 'riskForecast' as const },
  { to: '/alerts', icon: Bell, label: 'Alert Review', featureKey: 'alertReview' as const },
  { to: '/brief', icon: FileText, label: 'Intel Brief', featureKey: 'plainLanguageBrief' as const },
  { to: '/submit', icon: PlusCircle, label: 'Submit FIR', featureKey: 'incidentSubmission' as const },
];

export function Layout({ user, children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const features = ROLE_FEATURES[user.role];

  const visibleItems = navItems.filter(item =>
    item.featureKey === null || features[item.featureKey]
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={clsx(
          'flex flex-col h-full bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-in-out z-30',
          sidebarOpen ? 'w-64' : 'w-[72px]',
        )}
      >
        {/* Logo / Header */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-[var(--border-subtle)] shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
            <Shield size={18} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="animate-fade-in overflow-hidden">
              <div className="text-sm font-bold tracking-tight whitespace-nowrap">KSP Crime Intel</div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Platform</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] shadow-[inset_0_0_0_1px_rgba(6,182,212,0.2)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]',
              )}
            >
              <item.icon size={18} className="shrink-0" />
              {sidebarOpen && (
                <>
                  <span className="animate-fade-in whitespace-nowrap">{item.label}</span>
                  <ChevronRight
                    size={14}
                    className="ml-auto opacity-0 group-hover:opacity-50 transition-opacity"
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User Info */}
        <div className="border-t border-[var(--border-subtle)] p-3 shrink-0">
          {sidebarOpen ? (
            <div className="glass-card-sm p-3 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
                  {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="overflow-hidden">
                  <div className="text-sm font-medium truncate">{user.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">{user.station}</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <RoleBadge role={user.role} size="sm" />
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                  title="Logout"
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full p-2.5 rounded-xl hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-colors flex justify-center"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                {ROLE_LABELS[user.role]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-[var(--text-muted)] mono">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <div className="w-px h-5 bg-[var(--border-subtle)]" />
            <RoleBadge role={user.role} size="sm" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
