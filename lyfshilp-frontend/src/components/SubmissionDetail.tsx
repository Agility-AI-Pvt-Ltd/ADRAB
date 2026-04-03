import { useState } from 'react';
import { Modal, StatusBadge, ScoreBadge, DocTypeChip, fmtDateTime, Spinner, useToast, Avatar } from './shared';
import { submissionsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import type { Submission } from '../types';
import { useAutoResize } from '../hooks/useAutoResize';
import { useTextMeasure } from '../hooks/useTextMeasure';

interface Props {
  submission: Submission;
  onClose: () => void;
  onUpdated: (s: Submission) => void;
}

const DIM_LABELS: Record<string, string> = {
  tone_voice: 'Tone & Voice',
  format_structure: 'Format & Structure',
  stakeholder_fit: 'Stakeholder Fit',
  missing_elements: 'Missing Elements',
  improvement_scope: 'Improvement Scope',
};

// Collapsible content display — collapse threshold (lines)
const COLLAPSE_LINES = 7;

export default function SubmissionDetail({ submission, onClose, onUpdated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isFounder = user?.role === 'founder' || user?.role === 'admin';

  const [tab, setTab] = useState<'content' | 'ai' | 'review'>('content');
  const [reviewAction, setReviewAction] = useState<'approve' | 'approve_with_edits' | 'reject'>('approve');
  const [founderNote, setFounderNote] = useState('');
  const [editedContent, setEditedContent] = useState(submission.content);
  const [submitting, setSubmitting] = useState(false);
  const [resubmitContent, setResubmitContent] = useState(submission.content);
  const [resubmitting, setResubmitting] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);

  // Pretext.js — measure content text at ~620px (modal content width minus padding)
  // Returns lineCount via pure arithmetic after one-time Canvas prepare()
  const CONTENT_WIDTH = 620;
  const { lineCount: contentLines } = useTextMeasure(
    submission.content,
    CONTENT_WIDTH,
    { fontSize: 13, lineHeightRatio: 1.7, fontFamily: 'Inter, sans-serif' }
  );
  const contentIsLong = contentLines > COLLAPSE_LINES;
  const collapsedHeight = COLLAPSE_LINES * (13 * 1.7); // px

  // Auto-resize refs for all editable textareas
  const editedContentRef = useAutoResize(editedContent, { minHeight: 200, maxHeight: 500 });
  const founderNoteRef   = useAutoResize(founderNote, { minHeight: 100, maxHeight: 300 });
  const resubmitRef      = useAutoResize(resubmitContent, { minHeight: 220, maxHeight: 500 });

  const scorecard = submission.ai_scorecard;
  const dimensions = scorecard?.dimensions;

  async function handleReview() {
    setSubmitting(true);
    try {
      const { data } = await submissionsApi.review(submission.id, reviewAction, {
        edited_content: reviewAction === 'approve_with_edits' ? editedContent : undefined,
        founder_note: founderNote || undefined,
      });
      toast('success', `Submission ${reviewAction.replace(/_/g, ' ')}d`);
      onUpdated(data);
      onClose();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Review failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResubmit() {
    setResubmitting(true);
    try {
      const { data } = await submissionsApi.resubmit(submission.id, resubmitContent);
      toast('success', 'Resubmitted successfully');
      onUpdated(data);
      onClose();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Resubmit failed');
    } finally {
      setResubmitting(false);
    }
  }

  const canReview = isFounder && (submission.status === 'pending' || submission.status === 'under_review');
  const canResubmit = !isFounder && submission.status === 'rejected';

  return (
    <Modal
      title="Submission Detail"
      subtitle={`Version ${submission.version} · ${submission.doc_type.replace(/_/g, ' ')}`}
      onClose={onClose}
      size="lg"
    >
      {/* Header meta strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <DocTypeChip type={submission.doc_type} />
        <StatusBadge status={submission.status} />
        <ScoreBadge score={submission.ai_score} />
        {submission.ai_score !== null && (
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>AI Score</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>
          {fmtDateTime(submission.created_at)}
        </span>
      </div>

      {/* Meta grid */}
      <div className="meta-grid" style={{ marginBottom: 20 }}>
        {submission.author && (
          <div className="meta-item">
            <div className="meta-key">Author</div>
            <div className="meta-val">
              <div className="user-cell">
                <Avatar name={submission.author.name} email={submission.author.email} size="sm" />
                <span>{submission.author.name}</span>
              </div>
            </div>
          </div>
        )}
        <div className="meta-item">
          <div className="meta-key">Stakeholder</div>
          <div className="meta-val" style={{ textTransform: 'capitalize' }}>{submission.stakeholder}</div>
        </div>
        <div className="meta-item">
          <div className="meta-key">Version</div>
          <div className="meta-val">v{submission.version}</div>
        </div>
        {submission.submitted_at && (
          <div className="meta-item">
            <div className="meta-key">Submitted</div>
            <div className="meta-val">{fmtDateTime(submission.submitted_at)}</div>
          </div>
        )}
        {submission.reviewed_at && (
          <div className="meta-item">
            <div className="meta-key">Reviewed</div>
            <div className="meta-val">{fmtDateTime(submission.reviewed_at)}</div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab-btn ${tab === 'content' ? 'active' : ''}`} onClick={() => setTab('content')}>
          Content
        </button>
        {scorecard && (
          <button className={`tab-btn ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            AI Analysis
          </button>
        )}
        {(canReview || canResubmit) && (
          <button className={`tab-btn ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
            {canReview ? 'Review' : 'Resubmit'}
          </button>
        )}
      </div>

      {/* Content tab — Pretext-measured collapsible display */}
      {tab === 'content' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="detail-section-title" style={{ marginBottom: 0 }}>Document Content</div>
            {contentIsLong && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 11,
                  color: 'var(--ink-soft)',
                  fontFamily: 'DM Mono, monospace',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '2px 7px',
                }}>
                  {contentLines} lines
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setContentExpanded(e => !e)}
                  style={{ fontSize: 12, padding: '3px 10px' }}
                >
                  {contentExpanded ? '▲ Show less' : '▼ Show more'}
                </button>
              </div>
            )}
          </div>

          {/* Height animates between collapsed (Pretext) and auto */}
          <div
            className="content-display"
            style={{
              maxHeight: contentIsLong && !contentExpanded ? `${collapsedHeight}px` : undefined,
              overflow: contentIsLong && !contentExpanded ? 'hidden' : 'visible',
              maskImage: contentIsLong && !contentExpanded
                ? 'linear-gradient(to bottom, black 60%, transparent 100%)'
                : undefined,
              WebkitMaskImage: contentIsLong && !contentExpanded
                ? 'linear-gradient(to bottom, black 60%, transparent 100%)'
                : undefined,
              transition: 'max-height 0.25s ease',
            }}
          >
            {submission.content}
          </div>

          {contentIsLong && !contentExpanded && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setContentExpanded(true)}
              style={{ marginTop: 6, fontSize: 12 }}
            >
              ▼ Show full content ({contentLines} lines)
            </button>
          )}

          {submission.feedback?.founder_note && (
            <div style={{ marginTop: 16 }}>
              <div className="detail-section-title">Founder Note</div>
              <div className="founder-note-box">{submission.feedback.founder_note}</div>
            </div>
          )}
          {submission.feedback?.ai_generated_note && (
            <div style={{ marginTop: 12 }}>
              <div className="detail-section-title">AI Rejection Note</div>
              <div className="founder-note-box" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: '#f0b0a8' }}>
                {submission.feedback.ai_generated_note}
              </div>
            </div>
          )}

          {submission.file_url && (
            <div style={{ marginTop: 16 }}>
              <div className="detail-section-title">Attached File</div>
              <a
                href={submission.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm"
                style={{ display: 'inline-flex' }}
              >
                📎 {submission.file_name ?? 'Download file'}
              </a>
            </div>
          )}
        </div>
      )}

      {/* AI Analysis tab */}
      {tab === 'ai' && scorecard && (
        <div>
          {/* Score overview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '16px 20px', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, fontFamily: 'Playfair Display, serif', fontWeight: 700, color: 'var(--green-900)', lineHeight: 1 }}>
                {scorecard.score}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>out of 100</div>
            </div>
            <div style={{ flex: 1 }}>
              {dimensions && Object.entries(dimensions).map(([key, val]) => (
                <div key={key} className="dim-row">
                  <div className="dim-label">{DIM_LABELS[key] ?? key}</div>
                  <div className="dim-bar-track">
                    <div className="dim-bar-fill" style={{ width: `${(val / 20) * 100}%` }} />
                  </div>
                  <div className="dim-score">{val}/20</div>
                </div>
              ))}
            </div>
          </div>

          {/* Suggestions */}
          {scorecard.suggestions?.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="detail-section-title">Suggested Improvements</div>
              {scorecard.suggestions.map((s, i) => (
                <div key={i} className="suggestion-item">
                  <div className="suggestion-original">{s.original}</div>
                  <div className="suggestion-replacement">→ {s.replacement}</div>
                  <div className="suggestion-reason">{s.reason}</div>
                </div>
              ))}
            </div>
          )}

          {/* AI Rewrite */}
          {scorecard.rewrite && (
            <div>
              <div className="detail-section-title">AI Suggested Rewrite</div>
              <div className="rewrite-box">{scorecard.rewrite}</div>
            </div>
          )}
        </div>
      )}

      {/* Review tab (founder) */}
      {tab === 'review' && canReview && (
        <div>
          <div className="form-group">
            <label className="form-label">Action</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['approve', 'approve_with_edits', 'reject'] as const).map(a => (
                <button
                  key={a}
                  className={`btn ${reviewAction === a ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setReviewAction(a)}
                  style={a === 'reject' && reviewAction === a ? { background: 'var(--danger)' } : {}}
                >
                  {a === 'approve' ? '✓ Approve' : a === 'approve_with_edits' ? '✎ Approve with Edits' : '✕ Reject'}
                </button>
              ))}
            </div>
          </div>

          {reviewAction === 'approve_with_edits' && (
            <div className="form-group">
              <label className="form-label">Edited Content</label>
              {/* Pretext auto-resize: grows to fit content, no fixed height guessing */}
              <textarea
                ref={editedContentRef}
                className="form-textarea"
                value={editedContent}
                onChange={e => setEditedContent(e.target.value)}
                style={{ minHeight: 200, resize: 'none', transition: 'height 0.15s ease' }}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Note to Team Member <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              ref={founderNoteRef}
              className="form-textarea"
              value={founderNote}
              onChange={e => setFounderNote(e.target.value)}
              placeholder="Add context, guidance, or praise..."
              style={{ minHeight: 100, resize: 'none', transition: 'height 0.15s ease' }}
            />
          </div>

          <button
            className={`btn ${reviewAction === 'reject' ? 'btn-danger' : 'btn-primary'}`}
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            onClick={handleReview}
            disabled={submitting}
          >
            {submitting ? <Spinner /> : `Confirm ${reviewAction.replace(/_/g, ' ')}`}
          </button>
        </div>
      )}

      {/* Resubmit tab (team member) */}
      {tab === 'review' && canResubmit && (
        <div>
          <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--warn-bg)', border: '1px solid #f0d8a8', borderRadius: 10, fontSize: 13, color: 'var(--warn)' }}>
            This submission was rejected. Edit the content below and resubmit.
          </div>
          <div className="form-group">
            <label className="form-label">Revised Content</label>
            <textarea
              ref={resubmitRef}
              className="form-textarea"
              value={resubmitContent}
              onChange={e => setResubmitContent(e.target.value)}
              style={{ minHeight: 220, resize: 'none', transition: 'height 0.15s ease' }}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            onClick={handleResubmit}
            disabled={resubmitting}
          >
            {resubmitting ? <Spinner /> : 'Resubmit for Review'}
          </button>
        </div>
      )}
    </Modal>
  );
}
