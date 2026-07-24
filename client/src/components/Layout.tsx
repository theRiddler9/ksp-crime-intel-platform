import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Map, Network, TrendingUp, Bell, FileText,
  Shield, LogOut, Menu, X, ChevronRight,
  LayoutDashboard, PlusCircle, Sun, Moon,
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
  const [isLightMode, setIsLightMode] = useState(false);
  const navigate = useNavigate();
  const features = ROLE_FEATURES[user.role];

  const visibleItems = navItems.filter(item =>
    item.featureKey === null || features[item.featureKey]
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleTheme = () => {
    setIsLightMode(!isLightMode);
    document.documentElement.classList.toggle('light-mode');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={clsx(
          'flex flex-col h-full bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] transition-all duration-300 ease-in-out z-30',
          sidebarOpen ? 'w-72' : 'w-[76px]',
        )}
      >
        {/* Logo / Header */}
        <div className="flex items-center gap-3 px-5 h-[72px] border-b border-[var(--border-subtle)] shrink-0">
          <img 
            src="/logo.svg" 
            alt="KSP Logo" 
            className="w-10 h-10 object-contain shrink-0 drop-shadow-sm"
          />
          {sidebarOpen && (
            <div className="animate-fade-in overflow-hidden">
              <div className="text-[15px] font-bold tracking-tight whitespace-nowrap">KSP Crime Intel</div>
              <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest">Platform</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-4 space-y-8 overflow-y-auto">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                'flex items-center gap-4 px-4 py-3 rounded-xl text-base font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] shadow-[inset_0_0_0_1px_rgba(6,182,212,0.2)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]',
              )}
            >
              <item.icon size={20} className="shrink-0" />
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

        {/* User Info & Logout */}
        <div className="border-t border-[var(--border-subtle)] p-4 shrink-0 space-y-3">
          {sidebarOpen ? (
            <>
              {/* User card */}
              <div className="glass-card-sm p-3.5 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                    {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="overflow-hidden">
                    <div className="text-sm font-medium truncate">{user.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">{user.station}</div>
                  </div>
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-[var(--border-subtle)]">
                  <RoleBadge role={user.role} size="sm" />
                </div>
              </div>

              {/* Logout button — clearly visible */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 bg-red-500/[0.08] border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-300 transition-all duration-200 cursor-pointer"
              >
                <LogOut size={16} />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full p-2.5 rounded-xl bg-red-500/[0.08] border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200 flex justify-center cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-[72px] border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/80 backdrop-blur-sm flex items-center justify-between px-8 shrink-0">
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
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-white/5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="Toggle Theme"
            >
              {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="w-px h-5 bg-[var(--border-subtle)]" />
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
