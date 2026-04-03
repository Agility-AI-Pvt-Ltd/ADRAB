import { useEffect, useRef, useState } from 'react';
import { Modal, Spinner, useToast, DocTypeChip } from './shared';
import { adminApi, submissionsApi } from '../api';
import type { DocumentGuidance, DocumentType, Stakeholder } from '../types';

const STAKEHOLDERS: { value: Stakeholder; label: string }[] = [
  { value: 'parent', label: 'Parent' },
  { value: 'student', label: 'Student' },
  { value: 'principal', label: 'Principal' },
  { value: 'counsellor', label: 'Counsellor' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'investor', label: 'Investor' },
  { value: 'government', label: 'Government' },
];

const REFINE_ACTIONS = [
  { action: 'shorter', label: '↓ Shorter' },
  { action: 'more_formal', label: '⬆ More Formal' },
  { action: 'warmer', label: '♥ Warmer' },
  { action: 'add_urgency', label: '⚡ Add Urgency' },
  { action: 'regenerate', label: '↺ Regenerate' },
];

type Step = 'type' | 'context' | 'draft' | 'done';

interface Props { onClose: () => void; onCreated: () => void; }

export default function ComposeModal({ onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [docTypes, setDocTypes] = useState<DocumentGuidance[]>([]);
  const [step, setStep] = useState<Step>('type');
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [stakeholder, setStakeholder] = useState<Stakeholder | null>(null);
  const [contextFields, setContextFields] = useState<Record<string, string>>({
    context: '', objective: '', recipient_name: '', extra: ''
  });
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    submissionsApi.documentGuidance()
      .then(({ data }) => setDocTypes(data))
      .catch(() => toast('error', 'Could not load document types'));
  }, []);

  // Draft generation
  async function generateDraft() {
    if (!docType || !stakeholder) return;
    setGenerating(true);
    try {
      const { data } = await submissionsApi.generateDraft(docType, stakeholder, contextFields);
      setDraft(data.draft);
      setStep('draft');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Failed to generate draft');
    } finally {
      setGenerating(false);
    }
  }

  // Refine draft
  async function refineDraft(action: string) {
    if (!docType || !stakeholder) return;
    setRefining(true);
    try {
      const { data } = await submissionsApi.refineDraft(draft, action, docType, stakeholder);
      setDraft(data.draft);
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Refinement failed');
    } finally {
      setRefining(false);
    }
  }

  // Save as draft
  async function saveDraft() {
    if (!docType || !stakeholder || !draft.trim()) return;
    setSubmitting(true);
    try {
      const { data } = await submissionsApi.create(docType, stakeholder, draft, { fields: contextFields });
      toast('success', 'Saved as draft');
      onCreated();
      onClose();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  // Submit for review (create + immediately submit)
  async function submitForReview() {
    if (!docType || !stakeholder || !draft.trim()) return;
    setSubmitting(true);
    try {
      const { data: created } = await submissionsApi.create(docType, stakeholder, draft, { fields: contextFields });
      // Upload file if attached
      if (uploadedFile) {
        await submissionsApi.uploadFile(created.id, uploadedFile);
      }
      await submissionsApi.submit(created.id);
      toast('success', 'Submitted for review — AI is scoring your document');
      onCreated();
      onClose();
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  // Step: Type & Stakeholder selection
  if (step === 'type') {
    return (
      <Modal title="Compose Document" subtitle="Select document type and stakeholder" onClose={onClose} size="lg">
        <div>
          <div className="form-group">
            <label className="form-label">Document Type <span className="required">*</span></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {docTypes.map(dt => (
                <div
                  key={dt.id}
                  onClick={() => setDocType(dt.doc_type)}
                  style={{
                    padding: '12px 14px',
                    border: `2px solid ${docType === dt.doc_type ? 'var(--green-700)' : 'var(--border)'}`,
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: docType === dt.doc_type ? 'var(--green-50)' : 'var(--white)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: docType === dt.doc_type ? 'var(--green-900)' : 'var(--ink)', marginBottom: 3 }}>
                    {dt.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{dt.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Stakeholder <span className="required">*</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STAKEHOLDERS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStakeholder(s.value)}
                  className={`btn ${stakeholder === s.value ? 'btn-primary' : 'btn-outline'}`}
                  style={{ borderRadius: 20 }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!docType || !stakeholder}
              onClick={() => setStep('context')}
            >
              Next: Add Context →
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Step: Context form
  if (step === 'context') {
    return (
      <Modal title="Add Context" subtitle="Help the AI write in the right voice" onClose={onClose} size="lg">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            {docType && <DocTypeChip type={docType} />}
            <span style={{ fontSize: 13, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>
              → {stakeholder}
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Context / Background <span className="required">*</span></label>
            <textarea
              className="form-textarea"
              value={contextFields.context}
              onChange={e => setContextFields(f => ({ ...f, context: e.target.value }))}
              placeholder="e.g. We're reaching out to DPS RK Puram about our AI Scholar Program for Grade 11–12 students..."
              style={{ minHeight: 100 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Objective</label>
              <input
                className="form-input"
                value={contextFields.objective}
                onChange={e => setContextFields(f => ({ ...f, objective: e.target.value }))}
                placeholder="e.g. Schedule a demo call"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Recipient Name / Organisation</label>
              <input
                className="form-input"
                value={contextFields.recipient_name}
                onChange={e => setContextFields(f => ({ ...f, recipient_name: e.target.value }))}
                placeholder="e.g. Ms Priya Sharma, Vice Principal"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Additional Notes</label>
            <textarea
              className="form-textarea"
              value={contextFields.extra}
              onChange={e => setContextFields(f => ({ ...f, extra: e.target.value }))}
              placeholder="Any specific asks, tone preferences, or info to include..."
              style={{ minHeight: 80 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => setStep('type')}>← Back</button>
            <button
              className="btn btn-primary"
              disabled={!contextFields.context.trim() || generating}
              onClick={generateDraft}
            >
              {generating ? <><Spinner /> Generating…</> : '✦ Generate Draft'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Step: Draft editor
  if (step === 'draft') {
    return (
      <Modal title="Review & Edit Draft" subtitle="Refine, edit, then submit for founder review" onClose={onClose} size="lg">
        <div>
          {/* Refine toolbar */}
          <div className="draft-toolbar">
            <span className="draft-toolbar-label">AI Refine</span>
            {refining && <Spinner dark />}
            {!refining && REFINE_ACTIONS.map(r => (
              <button key={r.action} className="refine-btn" onClick={() => refineDraft(r.action)}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Editable draft */}
          <div className="form-group">
            <label className="form-label">Draft Content</label>
            <textarea
              className="form-textarea"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              style={{ minHeight: 260 }}
              disabled={refining}
            />
          </div>

          {/* File upload */}
          <div className="form-group">
            <label className="form-label">Attach File <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(optional .pdf / .docx)</span></label>
            <div
              className={`upload-zone ${uploadedFile ? '' : ''}`}
              onClick={() => fileRef.current?.click()}
            >
              {uploadedFile ? (
                <div style={{ fontSize: 13, color: 'var(--green-800)', fontWeight: 500 }}>
                  📎 {uploadedFile.name}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 10 }}
                    onClick={e => { e.stopPropagation(); setUploadedFile(null); }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  Click to attach a PDF or DOCX
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              style={{ display: 'none' }}
              onChange={e => setUploadedFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => setStep('context')}>← Edit Context</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-outline"
                onClick={saveDraft}
                disabled={submitting || !draft.trim()}
              >
                Save as Draft
              </button>
              <button
                className="btn btn-primary"
                onClick={submitForReview}
                disabled={submitting || !draft.trim()}
              >
                {submitting ? <><Spinner /> Submitting…</> : '✓ Submit for Review'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
}
