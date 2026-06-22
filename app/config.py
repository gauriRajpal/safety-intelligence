"""Runtime config from environment variables (12-factor)."""
from __future__ import annotations
import os


class Settings:
    APP_NAME = "SENTINEL Backend"
    VERSION = "0.1.0"
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sentinel.db")
    REDIS_URL = os.getenv("REDIS_URL", "")  # empty -> in-memory buffers
    NEO4J_URI = os.getenv("NEO4J_URI", "")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    # CORS origins for the SENTINEL React dev server
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")


settings = Settings()
