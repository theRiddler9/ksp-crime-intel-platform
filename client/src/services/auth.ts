// ──────────────────────────────────────────────
// Auth service — mock role-based login
// TODO: Replace with Catalyst Authentication SDK
// ──────────────────────────────────────────────

import type { User, UserRole } from '../types/role';
import { mockUser } from './mockData';

const AUTH_KEY = 'ksp_current_user';

export function login(role: UserRole): User {
  const user = mockUser(role);
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(user));
  return user;
}

export function logout(): void {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem('ksp_auth_token');
}

export function getCurrentUser(): User | null {
  const stored = sessionStorage.getItem(AUTH_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as User;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

export function hasRole(required: UserRole | UserRole[]): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  const roles = Array.isArray(required) ? required : [required];
  return roles.includes(user.role);
}
