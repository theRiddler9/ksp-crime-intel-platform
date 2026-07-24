import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, ChevronRight, Eye, Star, BarChart3, Crown, Lock,
} from 'lucide-react';
import { login } from '../services/auth';
import type { UserRole } from '../types/role';
import { ROLE_LABELS } from '../types/role';

const roles: { role: UserRole; icon: typeof Shield; description: string; color: string }[] = [
  { role: 'constable', icon: Shield, description: 'Beat area incidents, FIR submission', color: '#3b82f6' },
  { role: 'sho', icon: Eye, description: 'Station management, flag review, trends', color: '#06b6d4' },
  { role: 'sp', icon: Star, description: 'District intel, network analysis, escalations', color: '#8b5cf6' },
  { role: 'analyst', icon: BarChart3, description: 'Full toolkit — maps, graphs, MO matches', color: '#10b981' },
  { role: 'dgp', icon: Crown, description: 'State overview, AI briefings, critical flags', color: '#f59e0b' },
];

export function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!selectedRole) return;
    setIsLoggingIn(true);
    // Simulate auth delay
    await new Promise(r => setTimeout(r, 600));
    login(selectedRole);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-cyan-500/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-600/5 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-purple-500/3 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-lg animate-scale-in">
        {/* Logo Header */}
        <div className="text-center mb-8">
          <img 
            src="/logo.svg" 
            alt="KSP Logo" 
            className="w-20 h-20 object-contain mx-auto mb-5 drop-shadow-lg"
          />
          <h1 className="text-2xl font-bold tracking-tight gradient-text">
            KSP Crime Intel Platform
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Karnataka State Police — Intelligence Analytics
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock size={16} className="text-[var(--text-muted)]" />
            <h2 className="text-sm font-semibold">Select Your Role</h2>
            <span className="text-xs text-[var(--text-muted)] ml-auto">Demo Mode</span>
          </div>

          {/* Role Selection */}
          <div className="space-y-2 mb-6 stagger-children">
            {roles.map(({ role, icon: Icon, description, color }) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all duration-200 group ${
                  selectedRole === role
                    ? 'bg-white/[0.06] border border-[var(--border-accent)] shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                    : 'border border-transparent hover:bg-white/[0.03] hover:border-[var(--border-subtle)]'
                }`}
              >
                <div
                  className="p-2.5 rounded-xl shrink-0 transition-all duration-200"
                  style={{
                    background: selectedRole === role
                      ? `color-mix(in srgb, ${color} 20%, transparent)`
                      : 'var(--bg-elevated)',
                  }}
                >
                  <Icon size={18} style={{ color: selectedRole === role ? color : 'var(--text-muted)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{ROLE_LABELS[role]}</div>
                  <div className="text-xs text-[var(--text-muted)] truncate">{description}</div>
                </div>
                <ChevronRight
                  size={16}
                  className={`shrink-0 transition-all duration-200 ${
                    selectedRole === role ? 'text-[var(--accent-cyan)] translate-x-0' : 'text-[var(--text-muted)] opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0'
                  }`}
                />
              </button>
            ))}
          </div>

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={!selectedRole || isLoggingIn}
            className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isLoggingIn ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <Lock size={16} />
                Sign In as {selectedRole ? ROLE_LABELS[selectedRole] : '...'}
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-[var(--text-muted)] mt-4 uppercase tracking-wider">
            In production, this will use Catalyst Authentication SDK
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-[var(--text-muted)]">
          © 2025 Karnataka State Police — Crime Intelligence Division
        </div>
      </div>
    </div>
  );
}
