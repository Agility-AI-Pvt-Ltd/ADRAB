import { useEffect, useRef, useState } from 'react';
import { useAutoResize } from '../hooks/useAutoResize';
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

type ContextFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'textarea';
  readOnly?: boolean;
};

const DOC_TYPE_CONTEXT_FIELDS: Record<string, ContextFieldDef[]> = {
  cold_email: [
    { key: 'recipient_name_designation', label: 'Recipient Name and Designation', placeholder: 'e.g. Ms Priya Sharma, Vice Principal', required: true },
    { key: 'school_or_company_name', label: 'School or Company Name', placeholder: 'e.g. DPS RK Puram', required: true },
    { key: 'referral_name', label: 'Referral Name', placeholder: 'e.g. Referred by Rohan Mehta' },
    { key: 'programme_being_pitched', label: 'Programme Being Pitched', placeholder: 'e.g. AI Scholar Program', required: true },
    { key: 'specific_ask', label: 'Specific Ask', placeholder: 'e.g. 15-minute demo call next Tuesday', required: true },
  ],
  whatsapp: [
    { key: 'recipient_type', label: 'Recipient Type', placeholder: 'e.g. Parent', required: true, readOnly: true },
    { key: 'programme_name', label: 'Programme Name', placeholder: 'e.g. Summer AI Programme', required: true },
    { key: 'key_dates_deadlines', label: 'Key Dates or Deadlines', placeholder: 'e.g. Batch starts 15 May, last date 10 May', required: true, type: 'textarea' },
    { key: 'payment_or_form_link', label: 'Payment or Form Link', placeholder: 'e.g. https://...', type: 'textarea' },
  ],
  proposal: [
    { key: 'organisation_name', label: 'Organisation Name', placeholder: 'e.g. Mt. Carmel School Dwarka', required: true },
    { key: 'contact_person', label: 'Contact Person', placeholder: 'e.g. Dr Anjali Verma, Principal', required: true },
    { key: 'programmes_to_include', label: 'Programmes to Include', placeholder: 'e.g. AI Scholar Program, Teacher AI Workshop', required: true, type: 'textarea' },
    { key: 'school_specific_customisation', label: 'School-Specific Customisation', placeholder: 'e.g. Focus on Grade 9-12 and NEP alignment', type: 'textarea' },
  ],
  linkedin: [
    { key: 'recipient_name_role', label: 'Recipient Name and Role', placeholder: 'e.g. Aman Gupta, Head of Partnerships', required: true },
    { key: 'purpose', label: 'Purpose', placeholder: 'e.g. intro / follow-up / partnership', required: true },
    { key: 'mutual_connection_context', label: 'Mutual Connection or Context', placeholder: 'e.g. Met at TiE event through Neha', type: 'textarea' },
  ],
  payment_followup: [
    { key: 'recipient_name', label: 'Recipient Name', placeholder: 'e.g. Mr Rajesh Kumar', required: true },
    { key: 'programme_name', label: 'Programme Name', placeholder: 'e.g. Fellowship', required: true },
    { key: 'amount_due', label: 'Amount Due', placeholder: 'e.g. Rs 10,000', required: true },
    { key: 'original_deadline', label: 'Original Deadline', placeholder: 'e.g. 12 May 2026', required: true },
    { key: 'urgency_reason', label: 'Urgency Reason', placeholder: 'e.g. seat confirmation closes tomorrow', required: true, type: 'textarea' },
  ],
  ad_creative: [
    { key: 'platform', label: 'Platform', placeholder: 'e.g. Instagram / WhatsApp / print', required: true },
    { key: 'target_audience', label: 'Target Audience', placeholder: 'e.g. Parents of Grade 9-12 students', required: true },
    { key: 'programme_name', label: 'Programme Name', placeholder: 'e.g. Summer AI Programme', required: true },
    { key: 'key_benefit', label: 'Key Benefit', placeholder: 'e.g. Build real AI projects with mentors', required: true, type: 'textarea' },
    { key: 'price_deadline', label: 'Price and Deadline', placeholder: 'e.g. Rs 2,999 + GST, enroll by 10 May', required: true },
  ],
};

const DEFAULT_CONTEXT_FIELDS: ContextFieldDef[] = [
  { key: 'context', label: 'Context / Background', placeholder: 'Share the background, recipient, and why this document is needed.', required: true, type: 'textarea' },
  { key: 'objective', label: 'Objective', placeholder: 'e.g. Schedule a demo call' },
  { key: 'recipient_name', label: 'Recipient Name / Organisation', placeholder: 'e.g. Ms Priya Sharma, Vice Principal' },
  { key: 'extra', label: 'Additional Notes', placeholder: 'Any specific asks, tone preferences, or info to include...', type: 'textarea' },
];

const EXTRA_CONTEXT_FIELD: ContextFieldDef = {
  key: 'additional_context',
  label: 'Additional Context',
  placeholder: 'Paste any extra notes, message snippets, background details, objections, or important context that does not fit in the fields above.',
  type: 'textarea',
};

// ---------------------------------------------------------------------------
// Helper: auto-growing textarea that uses Pretext.js for height calculation.
// Each instance creates its own resize ref bound to its specific content.
// ---------------------------------------------------------------------------
function AutoTextarea({
  value,
  onChange,
  placeholder,
  readOnly,
  disabled,
  minHeight = 80,
  maxHeight = 400,
  style,
  className,
}: {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const ref = useAutoResize(value, { minHeight, maxHeight });
  return (
    <textarea
      ref={ref}
      className={className ?? 'form-textarea'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      style={{ resize: 'none', transition: 'height 0.15s ease', ...style }}
    />
  );
}

export default function ComposeModal({ onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [docTypes, setDocTypes] = useState<DocumentGuidance[]>([]);
  const [step, setStep] = useState<Step>('type');
  const [docType, setDocType] = useState<DocumentType | null>(null);
  const [stakeholder, setStakeholder] = useState<Stakeholder | null>(null);
  const [contextFields, setContextFields] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pretext-powered auto-resize ref for the draft textarea
  const draftRef = useAutoResize(draft, { minHeight: 260, maxHeight: 560 });

  useEffect(() => {
    submissionsApi.documentGuidance()
      .then(({ data }) => setDocTypes(data))
      .catch(() => toast('error', 'Could not load document types'));
  }, []);

  const currentFieldDefs = docType ? (DOC_TYPE_CONTEXT_FIELDS[docType] ?? DEFAULT_CONTEXT_FIELDS) : DEFAULT_CONTEXT_FIELDS;
  const visibleFieldDefs = currentFieldDefs.some((field) => field.key === EXTRA_CONTEXT_FIELD.key)
    ? currentFieldDefs
    : [...currentFieldDefs, EXTRA_CONTEXT_FIELD];

  useEffect(() => {
    setContextFields((prev) => {
      const next: Record<string, string> = {};
      for (const field of visibleFieldDefs) {
        if (field.key === 'recipient_type') {
          next[field.key] = stakeholder ? STAKEHOLDERS.find((s) => s.value === stakeholder)?.label ?? stakeholder : '';
        } else {
          next[field.key] = prev[field.key] ?? '';
        }
      }
      return next;
    });
  }, [visibleFieldDefs, stakeholder]);

  function updateContextField(key: string, value: string) {
    setContextFields((fields) => ({ ...fields, [key]: value }));
  }

  const canGenerateDraft = visibleFieldDefs
    .filter((field) => field.required)
    .every((field) => (contextFields[field.key] ?? '').trim());

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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {visibleFieldDefs.map((field) => (
              <div
                key={field.key}
                className="form-group"
                style={field.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}
              >
                <label className="form-label">
                  {field.label} {field.required ? <span className="required">*</span> : null}
                </label>
                {field.type === 'textarea' ? (
                  <AutoTextarea
                    value={contextFields[field.key] ?? ''}
                    onChange={e => updateContextField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    readOnly={field.readOnly}
                    minHeight={field.key === 'key_benefit' || field.key === 'programmes_to_include' || field.key === 'school_specific_customisation' ? 100 : field.key === EXTRA_CONTEXT_FIELD.key ? 140 : 88}
                  />
                ) : (
                  <input
                    className="form-input"
                    value={contextFields[field.key] ?? ''}
                    onChange={e => updateContextField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    readOnly={field.readOnly}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => setStep('type')}>← Back</button>
            <button
              className="btn btn-primary"
              disabled={!canGenerateDraft || generating}
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

          {/* Editable draft — Pretext auto-resizes to fit content exactly */}
          <div className="form-group">
            <label className="form-label">Draft Content</label>
            <textarea
              ref={draftRef}
              className="form-textarea"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              style={{ minHeight: 260, resize: 'none', transition: 'height 0.15s ease' }}
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
