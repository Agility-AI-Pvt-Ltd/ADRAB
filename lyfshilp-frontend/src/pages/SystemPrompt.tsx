import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Spinner, useToast, fmtDateTime } from '../components/shared';
import type { SystemPrompt } from '../types';

export default function SystemPromptPage() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState<SystemPrompt | null>(null);
  const [history, setHistory] = useState<SystemPrompt[]>([]);
  const [editing, setEditing] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await adminApi.getSystemPrompt();
      setPrompt(data);
      setEditing(data.prompt_text);
      setLabel(data.label ?? '');
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

  useEffect(() => { load(); }, []);

  return (
    <div className="content" style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            Brand Voice
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: 540 }}>
            This system prompt defines how the AI writes and evaluates all documents. Changes take effect immediately on the next AI call.
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadHistory}>
          History
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spinner dark /></div>
      ) : (
        <div className="card">
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

      {/* History panel */}
      {showHistory && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
              Prompt History
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(false)}>Hide</button>
          </div>
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
