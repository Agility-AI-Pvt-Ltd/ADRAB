# Lyfshilp AI DocTool — Backend

FastAPI backend for the Lyfshilp Academy AI Document Review & Approval Tool.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI + Uvicorn |
| Database | PostgreSQL (async via asyncpg) |
| ORM | SQLAlchemy 2 (async) |
| Migrations | Alembic |
| Auth | JWT (jose) + Google OAuth 2.0 |
| AI | Anthropic Claude API |
| File Storage | AWS S3 |
| Config | pydantic-settings |

---

## Project Structure

```
lyfshilp-backend/
├── app/
│   ├── main.py                    # App factory, lifespan, CORS
│   ├── api/
│   │   ├── dependencies.py        # Shared FastAPI Depends() — auth, roles
│   │   └── v1/
│   │       ├── router.py          # Aggregates all endpoint routers
│   │       └── endpoints/
│   │           ├── auth.py        # Login, Google OAuth, refresh, /me
│   │           ├── submissions.py # Full document lifecycle
│   │           ├── users.py       # User management (admin)
│   │           └── admin.py       # System prompt, audit log
│   ├── core/
│   │   ├── config.py              # All settings from .env (single source of truth)
│   │   ├── security.py            # JWT, bcrypt, domain enforcement
│   │   ├── exceptions.py          # Typed exception hierarchy
│   │   └── logging.py             # Structured JSON / text logging
│   ├── db/
│   │   ├── session.py             # Async engine + session factory + pooling
│   │   ├── base_repository.py     # Generic CRUD base class (OOP)
│   │   └── repositories/
│   │       ├── user_repository.py
│   │       └── submission_repository.py
│   ├── models/
│   │   └── models.py              # All SQLAlchemy ORM models
│   ├── schemas/
│   │   ├── auth.py                # Request/response Pydantic models for auth
│   │   ├── user.py
│   │   ├── submission.py          # Scorecard, draft, review schemas
│   │   └── admin.py
│   ├── services/
│   │   ├── auth_service.py        # Email+password & Google OAuth logic
│   │   ├── submission_service.py  # Full document lifecycle orchestration
│   │   ├── ai_service.py          # Anthropic Claude integration
│   │   ├── file_service.py        # S3 upload + PDF/DOCX text extraction
│   │   └── system_prompt_service.py
│   └── utils/
│       └── exception_handlers.py  # Global FastAPI error handlers
├── alembic/
│   ├── env.py
│   └── versions/
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_submissions.py
│   └── test_security.py
├── .env.example
├── requirements.txt
├── alembic.ini
└── pytest.ini
```

---

## Quick Start

### 1. Prerequisites

- Python 3.12+
- PostgreSQL 15+
- An Anthropic API key
- Google OAuth credentials (for Google sign-in)

### 2. Clone & Install

```bash
git clone <repo>
cd lyfshilp-backend

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env — fill in every value (DB password, API keys, etc.)
```

**Critical values to set:**
```
SECRET_KEY=<openssl rand -hex 32>
ALLOWED_EMAIL_DOMAIN=agilityai.in
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ANTHROPIC_API_KEY=sk-ant-...
POSTGRES_PASSWORD=...
```

### 4. Database Setup

```bash
# Create the database
createdb lyfshilp

# Run migrations
alembic upgrade head
```

### 5. Run

```bash
uvicorn app.main:app --reload --port 8000
```

API docs (dev mode only): http://localhost:8000/docs

---

## Authentication

### Domain Restriction

**Only `@agilityai.in` emails are permitted.** This is enforced in `app/core/security.py:enforce_allowed_domain()` and applied on every login path — email/password and Google OAuth.

### Email + Password

```
POST /api/v1/auth/register   # Create account (admin/seeding)
POST /api/v1/auth/login      # Returns access + refresh tokens
POST /api/v1/auth/refresh    # Rotate tokens
GET  /api/v1/auth/me         # Current user profile
```

### Google Sign-In

```
GET  /api/v1/auth/google            # Returns Google consent URL
POST /api/v1/auth/google/callback   # Exchange code → JWT tokens
```

**Flow:**
1. Frontend calls `GET /auth/google` → gets consent URL
2. Redirect user to the URL
3. Google redirects back with `?code=...`
4. Frontend posts code to `POST /auth/google/callback`
5. Backend validates email domain, upserts user, returns tokens

---

## API Overview

### Submissions

| Method | Path | Who | Description |
|---|---|---|---|
| POST | `/submissions/generate-draft` | Team | AI generates fresh draft |
| POST | `/submissions/refine-draft` | Team | Make shorter / warmer / formal |
| POST | `/submissions/` | Team | Save draft |
| POST | `/submissions/{id}/submit` | Team | Run AI review → PENDING |
| POST | `/submissions/{id}/upload-file` | Team | Attach PDF/DOCX |
| POST | `/submissions/{id}/resubmit` | Team | New version of rejected doc |
| GET | `/submissions/my` | Team | Own submissions list |
| GET | `/submissions/dashboard` | Founder | Pending queue + counts |
| GET | `/submissions/{id}` | Both | Submission detail |
| POST | `/submissions/{id}/review` | Founder | Approve / reject |
| GET | `/submissions/{id}/versions` | Founder | Version history |

### Admin / Settings

| Method | Path | Who | Description |
|---|---|---|---|
| GET | `/admin/system-prompt` | Founder | Active AI brand-voice prompt |
| PUT | `/admin/system-prompt` | Founder | Update prompt (live, no restart) |
| GET | `/admin/system-prompt/history` | Founder | All previous prompt versions |
| GET | `/admin/audit-log` | Founder | Paginated action log |

### Users

| Method | Path | Who | Description |
|---|---|---|---|
| GET | `/users/` | Founder | List all active users |
| GET | `/users/{id}` | Both | Fetch user |
| PATCH | `/users/{id}` | Founder | Update role/department |
| DELETE | `/users/{id}` | Admin | Soft-delete (deactivate) |

---

## AI Scorecard

Every submitted document is scored across 5 dimensions (20 pts each):

| Dimension | What is checked |
|---|---|
| `tone_voice` | Matches Lyfshilp's warm-authoritative voice |
| `format_structure` | Hook → Proof → CTA structure followed |
| `stakeholder_fit` | Language appropriate for the audience |
| `missing_elements` | Credentials, CTA, links, dates present |
| `improvement_scope` | How much work is still needed |

Score guide: 85-100 = approve as-is, 65-84 = minor edits, 40-64 = rewrite recommended, 0-39 = reject.

---

## Roles

| Role | Permissions |
|---|---|
| `founder` | Full access — review, approve, reject, settings |
| `team_member` | Create/submit own documents, view own submissions |
| `admin` | All founder permissions + user deactivation |

---

## Database Migrations

```bash
# Generate a migration after model changes
alembic revision --autogenerate -m "describe change"

# Apply migrations
alembic upgrade head

# Rollback one step
alembic downgrade -1
```

---

## Running Tests

```bash
# Create test database first
createdb lyfshilp_test

pytest -v
```

---

## Connection Pooling

Configured in `app/core/config.py` and applied in `app/db/session.py`:

| Setting | Default | Purpose |
|---|---|---|
| `DB_POOL_SIZE` | 10 | Persistent connections |
| `DB_MAX_OVERFLOW` | 20 | Extra connections under load |
| `DB_POOL_TIMEOUT` | 30s | Wait before raising error |
| `DB_POOL_RECYCLE` | 1800s | Recycle connections (avoids stale) |
| `DB_POOL_PRE_PING` | true | Validate before checkout |

---

## OOP Design Patterns

- **Repository Pattern** — `BaseRepository[T]` provides typed generic CRUD; domain repos extend it with query methods.
- **Service Layer** — `AuthService`, `SubmissionService`, `AIService`, `FileService`, `SystemPromptService` each own a single business domain.
- **Dependency Injection** — FastAPI `Depends()` wires session + current user into every endpoint; services receive the session in `__init__`.
- **Exception Hierarchy** — `AppException` → `AuthenticationError`, `ForbiddenError`, `NotFoundError`, etc., all caught by global handlers.
- **Config as Singleton** — `@lru_cache` on `get_settings()` ensures a single `Settings` instance across the process.
