"""PostgreSQL persistence (SQLAlchemy). Logs frames, predictions, incidents.
Falls back to SQLite via DATABASE_URL so it runs with zero infra in a demo."""
from __future__ import annotations
import json, datetime
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False}
                       if settings.DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False)
Base = declarative_base()


class EventRecord(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    zone = Column(String(64))
    frame = Column(Text)            # raw frame JSON
    plant_risk_index = Column(Float)
    top_risk = Column(String(32))
    payload = Column(Text)          # full analyze response JSON


class IncidentRecord(Base):
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    zone = Column(String(64))
    risk = Column(String(32))
    score = Column(Float)
    severity = Column(String(16))


def init_db():
    Base.metadata.create_all(engine)


def log_event(zone, frame: dict, result: dict):
    try:
        s = SessionLocal()
        rec = EventRecord(zone=zone, frame=json.dumps(frame),
                          plant_risk_index=result.get("plant_risk_index", 0),
                          top_risk=(result.get("top_risk") or {}).get("key"),
                          payload=json.dumps(result, default=str))
        s.add(rec)
        top = result.get("top_risk")
        if top and top["severity"] in ("high", "critical"):
            s.add(IncidentRecord(zone=top["zone"], risk=top["key"],
                                 score=top["score"], severity=top["severity"]))
        s.commit(); s.close()
    except Exception as e:  # pragma: no cover
        print("DB log skipped:", e)
