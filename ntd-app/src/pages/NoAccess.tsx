import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function NoAccess() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return <main className="auth">
    <section className="auth-card">
      <div className="auth-title">No screens assigned</div>
      <p className="auth-sub">{user?.clientId} is active, but an administrator has not assigned any responsibilities yet.</p>
      <button className="btn primary block" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>Sign out</button>
    </section>
  </main>;
}