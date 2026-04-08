# Lyfshilp Backend

FastAPI backend for the Lyfshilp AI Document Review and Approval Tool.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI + Uvicorn |
| Database | PostgreSQL |
| ORM | SQLAlchemy 2 (async) |
| Auth | JWT + Google OAuth 2.0 |
| AI | OpenAI API |
| Storage | Local disk uploads + founder library source files |
| Config | `pydantic-settings` |

## Project Structure

```text
lyfshilp-backend/
├── lyfshilp-backend/
│   ├── main.py
│   ├── api/
│   │   ├── dependencies.py
│   │   ├── router.py
│   │   └── endpoints/
│   │       ├── auth.py
│   │       ├── admin.py
│   │       ├── library.py
│   │       ├── submissions.py
│   │       ├── users.py
│   │       └── ...
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── exceptions.py
│   │   └── logging.py
│   ├── db/
│   │   ├── session.py
│   │   └── repositories/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── utils/
├── scripts/
├── tests/
├── .env.example
├── render.yaml
├── requirements.txt
└── pytest.ini
```

## Quick Start

### 1. Prerequisites

- Python 3.12+
- PostgreSQL 15+
- OpenAI API key
- Google OAuth credentials

### 2. Install

```bash
cd lyfshilp-backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp lyfshilp-backend/.env.example .env
```

Fill in the required values in `.env`, especially:

```env
SECRET_KEY=...
ALLOWED_ORIGINS="https://lyfshilp-frontend.vercel.app"
FRONTEND_URL=https://lyfshilp-frontend.vercel.app
GOOGLE_REDIRECT_URI=https://lyfshilp-frontend.vercel.app/auth/google/callback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OPENAI_API_KEY=...
DATABASE_URL=...
```

Notes:

- `ALLOWED_ORIGINS` must include your deployed frontend origin.
- `GOOGLE_REDIRECT_URI` must match the Google OAuth client configuration exactly.
- The app accepts a PostgreSQL `DATABASE_URL` and normalizes it for async usage.

### 4. Run Locally

```bash
uvicorn main:app --reload --port 8000
```

API docs in debug mode:

- `http://localhost:8000/docs`

## Authentication

### Domain Restriction

Only `@agilityai.in` email addresses are allowed to sign in.

### Email + Password

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
GET  /api/v1/auth/me
```

### Google Sign-In

```text
GET  /api/v1/auth/google
POST /api/v1/auth/google/callback
```

Flow:

1. Frontend calls `GET /api/v1/auth/google`.
2. Backend returns the Google consent URL.
3. Google redirects to the frontend callback route: `/auth/google/callback?code=...`.
4. The frontend exchanges the `code` with `POST /api/v1/auth/google/callback`.
5. Backend validates the account and returns JWT access and refresh tokens.

Compatibility note:

- The backend also includes a redirect bridge for `/auth/google/callback` and `/api/v1/auth/google/callback` so hosted deployments can forward the browser back to the frontend callback route.

## API Overview

### Submissions

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/submissions/generate-draft` | Generate an AI draft |
| POST | `/api/v1/submissions/refine-draft` | Refine draft text |
| POST | `/api/v1/submissions/` | Save a draft |
| POST | `/api/v1/submissions/{id}/submit` | Submit for review |
| POST | `/api/v1/submissions/{id}/upload-file` | Attach a file |
| POST | `/api/v1/submissions/{id}/resubmit` | Resubmit a rejected document |
| GET | `/api/v1/submissions/my` | List current user submissions |
| GET | `/api/v1/submissions/dashboard` | Founder dashboard data |
| GET | `/api/v1/submissions/{id}` | View a submission |
| POST | `/api/v1/submissions/{id}/review` | Approve, edit, or reject |
| GET | `/api/v1/submissions/{id}/versions` | Version history |

### Admin

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/system-prompt` | Read active prompt |
| PUT | `/api/v1/admin/system-prompt` | Update active prompt |
| GET | `/api/v1/admin/system-prompt/history` | Prompt history |
| GET | `/api/v1/admin/audit-log` | Audit log |

### Founder Library

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/library/items` | List library items |
| GET | `/api/v1/library/items/{id}` | Fetch one library item |
| POST | `/api/v1/library/items` | Create a library item from markdown or an uploaded file |
| PUT | `/api/v1/library/items/{id}` | Update a library item |
| PATCH | `/api/v1/library/items/{id}/toggle` | Enable or disable a library item |

### Users

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/users/` | List users |
| GET | `/api/v1/users/{id}` | Fetch one user |
| PATCH | `/api/v1/users/{id}` | Update role or department |
| DELETE | `/api/v1/users/{id}` | Deactivate a user |

## Environment Variables

The main settings live in [`lyfshilp-backend/.env.example`](./lyfshilp-backend/.env.example).

Important values:

- `APP_DEBUG`
- `API_V1_PREFIX`
- `ALLOWED_ORIGINS`
- `SECRET_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `FRONTEND_URL`
- `DATABASE_URL` or the `POSTGRES_*` values
- `OPENAI_API_KEY`
- `UPLOAD_DIR`

## Database and Seeding

The app can initialize the database and seed default content on startup when `AUTO_INIT_DB=true`.

Reusable seed scripts:

- `scripts/seed_first_founder.py`
- `scripts/seed_system_prompt.py`
- `scripts/seed_stakeholder_guidance.py`
- `scripts/seed_ai_review_guidance.py`
- `scripts/seed_emoji_guidance.py`
- `scripts/seed_document_guidance.py`
- `scripts/seed_few_shot_examples.py`
- `scripts/import_knowledge_snippet.py`

## Database Migrations

This repo now includes Alembic for intentional schema changes.

Recommended flow:

1. Make your model/schema change in code.
2. Add or update an Alembic migration in `lyfshilp-backend/alembic/versions/`.
3. Apply the same migration locally and in Neon.

Run migrations with:

```bash
cd lyfshilp-backend
alembic upgrade head
```

To point Alembic at Neon, set `DATABASE_URL` to the Neon connection string in `.env` before running the command.
If you want to keep your local `.env` unchanged, use the dedicated Neon file instead:

```bash
set -a
source .env.neon
set +a
alembic upgrade head
```

The baseline migration is `0001_initial_schema`, which safely creates any missing tables from the current SQLAlchemy metadata. For new changes after that, add proper forward-only migrations instead of relying on `create_all()`.

## Founder Library

Founders can upload PDFs, DOCX files, TXT files, or paste markdown into the Library section.

The backend stores:

- the original source file under `UPLOAD_DIR`
- parsed markdown in Postgres
- matching metadata such as section, document types, stakeholders, and tags

Parsing behavior:

- `llama_parse` is used first when `LLAMA_CLOUD_API_KEY` is configured
- if parsing fails or the key is missing, the service falls back to local extraction
- the first step stores parsed markdown in Postgres
- the second step runs LLM analysis to classify the source, suggest section/tags/doc-type metadata, and surface clarifying questions
- the generated library content is injected into draft and review prompt assembly when it matches the document type and stakeholder

This is structured founder-managed prompt context, not vector RAG.

Example:

```bash
python3 scripts/seed_system_prompt.py
python3 scripts/seed_system_prompt.py --overwrite
```

## Testing

```bash
createdb lyfshilp_test
pytest -v
```

## Deployment Notes

- Render backend service: use `render.yaml` as the source of truth.
- Frontend origin must be added to `ALLOWED_ORIGINS`.
- Google OAuth redirect URI must match the deployed frontend callback URL exactly.
- Uploaded files are stored under `UPLOAD_DIR` and served by FastAPI at `/uploads`.
- Founder Library uploads are stored under `UPLOAD_DIR/library/...` and parsed into markdown for prompt matching.

## Design Notes

- Repository pattern for data access.
- Service layer for business logic.
- FastAPI dependency injection for DB sessions and auth.
- Centralized exception handling.
- Cached settings singleton via `pydantic-settings`.
