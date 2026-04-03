import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { adminApi } from '../api';
import { Spinner, useToast, fmtDateTime } from '../components/shared';
import type { AIReviewGuidance, EmojiGuidance, StakeholderGuidance, SystemPrompt } from '../types';

export default function SystemPromptPage() {
  const { toast } = useToast();
  const location = useLocation();
  const hash = location.hash;

  const [prompt, setPrompt] = useState<SystemPrompt | null>(null);
  const [aiReviewGuidance, setAiReviewGuidance] = useState<AIReviewGuidance[]>([]);
  const [emojiGuidance, setEmojiGuidance] = useState<EmojiGuidance[]>([]);
  const [stakeholderGuidance, setStakeholderGuidance] = useState<StakeholderGuidance[]>([]);
  const [history, setHistory] = useState<SystemPrompt[]>([]);
  const [editing, setEditing] = useState('');
  const [label, setLabel] = useState('');
  const [savingReviewConfig, setSavingReviewConfig] = useState<string | null>(null);
  const [savingEmojiConfig, setSavingEmojiConfig] = useState<string | null>(null);
  const [savingStakeholder, setSavingStakeholder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Determine current view from hash
  const isReviewEngine = hash === '#review-engine';
  const isEmojiRules = hash === '#emoji-rules';
  const isStakeholders = hash === '#stakeholders' || hash.startsWith('#stakeholder-');
  const isHistory = hash === '#history' || showHistory;
  const isBrandVoice = !isReviewEngine && !isEmojiRules && !isStakeholders && !isHistory;

  const title = isReviewEngine ? 'AI Review Engine' 
              : isEmojiRules ? 'Emoji Rules'
              : isStakeholders ? 'Stakeholder Rules'
              : isHistory ? 'Prompt History'
              : 'Brand Voice';

  const subtitle = isReviewEngine ? 'Define how AI reviews, scores, and interprets document quality.'
                 : isEmojiRules ? 'Founder-managed emoji rules by document type and channel.'
                 : isStakeholders ? ' Founder-managed rules for stakeholder-specific tone and guidance.'
                 : isHistory ? 'Repository of previous brand voice versions and system prompts.'
                 : 'This system prompt defines how the AI writes and evaluates all documents.';


  async function load() {
    setLoading(true);
    try {
      const [{ data }, { data: reviewData }, { data: emojiData }, { data: stakeholderData }] = await Promise.all([
        adminApi.getSystemPrompt(),
        adminApi.aiReviewGuidance(),
        adminApi.emojiGuidance(),
        adminApi.stakeholderGuidance(),
      ]);
      setPrompt(data);
      setEditing(data.prompt_text);
      setLabel(data.label ?? '');
      setAiReviewGuidance(reviewData);
      setEmojiGuidance(emojiData);
      setStakeholderGuidance(stakeholderData);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    const { data } = await adminApi.promptHistory();
    setHistory(data);
    setShowHistory(true);
  }

  async function save() {
    setSaving(true);
    try {
      const { data } = await adminApi.updateSystemPrompt(editing, label || undefined);
      setPrompt(data);
      toast('success', 'Brand voice updated successfully');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function saveStakeholder(item: StakeholderGuidance) {
    setSavingStakeholder(item.stakeholder);
    try {
      const { data } = await adminApi.updateStakeholderGuidance(item.stakeholder, {
        title: item.title,
        guidance_text: item.guidance_text,
      });
      setStakeholderGuidance((rows) => rows.map((row) => row.stakeholder === data.stakeholder ? data : row));
      toast('success', `${data.title} guidance updated`);
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Failed to update stakeholder guidance');
    } finally {
      setSavingStakeholder(null);
    }
  }

  async function saveReviewConfig(item: AIReviewGuidance) {
    setSavingReviewConfig(item.config_key);
    try {
      const { data } = await adminApi.updateAiReviewGuidance(item.config_key, {
        review_dimension: item.review_dimension,
        title: item.title,
        content: item.content,
      });
      setAiReviewGuidance((rows) => rows.map((row) => row.config_key === data.config_key ? data : row));
      toast('success', `${data.title} updated`);
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Failed to update AI review guidance');
    } finally {
      setSavingReviewConfig(null);
    }
  }

  async function saveEmojiConfig(item: EmojiGuidance) {
    setSavingEmojiConfig(item.config_key);
    try {
      const { data } = await adminApi.updateEmojiGuidance(item.config_key, {
        title: item.title,
        content: item.content,
      });
      setEmojiGuidance((rows) => rows.map((row) => row.config_key === data.config_key ? data : row));
      toast('success', `${data.title} updated`);
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Failed to update emoji guidance');
    } finally {
      setSavingEmojiConfig(null);
    }
  }

  useEffect(() => { load(); }, []);

  // Handle scrolling to hash
  useEffect(() => {
    if (!loading && hash) {
      // Small timeout to ensure DOM is ready after conditional rendering
      const timer = setTimeout(() => {
        const id = hash.replace('#', '');
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [hash, loading]);

  return (
    <div className="content" style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            {title}
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: 540 }}>
            {subtitle}
          </p>
        </div>
        {!isHistory && (
          <button className="btn btn-outline btn-sm" onClick={loadHistory}>
            View History
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spinner dark /></div>
      ) : (
        <>
          {/* Brand Voice Editor */}
          {isBrandVoice && (
            <div className="card" id="prompt">
              <div className="card-body">
                {prompt?.updated_at && (
                  <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 8, fontSize: 12, color: 'var(--green-800)' }}>
                    Last updated: {fmtDateTime(prompt.updated_at)} · <strong>{prompt.label}</strong>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Label / Version Name</label>
                  <input
                    className="form-input"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. v2 – warmer tone, Q2 2025"
                    style={{ maxWidth: 340 }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">System Prompt</label>
                  <textarea
                    className="form-textarea"
                    value={editing}
                    onChange={e => setEditing(e.target.value)}
                    style={{ minHeight: 420, fontFamily: 'DM Mono, monospace', fontSize: 12.5, lineHeight: 1.65 }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-soft)' }}>
                    {editing.length.toLocaleString()} characters
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-outline" onClick={() => setEditing(prompt?.prompt_text ?? '')}>
                    Reset Changes
                  </button>
                  <button className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? <><Spinner /> Saving…</> : '✓ Save Brand Voice'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AI Review Engine */}
          {isReviewEngine && (
            <div className="card" id="review-engine">
              <div className="card-body">
                <div style={{ display: 'grid', gap: 16 }}>
                {aiReviewGuidance.map((item) => (
                  <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--paper)' }}>
                    <div className="form-group">
                      <input
                        className="form-input"
                        value={item.review_dimension}
                        onChange={e => setAiReviewGuidance(rows => rows.map(row => row.id === item.id ? { ...row, review_dimension: e.target.value } : row))}
                        placeholder="Review dimension"
                      />
                    </div>
                    <div className="form-group">
                      <input
                        className="form-input"
                        value={item.title}
                        onChange={e => setAiReviewGuidance(rows => rows.map(row => row.id === item.id ? { ...row, title: e.target.value } : row))}
                        placeholder="Section"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <textarea
                        className="form-textarea"
                        value={item.content}
                        onChange={e => setAiReviewGuidance(rows => rows.map(row => row.id === item.id ? { ...row, content: e.target.value } : row))}
                        style={{ minHeight: 160 }}
                        placeholder="Content"
                      />
                    </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                          Updated {fmtDateTime(item.updated_at)}
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveReviewConfig(item)}
                          disabled={savingReviewConfig === item.config_key}
                        >
                          {savingReviewConfig === item.config_key ? 'Saving…' : 'Save Review Rule'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Emoji Rules */}
          {isEmojiRules && (
            <div className="card" id="emoji-rules">
              <div className="card-body">
                <div style={{ display: 'grid', gap: 16 }}>
                  {emojiGuidance.map((item) => (
                    <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--paper)' }}>
                      <div className="form-group">
                        <input
                          className="form-input"
                          value={item.title}
                          onChange={e => setEmojiGuidance(rows => rows.map(row => row.id === item.id ? { ...row, title: e.target.value } : row))}
                          placeholder="Rule title"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <textarea
                          className="form-textarea"
                          value={item.content}
                          onChange={e => setEmojiGuidance(rows => rows.map(row => row.id === item.id ? { ...row, content: e.target.value } : row))}
                          style={{ minHeight: 120 }}
                          placeholder="Rule content"
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                          Updated {fmtDateTime(item.updated_at)}
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveEmojiConfig(item)}
                          disabled={savingEmojiConfig === item.config_key}
                        >
                          {savingEmojiConfig === item.config_key ? 'Saving…' : 'Save Emoji Rule'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stakeholder Rules */}
          {isStakeholders && (
            <div className="card" id="stakeholders">
              <div className="card-body">
                <div style={{ display: 'grid', gap: 16 }}>
                  {stakeholderGuidance.map((item) => (
                    <div key={item.id} id={`stakeholder-${item.stakeholder}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--paper)', scrollMarginTop: 80 }}>
                      <div className="form-group">
                        <label className="form-label">Stakeholder</label>
                        <div style={{ fontWeight: 600, color: 'var(--ink)', textTransform: 'capitalize' }}>{item.stakeholder.replace(/_/g, ' ')}</div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Title</label>
                        <input
                          className="form-input"
                          value={item.title}
                          onChange={e => setStakeholderGuidance(rows => rows.map(row => row.id === item.id ? { ...row, title: e.target.value } : row))}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Guidance</label>
                        <textarea
                          className="form-textarea"
                          value={item.guidance_text}
                          onChange={e => setStakeholderGuidance(rows => rows.map(row => row.id === item.id ? { ...row, guidance_text: e.target.value } : row))}
                          style={{ minHeight: 110 }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                          Updated {fmtDateTime(item.updated_at)}
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveStakeholder(item)}
                          disabled={savingStakeholder === item.stakeholder}
                        >
                          {savingStakeholder === item.stakeholder ? 'Saving…' : 'Save Stakeholder Rule'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* History panel */}
      {isHistory && (
        <div id="history">
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Active</th>
                  <th>Updated</th>
                  <th>Characters</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.id ?? i}>
                    <td style={{ fontWeight: 500 }}>{h.label}</td>
                    <td>{h.is_active ? <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>✓ Active</span> : '—'}</td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {h.updated_at ? fmtDateTime(h.updated_at) : '—'}
                    </td>
                    <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}>
                      {h.prompt_text.length.toLocaleString()}
                    </td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => { setEditing(h.prompt_text); setLabel(h.label + ' (restored)'); setShowHistory(false); }}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
