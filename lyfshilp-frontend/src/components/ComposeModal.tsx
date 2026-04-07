import { useEffect, useRef, useState } from 'react';
import { useAutoResize } from '../hooks/useAutoResize';
import { Modal, Spinner, useToast, DocTypeChip } from './shared';
import { adminApi, submissionsApi } from '../api';
import type { DocumentGuidance, DocumentType, Stakeholder, DraftAnalysisResponse, LLMMode } from '../types';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  analysis?: DraftAnalysisResponse;
  draftTrace?: any;
}

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

type Step = 'type' | 'prompt_method' | 'context' | 'custom_prompt' | 'existing_draft' | 'draft' | 'done';

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
  const [llmMode, setLlmMode] = useState<LLMMode>('guided');
  const [thinkingInstructions, setThinkingInstructions] = useState('');
  const [contextFields, setContextFields] = useState<Record<string, string>>({});
  const [customPromptText, setCustomPromptText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [baseDraft, setBaseDraft] = useState<string | null>(null);
  const [pendingChatInput, setPendingChatInput] = useState<string | null>(null); // awaiting suggestion pick
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [existingDraftAnalysis, setExistingDraftAnalysis] = useState<DraftAnalysisResponse | null>(null);
  const [existingDraftAnalyzedContent, setExistingDraftAnalyzedContent] = useState('');
  const [extractingFile, setExtractingFile] = useState(false);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Suggestions from the most recent AI message
  const lastAiMsg = [...chatMessages].reverse().find(m => m.role === 'ai');
  const lastSuggestions = lastAiMsg?.analysis?.suggestions ?? [];
  const trimmedThinkingInstructions = thinkingInstructions.trim();

  function renderTraceSection(title: string, workflowMemory: any) {
    const trace = workflowMemory?.trace;
    if (!trace) return null;

    return (
      <details style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--white)', color: 'var(--ink)' }}>
        <summary style={{ cursor: 'pointer', padding: '12px 16px', fontSize: 13, fontWeight: 600, background: 'var(--surface)', color: 'var(--ink)' }}>
          {title}
        </summary>
        <div style={{ padding: '0 16px 16px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <div><strong>Graph:</strong> {trace.graph_name}</div>
            <div><strong>Trace ID:</strong> {trace.trace_id}</div>
            <div><strong>Nodes:</strong> {(trace.nodes_executed ?? []).map((item: any) => item.node).join(' → ') || '—'}</div>
            <div><strong>Few-shot examples:</strong> {(trace.few_shot_examples ?? []).map((item: any) => item.title).join(', ') || 'None'}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Database Queries</div>
            <pre className="rewrite-box" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--ink)' }}>{JSON.stringify(trace.db_queries ?? [], null, 2)}</pre>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Context Blocks</div>
            <pre className="rewrite-box" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--ink)' }}>{JSON.stringify(trace.context_blocks ?? {}, null, 2)}</pre>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI Calls</div>
            <pre className="rewrite-box" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--ink)' }}>{JSON.stringify(trace.ai_calls ?? [], null, 2)}</pre>
          </div>
        </div>
      </details>
    );
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, generating]);


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

  // Chat generation
  async function sendChatMessage() {
    if (!chatInput.trim() || !docType || !stakeholder) return;
    const input = chatInput.trim();
    setChatInput('');

    if (baseDraft === null) {
      // First message → generate fresh draft immediately
      setChatMessages((prev) => [...prev, { role: 'user', content: input }]);
      setGenerating(true);
      try {
        const { data } = await submissionsApi.generateDraft(
          docType,
          stakeholder,
          {
            "User's Complete Custom Prompt": input,
          },
          {
            llm_mode: llmMode,
            thinking_instructions: trimmedThinkingInstructions || undefined,
          }
        );
        const resultDraft = data.draft;
        setBaseDraft(resultDraft);
        const { data: analysis } = await submissionsApi.analyzeDraft(docType, stakeholder, resultDraft);
        setChatMessages((prev) => [...prev, { role: 'ai', content: resultDraft, analysis, draftTrace: data.workflow_memory }]);
      } catch (e: any) {
        toast('error', e.response?.data?.detail ?? 'Failed to generate draft');
      } finally {
        setGenerating(false);
      }
    } else if (lastSuggestions.length > 0) {
      // Follow-up with suggestions available → pause and show picker
      setSelectedSuggestions(new Set());
      setPendingChatInput(input);
    } else {
      // Follow-up with no suggestions → refine immediately
      await executeRefine(input, []);
    }
  }

  async function executeRefine(userInstruction: string, applySuggestions: number[]) {
    if (!docType || !stakeholder || !baseDraft) return;
    setChatMessages((prev) => [...prev, { role: 'user', content: userInstruction }]);
    setPendingChatInput(null);
    setGenerating(true);
    try {
      // Build an explicit human_input so the AI doesn't invent other changes
      let human_input = `INSTRUCTION: ${userInstruction}\n\n`;
      if (applySuggestions.length > 0) {
        human_input += 'ALSO APPLY THESE SPECIFIC IMPROVEMENTS (and nothing else beyond the instruction above):\n';
        applySuggestions.forEach((idx) => {
          const s = lastSuggestions[idx];
          if (s) human_input += `- Replace "${s.original}" → "${s.replacement}" (Reason: ${s.reason})\n`;
        });
      } else {
        human_input += 'IMPORTANT: Apply ONLY the instruction above. Do NOT apply any other suggestions or improvements not explicitly listed here.';
      }

      const { data } = await submissionsApi.refineDraft(baseDraft, 'regenerate', docType, stakeholder, {
        human_input,
        thinking_instructions: trimmedThinkingInstructions || undefined,
      });
      const resultDraft = data.draft;
      const { data: analysis } = await submissionsApi.analyzeDraft(docType, stakeholder, resultDraft);
      setChatMessages((prev) => [...prev, { role: 'ai', content: resultDraft, analysis, draftTrace: data.workflow_memory }]);
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Refinement failed');
    } finally {
      setGenerating(false);
    }
  }

  function clearChat() {
    setChatMessages([]);
    setChatInput('');
    setBaseDraft(null);
  }

  function useDraftFromChat(draftContent: string, analysis?: DraftAnalysisResponse) {
    setDraft(draftContent);
    if (analysis) {
      setExistingDraftAnalysis(analysis);
      setExistingDraftAnalyzedContent(draftContent);
    }
    setStep('draft');
  }

  function updateExistingDraft(value: string) {
    setDraft(value);
    if (value !== existingDraftAnalyzedContent) {
      setExistingDraftAnalysis(null);
    }
  }

  function readinessLabel(score: number) {
    if (score >= 85) return 'Ready to submit';
    if (score >= 65) return 'Good foundation';
    if (score >= 40) return 'Needs improvement';
    return 'High revision needed';
  }

  function getCurrentPrecheckPayload() {
    if (!existingDraftAnalysis || existingDraftAnalyzedContent !== draft) return {};
    return {
      ai_precheck: {
        score: existingDraftAnalysis.score,
        dimensions: existingDraftAnalysis.dimensions,
        grammar_check: existingDraftAnalysis.grammar_check,
        suggestions: existingDraftAnalysis.suggestions,
        rewrite: existingDraftAnalysis.rewrite,
      },
      precheck_workflow_memory: existingDraftAnalysis.workflow_memory,
    };
  }

  // Draft generation
  async function generateDraft() {
    if (!docType || !stakeholder) return;
    setGenerating(true);
    try {
      const formData = step === 'custom_prompt'
        ? { "User's Complete Custom Prompt": customPromptText }
        : contextFields;

      const { data } = await submissionsApi.generateDraft(docType, stakeholder, formData, {
        llm_mode: llmMode,
        thinking_instructions: trimmedThinkingInstructions || undefined,
      });
      setDraft(data.draft);
      setStep('draft');
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Failed to generate draft');
    } finally {
      setGenerating(false);
    }
  }

  async function handleExistingDraftUpload(file: File) {
    setUploadedFile(file);
    setExtractingFile(true);
    try {
      const { data } = await submissionsApi.extractFile(file);
      if (!data.extracted_text?.trim()) {
        toast('error', 'Could not extract readable text from this file');
        return;
      }
      updateExistingDraft(data.extracted_text);
      toast('success', `Imported text from ${data.file_name}`);
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not extract text from file');
    } finally {
      setExtractingFile(false);
    }
  }

  async function runExistingDraftPrecheck() {
    if (!docType || !stakeholder || !draft.trim()) return;
    setCheckingReadiness(true);
    try {
      const { data } = await submissionsApi.analyzeDraft(docType, stakeholder, draft);
      setExistingDraftAnalysis(data);
      setExistingDraftAnalyzedContent(draft);
      toast('success', `Pre-check complete: ${data.score}/100`);
    } catch (e: any) {
      toast('error', e.response?.data?.detail ?? 'Could not run AI pre-check');
    } finally {
      setCheckingReadiness(false);
    }
  }

  // Refine draft
  async function refineDraft(action: string) {
    if (!docType || !stakeholder) return;
    setRefining(true);
    try {
      const { data } = await submissionsApi.refineDraft(draft, action, docType, stakeholder, {
        thinking_instructions: trimmedThinkingInstructions || undefined,
      });
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
      const { data } = await submissionsApi.create(docType, stakeholder, draft, {
        fields: contextFields,
        ...getCurrentPrecheckPayload(),
      });
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
    if (step === 'existing_draft' && (!existingDraftAnalysis || existingDraftAnalyzedContent !== draft)) {
      toast('info', 'Run AI pre-check on the current draft before submitting to founders');
      return;
    }
    setSubmitting(true);
    try {
      const { data: created } = await submissionsApi.create(docType, stakeholder, draft, {
        fields: contextFields,
        ...getCurrentPrecheckPayload(),
      });
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
              onClick={() => setStep('prompt_method')}
            >
              Next: Compose Method →
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Step: Context form
  if (step === 'context') {
    return (
      <Modal title="Add Context" subtitle="Help the AI write in the right voice" onClose={onClose} size="full">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '70vh' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            {docType && <DocTypeChip type={docType} />}
            <span style={{ fontSize: 13, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>
              → {stakeholder}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: llmMode === 'autonomous' ? 'var(--green-800)' : 'var(--ink-mid)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {llmMode} mode
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1, alignContent: 'start' }}>
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
            <button className="btn btn-outline" onClick={() => setStep('prompt_method')}>← Back</button>
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

  // Step: Choose prompt method
  if (step === 'prompt_method') {
    return (
      <Modal title="Compose Method" subtitle="How would you like to create this document?" onClose={onClose} size="full">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24 }}>
          <div style={{ width: '100%', maxWidth: 1240, border: '1px solid var(--border)', borderRadius: 18, background: 'var(--white)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--ink-mid)' }}>
                  AI Thinking Instructions
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                  Optionally tell the model exactly what to prioritize, avoid, and how to reason.
                </div>
              </div>
              <div style={{ display: 'inline-flex', background: 'var(--surface)', borderRadius: 999, padding: 4, border: '1px solid var(--border)' }}>
                <button
                  className={`btn btn-sm ${llmMode === 'autonomous' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 999 }}
                  onClick={() => setLlmMode('autonomous')}
                >
                  Autonomous
                </button>
                <button
                  className={`btn btn-sm ${llmMode === 'guided' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 999 }}
                  onClick={() => setLlmMode('guided')}
                >
                  Guided
                </button>
              </div>
            </div>
            <AutoTextarea
              value={thinkingInstructions}
              onChange={e => setThinkingInstructions(e.target.value)}
              placeholder="Example: Think like a senior Lyfshilp editor. Lead with the outcome, keep sentences short, avoid salesy phrasing, and never ask me for confirmation unless you truly need a missing fact."
              minHeight={110}
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            />
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {llmMode === 'autonomous'
                ? 'Autonomous mode means the AI will move forward using best judgment and the current context.'
                : 'Guided mode means the AI will follow your detailed directions and keep your reasoning notes in the prompt.'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24, width: '100%', maxWidth: 1240 }}>
            {/* Option 1: Custom Prompt */}
            <div
              className="method-card"
              style={{ padding: 32, border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', background: 'var(--white)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
              onClick={() => {
                setLlmMode('guided');
                setStep('custom_prompt');
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 16 }}>✍️</div>
              <h3 style={{ fontSize: 20, marginBottom: 12, fontWeight: 600 }}>Guided Prompt</h3>
              <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>Write exactly how the AI should think, then chat with it to refine the draft.</p>
            </div>

            {/* Option 2: Default Context Form */}
            <div
              className="method-card"
              style={{ padding: 32, border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', background: 'var(--white)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
              onClick={() => {
                setLlmMode('autonomous');
                setStep('context');
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 16 }}>📋</div>
              <h3 style={{ fontSize: 20, marginBottom: 12, fontWeight: 600 }}>Autonomous Draft</h3>
              <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>Answer a few quick questions and let the AI draft independently without waiting for human feedback.</p>
            </div>

            <div
              className="method-card"
              style={{ padding: 32, border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', background: 'var(--white)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
              onClick={() => setStep('existing_draft')}
            >
              <div style={{ fontSize: 24, marginBottom: 16 }}>📤</div>
              <h3 style={{ fontSize: 20, marginBottom: 12, fontWeight: 600 }}>Submit Existing Draft</h3>
              <p style={{ color: 'var(--ink-soft)', lineHeight: 1.6 }}>Paste or upload an existing document, run an AI readiness pre-check, and only then send it to founders for review.</p>
            </div>
          </div>
          <button className="btn btn-outline" onClick={() => setStep('type')}>← Back to Document Type</button>
        </div>
      </Modal>
    );
  }

  if (step === 'existing_draft') {
    const readinessScore = existingDraftAnalysis?.score ?? null;
    return (
      <Modal title="Submit Existing Draft" subtitle="Paste or upload content and run AI pre-check before founder review" onClose={onClose} size="full">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '80vh' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            {docType && <DocTypeChip type={docType} />}
            <span style={{ fontSize: 13, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>
              → {stakeholder}
            </span>
          </div>

          <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label className="form-label">Existing Draft Content</label>
            <textarea
              ref={draftRef}
              className="form-textarea"
              value={draft}
              onChange={e => updateExistingDraft(e.target.value)}
              style={{ flex: 1, minHeight: 360, resize: 'vertical', transition: 'height 0.15s ease', fontSize: 15 }}
              placeholder="Paste the current draft here, or upload a PDF/DOCX below to extract its text."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Import From File <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(optional .pdf / .docx)</span></label>
            <div className="upload-zone" onClick={() => fileRef.current?.click()}>
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
                  {extractingFile ? 'Extracting text…' : 'Click to import a PDF or DOCX'}
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (file) await handleExistingDraftUpload(file);
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button
              className="btn btn-primary"
              disabled={!draft.trim() || checkingReadiness}
              onClick={runExistingDraftPrecheck}
            >
              {checkingReadiness ? <><Spinner /> Running AI pre-check…</> : 'Run AI Pre-check'}
            </button>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              Team members see a readiness score before the draft goes to founders.
            </div>
          </div>

          {existingDraftAnalysis && (
            <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--white)', overflow: 'hidden', color: 'var(--ink)' }}>
              <div style={{ padding: '18px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Readiness Score</div>
                  <div style={{ fontSize: 15, color: 'var(--ink-soft)' }}>{readinessLabel(existingDraftAnalysis.score)}</div>
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: existingDraftAnalysis.score >= 80 ? 'var(--green-700)' : existingDraftAnalysis.score >= 60 ? '#f59e0b' : 'var(--red-600)' }}>
                  {existingDraftAnalysis.score}/100
                </div>
              </div>
              <div style={{ padding: '18px 22px', background: 'var(--white)', color: 'var(--ink)' }}>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 18 }}>
                  <div><strong>Tone:</strong> {existingDraftAnalysis.dimensions.tone_voice}/20</div>
                  <div><strong>Structure:</strong> {existingDraftAnalysis.dimensions.format_structure}/20</div>
                  <div><strong>Stakeholder Fit:</strong> {existingDraftAnalysis.dimensions.stakeholder_fit}/20</div>
                  <div><strong>Completeness:</strong> {existingDraftAnalysis.dimensions.missing_elements}/20</div>
                  <div><strong>Improvement:</strong> {existingDraftAnalysis.dimensions.improvement_scope}/20</div>
                  <div><strong>Grammar:</strong> {existingDraftAnalysis.grammar_check?.score ?? '—'}/20</div>
                </div>
                {existingDraftAnalysis.grammar_check?.notes?.length ? (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Grammar Check</div>
                    <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-soft)' }}>
                      {existingDraftAnalysis.grammar_check.notes.map((note, idx) => (
                        <li key={idx} style={{ marginBottom: 8 }}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {existingDraftAnalysis.suggestions.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Basic AI Suggestions</div>
                    <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-soft)' }}>
                      {existingDraftAnalysis.suggestions.slice(0, 4).map((item, idx) => (
                        <li key={idx} style={{ marginBottom: 8 }}>{item.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {renderTraceSection('AI Pre-check Trace', existingDraftAnalysis.workflow_memory)}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 'auto' }}>
            <button className="btn btn-outline" onClick={() => setStep('prompt_method')}>← Back</button>
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
                disabled={submitting || !draft.trim() || !existingDraftAnalysis || existingDraftAnalyzedContent !== draft}
              >
                {submitting ? <><Spinner /> Submitting…</> : '✓ Submit to Founders'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

    // Step: Custom Prompt Editor
  if (step === 'custom_prompt') {
    return (
      <Modal title="Interactive Compose" subtitle="Tell the AI how to think, then chat to refine the draft" onClose={onClose} size="full">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '80vh' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            {docType && <DocTypeChip type={docType} />}
            <span style={{ fontSize: 13, color: 'var(--ink-soft)', textTransform: 'capitalize' }}>
              → {stakeholder}
            </span>
            <button
              className={`btn btn-sm ${llmMode === 'autonomous' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setLlmMode('autonomous')}
              style={{ marginLeft: 'auto', borderRadius: 999 }}
            >
              Autonomous
            </button>
            <button
              className={`btn btn-sm ${llmMode === 'guided' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setLlmMode('guided')}
              style={{ borderRadius: 999 }}
            >
              Guided
            </button>
          </div>

          <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--white)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Thinking Instructions
            </div>
            <AutoTextarea
              value={thinkingInstructions}
              onChange={e => setThinkingInstructions(e.target.value)}
              placeholder="Tell the AI exactly what to prioritize, what to avoid, and how to reason about this draft."
              minHeight={84}
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            />
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {trimmedThinkingInstructions
                ? 'These instructions will be prepended to every generation and refinement request in this session.'
                : 'Leave this blank for autonomous drafting with best-effort assumptions.'}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 20, padding: '10px 4px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {chatMessages.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--ink-soft)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
                <div>Send your prompt below to begin generating. The AI will follow your thinking notes if you add them.</div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                {msg.role === 'user' ? (
                  <div style={{ background: 'var(--ink)', color: 'var(--white)', padding: '16px 20px', borderRadius: '20px 20px 4px 20px', fontSize: 15, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {msg.content}
                  </div>
                ) : (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px 20px 20px 4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                    <div style={{ padding: '24px 30px', borderBottom: '1px solid var(--border)', background: 'var(--white)', fontSize: 15, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {msg.content}
                    </div>
                    {msg.analysis && (
                      <div style={{ padding: '20px 30px', background: 'var(--surface)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>AI Scorecard</span>
                          <span style={{ fontWeight: 800, fontSize: 18, color: msg.analysis.score >= 80 ? 'var(--green-700)' : msg.analysis.score >= 60 ? '#f59e0b' : 'var(--red-600)' }}>
                            {msg.analysis.score} / 100
                          </span>
                        </div>
                        {msg.analysis.dimensions && (
                          <div style={{ marginBottom: 24, padding: 16, background: 'var(--white)', borderRadius: 8, border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Score Breakdown (out of 20)</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Tone & Voice</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: msg.analysis.dimensions.tone_voice < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{msg.analysis.dimensions.tone_voice}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Format & Structure</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: msg.analysis.dimensions.format_structure < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{msg.analysis.dimensions.format_structure}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Stakeholder Fit</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: msg.analysis.dimensions.stakeholder_fit < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{msg.analysis.dimensions.stakeholder_fit}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Completeness</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: msg.analysis.dimensions.missing_elements < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{msg.analysis.dimensions.missing_elements}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Improvement</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: msg.analysis.dimensions.improvement_scope < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{msg.analysis.dimensions.improvement_scope}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 4 }}>Grammar</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: (msg.analysis.grammar_check?.score ?? 0) < 15 ? 'var(--red-600)' : 'var(--ink)' }}>{msg.analysis.grammar_check?.score ?? '—'}</div>
                              </div>
                            </div>
                            
                            {msg.analysis.grammar_check?.notes?.length ? (
                              <div style={{ marginTop: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Grammar Check Notes</div>
                                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--ink-soft)' }}>
                                  {msg.analysis.grammar_check.notes.map((note, idx) => (
                                    <li key={idx} style={{ marginBottom: 4 }}>{note}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        )}
                        {msg.analysis.suggestions.length > 0 && (
                          <div style={{ marginBottom: 24 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-mid)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Suggestions</div>
                            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--ink-soft)' }}>
                              {msg.analysis.suggestions.slice(0, 3).map((s, idx) => (
                                <li key={idx} style={{ marginBottom: 8 }}>{s.reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <button className="btn btn-primary" onClick={() => useDraftFromChat(msg.content, msg.analysis)}>
                          Use this Draft →
                        </button>
                        {renderTraceSection('Draft Generation Trace', msg.draftTrace)}
                        {renderTraceSection('AI Review Trace', msg.analysis.workflow_memory)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {generating && (
              <div style={{ alignSelf: 'flex-start', padding: 20, color: 'var(--ink-soft)' }}>
                <Spinner dark /> Generating Response…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Suggestion Picker — only appears when user sends a follow-up and suggestions exist */}
          {pendingChatInput !== null && (
            <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', background: 'var(--white)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Apply AI suggestions?</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    Select which improvements to also apply alongside your change. Unselected ones will be ignored.
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, color: 'var(--ink-soft)' }}
                  onClick={() => setPendingChatInput(null)}
                >✕ Cancel</button>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lastSuggestions.map((s, idx) => {
                  const checked = selectedSuggestions.has(idx);
                  return (
                    <label
                      key={idx}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, background: checked ? 'var(--ink-5, rgba(0,0,0,0.04))' : 'transparent', border: `1px solid ${checked ? 'var(--ink)' : 'var(--border)'}`, transition: 'all 0.15s' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedSuggestions(prev => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            return next;
                          });
                        }}
                        style={{ marginTop: 2, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 4 }}>{s.reason}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ textDecoration: 'line-through' }}>{s.original}</span>
                          <span>→</span>
                          <span style={{ color: 'var(--ink)', fontStyle: 'italic' }}>{s.replacement}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => executeRefine(pendingChatInput, [])}
                >
                  Skip — Apply my change only
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => executeRefine(pendingChatInput, Array.from(selectedSuggestions))}
                >
                  Refine with {selectedSuggestions.size} suggestion{selectedSuggestions.size !== 1 ? 's' : ''} →
                </button>
              </div>
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <textarea
              className="form-textarea"
              style={{ minHeight: 60, paddingRight: 60, paddingBottom: 16, paddingTop: 16, resize: 'none' }}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder={chatMessages.length === 0 ? "Paste your complete prompt or instruction here (Press Enter to send)..." : "Ask AI to change something..."}
              disabled={generating || pendingChatInput !== null}
            />
            <button
              className="btn btn-primary"
              style={{ position: 'absolute', right: 8, bottom: 8, padding: '8px 14px', borderRadius: 8 }}
              disabled={generating || !chatInput.trim() || pendingChatInput !== null}
              onClick={sendChatMessage}
            >
              ↑
            </button>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setStep('prompt_method')} disabled={generating}
              style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
              ← Back
            </button>
            {chatMessages.length > 0 && (
              <button
                onClick={clearChat}
                disabled={generating}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)',
                  background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 20, padding: '5px 14px', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ink)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-soft)'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                </svg>
                Start Over
              </button>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // Step: Draft editor
  if (step === 'draft') {
    return (
      <Modal title="Review & Edit Draft" subtitle="Refine, edit, then submit for founder review" onClose={onClose} size="full">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '80vh' }}>
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
          <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label className="form-label" style={{ marginBottom: 10 }}>Draft Content</label>
            <textarea
              ref={draftRef}
              className="form-textarea"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              style={{ flex: 1, minHeight: 400, resize: 'vertical', transition: 'height 0.15s ease', fontSize: 15 }}
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
            <button className="btn btn-outline" onClick={() => setStep('prompt_method')}>← Edit Instructions</button>
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
