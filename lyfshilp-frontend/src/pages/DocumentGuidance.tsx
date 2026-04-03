import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Modal, Spinner, useToast } from '../components/shared';
import type { DocumentGuidance } from '../types';

export default function DocumentGuidancePage() {
  const { toast } = useToast();
  const [guidance, setGuidance] = useState<DocumentGuidance[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingGuidance, setSavingGuidance] = useState(false);
  const [creatingGuidance, setCreatingGuidance] = useState(false);
  const [editingGuidance, setEditingGuidance] = useState<DocumentGuidance | null>(null);
  const [guidanceForm, setGuidanceForm] = useState({ doc_type: '', title: '', description: '', key_requirements: '' });

  async function load() {
    setLoading(true);
    try {
      const { data } = await adminApi.documentGuidance();
      setGuidance(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openGuidanceEditor(item: DocumentGuidance) {
    setEditingGuidance(item);
    setGuidanceForm({
      doc_type: item.doc_type,
      title: item.title,
      description: item.description,
      key_requirements: item.key_requirements,
    });
  }

  function openCreateGuidance() {
    setEditingGuidance(null);
    setGuidanceForm({ doc_type: '', title: '', description: '', key_requirements: '' });
    setCreatingGuidance(true);
  }

  async function saveGuidance() {
    if (!editingGuidance && !creatingGuidance) return;
    setSavingGuidance(true);
    try {
      if (creatingGuidance) {
        await adminApi.createDocumentGuidance(guidanceForm);
        toast('success', 'Document type created');
      } else if (editingGuidance) {
        await adminApi.updateDocumentGuidance(editingGuidance.doc_type, guidanceForm);
        toast('success', 'Document guidance updated');
      }
      setEditingGuidance(null);
      setCreatingGuidance(false);
      await load();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not save document guidance');
    } finally {
      setSavingGuidance(false);
    }
  }

  return (
    <div className="content">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
              Document Guidance
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: 680 }}>
              These founder-managed rules are stored in Postgres and injected into the AI context for each document type during generation, refinement, and review.
            </p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreateGuidance}>
            + New Document Type
          </button>
        </div>
      </div>

      <div className="table-card">
        <div className="table-header">
          <span className="table-title">Guidance Library</span>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{guidance.length} document type{guidance.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <Spinner dark />
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Document Type</th>
                <th>Description</th>
                <th>Key Requirements</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {guidance.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.title}</td>
                  <td>{item.description}</td>
                  <td>{item.key_requirements}</td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openGuidanceEditor(item)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(editingGuidance || creatingGuidance) && (
        <Modal
          title={creatingGuidance ? 'Create Document Type' : `Edit ${editingGuidance?.title}`}
          subtitle="This guidance is injected into the AI context for this document type."
          onClose={() => { setEditingGuidance(null); setCreatingGuidance(false); }}
          footer={(
            <>
              <button className="btn btn-outline" onClick={() => { setEditingGuidance(null); setCreatingGuidance(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={saveGuidance} disabled={savingGuidance}>
                {savingGuidance ? 'Saving…' : creatingGuidance ? 'Create Document Type' : 'Save Guidance'}
              </button>
            </>
          )}
        >
          <div className="form-group">
            <label className="form-label">Document Type Key</label>
            <input
              className="form-input"
              value={guidanceForm.doc_type}
              onChange={e => setGuidanceForm(form => ({ ...form, doc_type: e.target.value }))}
              placeholder="e.g. founder_letter"
              disabled={!creatingGuidance}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input
              className="form-input"
              value={guidanceForm.title}
              onChange={e => setGuidanceForm(form => ({ ...form, title: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={guidanceForm.description}
              onChange={e => setGuidanceForm(form => ({ ...form, description: e.target.value }))}
              style={{ minHeight: 100 }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Key Requirements</label>
            <textarea
              className="form-textarea"
              value={guidanceForm.key_requirements}
              onChange={e => setGuidanceForm(form => ({ ...form, key_requirements: e.target.value }))}
              style={{ minHeight: 160 }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
