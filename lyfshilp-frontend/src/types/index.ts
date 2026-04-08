// ── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'founder' | 'team_member' | 'admin';
export type TeamDepartment = 'sales' | 'marketing' | 'counsellor' | 'academic' | 'founders';
export type AuthProvider = 'local' | 'google';
export type LLMMode = 'autonomous' | 'guided';

export type DocumentType = string;

export type Stakeholder =
  | 'parent'
  | 'student'
  | 'principal'
  | 'counsellor'
  | 'corporate'
  | 'investor'
  | 'government';

export type SubmissionStatus = 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected';

// ── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: TeamDepartment | null;
  auth_provider: AuthProvider;
  is_active: boolean;
  created_at: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// ── AI Scorecard ─────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  tone_voice: number;
  format_structure: number;
  stakeholder_fit: number;
  missing_elements: number;
  improvement_scope: number;
}

export interface GrammarCheck {
  score: number;
  notes: string[];
}

export interface AISuggestion {
  original: string;
  replacement: string;
  reason: string;
}

// ── Submission ────────────────────────────────────────────────────────────────

export interface Submission {
  id: string;
  user_id: string;
  doc_type: DocumentType;
  stakeholder: Stakeholder;
  content: string;
  ai_score: number | null;
  ai_scorecard: {
    score?: number;
    dimensions?: ScoreBreakdown;
    grammar_check?: GrammarCheck;
    suggestions?: AISuggestion[];
    rewrite?: string;
    tone_voice?: number;
    format_structure?: number;
    stakeholder_fit?: number;
    missing_elements?: number;
    improvement_scope?: number;
  } | null;
  ai_suggestions: AISuggestion[] | null;
  ai_rewrite: string | null;
  status: SubmissionStatus;
  version: number;
  parent_submission_id: string | null;
  file_url: string | null;
  file_name: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  author?: User;
  feedback?: {
    founder_note: string | null;
    ai_generated_note: string | null;
  };
  visibility?: {
    visible_to_roles?: string[] | null;
    visible_to_departments?: string[] | null;
    visible_to_user_ids?: string[] | null;
  } | null;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardData {
  pending: Submission[];
  approved?: Submission[];
  recent?: Submission[];
  counts: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    under_review: number;
  };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface SystemPrompt {
  id: string | null;
  prompt_text: string;
  label: string;
  is_active: boolean;
  updated_at: string | null;
}

export interface StakeholderGuidance {
  id: string;
  stakeholder: Stakeholder;
  title: string;
  guidance_text: string;
  updated_at: string;
}

export interface AIReviewGuidance {
  id: string;
  config_key: string;
  review_dimension: string;
  title: string;
  content: string;
  updated_at: string;
}

export interface EmojiGuidance {
  id: string;
  config_key: string;
  title: string;
  content: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface KnowledgeLibraryItem {
  id: string;
  title: string;
  section_key: string;
  section_label: string;
  description: string | null;
  source_kind: string;
  source_file_url: string | null;
  source_filename: string | null;
  source_mime_type: string | null;
  source_size_bytes: number | null;
  content_markdown: string;
  raw_text: string | null;
  applies_to_doc_types: string[] | null;
  applies_to_stakeholders: string[] | null;
  visible_to_departments: string[] | null;
  tags: string[] | null;
  sort_order: number;
  is_active: boolean;
  parser_provider: string | null;
  parser_status: string | null;
  parser_notes: string | null;
  intake_analysis: KnowledgeLibraryAnalysis | null;
  intake_conversation: KnowledgeLibraryConversationMessage[] | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeLibraryConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string | null;
}

export interface KnowledgeLibraryAnalysis {
  content_kind: string;
  summary: string;
  confidence: number;
  inferred_title: string | null;
  inferred_section_key: string | null;
  inferred_section_label: string | null;
  recommended_doc_types: string[];
  recommended_stakeholders: string[];
  recommended_tags: string[];
  clarifying_questions: string[];
  needs_clarification: boolean;
  notes: string | null;
}

export interface KnowledgeLibraryIntakeResponse {
  source_filename: string | null;
  source_mime_type: string | null;
  source_size_bytes: number | null;
  content_markdown: string;
  raw_text: string | null;
  parser_provider: string;
  parser_status: string;
  parser_notes: string | null;
  analysis: KnowledgeLibraryAnalysis;
}

export interface GoogleDriveConnectionStatus {
  connected: boolean;
  google_email: string | null;
  folder_id: string | null;
  scopes: string | null;
  connected_at: string | null;
}

export interface GoogleDriveAuthUrl {
  url: string;
  state: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  modified_time: string | null;
  size_bytes: number | null;
}

export interface DocumentGuidance {
  id: string;
  doc_type: DocumentType;
  title: string;
  description: string;
  key_requirements: string;
  updated_at: string;
}

export interface DraftAnalysisResponse {
  score: number;
  dimensions: {
    tone_voice: number;
    format_structure: number;
    stakeholder_fit: number;
    missing_elements: number;
    improvement_scope: number;
  };
  grammar_check?: GrammarCheck | null;
  suggestions: {
    original: string;
    replacement: string;
    reason: string;
  }[];
  rewrite: string;
  workflow_stage: string;
  workflow_memory: any;
}

export interface LibraryContextPreview {
  library_context: string;
  has_context: boolean;
}

export interface ComposeStakeholderOption {
  value: Stakeholder;
  label: string;
}

export interface ComposeOptionsResponse {
  document_guidance: DocumentGuidance[];
  stakeholders: ComposeStakeholderOption[];
}

export interface DraftWorkflowResponse {
  draft: string;
  workflow_stage: string;
  workflow_memory: any;
}
