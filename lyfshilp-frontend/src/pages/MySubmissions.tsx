import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { submissionsApi } from '../api';
import { cachedFetch, invalidateCache } from '../utils/apiCache';
import { StatusBadge, ScoreBadge, DocTypeChip, fmtDateTime, Spinner, ApprovalBanner, TextPreview } from '../components/shared';
import ComposeModal from '../components/ComposeModal';
import { useAuth } from '../contexts/AuthContext';
import type { Submission } from '../types';

export default function MySubmissions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCompose = user?.role === 'team_member' && user.is_active;
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  async function load(forceRefresh = false) {
    if (forceRefresh) {
      invalidateCache('my_submissions');
      setLoading(true);
    } else if (submissions.length === 0) {
      setLoading(true);
    }
    
    try {
      const data = await cachedFetch(
        'my_submissions',
        () => submissionsApi.my().then(r => r.data),
        {
          ttl: 30_000,             // Fresh for 30s
          staleTtl: 30 * 60_000,   // Stale-while-revalidate for 30m
          onRefresh: (fresh) => setSubmissions(fresh)
        }
      );
      setSubmissions(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = submissions.filter(s => !statusFilter || s.status === statusFilter);

  // Counts
  const counts = {
    total: submissions.length,
    approved: submissions.filter(s => s.status === 'approved').length,
    pending: submissions.filter(s => s.status === 'pending' || s.status === 'under_review').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  };

  return (
    <div className="content">
      {user && !user.is_active && (
        <div style={{ marginBottom: 18 }}>
          <ApprovalBanner />
        </div>
      )}

      {/* Mini stats */}
      <div className="stats-row">
        <div className="stat-card total">
          <div className="stat-label">Total</div>
          <div className="stat-value">{counts.total}</div>
          <div className="stat-sub">Documents created</div>
        </div>
        <div className="stat-card approved">
          <div className="stat-label">Approved</div>
          <div className="stat-value">{counts.approved}</div>
          <div className="stat-sub">Ready to send</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-label">In Review</div>
          <div className="stat-value">{counts.pending}</div>
          <div className="stat-sub">Awaiting decision</div>
        </div>
        <div className="stat-card rejected">
          <div className="stat-label">Rejected</div>
          <div className="stat-value">{counts.rejected}</div>
          <div className="stat-sub">Needs revision</div>
        </div>
      </div>

      <div className="filters-row">
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="btn btn-outline btn-sm" onClick={() => load(true)}>↺ Refresh</button>
        <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)} style={{ marginLeft: 'auto' }} disabled={!canCompose}>
          ✦ Compose
        </button>
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">My Submissions</span>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{filtered.length} document{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}><Spinner dark /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✦</div>
            <div className="empty-state-title">No submissions yet</div>
            <div className="empty-state-desc">
              <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)} disabled={!canCompose}>
                Compose your first document
              </button>
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Preview</th>
                <th>Stakeholder</th>
                <th>AI Score</th>
                <th>Status</th>
                <th>Version</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td><DocTypeChip type={s.doc_type} /></td>
                  <td style={{ maxWidth: 240 }}>
                    <TextPreview text={s.content} maxLines={2} containerWidth={220} />
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{s.stakeholder}</td>
                  <td><ScoreBadge score={s.ai_score} /></td>
                  <td><StatusBadge status={s.status} /></td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>v{s.version}</td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{fmtDateTime(s.created_at)}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => navigate('/submission/' + s.id)}>
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {composing && canCompose && (
        <ComposeModal onClose={() => setComposing(false)} onCreated={() => load(true)} />
      )}
    </div>
  );
}
