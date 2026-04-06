import { useEffect, useMemo, useState } from 'react';
import { Modal, StatusBadge, ScoreBadge, DocTypeChip, fmtDateTime, Spinner, useToast, Avatar, AvatarGroup } from './shared';
import { submissionsApi, usersApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import type { Submission, TeamDepartment, User } from '../types';
import { useAutoResize } from '../hooks/useAutoResize';
import { useTextMeasure } from '../hooks/useTextMeasure';
import { downloadTextAsPdf } from '../utils/documentExport';

interface Props {
  submission: Submission;
  onClose: () => void;
  onUpdated: (s: Submission) => void;
}

const StartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <polyline points="7 15 11 11 14 14 18 10"></polyline>
  </svg>
);

const DIM_LABELS: Record<string, string> = {
  tone_voice: 'Tone & Voice',
  format_structure: 'Format & Structure',
  stakeholder_fit: 'Stakeholder Fit',
  missing_elements: 'Missing Elements',
  improvement_scope: 'Improvement Scope',
};

// Collapsible content display — collapse threshold (lines)
const COLLAPSE_LINES = 7;
const DEPARTMENT_OPTIONS: { value: TeamDepartment; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'counsellor', label: 'Counsellor' },
  { value: 'academic', label: 'Academic' },
  { value: 'founders', label: 'Founders' },
];

export default function SubmissionDetail({ submission, onClose, onUpdated }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isFounder = user?.role === 'founder' || user?.role === 'admin';

  const [tab, setTab] = useState<'content' | 'ai' | 'review' | 'visibility' | 'history'>('content');
  const [history, setHistory] = useState<Submission[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'approve_with_edits' | 'reject'>('approve');
  const [founderNote, setFounderNote] = useState('');
  const [editedContent, setEditedContent] = useState(submission.content);
  const [submitting, setSubmitting] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [resubmitContent, setResubmitContent] = useState(submission.content);
  const [resubmitting, setResubmitting] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [visibleDepartments, setVisibleDepartments] = useState<string[]>(
    submission.visibility?.visible_to_departments ?? []
  );
  const [visibleUserIds, setVisibleUserIds] = useState<string[]>(
    submission.visibility?.visible_to_user_ids ?? []
  );

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
  const dimensions = scorecard?.dimensions ?? (
    scorecard && 'tone_voice' in scorecard
      ? {
          tone_voice: scorecard.tone_voice ?? 0,
          format_structure: scorecard.format_structure ?? 0,
          stakeholder_fit: scorecard.stakeholder_fit ?? 0,
          missing_elements: scorecard.missing_elements ?? 0,
          improvement_scope: scorecard.improvement_scope ?? 0,
        }
      : undefined
  );
  const scorecardScore = scorecard?.score ?? submission.ai_score ?? 0;
  const suggestions = scorecard?.suggestions ?? submission.ai_suggestions ?? [];
  const rewrite = scorecard?.rewrite ?? submission.ai_rewrite ?? '';
  const downloadableFileUrl = submissionsApi.downloadFileUrl(submission.id);
  const founderEdited = reviewAction === 'approve_with_edits' && editedContent.trim() !== submission.content.trim();
  const visibilitySummaryText = useMemo(() => {
    const segments: string[] = [];
    if (visibleDepartments.length) segments.push(`${visibleDepartments.length} department${visibleDepartments.length !== 1 ? 's' : ''}`);
    if (visibleUserIds.length) segments.push(`${visibleUserIds.length} member${visibleUserIds.length !== 1 ? 's' : ''}`);
    return segments.length ? segments.join(' + ') : 'No recipients selected yet';
  }, [visibleDepartments, visibleUserIds]);

  const renderVisibilitySummary = () => {
    if (visibleUserIds.length === 0 && visibleDepartments.length === 0) {
      return <span>No recipients selected yet</span>;
    }
    
    const users = teamMembers.filter(m => visibleUserIds.includes(m.id));
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, verticalAlign: 'middle', marginLeft: 4 }}>
        {users.length > 0 && <AvatarGroup users={users} max={4} size="sm" />}
        <span>{visibilitySummaryText}</span>
      </div>
    );
  };

  useEffect(() => {
    if (!isFounder) return;
    usersApi.list()
      .then(({ data }) => {
        setTeamMembers(
          data.filter(item => item.role === 'team_member' && item.is_active)
        );
      })
      .catch(() => setTeamMembers([]));
  }, [isFounder]);

  useEffect(() => {
    setEditedContent(submission.content);
    setResubmitContent(submission.content);
    setVisibleDepartments(submission.visibility?.visible_to_departments ?? []);
    setVisibleUserIds(submission.visibility?.visible_to_user_ids ?? []);
  }, [submission]);

  useEffect(() => {
    if (tab === 'history' && history.length === 0) {
      setLoadingHistory(true);
      submissionsApi.versions(submission.id)
        .then(res => setHistory(res.data))
        .catch(() => toast('error', 'Could not load history'))
        .finally(() => setLoadingHistory(false));
    }
  }, [tab, submission.id, history.length]);

  const timelineEvents = useMemo(() => {
    const events: Array<{ id: string; type: 'start' | 'mid' | 'end'; title: string; desc: React.ReactNode; date: string; icon?: React.ReactNode; content?: string }> = [];
    if (history.length === 0) return events;

    const sorted = [...history].sort((a, b) => a.version - b.version);

    sorted.forEach((sub, idx) => {
      if (idx === 0) {
        events.push({
          id: `start`,
          type: 'start',
          title: `Draft Initiated`,
          desc: `Version 1 created by ${sub.author?.name || 'author'}`,
          date: sub.created_at,
          icon: <StartIcon />,
          content: sub.content
        });
      } else {
        events.push({
          id: `draft-${sub.version}`,
          type: 'mid',
          title: `Version ${sub.version} Created`,
          desc: `Draft initiated for requested revisions.`,
          date: sub.created_at,
          content: sub.content
        });
      }

      if (sub.submitted_at) {
        events.push({
          id: `submit-${sub.version}`,
          type: 'mid',
          title: idx === 0 ? `Sent for Review` : `Revised Version Submitted`,
          desc: `Version ${sub.version} sent to founder.`,
          date: sub.submitted_at,
          content: sub.content
        });
      }

      if (sub.reviewed_at) {
        if (sub.status === 'rejected') {
          events.push({
            id: `review-${sub.version}`,
            type: 'mid',
            title: `Changes Requested`,
            desc: sub.feedback?.founder_note ? `"${sub.feedback.founder_note}"` : 'Revisions requested.',
            date: sub.reviewed_at,
            content: sub.content
          });
        } else if (sub.status === 'approved') {
          events.push({
            id: `approve-${sub.version}`,
            type: 'mid',
            title: `Approved`,
            desc: `Document finalized and ready for use.`,
            date: sub.reviewed_at,
            content: sub.content
          });
        }
      }
    });

    if (events.length > 1) {
      events[events.length - 1].type = 'end';
    }

    return events;
  }, [history]);

  async function handleReview() {
    setSubmitting(true);
    try {
      const { data } = await submissionsApi.review(submission.id, reviewAction, {
        edited_content: reviewAction === 'approve_with_edits' ? editedContent : undefined,
        founder_note: founderNote || undefined,
        visible_to_departments: reviewAction !== 'reject' ? visibleDepartments : undefined,
        visible_to_user_ids: reviewAction !== 'reject' ? visibleUserIds : undefined,
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

  async function handleVisibilitySave() {
    setSavingVisibility(true);
    try {
      const { data } = await submissionsApi.updateVisibility(submission.id, {
        visible_to_departments: visibleDepartments,
        visible_to_user_ids: visibleUserIds,
      });
      toast('success', 'Visibility updated');
      onUpdated(data);
      onClose();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not update visibility');
    } finally {
      setSavingVisibility(false);
    }
  }

  function handleApplySuggestion(original: string, replacement: string) {
    const sourceContent = reviewAction === 'approve_with_edits' ? editedContent : submission.content;
    if (!original.trim()) {
      toast('error', 'This suggestion cannot be applied automatically');
      return;
    }

    const nextContent = sourceContent.includes(original)
      ? sourceContent.replace(original, replacement)
      : editedContent.includes(original)
        ? editedContent.replace(original, replacement)
        : null;

    if (!nextContent) {
      toast('error', 'Could not find that exact text in the document');
      return;
    }

    setReviewAction('approve_with_edits');
    setTab('review');
    setEditedContent(nextContent);
    toast('success', 'AI suggestion applied to founder edits');
  }

  function handleApplyRewrite() {
    if (!rewrite.trim()) {
      toast('error', 'No AI rewrite is available');
      return;
    }
    setReviewAction('approve_with_edits');
    setTab('review');
    setEditedContent(rewrite);
    toast('success', 'AI rewrite applied to founder edits');
  }

  async function handleCopyApprovedContent() {
    try {
      await navigator.clipboard.writeText(submission.content);
      toast('success', 'Approved document copied to clipboard');
    } catch {
      toast('error', 'Could not copy document to clipboard');
    }
  }

  function handleDownloadApprovedPdf() {
    try {
      const safeDocType = submission.doc_type.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'document';
      const safeStakeholder = submission.stakeholder.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      const filename = `${safeDocType}-${safeStakeholder}-v${submission.version}.pdf`;
      const title = `${submission.doc_type.replace(/_/g, ' ')} · ${submission.stakeholder}`;
      downloadTextAsPdf(filename, title, submission.content);
      toast('success', 'PDF download started');
    } catch {
      toast('error', 'Could not generate PDF');
    }
  }

  const canReview = isFounder && (submission.status === 'pending' || submission.status === 'under_review');
  const canResubmit = !isFounder && submission.status === 'rejected';
  const canManageVisibility = isFounder && submission.status === 'approved';
  const canExportApprovedDocument = isFounder && submission.status === 'approved';

  function toggleDepartment(department: string) {
    setVisibleDepartments(current =>
      current.includes(department)
        ? current.filter(item => item !== department)
        : [...current, department]
    );
  }

  const renderDepartmentSelector = () => (
    <div className="form-group" style={{ marginTop: 24 }}>
      <label className="form-label" style={{ marginBottom: 12 }}>Visible to Departments</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {DEPARTMENT_OPTIONS.map(option => {
          const active = visibleDepartments.includes(option.value);
          return (
            <label
              key={option.value}
              className={`dept-pill ${active ? 'active' : ''}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                style={{ display: 'none' }}
                checked={active}
                onChange={() => toggleDepartment(option.value)}
              />
              {active && <span style={{ fontSize: 11 }}>✓</span>}
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  const renderMemberSelector = () => (
    <div className="form-group" style={{ marginTop: 24 }}>
      <label className="form-label" style={{ marginBottom: 12 }}>Visible to Specific Team Members</label>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
        maxHeight: 250,
        overflowY: 'auto',
        padding: 4,
        margin: '-4px'
      }}>
        {teamMembers.map(member => {
          const active = visibleUserIds.includes(member.id);
          return (
            <div
              key={member.id}
              className={`member-card ${active ? 'active' : ''}`}
              onClick={() => {
                setVisibleUserIds(prev =>
                  prev.includes(member.id) ? prev.filter(id => id !== member.id) : [...prev, member.id]
                );
              }}
            >
              <Avatar name={member.name} email={member.email ?? ''} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="user-name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {member.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>
                  {member.department?.replace('_', ' ') ?? 'General'}
                </div>
              </div>
              <div className="member-card-check">
                {active && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Modal
      title="Submission Detail"
      subtitle={`Version ${submission.version} · ${submission.doc_type.replace(/_/g, ' ')}`}
      onClose={onClose}
      size="full"
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

      {canExportApprovedDocument && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 20,
            padding: '12px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          <button className="btn btn-primary btn-sm" onClick={handleDownloadApprovedPdf}>
            Download PDF
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleCopyApprovedContent}>
            Copy to clipboard
          </button>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', alignSelf: 'center' }}>
            Exports the final approved content currently shown in this submission.
          </div>
        </div>
      )}

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
        {canManageVisibility && (
          <button className={`tab-btn ${tab === 'visibility' ? 'active' : ''}`} onClick={() => setTab('visibility')}>
            Visibility
          </button>
        )}
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          History
        </button>
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
              maxHeight: contentIsLong && !contentExpanded ? `${collapsedHeight}px` : 'none',
              overflow: contentIsLong && !contentExpanded ? 'hidden' : 'visible',
              maskImage: contentIsLong && !contentExpanded
                ? 'linear-gradient(to bottom, black 60%, transparent 100%)'
                : 'none',
              WebkitMaskImage: contentIsLong && !contentExpanded
                ? 'linear-gradient(to bottom, black 60%, transparent 100%)'
                : 'none',
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
                {submission.feedback.ai_generated_note
                  .replace(/\[Team Member['’]s Name\]/gi, submission.author?.name || 'Team Member')
                  .replace(/\[Your Name\]/gi, user?.name || 'Founder')}
              </div>
            </div>
          )}

          {submission.file_url && (
            <div style={{ marginTop: 16 }}>
              <div className="detail-section-title">Attached File</div>
              <a
                href={downloadableFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm"
                style={{ display: 'inline-flex' }}
              >
                📎 {submission.file_name ?? 'Download file'}
              </a>
            </div>
          )}

          {submission.ai_scorecard && (
            <div style={{ marginTop: 28, marginBottom: 16 }}>
              <div className="detail-section-title">AI Scorecard (Pre-Evaluation)</div>
              <div className="ai-scorecard-panel">
                <div className="ai-scorecard-header">
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Platform AI Analysis</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: (submission.ai_scorecard.score ?? 0) >= 80 ? 'var(--green-700)' : (submission.ai_scorecard.score ?? 0) >= 60 ? '#f59e0b' : 'var(--red-600)' }}>
                    {submission.ai_scorecard.score ?? 0} / 100
                  </span>
                </div>
                 {submission.ai_scorecard.dimensions && (
                  <div className="ai-scorecard-breakdown">
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score Breakdown (out of 20)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Tone & Voice</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: submission.ai_scorecard.dimensions.tone_voice < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{submission.ai_scorecard.dimensions.tone_voice}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Format & Structure</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: submission.ai_scorecard.dimensions.format_structure < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{submission.ai_scorecard.dimensions.format_structure}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Stakeholder Fit</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: submission.ai_scorecard.dimensions.stakeholder_fit < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{submission.ai_scorecard.dimensions.stakeholder_fit}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Completeness</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: submission.ai_scorecard.dimensions.missing_elements < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{submission.ai_scorecard.dimensions.missing_elements}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Improvement</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: submission.ai_scorecard.dimensions.improvement_scope < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{submission.ai_scorecard.dimensions.improvement_scope}</div>
                      </div>
                    </div>
                  </div>
                )}
                {submission.ai_scorecard.grammar_check && (
                  <div className="ai-scorecard-breakdown" style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Grammar Check</div>
                      <span style={{
                        fontWeight: 700, fontSize: 13,
                        color: (submission.ai_scorecard.grammar_check.score ?? 0) >= 16 ? 'var(--green-700)' : (submission.ai_scorecard.grammar_check.score ?? 0) >= 12 ? '#f59e0b' : 'var(--red-600)',
                        background: (submission.ai_scorecard.grammar_check.score ?? 0) >= 16 ? 'var(--success-bg)' : (submission.ai_scorecard.grammar_check.score ?? 0) >= 12 ? 'var(--warn-bg)' : 'var(--danger-bg)',
                        padding: '2px 10px', borderRadius: 20,
                      }}>
                        {submission.ai_scorecard.grammar_check.score ?? 0} / 20
                      </span>
                    </div>
                    {(submission.ai_scorecard.grammar_check.notes?.length || 0) > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-soft)' }}>
                        {submission.ai_scorecard.grammar_check.notes.map((note: string, idx: number) => (
                          <li key={idx} style={{ marginBottom: 4 }}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {(submission.ai_scorecard.suggestions?.length || 0) > 0 && (
                  <div className="ai-scorecard-suggestions">
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Suggestions Encountered</div>
                    <ul>
                      {submission.ai_scorecard.suggestions?.slice(0, 5).map((s: any, idx: number) => (
                        <li key={idx}>{s.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
                {scorecardScore}
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
          {suggestions.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="detail-section-title">Suggested Improvements</div>
              {suggestions.map((s, i) => (
                <div key={i} className="suggestion-item">
                  <div className="suggestion-original">{s.original}</div>
                  <div className="suggestion-replacement">→ {s.replacement}</div>
                  <div className="suggestion-reason">{s.reason}</div>
                  {canReview && (
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => handleApplySuggestion(s.original, s.replacement)}
                      >
                        Apply suggestion
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* AI Rewrite */}
          {rewrite && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div className="detail-section-title" style={{ marginBottom: 0 }}>AI Suggested Rewrite</div>
                {canReview && (
                  <button className="btn btn-primary btn-sm" onClick={handleApplyRewrite}>
                    Use full rewrite
                  </button>
                )}
              </div>
              <div className="rewrite-box">{rewrite}</div>
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
                  {a === 'approve' ? '✓ Approve' : a === 'approve_with_edits' ? '✎ Approve with Edits' : '↩ Request Edits'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13 }}>
            <div><strong>Founder changes:</strong> {reviewAction === 'approve_with_edits' ? (founderEdited ? 'Founder edited the final version' : 'Approve with edits selected, but no content change made yet') : reviewAction === 'reject' ? 'Send the document back to the team member for revision.' : 'Approve as-is without content edits.'}</div>
            {reviewAction !== 'reject' && (
              <div style={{ marginTop: 6 }}><strong>Final visibility:</strong> {renderVisibilitySummary()}</div>
            )}
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

          {reviewAction !== 'reject' && (
            <>
              {renderDepartmentSelector()}
              {renderMemberSelector()}
            </>
          )}

          <div className="form-group">
            <label className="form-label">Add Suggestion or Comment <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              ref={founderNoteRef}
              className="form-textarea"
              value={founderNote}
              onChange={e => setFounderNote(e.target.value)}
              placeholder="Provide suggestions or exact instructions for the edits..."
              style={{ minHeight: 100, resize: 'none', transition: 'height 0.15s ease' }}
            />
          </div>

          <button
            className={`btn ${reviewAction === 'reject' ? 'btn-danger' : 'btn-primary'}`}
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            onClick={handleReview}
            disabled={submitting}
          >
            {submitting ? <Spinner /> : reviewAction === 'reject' ? 'Confirm Request Edits' : `Confirm ${reviewAction.replace(/_/g, ' ')}`}
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

      {tab === 'visibility' && canManageVisibility && (
        <div>
          <div className="info-banner" style={{ marginBottom: 20 }}>
            <div className="info-row"><strong>Approval state:</strong> This submission is already approved.</div>
            <div className="info-row"><strong>Founder changes:</strong> {submission.reviewed_at ? 'You can update who can view or download the final version at any time.' : 'No review metadata available.'}</div>
            <div className="info-row" style={{ display: 'flex', alignItems: 'center' }}><strong>Current visibility:</strong> {renderVisibilitySummary()}</div>
          </div>

          {renderDepartmentSelector()}
          {renderMemberSelector()}

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
            onClick={handleVisibilitySave}
            disabled={savingVisibility}
          >
            {savingVisibility ? <Spinner /> : 'Save visibility'}
          </button>
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div style={{ minHeight: 200, padding: '10px 0' }}>
          {loadingHistory ? (
            <div style={{ textAlign: 'center', marginTop: 40 }}><Spinner dark /></div>
          ) : timelineEvents.length === 0 ? (
            <div className="empty-state">No history available</div>
          ) : (
            <div className="timeline">
              <div className="timeline-line" />
              {timelineEvents.map((ev, i) => (
                <div key={ev.id} className={`timeline-item ${ev.type}`}>
                  <div className="timeline-icon-wrap">
                    <div className="timeline-icon">{ev.icon}</div>
                  </div>
                  <div className="timeline-content">
                    <div 
                      className="timeline-title"
                      style={ev.content ? { cursor: 'pointer' } : {}}
                      onClick={() => ev.content && setExpandedEventId(expandedEventId === ev.id ? null : ev.id)}
                    >
                      {ev.title}
                    </div>
                    <div className="timeline-desc">
                      {ev.date && <span className="timeline-date">{fmtDateTime(ev.date)}</span>}
                      {ev.desc}
                    </div>
                    {expandedEventId === ev.id && ev.content && (
                      <div className="content-display" style={{ marginTop: 12, fontSize: 13, maxHeight: 300, overflowY: 'auto' }}>
                        {ev.content}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
