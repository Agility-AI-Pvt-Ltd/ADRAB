import axios from 'axios';
import type {
  TokenResponse, User, Submission, DashboardData,
  SystemPrompt, AuditLog, DocumentType, Stakeholder, DocumentGuidance, StakeholderGuidance, AIReviewGuidance, EmojiGuidance, DraftAnalysisResponse, DraftWorkflowResponse, KnowledgeLibraryItem,
  LLMMode,
  GoogleDriveAuthUrl, GoogleDriveConnectionStatus, GoogleDriveFile, LibraryContextPreview, ComposeOptionsResponse
} from '../types';

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

const client = axios.create({ baseURL: API_BASE });

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
          const { data } = await axios.post<TokenResponse>(`${API_BASE}/auth/refresh`, { refresh_token: rt });
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
  composeOptions: () => client.get<ComposeOptionsResponse>('/submissions/compose-options'),

  generateDraft: (
    doc_type: DocumentType,
    stakeholder: Stakeholder,
    fields: Record<string, string>,
    options?: {
      llm_mode?: LLMMode;
      thinking_instructions?: string;
      selected_library_item_ids?: string[];
    }
  ) =>
    client.post<DraftWorkflowResponse>('/submissions/generate-draft', {
      doc_type,
      stakeholder,
      context_form_data: { fields },
      llm_mode: options?.llm_mode ?? 'guided',
      thinking_instructions: options?.thinking_instructions,
      selected_library_item_ids: options?.selected_library_item_ids ?? [],
    }),

  analyzeDraft: (doc_type: DocumentType, stakeholder: Stakeholder, content: string) =>
    client.post<DraftAnalysisResponse>('/submissions/analyze-draft', {
      doc_type, stakeholder, content
    }),

  refineDraft: (
    content: string,
    action: string,
    doc_type: DocumentType,
    stakeholder: Stakeholder,
    options?: { human_input?: string; thinking_instructions?: string }
  ) =>
    client.post<DraftWorkflowResponse>('/submissions/refine-draft', {
      content,
      action,
      doc_type,
      stakeholder,
      human_input: options?.human_input,
      thinking_instructions: options?.thinking_instructions,
    }),

  extractFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post<{ file_name: string; extracted_text: string | null }>('/submissions/extract-file', fd);
  },

  libraryContext: (doc_type: DocumentType, stakeholder: Stakeholder) =>
    client.get<LibraryContextPreview>('/submissions/library-context', {
      params: { doc_type, stakeholder },
    }),

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

  submit: (id: string, body: { assigned_founder_ids: string[] }) =>
    client.post<Submission>(`/submissions/${id}/submit`, body),

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

  downloadFileUrl: (id: string) => `${API_BASE}/submissions/${id}/download-file`,

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

// ── Founder Library ──────────────────────────────────────────────────────────
export const libraryApi = {
  list: () => client.get<KnowledgeLibraryItem[]>('/library/items'),
  get: (id: string) => client.get<KnowledgeLibraryItem>(`/library/items/${id}`),
  parse: (formData: FormData, options?: { archive_source?: boolean }) => {
    if (options?.archive_source !== undefined) {
      formData.append('archive_source', String(options.archive_source));
    }
    return client.post<KnowledgeLibraryItem>('/library/items/parse', formData);
  },
  importDrive: (body: { drive_file_id: string; title?: string | null; description?: string | null; is_active?: boolean }) =>
    client.post<KnowledgeLibraryItem>('/library/items/import-drive', body),
  create: (formData: FormData) =>
    client.post<KnowledgeLibraryItem>('/library/items', formData),
  analyze: (id: string, body?: { founder_instructions?: string | null; auto_only?: boolean }) =>
    client.post<KnowledgeLibraryItem>(`/library/items/${id}/analyze`, body ?? {}),
  update: (id: string, body: {
    title: string;
    section_key: string;
    section_label: string;
    description?: string | null;
    source_file_url?: string | null;
    content_markdown: string;
    applies_to_doc_types?: string[] | null;
    applies_to_stakeholders?: string[] | null;
    visible_to_departments?: string[] | null;
    tags?: string[] | null;
    sort_order?: number;
    is_active?: boolean;
  }) =>
    client.put<KnowledgeLibraryItem>(`/library/items/${id}`, body),
  toggle: (id: string) =>
    client.patch<KnowledgeLibraryItem>(`/library/items/${id}/toggle`),
  delete: (id: string) =>
    client.delete(`/library/items/${id}`),
};

// ── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => client.get<User[]>('/users/'),
  founders: () => client.get<User[]>('/users/founders'),
  createFounder: (body: { name: string; email: string; password: string; department?: 'founders' | null }) =>
    client.post<User>('/users/founders', body),
  me: () => client.get<User>('/users/me/profile'),
  googleDriveStatus: () => client.get<GoogleDriveConnectionStatus>('/users/me/google-drive'),
  googleDriveAuthUrl: () => client.get<GoogleDriveAuthUrl>('/users/me/google-drive/auth'),
  googleDriveFiles: (q?: string) => client.get<GoogleDriveFile[]>('/users/me/google-drive/files', { params: q ? { q } : undefined }),
  googleDriveCallback: (code: string) =>
    client.post<GoogleDriveConnectionStatus>('/users/me/google-drive/callback', { code }),
  updateMe: (body: Partial<Pick<User, 'name' | 'department'>>) =>
    client.patch<User>('/users/me/profile', body),
  changePassword: (current_password: string | null, new_password: string) =>
    client.post<User>('/users/me/change-password', { current_password, new_password }),
  deleteMe: (confirm_email: string, current_password: string | null) =>
    client.post('/users/me/delete', { confirm_email, current_password }),
  update: (userId: string, body: Partial<Pick<User, 'role' | 'department' | 'is_active' | 'name'>>) =>
    client.patch<User>(`/users/${userId}`, body),
};
