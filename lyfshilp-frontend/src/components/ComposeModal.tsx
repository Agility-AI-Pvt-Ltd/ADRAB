import { useEffect, useRef, useState } from 'react';
import { useAutoResize } from '../hooks/useAutoResize';
import { Modal, Spinner, useToast, DocTypeChip } from './shared';
import { libraryApi, submissionsApi, usersApi } from '../api';
import { cachedFetch, readCache } from '../utils/apiCache';
import { useAuth } from '../contexts/AuthContext';
import type { DocumentGuidance, DocumentType, KnowledgeLibraryItem, Stakeholder, DraftAnalysisResponse, LLMMode, LibraryContextPreview, ComposeStakeholderOption } from '../types';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  analysis?: DraftAnalysisResponse;
  draftTrace?: any;
}

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
  onKeyDown,
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
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
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
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      style={{ resize: 'none', transition: 'height 0.15s ease', ...style }}
    />
  );
}

/**
 * Filter cached library items to those that match the given doc_type + stakeholder,
 * using the same logic as the backend: empty list = matches all.
 */
function filterLibraryItems(
  items: KnowledgeLibraryItem[],
  docType: string,
  stakeholder: string
): KnowledgeLibraryItem[] {
  return items.filter(item => {
    if (!item.is_active) return false;
    const docTypes = item.applies_to_doc_types ?? [];
    const stakeholders = item.applies_to_stakeholders ?? [];
    const docOk = docTypes.length === 0 || docTypes.includes(docType);
    const stakeholderOk = stakeholders.length === 0 || stakeholders.includes(stakeholder);
    return docOk && stakeholderOk;
  });
}

function getMentionState(text: string) {
  const lastAt = text.lastIndexOf('@');
  if (lastAt === -1) return null;
  if (lastAt > 0 && !/\s/.test(text[lastAt - 1])) return null;
  const fragment = text.slice(lastAt + 1);
  if (fragment.includes('\n')) return null;
  return {
    start: lastAt,
    query: fragment.trim().toLowerCase(),
  };
}

function removeMentionQuery(text: string, mentionState: { start: number; query: string }) {
  return `${text.slice(0, mentionState.start)}${text.slice(mentionState.start + 1 + mentionState.query.length)}`;
}

/** Compact square chip style — draggable or clickable to insert into the prompt */
function LibraryContextChips({
  items,
  onInsert,
  selectedIds,
}: {
  items: KnowledgeLibraryItem[];
  onInsert?: (item: KnowledgeLibraryItem) => void;
  selectedIds?: Set<string>;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => (
        <div
          key={item.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/library-item-title', item.title);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={() => onInsert?.(item)}
          title={`Click or drag to insert: ${item.title}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${selectedIds?.has(item.id) ? 'var(--pink-500)' : 'var(--border)'}`,
            background: selectedIds?.has(item.id) ? 'rgba(255, 101, 138, 0.10)' : 'var(--surface)',
            cursor: 'pointer',
            userSelect: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            transition: 'transform 0.15s, opacity 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
          }}
          onMouseDown={e => {
            e.currentTarget.style.opacity = '0.7';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseUp={e => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onDragEnd={e => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
          }}
        >
          <span style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
          }}>📄</span>
          <span style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: 'var(--ink)',
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}>
            {item.title}
          </span>
        </div>
      ))}
    </div>
  );
}


export default function ComposeModal({ onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [docTypes, setDocTypes] = useState<DocumentGuidance[]>([]);
  const [stakeholders, setStakeholders] = useState<ComposeStakeholderOption[]>([]);
  const [founderOptions, setFounderOptions] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [founderOptionsLoading, setFounderOptionsLoading] = useState(false);
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
  const [libraryContextLoading, setLibraryContextLoading] = useState(false);
  const [matchedLibraryItems, setMatchedLibraryItems] = useState<KnowledgeLibraryItem[]>([]);
  const [selectedLibraryItems, setSelectedLibraryItems] = useState<KnowledgeLibraryItem[]>([]);
  const [mentionState, setMentionState] = useState<{ start: number; query: string } | null>(null);
  const [guidedLibraryItems, setGuidedLibraryItems] = useState<KnowledgeLibraryItem[]>([]);
  const [chatInputDragOver, setChatInputDragOver] = useState(false);
  const [selectedFounderIds, setSelectedFounderIds] = useState<string[]>([]);
  const [founderPickerOpen, setFounderPickerOpen] = useState(false);
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
    cachedFetch(
      'compose_options',
      () => submissionsApi.composeOptions().then((r) => r.data),
      {
        ttl: 5 * 60_000,      // treat as fresh for 5 min
        staleTtl: 60 * 60_000, // serve stale for up to 1 hour while refreshing
        onRefresh: (fresh) => {
          setDocTypes(fresh.document_guidance);
          setStakeholders(fresh.stakeholders);
        },
      }
    )
      .then((data) => {
        setDocTypes(data.document_guidance);
        setStakeholders(data.stakeholders);
      })
      .catch(() => toast('error', 'Could not load compose options'));
  }, []);

  useEffect(() => {
    if (user?.role !== 'team_member') return;
    setFounderOptionsLoading(true);
    usersApi.founders()
      .then(({ data }) => setFounderOptions(data))
      .catch(() => setFounderOptions([]))
      .finally(() => setFounderOptionsLoading(false));
  }, [user?.role]);

  useEffect(() => {
    const shouldShowLibraryContext = step === 'context' || step === 'custom_prompt';
    if (!shouldShowLibraryContext || !docType || !stakeholder) {
      setLibraryContextLoading(false);
      setMatchedLibraryItems([]);
      setSelectedLibraryItems([]);
      setMentionState(null);
      return;
    }

    // Instantly retrieve from cache to prevent UI flicker
    const cachedItems = readCache<KnowledgeLibraryItem[]>('library_items')?.data;
    if (!cachedItems) {
      setLibraryContextLoading(true);
    } else {
      // Re-filter instantly just in case
      setMatchedLibraryItems(filterLibraryItems(cachedItems, docType, stakeholder));
    }

    // Still initiate background fetch to keep fresh
    cachedFetch(
      'library_items',
      () => libraryApi.list().then(r => r.data),
      { 
        ttl: 3 * 60_000, 
        staleTtl: 30 * 60_000,
        onRefresh: (items) => {
          setMatchedLibraryItems(filterLibraryItems(items, docType, stakeholder));
          setLibraryContextLoading(false);
        }
      }
    ).then(items => {
      setMatchedLibraryItems(filterLibraryItems(items, docType, stakeholder));
    }).catch(() => {
      setMatchedLibraryItems([]);
    }).finally(() => {
      setLibraryContextLoading(false);
    });
  }, [step, docType, stakeholder]);

  const currentFieldDefs = docType ? (DOC_TYPE_CONTEXT_FIELDS[docType] ?? DEFAULT_CONTEXT_FIELDS) : DEFAULT_CONTEXT_FIELDS;
  const visibleFieldDefs = currentFieldDefs.some((field) => field.key === EXTRA_CONTEXT_FIELD.key)
    ? currentFieldDefs
    : [...currentFieldDefs, EXTRA_CONTEXT_FIELD];

  useEffect(() => {
    setContextFields((prev) => {
      const next: Record<string, string> = {};
      for (const field of visibleFieldDefs) {
        if (field.key === 'recipient_type') {
          next[field.key] = stakeholder ? stakeholders.find((s) => s.value === stakeholder)?.label ?? stakeholder : '';
        } else {
          next[field.key] = prev[field.key] ?? '';
        }
      }
      return next;
    });
  }, [visibleFieldDefs, stakeholder, stakeholders]);

  function updateContextField(key: string, value: string) {
    setContextFields((fields) => ({ ...fields, [key]: value }));
    if (key === EXTRA_CONTEXT_FIELD.key) {
      const nextMentionState = getMentionState(value);
      setMentionState(nextMentionState);
    }
  }

  const canGenerateDraft = visibleFieldDefs
    .filter((field) => field.required)
    .every((field) => (contextFields[field.key] ?? '').trim());

  // Toggle a chip tag in the prompt text
  function toggleLibraryTag(title: string) {
    setChatInput(prev => {
      const tag = `@[${title}]`;
      if (prev.includes(tag)) {
        return prev.replace(tag, '').replace(/\s{2,}/g, ' ').trim();
      } else {
        return prev ? `${prev} ${tag}` : tag;
      }
    });
  }

  function toggleAutonomousLibraryItem(item: KnowledgeLibraryItem) {
    setSelectedLibraryItems((prev) => {
      const alreadySelected = prev.some((libraryItem) => libraryItem.id === item.id);
      if (alreadySelected) {
        return prev.filter((libraryItem) => libraryItem.id !== item.id);
      }
      return [...prev, item];
    });
    setMentionState(null);
  }

  function selectAllLibraryItems() {
    setSelectedLibraryItems(matchedLibraryItems);
    setMentionState(null);
  }

  function removeLastSelectedLibraryItem() {
    setSelectedLibraryItems((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  }

  function toggleGuidedLibraryItem(item: KnowledgeLibraryItem) {
    setGuidedLibraryItems((prev) => {
      const alreadySelected = prev.some((libraryItem) => libraryItem.id === item.id);
      if (alreadySelected) {
        return prev.filter((libraryItem) => libraryItem.id !== item.id);
      }
      return [...prev, item];
    });
  }

  function selectAllGuidedLibraryItems() {
    setGuidedLibraryItems(matchedLibraryItems);
  }

  function removeLastGuidedLibraryItem() {
    setGuidedLibraryItems((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
  }

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
        const formData: Record<string, string> = {
          "User's Complete Custom Prompt": input,
        };
        const { data } = await submissionsApi.generateDraft(
          docType,
          stakeholder,
          formData,
          {
            llm_mode: llmMode,
            thinking_instructions: trimmedThinkingInstructions || undefined,
            selected_library_item_ids: guidedLibraryItems.map((item) => item.id),
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
      const formData: Record<string, string> = step === 'custom_prompt'
        ? { "User's Complete Custom Prompt": customPromptText }
        : {
            ...contextFields,
          } as Record<string, string>;

      const { data } = await submissionsApi.generateDraft(docType, stakeholder, formData, {
        llm_mode: llmMode,
        thinking_instructions: trimmedThinkingInstructions || undefined,
        selected_library_item_ids: selectedLibraryItems.map((item) => item.id),
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
  async function submitForReview(reviewerIds: string[] = selectedFounderIds, force = false) {
    if (!docType || !stakeholder || !draft.trim()) return;
    if (step === 'existing_draft' && (!existingDraftAnalysis || existingDraftAnalyzedContent !== draft)) {
      toast('info', 'Run AI pre-check on the current draft before submitting to founders');
      return;
    }
    if (user?.role === 'team_member' && !force) {
      setFounderPickerOpen(true);
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
      await submissionsApi.submit(created.id, { assigned_founder_ids: reviewerIds });
      toast('success', 'Submitted for review — AI is scoring your document');
      setFounderPickerOpen(false);
      setSelectedFounderIds([]);
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
              {stakeholders.map(s => (
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
            <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 2 }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Founder Library
                <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 400 }}>matched context</span>
              </label>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
                Click an item to append it into Additional Context for this autonomous draft.
              </div>
              {libraryContextLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-soft)', fontSize: 12.5 }}>
                  <Spinner />
                  Matching library…
                </div>
              ) : matchedLibraryItems.length > 0 ? (
                <LibraryContextChips
                  items={matchedLibraryItems}
                  onInsert={toggleAutonomousLibraryItem}
                  selectedIds={new Set(selectedLibraryItems.map((item) => item.id))}
                />
              ) : (
                <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>
                  No matches yet
                </div>
              )}
            </div>
            {visibleFieldDefs.map((field) => (
              <div
                key={field.key}
                className="form-group"
                style={field.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}
              >
                <label className="form-label">
                  {field.label} {field.required ? <span className="required">*</span> : null}
                </label>
                {field.key === EXTRA_CONTEXT_FIELD.key && mentionState && (
                  <div
                    style={{
                      marginBottom: 10,
                      border: '1px solid var(--border)',
                      borderRadius: 14,
                      background: 'var(--surface)',
                      padding: 10,
                      boxShadow: '0 10px 24px rgba(0,0,0,0.14)',
                    }}
                  >
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Library Suggestions
                      </div>
                    <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          width: '100%',
                          borderRadius: 10,
                          padding: '10px 12px',
                          background: 'rgba(255, 101, 138, 0.10)',
                          border: '1px solid var(--pink-500)',
                        }}
                        onClick={selectAllLibraryItems}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.08)', marginRight: 10, flexShrink: 0 }}>
                          @
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>@all</span>
                          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                            Add all matching founder library items
                          </span>
                        </span>
                      </button>
                      {matchedLibraryItems
                        .filter((item) => !mentionState.query || item.title.toLowerCase().includes(mentionState.query))
                        .filter((item) => !selectedLibraryItems.some((selected) => selected.id === item.id))
                        .slice(0, 8)
                        .map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="btn btn-ghost"
                            style={{
                              justifyContent: 'flex-start',
                              textAlign: 'left',
                              width: '100%',
                              borderRadius: 10,
                              padding: '10px 12px',
                              background: 'var(--surface)',
                            }}
                            onClick={() => {
                              const current = contextFields[EXTRA_CONTEXT_FIELD.key] ?? '';
                              const nextValue = removeMentionQuery(current, mentionState);
                              updateContextField(EXTRA_CONTEXT_FIELD.key, nextValue);
                              setSelectedLibraryItems((prev) =>
                                prev.some((selected) => selected.id === item.id)
                                  ? prev
                                  : [...prev, item]
                              );
                              setMentionState(null);
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.08)', marginRight: 10, flexShrink: 0 }}>
                              📄
                            </span>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</span>
                              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                                {item.section_label}
                              </span>
                            </span>
                          </button>
                        ))}
                      {!matchedLibraryItems
                        .filter((item) => !mentionState.query || item.title.toLowerCase().includes(mentionState.query))
                        .filter((item) => !selectedLibraryItems.some((selected) => selected.id === item.id)).length && (
                        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', padding: '6px 2px' }}>
                          No matching library items.
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {field.key === EXTRA_CONTEXT_FIELD.key && selectedLibraryItems.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {selectedLibraryItems.map((item) => (
                      <span
                        key={item.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          borderRadius: 999,
                          background: 'rgba(255, 101, 138, 0.16)',
                          border: '1px solid var(--pink-500)',
                          color: 'var(--ink)',
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, background: 'rgba(0,0,0,0.18)', fontSize: 11 }}>
                          @
                        </span>
                        <span>{item.title}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedLibraryItems((prev) => prev.filter((selected) => selected.id !== item.id))}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            padding: 0,
                            marginLeft: 2,
                            fontSize: 14,
                            lineHeight: 1,
                          }}
                          aria-label={`Remove ${item.title}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {field.type === 'textarea' ? (
                  <AutoTextarea
                    value={contextFields[field.key] ?? ''}
                    onChange={e => updateContextField(field.key, e.target.value)}
                    onKeyDown={field.key === EXTRA_CONTEXT_FIELD.key ? (e) => {
                      if (e.key === 'Backspace' && (contextFields[field.key] ?? '') === '' && selectedLibraryItems.length > 0) {
                        e.preventDefault();
                        removeLastSelectedLibraryItem();
                      }
                    } : undefined}
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
                onClick={() => void submitForReview()}
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
              minHeight={150}
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            />
            <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>
              {trimmedThinkingInstructions
                ? 'These instructions will be prepended to every generation and refinement request in this session.'
                : 'Leave this blank for autonomous drafting with best-effort assumptions.'}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📚</span>
              Founder Library
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— {docType ? docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''} → {stakeholder ? stakeholder.charAt(0).toUpperCase() + stakeholder.slice(1) : ''}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
              Click an item to add it as an @mention.
            </div>
            {libraryContextLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-soft)', fontSize: 12.5 }}>
                <Spinner />
                Matching library…
              </div>
            ) : matchedLibraryItems.length > 0 ? (
              <LibraryContextChips
                items={matchedLibraryItems}
                onInsert={toggleGuidedLibraryItem}
              />
            ) : (
              <div style={{ color: 'var(--ink-soft)', fontSize: 12.5 }}>No matches yet</div>
            )}
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

          <div
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setChatInputDragOver(true); }}
            onDragLeave={() => setChatInputDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setChatInputDragOver(false);
              const title = e.dataTransfer.getData('text/library-item-title');
              if (!title) return;
              toggleLibraryTag(title);
            }}
          >
            {guidedLibraryItems.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {guidedLibraryItems.map((item) => (
                  <span
                    key={item.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 999,
                      background: 'rgba(255, 101, 138, 0.16)',
                      border: '1px solid var(--pink-500)',
                      color: 'var(--ink)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, background: 'rgba(0,0,0,0.18)', fontSize: 11 }}>
                      @
                    </span>
                    <span>{item.title}</span>
                    <button
                      type="button"
                      onClick={() => setGuidedLibraryItems((prev) => prev.filter((selected) => selected.id !== item.id))}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: 2,
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                      aria-label={`Remove ${item.title}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
              <textarea
                className="form-textarea"
                style={{
                  minHeight: 130,
                paddingRight: 60,
                paddingBottom: 16,
                paddingTop: 16,
                resize: 'none',
                transition: 'box-shadow 0.15s, border-color 0.15s',
                ...(chatInputDragOver ? {
                  borderColor: 'var(--green-700, #15803d)',
                  boxShadow: '0 0 0 3px rgba(21,128,61,0.2)',
                } : {}),
              }}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && chatInput === '' && guidedLibraryItems.length > 0) {
                  e.preventDefault();
                  removeLastGuidedLibraryItem();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder={chatMessages.length === 0 ? "Paste your complete prompt or instruction here (Press Enter to send)..." : "Ask AI to change something..."}
              disabled={generating || pendingChatInput !== null}
              />
            {getMentionState(chatInput) && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: '100%',
                  marginBottom: 10,
                  border: '1px solid var(--border)',
                  borderRadius: 14,
                  background: 'var(--surface)',
                  padding: 10,
                  boxShadow: '0 10px 24px rgba(0,0,0,0.14)',
                  zIndex: 20,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Library Suggestions
                </div>
                <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      width: '100%',
                      borderRadius: 10,
                      padding: '10px 12px',
                      background: 'rgba(255, 101, 138, 0.10)',
                      border: '1px solid var(--pink-500)',
                    }}
                    onClick={selectAllGuidedLibraryItems}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.08)', marginRight: 10, flexShrink: 0 }}>
                      @
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>@all</span>
                      <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                        Add all matching founder library items
                      </span>
                    </span>
                  </button>
                  {matchedLibraryItems
                    .filter((item) => {
                      const query = getMentionState(chatInput)?.query ?? '';
                      return !query || item.title.toLowerCase().includes(query);
                    })
                    .filter((item) => !guidedLibraryItems.some((selected) => selected.id === item.id))
                    .slice(0, 8)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          width: '100%',
                          borderRadius: 10,
                          padding: '10px 12px',
                          background: 'var(--surface)',
                        }}
                        onClick={() => {
                          toggleGuidedLibraryItem(item);
                          const mention = getMentionState(chatInput);
                          if (mention) {
                            setChatInput((current) => removeMentionQuery(current, mention));
                          }
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.08)', marginRight: 10, flexShrink: 0 }}>
                          📄
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</span>
                          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{item.section_label}</span>
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
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
      <>
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
                onClick={() => void submitForReview()}
                disabled={submitting || !draft.trim()}
              >
                {submitting ? <><Spinner /> Submitting…</> : '✓ Submit for Review'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
      {founderPickerOpen && (
        <Modal
          title="Choose Founder Reviewer"
          subtitle="Select at least one founder who should approve this submission"
          onClose={() => setFounderPickerOpen(false)}
          size="lg"
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              This submission will go only to the selected founder(s) for approval.
            </div>
            <div style={{ display: 'grid', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
              {founderOptionsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-soft)' }}>
                  <Spinner /> Loading founders...
                </div>
              ) : founderOptions.length > 0 ? (
                founderOptions.map((founder) => {
                  const checked = selectedFounderIds.includes(founder.id);
                  return (
                    <label
                      key={founder.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        border: `1px solid ${checked ? 'var(--pink-500)' : 'var(--border)'}`,
                        borderRadius: 12,
                        background: checked ? 'rgba(255, 101, 138, 0.08)' : 'var(--surface)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedFounderIds((prev) =>
                            prev.includes(founder.id)
                              ? prev.filter((id) => id !== founder.id)
                              : [...prev, founder.id]
                          );
                        }}
                      />
                      <div style={{ display: 'grid', gap: 2 }}>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{founder.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{founder.email}</div>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div style={{ color: 'var(--ink-soft)' }}>No active founders were found.</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
              <button className="btn btn-outline" onClick={() => setFounderPickerOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (selectedFounderIds.length === 0) {
                    toast('info', 'Please select at least one founder');
                    return;
                  }
                  void submitForReview(selectedFounderIds, true);
                }}
                disabled={selectedFounderIds.length === 0 || submitting}
              >
                {submitting ? <><Spinner /> Submitting…</> : 'Submit to Selected Founder(s)'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      </>
    );
  }

  return null;
}
