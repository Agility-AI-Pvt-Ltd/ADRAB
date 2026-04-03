// ── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = 'founder' | 'team_member' | 'admin';
export type TeamDepartment = 'sales' | 'marketing' | 'counsellor' | 'academic' | 'founders';
export type AuthProvider = 'local' | 'google';

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
    score: number;
    dimensions: ScoreBreakdown;
    suggestions: AISuggestion[];
    rewrite: string;
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
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardData {
  pending: Submission[];
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

export interface DocumentGuidance {
  id: string;
  doc_type: DocumentType;
  title: string;
  description: string;
  key_requirements: string;
  updated_at: string;
}
