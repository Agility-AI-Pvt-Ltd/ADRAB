import axios from 'axios';
import type {
  TokenResponse, User, Submission, DashboardData,
  SystemPrompt, AuditLog, DocumentType, Stakeholder, DocumentGuidance, StakeholderGuidance, AIReviewGuidance, EmojiGuidance, DraftAnalysisResponse, DraftWorkflowResponse
} from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

const client = axios.create({ baseURL: BASE });

// Attach token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
client.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      const rt = localStorage.getItem('refresh_token');
      if (rt) {
        try {
          const { data } = await axios.post<TokenResponse>(`${BASE}/auth/refresh`, { refresh_token: rt });
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          err.config.headers.Authorization = `Bearer ${data.access_token}`;
          return client(err.config);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    client.post<TokenResponse>('/auth/login', { email, password }),

  me: () => client.get<User>('/auth/me'),

  getGoogleUrl: () => client.get<{ url: string; state: string }>('/auth/google'),

  googleCallback: (code: string) =>
    client.post<TokenResponse>('/auth/google/callback', { code }),

  refresh: (refresh_token: string) =>
    client.post<TokenResponse>('/auth/refresh', { refresh_token }),

  forgotPassword: (email: string) =>
    client.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, new_password: string) =>
    client.post<{ message: string }>('/auth/reset-password', { token, new_password }),
};

// ── Submissions ───────────────────────────────────────────────────────────────
export const submissionsApi = {
  documentGuidance: () => client.get<DocumentGuidance[]>('/submissions/document-guidance'),

  generateDraft: (doc_type: DocumentType, stakeholder: Stakeholder, fields: Record<string, string>) =>
    client.post<DraftWorkflowResponse>('/submissions/generate-draft', {
      doc_type, stakeholder, context_form_data: { fields }
    }),

  analyzeDraft: (doc_type: DocumentType, stakeholder: Stakeholder, content: string) =>
    client.post<DraftAnalysisResponse>('/submissions/analyze-draft', {
      doc_type, stakeholder, content
    }),

  refineDraft: (content: string, action: string, doc_type: DocumentType, stakeholder: Stakeholder, human_input?: string) =>
    client.post<DraftWorkflowResponse>('/submissions/refine-draft', {
      content, action, doc_type, stakeholder, human_input
    }),

  extractFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post<{ file_name: string; extracted_text: string | null }>('/submissions/extract-file', fd);
  },

  create: (
    doc_type: DocumentType,
    stakeholder: Stakeholder,
    content: string,
    options?: {
      fields?: Record<string, string>;
      ai_precheck?: {
        score: number;
        dimensions: {
          tone_voice: number;
          format_structure: number;
          stakeholder_fit: number;
          missing_elements: number;
          improvement_scope: number;
        };
        grammar_check?: {
          score: number;
          notes: string[];
        } | null;
        suggestions: {
          original: string;
          replacement: string;
          reason: string;
        }[];
        rewrite: string;
      };
      precheck_workflow_memory?: unknown;
    }
  ) =>
    client.post<Submission>('/submissions/', {
      doc_type,
      stakeholder,
      content,
      context_form_data: options?.fields ? { fields: options.fields } : undefined,
      ai_precheck: options?.ai_precheck,
      precheck_workflow_memory: options?.precheck_workflow_memory,
    }),

  submit: (id: string) =>
    client.post<Submission>(`/submissions/${id}/submit`),

  uploadFile: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post<{ file_url: string; file_name: string; extracted_text: string }>(
      `/submissions/${id}/upload-file`, fd
    );
  },

  resubmit: (id: string, content: string) =>
    client.post<Submission>(`/submissions/${id}/resubmit`, { content }),

  review: (id: string, action: string, opts?: {
    edited_content?: string;
    founder_note?: string;
    visible_to_roles?: string[];
    visible_to_departments?: string[];
    visible_to_user_ids?: string[];
  }) =>
    client.post<Submission>(`/submissions/${id}/review`, { action, ...opts }),

  updateVisibility: (id: string, opts: {
    visible_to_roles?: string[];
    visible_to_departments?: string[];
    visible_to_user_ids?: string[];
  }) =>
    client.patch<Submission>(`/submissions/${id}/visibility`, opts),

  downloadFileUrl: (id: string) => `${BASE}/submissions/${id}/download-file`,

  dashboard: (filters?: { doc_type?: string; stakeholder?: string; user_id?: string }) =>
    client.get<DashboardData>('/submissions/dashboard', { params: filters }),

  my: () => client.get<Submission[]>('/submissions/my'),

  get: (id: string) => client.get<Submission>(`/submissions/${id}`),

  versions: (id: string) => client.get<Submission[]>(`/submissions/${id}/versions`),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  getSystemPrompt: () => client.get<SystemPrompt>('/admin/system-prompt'),
  updateSystemPrompt: (prompt_text: string, label?: string) =>
    client.put<SystemPrompt>('/admin/system-prompt', { prompt_text, label }),
  promptHistory: () => client.get<SystemPrompt[]>('/admin/system-prompt/history'),
  stakeholderGuidance: () => client.get<StakeholderGuidance[]>('/admin/stakeholder-guidance'),
  updateStakeholderGuidance: (stakeholder: Stakeholder, body: Pick<StakeholderGuidance, 'title' | 'guidance_text'>) =>
    client.put<StakeholderGuidance>(`/admin/stakeholder-guidance/${stakeholder}`, body),
  aiReviewGuidance: () => client.get<AIReviewGuidance[]>('/admin/ai-review-guidance'),
  updateAiReviewGuidance: (configKey: string, body: Pick<AIReviewGuidance, 'review_dimension' | 'title' | 'content'>) =>
    client.put<AIReviewGuidance>(`/admin/ai-review-guidance/${configKey}`, body),
  emojiGuidance: () => client.get<EmojiGuidance[]>('/admin/emoji-guidance'),
  updateEmojiGuidance: (configKey: string, body: Pick<EmojiGuidance, 'title' | 'content'>) =>
    client.put<EmojiGuidance>(`/admin/emoji-guidance/${configKey}`, body),
  documentGuidance: () => client.get<DocumentGuidance[]>('/admin/document-guidance'),
  createDocumentGuidance: (body: Pick<DocumentGuidance, 'doc_type' | 'title' | 'description' | 'key_requirements'>) =>
    client.post<DocumentGuidance>('/admin/document-guidance', body),
  updateDocumentGuidance: (docType: string, body: Pick<DocumentGuidance, 'doc_type' | 'title' | 'description' | 'key_requirements'>) =>
    client.put<DocumentGuidance>(`/admin/document-guidance/${docType}`, body),
  auditLog: (limit = 100, offset = 0) =>
    client.get<AuditLog[]>('/admin/audit-log', { params: { limit, offset } }),
};

// ── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => client.get<User[]>('/users/'),
  createFounder: (body: { name: string; email: string; password: string; department?: 'founders' | null }) =>
    client.post<User>('/users/founders', body),
  me: () => client.get<User>('/users/me/profile'),
  updateMe: (body: Partial<Pick<User, 'name' | 'department'>>) =>
    client.patch<User>('/users/me/profile', body),
  changePassword: (current_password: string | null, new_password: string) =>
    client.post<User>('/users/me/change-password', { current_password, new_password }),
  deleteMe: (confirm_email: string, current_password: string | null) =>
    client.post('/users/me/delete', { confirm_email, current_password }),
  update: (userId: string, body: Partial<Pick<User, 'role' | 'department' | 'is_active' | 'name'>>) =>
    client.patch<User>(`/users/${userId}`, body),
};
