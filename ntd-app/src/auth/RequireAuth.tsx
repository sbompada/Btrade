import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  role?: 'admin';
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

  return <>{children}</>;
}
