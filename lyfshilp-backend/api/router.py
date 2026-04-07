"""API v1 — aggregates all endpoint routers"""

from api.endpoints import admin, auth, library
from api.endpoints import submissions
from fastapi import APIRouter

from api.endpoints import users

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(submissions.router)
api_router.include_router(users.router)
api_router.include_router(admin.router)
api_router.include_router(library.router)
