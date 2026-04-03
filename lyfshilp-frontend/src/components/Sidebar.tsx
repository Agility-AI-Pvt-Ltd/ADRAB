import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from './shared';
import { adminApi } from '../api';

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
  const [stakeholders, setStakeholders] = useState<string[]>([]);
  const [showStakeholders, setShowStakeholders] = useState(false);

  const isFounder = user?.role === 'founder' || user?.role === 'admin';
  const canCompose = user?.role === 'team_member' && user.is_active;

  useEffect(() => {
    if (isFounder) {
      adminApi.stakeholderGuidance()
        .then(res => setStakeholders(res.data.map((s: any) => s.stakeholder)))
        .catch(() => {});
    }
  }, [isFounder]);

  // Handle initial expand on mount
  useEffect(() => {
    if (location.pathname.startsWith('/admin/system-prompt') && 
        (location.hash === '#stakeholders' || location.hash.startsWith('#stakeholder-'))) {
      setShowStakeholders(true);
    }
  }, []); // Only on mount

  const ROLE_LABELS: Record<string, string> = {
    founder: 'Founder',
    team_member: 'Team Member',
    admin: 'Admin',
  };

  const isOnBrandVoice = location.pathname.startsWith('/admin/system-prompt');
  const isOnDocumentGuidance = location.pathname.startsWith('/document-guidance');
  const isOnAiReviewEngine = isOnBrandVoice && location.hash === '#review-engine';
  const isOnEmojiRules = isOnBrandVoice && location.hash === '#emoji-rules';
  const isOnStakeholderRules =
    isOnBrandVoice && (location.hash === '#stakeholders' || location.hash.startsWith('#stakeholder-'));
  const isOnPromptHistory = isOnBrandVoice && location.hash === '#history';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--ink)',
          color: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '16px', flexShrink: 0, fontFamily: '"Playfair Display", serif'
        }}>L.</div>
        <div>
          <div className="logo-mark" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Lyfshilp.com <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></div>
          <div className="logo-sub" style={{ marginTop: 0 }}>AI Doc Tool</div>
        </div>
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
              to="/document-guidance"
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span>{ICONS.guidance}</span>
              Document Guidance
            </NavLink>
            <NavLink
              to="/admin/system-prompt#review-engine"
              className={() => `nav-item${isOnAiReviewEngine ? ' active' : ''}`}
            >
              <span>{ICONS.review}</span>
              AI Review Engine
            </NavLink>
            <NavLink
              to="/admin/system-prompt#emoji-rules"
              className={() => `nav-item${isOnEmojiRules ? ' active' : ''}`}
            >
              <span>{ICONS.guidance}</span>
              Emoji Rules
            </NavLink>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Link
                to="/admin/system-prompt#stakeholders"
                className={`nav-item${isOnStakeholderRules ? ' active' : ''}`}
                onClick={() => {
                  if (isOnStakeholderRules) {
                    setShowStakeholders(!showStakeholders);
                  } else {
                    setShowStakeholders(true);
                  }
                }}
              >
                <span>{ICONS.users}</span>
                Stakeholder Rules
                {isOnStakeholderRules && <span style={{ fontSize: 10, alignSelf: 'center', marginLeft: 'auto', paddingRight: 6 }}>{showStakeholders ? '▼' : '▶'}</span>}
              </Link>
              {isOnStakeholderRules && showStakeholders && (
                <div className="nav-sub">
                  {stakeholders.map((s) => (
                    <Link
                      key={s}
                      to={`/admin/system-prompt#stakeholder-${s}`}
                      className={`nav-sub-item${location.hash === `#stakeholder-${s}` ? ' active' : ''}`}
                      style={{ fontSize: 12.5, padding: '4px 12px 4px 12px', textTransform: 'capitalize' }}
                    >
                      <span style={{ opacity: 0.5, marginRight: 6 }}>—</span> {s.replace(/_/g, ' ')}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <NavLink
              to="/admin/system-prompt"
              className={() => `nav-item${isOnBrandVoice && !location.hash ? ' active' : ''}`}
            >
              <span>{ICONS.admin}</span>
              Brand Voice
            </NavLink>
            <NavLink
              to="/admin/system-prompt#history"
              className={() => `nav-item${isOnPromptHistory ? ' active' : ''}`}
            >
              <span>{ICONS.admin}</span>
              Prompt History
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
            color: 'var(--ink-soft)', fontSize: 16, padding: '4px',
            flexShrink: 0,
          }}
        >
          {ICONS.logout}
        </button>
      </div>
    </aside>
  );
}
