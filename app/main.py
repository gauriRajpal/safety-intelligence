"""SENTINEL backend — FastAPI entrypoint.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import router
from app.db.models import init_db

app = FastAPI(title=settings.APP_NAME, version=settings.VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"], allow_headers=["*"], allow_credentials=True,
)

app.include_router(router)


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/")
def root():
    return {"service": settings.APP_NAME, "version": settings.VERSION,
            "docs": "/docs", "primary_endpoint": "POST /analyze"}
