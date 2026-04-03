import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Spinner, fmtDateTime } from '../components/shared';
import type { AuditLog } from '../types';

const ACTION_COLORS: Record<string, string> = {
  'submission.create': 'var(--green-700)',
  'submission.submit': '#1D4ED8',
  'submission.approve': 'var(--green-700)',
  'submission.reject': 'var(--danger)',
  'submission.approve_with_edits': '#B7791F',
  'system_prompt.update': 'var(--gold)',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  async function load(offset = 0) {
    setLoading(true);
    try {
      const { data } = await adminApi.auditLog(PER_PAGE, offset);
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(page * PER_PAGE); }, [page]);

  return (
    <div className="content">
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
            Audit Log
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>
            Complete record of all system actions.
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => load(page * PER_PAGE)}>↺ Refresh</button>
      </div>

      <div className="table-card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spinner dark /></div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">◷</div>
            <div className="empty-state-title">No audit entries</div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Resource ID</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {fmtDateTime(log.created_at)}
                  </td>
                  <td>
                    <span style={{
                      fontFamily: 'DM Mono, monospace',
                      fontSize: 12,
                      fontWeight: 600,
                      color: ACTION_COLORS[log.action] ?? 'var(--ink-mid)',
                      background: 'var(--cream)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--border)',
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ textTransform: 'capitalize', fontSize: 13 }}>{log.resource_type}</td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--ink-soft)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.resource_id ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--ink-soft)' }}>
                    {log.ip_address ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-outline btn-sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Page {page + 1}</span>
          <button
            className="btn btn-outline btn-sm"
            disabled={logs.length < PER_PAGE}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
