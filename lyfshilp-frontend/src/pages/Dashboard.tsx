import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { submissionsApi, usersApi } from '../api';
import { StatusBadge, ScoreBadge, DocTypeChip, fmtDateTime, Spinner, useToast, Avatar, TextPreview } from '../components/shared';
import CalendarTimeline from '../components/CalendarTimeline';
import type { DashboardData, Submission, User } from '../types';

const DOC_TYPE_OPTS = ['', 'proposal', 'cold_email', 'reply_email', 'whatsapp', 'linkedin', 'ad_creative', 'payment_followup'];
const STAKEHOLDER_OPTS = ['', 'parent', 'student', 'principal', 'counsellor', 'corporate', 'investor', 'government'];

export default function Dashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [docFilter, setDocFilter] = useState('');
  const [shFilter, setShFilter] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [{ data: d }, { data: listedUsers }] = await Promise.all([
        submissionsApi.dashboard({
          doc_type: docFilter || undefined,
          stakeholder: shFilter || undefined,
        }),
        usersApi.list(),
      ]);
      setData(d);
      setUsers(listedUsers);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [docFilter, shFilter]);

  const pending = data?.pending ?? [];
  const approved = data?.approved ?? [];
  const counts = {
    total: data?.counts?.total ?? 0,
    pending: data?.counts?.pending ?? 0,
    approved: data?.counts?.approved ?? 0,
    rejected: data?.counts?.rejected ?? 0,
    under_review: data?.counts?.under_review ?? 0,
  };
  const pendingApprovals = users.filter(u => u.role === 'team_member' && !u.is_active);

  const filtered = pending.filter(s =>
    !search || s.content.toLowerCase().includes(search.toLowerCase())
  );

  async function approveUser(userId: string) {
    setApprovingUserId(userId);
    try {
      await usersApi.update(userId, { is_active: true });
      toast('success', 'Team member approved successfully');
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not approve team member');
    } finally {
      setApprovingUserId(null);
    }
  }

  function openSubmission(submissionId: string) {
    navigate('/submission/' + submissionId);
  }

  return (
    <div className="content">
      {/* Stat cards */}
      <div className="stats-row">
        <div className="stat-card total">
          <div className="stat-label">Total</div>
          <div className="stat-value">{counts.total}</div>
          <div className="stat-sub">All submissions</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-label">Pending</div>
          <div className="stat-value">{counts.pending}</div>
          <div className="stat-sub">Awaiting review</div>
        </div>
        <div className="stat-card approved">
          <div className="stat-label">Approved</div>
          <div className="stat-value">{counts.approved}</div>
          <div className="stat-sub">Ready to send</div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-label">Rejected</div>
          <div className="stat-value">{counts.rejected}</div>
          <div className="stat-sub">Needs revision</div>
        </div>
      </div>

      <div className="table-card" style={{ marginBottom: 20 }}>
        <div className="table-header">
          <span className="table-title">Pending Account Approvals</span>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {pendingApprovals.length} team member{pendingApprovals.length !== 1 ? 's' : ''} awaiting founder approval
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Spinner dark />
          </div>
        ) : pendingApprovals.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 20px' }}>
            <div className="empty-state-title">No pending account approvals</div>
            <div className="empty-state-desc">Inactive team members will appear here as soon as they sign in.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Auth</th>
                <th>Joined</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingApprovals.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <Avatar name={user.name} email={user.email} size="sm" />
                      <span>{user.name}</span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td style={{ textTransform: 'capitalize' }}>{user.auth_provider}</td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{fmtDateTime(user.created_at)}</td>
                  <td><span className="approval-pill">Awaiting approval</span></td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => approveUser(user.id)}
                      disabled={approvingUserId === user.id}
                    >
                      {approvingUserId === user.id ? 'Approving…' : 'Approve Account'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Filters */}
      <div className="filters-row">
        <select className="filter-select" value={docFilter} onChange={e => setDocFilter(e.target.value)}>
          <option value="">All Doc Types</option>
          {DOC_TYPE_OPTS.filter(Boolean).map(v => (
            <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="filter-select" value={shFilter} onChange={e => setShFilter(e.target.value)}>
          <option value="">All Stakeholders</option>
          {STAKEHOLDER_OPTS.filter(Boolean).map(v => (
            <option key={v} value={v} style={{ textTransform: 'capitalize' }}>{v}</option>
          ))}
        </select>
        <div className="search-wrap">
          <span className="search-icon" style={{ fontSize: 13 }}>⌕</span>
          <input
            className="search-input"
            placeholder="Search content..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="table-header">
          <span className="table-title">Pending Review</span>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{filtered.length} submission{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Spinner dark />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">◈</div>
            <div className="empty-state-title">No submissions to review</div>
            <div className="empty-state-desc">All caught up — great work!</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Author</th>
                <th>Preview</th>
                <th>Type</th>
                <th>Stakeholder</th>
                <th>AI Score</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Version</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="user-cell">
                      <Avatar name={s.author?.name} email={s.author?.email} size="sm" />
                      <span>{s.author?.name ?? 'Unknown user'}</span>
                    </div>
                  </td>
                  <td style={{ maxWidth: 220 }}>
                    <TextPreview text={s.content} maxLines={2} containerWidth={200} />
                  </td>
                  <td><DocTypeChip type={s.doc_type} /></td>
                  <td style={{ textTransform: 'capitalize' }}>{s.stakeholder}</td>
                  <td><ScoreBadge score={s.ai_score} /></td>
                  <td><StatusBadge status={s.status} /></td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                    {s.submitted_at ? fmtDateTime(s.submitted_at) : '—'}
                  </td>
                  <td>v{s.version}</td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => openSubmission(s.id)}
                    >
                      Review →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Approved Submissions */}
      <div className="table-card" style={{ marginTop: 24 }}>
        <div className="table-header">
          <span className="table-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green-700, #15803d)', display: 'inline-block' }} />
            Approved Submissions
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            {approved.filter(s => !search || s.content.toLowerCase().includes(search.toLowerCase())).length} submission{approved.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}><Spinner dark /></div>
        ) : approved.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✓</div>
            <div className="empty-state-title">No approved submissions yet</div>
            <div className="empty-state-desc">Approved documents will appear here once reviewed.</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Author</th>
                <th>Preview</th>
                <th>Type</th>
                <th>Stakeholder</th>
                <th>AI Score</th>
                <th>Approved</th>
                <th>Version</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {approved
                .filter(s => !search || s.content.toLowerCase().includes(search.toLowerCase()))
                .map(s => (
                  <tr key={s.id}>
                    <td>
                      <div className="user-cell">
                        <Avatar name={s.author?.name} email={s.author?.email} size="sm" />
                        <span>{s.author?.name ?? 'Unknown user'}</span>
                      </div>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <TextPreview text={s.content} maxLines={2} containerWidth={200} />
                    </td>
                    <td><DocTypeChip type={s.doc_type} /></td>
                    <td style={{ textTransform: 'capitalize' }}>{s.stakeholder}</td>
                    <td><ScoreBadge score={s.ai_score} /></td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {s.reviewed_at ? fmtDateTime(s.reviewed_at) : '—'}
                    </td>
                    <td>v{s.version}</td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openSubmission(s.id)}
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <CalendarTimeline
        submissions={[...(data?.pending ?? []), ...(data?.recent ?? [])]}
        onSelect={(submission) => openSubmission(submission.id)}
      />
    </div>
  );
}
