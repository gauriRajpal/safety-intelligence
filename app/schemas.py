"""Pydantic schemas — the REST contract the SENTINEL frontend codes against."""
from __future__ import annotations
from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class FrameIn(BaseModel):
    """One plant snapshot, emitted by SENTINEL each tick. Field names match the
    frontend world object so integration is a direct map."""
    zone: str = "Tank B"
    ch4: float = 800
    h2s: float = 1.5
    o2: float = 20.9
    temp: float = 34
    pressure: float = 2.1
    humidity: float = 55
    valve_temp: float = 38
    valve_pos: float = 12
    pump_vibration: float = 2.4
    pump_temp: float = 47
    pump_load: float = 64
    maint_overdue_days: int = 0
    hot_work_active: bool = False
    confined_space_active: bool = False
    electrical_active: bool = False
    active_permit_count: Optional[int] = None
    worker_density: float = 0.34
    workers_near_valve: int = 0
    workers_in_confined: int = 0
    ppe_violations: int = 0
    unauthorized_access: bool = False
    smoke_detected: bool = False
    fire_detected: bool = False
    shift_type: str = "Day"
    duty_hours: float = 8.0
    fatigue: float = 0.35
    crew_skill: str = "Mixed"
    location_id: Optional[str] = None  # for graph context lookup
    ts: Optional[str] = None


class Contributor(BaseModel):
    label: str
    value: float
    raw: str
    active: bool


class RiskItem(BaseModel):
    key: str
    category: str
    zone: str
    score: float
    severity: str
    synergy: float
    active_factors: int
    contributors: List[Contributor]


class InterventionItem(BaseModel):
    risk: str
    zone: str
    action: str
    priority: str
    auto_execute: bool
    trigger_score: float


class AnalyzeResponse(BaseModel):
    plant_risk_index: float
    top_risk: Optional[RiskItem]
    risks: List[RiskItem]
    anomaly: Dict
    forecast: Dict
    interventions: List[InterventionItem]
    advisory: Optional[str] = None
    graph_boost: float = 0.0
    models: Dict


class AdvisoryRequest(BaseModel):
    frame: FrameIn
