import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from './shared';

const ICONS = {
  dashboard: '⊞',
  compose: '✦',
  submissions: '◫',
  review: '◈',
  guidance: '☰',
  admin: '⚙',
  users: '◉',
  logout: '→',
};

export default function Sidebar({ pendingCount }: { pendingCount?: number }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isFounder = user?.role === 'founder' || user?.role === 'admin';
  const canCompose = user?.role === 'team_member' && user.is_active;

  const ROLE_LABELS: Record<string, string> = {
    founder: 'Founder',
    team_member: 'Team Member',
    admin: 'Admin',
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">Lyfshilp</div>
        <div className="logo-sub">AI Doc Tool</div>
      </div>

      <nav className="sidebar-nav">
        {isFounder && (
          <>
            <div className="nav-section-label">Founder</div>
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>{ICONS.dashboard}</span>
              Dashboard
              {pendingCount ? (
                <span className="nav-badge">{pendingCount}</span>
              ) : null}
            </NavLink>
            <NavLink
              to="/review"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>{ICONS.review}</span>
              Review Queue
              {pendingCount ? (
                <span className="nav-badge">{pendingCount}</span>
              ) : null}
            </NavLink>
            <NavLink
              to="/users"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>{ICONS.users}</span>
              People
            </NavLink>
            <NavLink
              to="/document-guidance"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>{ICONS.guidance}</span>
              Document Guidance
            </NavLink>
          </>
        )}

        <div className="nav-section-label">Documents</div>
        {canCompose && (
          <NavLink
            to="/compose"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span>{ICONS.compose}</span>
            Compose
          </NavLink>
        )}
        <NavLink
          to="/submissions"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span>{ICONS.submissions}</span>
          My Submissions
        </NavLink>

        {isFounder && (
          <>
            <div className="nav-section-label">Admin</div>
            <NavLink
              to="/admin/system-prompt"
              className={({ isActive }) =>
                `nav-item${location.pathname.startsWith('/admin') ? ' active' : ''}`
              }
            >
              <span>{ICONS.admin}</span>
              Brand Voice
            </NavLink>
            <NavLink
              to="/admin/audit-log"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>{ICONS.users}</span>
              Audit Log
            </NavLink>
          </>
        )}
      </nav>

      <div className="sidebar-user">
        <Link to="/profile" className="sidebar-user-link">
          <Avatar name={user?.name} email={user?.email} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </div>
            <div className="user-role">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</div>
          </div>
        </Link>
        <button
          onClick={logout}
          title="Sign out"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', fontSize: 16, padding: '4px',
            flexShrink: 0,
          }}
        >
          {ICONS.logout}
        </button>
      </div>
    </aside>
  );
}
