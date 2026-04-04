import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ToastProvider, ApprovalBanner } from './components/shared';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import GoogleCallback from './pages/GoogleCallback';
import Dashboard from './pages/Dashboard';
import MySubmissions from './pages/MySubmissions';
import UsersPage from './pages/Users';
import DocumentGuidancePage from './pages/DocumentGuidance';
import ProfilePage from './pages/Profile';
import SystemPromptPage from './pages/SystemPrompt';
import AuditLogPage from './pages/AuditLog';
import SubmissionPage from './pages/SubmissionPage';
import ComposeModal from './components/ComposeModal';
import { Spinner } from './components/shared';
import { useState } from 'react';

function AppShell() {
  const { user } = useAuth();
  const isFounder = user?.role === 'founder' || user?.role === 'admin';
  const canCompose = user?.role === 'team_member' && user.is_active;
  const [composing, setComposing] = useState(false);

  const PAGE_TITLES: Record<string, string> = {
    '/dashboard': 'Founder Dashboard',
    '/review': 'Review Queue',
    '/compose': 'Compose',
    '/submissions': 'My Submissions',
    '/users': 'People',
    '/document-guidance': 'Document Guidance',
    '/profile': 'My Profile',
    '/admin/system-prompt': 'Brand Voice',
    '/admin/audit-log': 'Audit Log',
  };
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? 'AI Document Review & Approval Tool';

  return (
    <ToastProvider>
      <div className="layout">
        <Sidebar />
        <main className="main">
          <header className="topbar">
            <div className="topbar-title">{title}</div>
            <div className="topbar-actions">
              {canCompose && (
                <button className="btn btn-primary" onClick={() => setComposing(true)}>
                  ✦ Compose
                </button>
              )}
            </div>
          </header>

          {user && !user.is_active && (
            <div className="content" style={{ paddingBottom: 0 }}>
              <ApprovalBanner isFounder={isFounder} />
            </div>
          )}

          <Routes>
            <Route path="/" element={<Navigate to={isFounder ? '/dashboard' : '/submissions'} replace />} />
            <Route path="/dashboard" element={isFounder ? <Dashboard /> : <Navigate to="/submissions" replace />} />
            <Route path="/review" element={isFounder ? <Dashboard /> : <Navigate to="/submissions" replace />} />
            <Route path="/users" element={isFounder ? <UsersPage /> : <Navigate to="/submissions" replace />} />
            <Route path="/document-guidance" element={isFounder ? <DocumentGuidancePage /> : <Navigate to="/submissions" replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/submissions" element={<MySubmissions />} />
            <Route path="/compose" element={canCompose ? (
              <div className="content">
                <ComposeModal onClose={() => window.history.back()} onCreated={() => window.location.href = '/submissions'} />
              </div>
            ) : <Navigate to="/submissions" replace />} />
            {isFounder && (
              <>
                <Route path="/admin/system-prompt" element={<SystemPromptPage />} />
                <Route path="/admin/audit-log" element={<AuditLogPage />} />
              </>
            )}
            <Route path="/submission/:id" element={<SubmissionPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {composing && (
        <ComposeModal
          onClose={() => setComposing(false)}
          onCreated={() => { setComposing(false); window.location.href = '/submissions'; }}
        />
      )}
    </ToastProvider>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="loading-page">
        <div style={{ textAlign: 'center' }}>
          <Spinner dark />
          <div style={{ marginTop: 14, fontSize: 13, color: 'var(--ink-soft)' }}>Loading…</div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/google/callback" element={<GoogleCallback />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
