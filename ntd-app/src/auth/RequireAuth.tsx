import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { canAccess, firstAllowedPath } from '../lib/api';

export default function RequireAuth({
  children,
  role,
  permission,
  allowTeam,
}: {
  children: ReactNode;
  role?: 'admin';
  permission?: string;
  allowTeam?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth">
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Checking your session…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // The route is guarded on the server too; this only keeps the UI honest.
  if (role && user.role !== role) return <Navigate to="/dashboard" replace />;
  if (permission && !canAccess(user, permission)) return <Navigate to="/dashboard" replace />;
  if (!role && !permission && !allowTeam && user.role === 'team') return <Navigate to={firstAllowedPath(user)} replace />;

  return <>{children}</>;
}
