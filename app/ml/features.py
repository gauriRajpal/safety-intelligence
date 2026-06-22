"""Feature engineering — shared by training and inference.

This is the ONE place the feature vector is defined. Training scripts, the
inference models, and the API all import FEATURE_ORDER from here so the column
order can never drift between train and serve (the classic ML-in-prod bug).
"""
from __future__ import annotations
from typing import Dict, List
import numpy as np

# Canonical numeric feature order. NEVER reorder without retraining.
FEATURE_ORDER: List[str] = [
    "ch4", "h2s", "o2", "temp", "pressure", "humidity",
    "valve_temp", "valve_pos",
    "pump_vibration", "pump_temp", "pump_load", "maint_overdue_days",
    "active_permit_count", "hot_work", "confined_active", "electrical_active",
    "worker_density", "workers_near_valve", "workers_in_confined",
    "ppe_violations", "unauthorized", "smoke", "fire",
    "is_night", "duty_hours", "fatigue",
]

# The five risk targets the models predict (0-100).
RISK_TARGETS: List[str] = ["fire", "explosion", "toxic", "equipment", "human_error"]


def frame_to_features(f: Dict) -> Dict[str, float]:
    """Convert an incoming SENTINEL frame (dict) into the flat numeric feature
    dict. Tolerant of missing keys — anything absent defaults to a safe value."""
    g = f.get
    permits = int(bool(g("hot_work_active"))) + int(bool(g("confined_space_active"))) \
        + int(bool(g("electrical_active")))
    return {
        "ch4": float(g("ch4", 800.0)),
        "h2s": float(g("h2s", 1.5)),
        "o2": float(g("o2", 20.9)),
        "temp": float(g("temp", 34.0)),
        "pressure": float(g("pressure", 2.1)),
        "humidity": float(g("humidity", 55.0)),
        "valve_temp": float(g("valve_temp", 38.0)),
        "valve_pos": float(g("valve_pos", 12.0)),
        "pump_vibration": float(g("pump_vibration", 2.4)),
        "pump_temp": float(g("pump_temp", 47.0)),
        "pump_load": float(g("pump_load", 64.0)),
        "maint_overdue_days": float(g("maint_overdue_days", 0.0)),
        "active_permit_count": float(g("active_permit_count", permits)),
        "hot_work": float(bool(g("hot_work_active", False))),
        "confined_active": float(bool(g("confined_space_active", False))),
        "electrical_active": float(bool(g("electrical_active", False))),
        "worker_density": float(g("worker_density", 0.3)),
        "workers_near_valve": float(g("workers_near_valve", 0)),
        "workers_in_confined": float(g("workers_in_confined", 0)),
        "ppe_violations": float(g("ppe_violations", 0)),
        "unauthorized": float(bool(g("unauthorized_access", False))),
        "smoke": float(bool(g("smoke_detected", False))),
        "fire": float(bool(g("fire_detected", False))),
        "is_night": float(str(g("shift_type", "Day")).lower() == "night"),
        "duty_hours": float(g("duty_hours", 8.0)),
        "fatigue": float(g("fatigue", 0.35)),
    }


def to_vector(feat: Dict[str, float]) -> np.ndarray:
    """Ordered 1-D numpy vector in FEATURE_ORDER."""
    return np.array([feat[k] for k in FEATURE_ORDER], dtype=np.float32)
