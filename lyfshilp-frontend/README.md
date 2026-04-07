# AI Document Review & Approval Tool — Frontend

Vite + React + TypeScript frontend for the AI Document Review & Approval Tool.

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Framework   | React 18 + TypeScript             |
| Build tool  | Vite 5                            |
| Routing     | React Router v6                   |
| HTTP client | Axios (with auto token refresh)   |
| Fonts       | Playfair Display + DM Sans + DM Mono |
| Styling     | Plain CSS (custom design system)  |

---

## Project Structure

```
lyfshilp-frontend/
├── index.html
├── vite.config.ts          # Dev server with /api proxy to localhost:8000
├── tsconfig.json
├── .env.example
└── src/
    ├── main.tsx            # App entry point
    ├── App.tsx             # Router + auth guard
    ├── index.css           # Global design system CSS
    ├── api/
    │   └── index.ts        # Typed API client (auth, submissions, admin)
    ├── contexts/
    │   └── AuthContext.tsx # Auth state, login, logout
    ├── types/
    │   └── index.ts        # All TypeScript types matching backend schemas
    ├── components/
    │   ├── shared.tsx      # Toast, Modal, Spinner, Badge, helpers
    │   ├── Sidebar.tsx     # Navigation sidebar (role-aware)
    │   ├── ComposeModal.tsx # 3-step AI document creation flow
    │   └── SubmissionDetail.tsx # View / review / resubmit modal
    └── pages/
        ├── Login.tsx           # Email + Google OAuth login
        ├── GoogleCallback.tsx  # OAuth redirect handler
        ├── Dashboard.tsx       # Founder dashboard with stats + review table
        ├── MySubmissions.tsx   # Team member submissions list
        ├── SystemPrompt.tsx    # Admin: edit AI brand voice
        ├── AuditLog.tsx        # Admin: paginated audit log
        └── Library.tsx         # Founder: upload and manage prompt knowledge base
```

---

## Quick Start

### 1. Install

```bash
cd lyfshilp-frontend
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env if needed (default works with local backend on :8000)
```

### 3. Run

```bash
npm run dev
# → http://localhost:3000
```

Make sure the backend is running on `http://localhost:8000` (the Vite dev server proxies `/api` there automatically).

### 4. Build for production

```bash
npm run build
# Output in dist/
```

---

## Features by Role

### Team Members
- Compose new documents with AI draft generation (3-step flow)
- One-click AI refinements: shorter / warmer / more formal / add urgency / regenerate
- Attach PDF or DOCX files to submissions
- View AI scorecard (score, dimension bars, suggestions, AI rewrite)
- Resubmit rejected documents with revisions

### Founders / Admins
- Dashboard with live stats (total / pending / approved / rejected)
- Filter pending submissions by doc type and stakeholder
- Review queue: approve / approve with edits / reject
- Leave founder notes; AI auto-generates rejection notes
- Edit AI brand voice system prompt (takes effect immediately)
- Manage the Founder Library: upload PDF/DOCX/TXT/MD content, edit markdown, and activate/deactivate knowledge items
- View full audit log with action + resource + IP + timestamp

---

## API Integration

All API calls are in `src/api/index.ts`. The Axios client:
- Attaches JWT Bearer token from `localStorage` automatically
- On 401, attempts token refresh then retries the original request
- On refresh failure, clears storage and redirects to `/login`

Google OAuth flow:
1. Frontend calls `GET /auth/google` → gets redirect URL
2. User is redirected to Google consent screen
3. Google redirects to `/auth/google/callback?code=...`
4. Frontend `GoogleCallback` page exchanges code for tokens via `POST /auth/google/callback`

Founder Library flow:
1. Founder opens `/library`
2. Founder uploads a source file or pastes markdown
3. Backend parses the source and stores the markdown in Postgres
4. Founder opens the saved item and runs metadata analysis
5. If the source is ambiguous, the UI can show clarifying questions before activation
6. Matching items are inserted into draft and review context when the doc type and stakeholder match
