"""Event Fusion Layer.

Takes the raw frame + every model's output and produces ONE unified risk vector.
Beyond just reading model scores, it:
  - lists the contributing factors per risk (explainability),
  - counts co-occurring drivers and reports a synergy multiplier (the compound
    insight: weak signals together > the sum of parts),
  - blends in anomaly score and the forecaster trend,
  - applies an optional graph-context boost (see graph/neo4j_client).

This layer always runs, even when models are cold, so the platform degrades
gracefully and never goes dark.
"""
from __future__ import annotations
from typing import Dict, List, Optional
import numpy as np

_n = lambda v, lo, hi: float(np.clip((v - lo) / (hi - lo), 0, 1))

# (label, value-fn, raw-fn) per risk — drives the explainability output
FACTORS = {
    "fire": [
        ("CH4 @ Tank B", lambda f: _n(f["ch4"], 800, 9000), lambda f: f"{f['ch4']:.0f} ppm"),
        ("Hot-work permit", lambda f: f["hot_work"], lambda f: "active" if f["hot_work"] else "none"),
        ("Valve V-1 temp", lambda f: _n(f["valve_temp"], 35, 120), lambda f: f"{f['valve_temp']:.0f} C"),
        ("Worker proximity", lambda f: _n(f["workers_near_valve"], 0, 3), lambda f: f"{int(f['workers_near_valve'])} near"),
    ],
    "explosion": [
        ("CH4 @ Tank B", lambda f: _n(f["ch4"], 800, 9000), lambda f: f"{f['ch4']:.0f} ppm"),
        ("Confinement/pressure", lambda f: _n(f["pressure"], 1.4, 3.0), lambda f: f"{f['pressure']:.1f} bar"),
        ("Hot-work permit", lambda f: f["hot_work"], lambda f: "active" if f["hot_work"] else "none"),
    ],
    "toxic": [
        ("H2S level", lambda f: _n(f["h2s"], 2, 20), lambda f: f"{f['h2s']:.1f} ppm"),
        ("O2 deficiency", lambda f: _n(20.9 - f["o2"], 0, 4.9), lambda f: f"{f['o2']:.1f} %"),
        ("Confined occupancy", lambda f: _n(f["workers_in_confined"], 0, 2), lambda f: f"{int(f['workers_in_confined'])} inside"),
    ],
    "equipment": [
        ("Bearing vibration", lambda f: _n(f["pump_vibration"], 2.5, 12), lambda f: f"{f['pump_vibration']:.1f} mm/s"),
        ("Casing temp", lambda f: _n(f["pump_temp"], 50, 105), lambda f: f"{f['pump_temp']:.0f} C"),
        ("Maint overdue", lambda f: _n(f["maint_overdue_days"], 0, 21), lambda f: f"{int(f['maint_overdue_days'])} d"),
        ("Machine load", lambda f: _n(f["pump_load"], 60, 100), lambda f: f"{f['pump_load']:.0f} %"),
    ],
    "human_error": [
        ("Continuous duty", lambda f: _n(f["duty_hours"], 8, 12), lambda f: f"{f['duty_hours']:.1f} h"),
        ("Fatigue index", lambda f: f["fatigue"], lambda f: f"{f['fatigue']*100:.0f} %"),
        ("Night shift", lambda f: f["is_night"], lambda f: "night" if f["is_night"] else "day"),
        ("PPE violations", lambda f: _n(f["ppe_violations"], 0, 3), lambda f: f"{int(f['ppe_violations'])}"),
    ],
}

ZONE_OF = {"fire": "Tank B", "explosion": "Tank B", "toxic": "C-7",
           "equipment": "Pump P-2", "human_error": "Crew"}


def fuse(feat: Dict, risk_scores: Dict, anomaly: Dict,
         forecast: Optional[Dict] = None, graph_boost: float = 0.0) -> Dict:
    risks: List[Dict] = []
    for key, fns in FACTORS.items():
        contributors, active = [], 0
        for label, vfn, rawfn in fns:
            v = vfn(feat)
            if v > 0.4:
                active += 1
            contributors.append({"label": label, "value": round(v, 3),
                                  "raw": rawfn(feat), "active": v > 0.4})
        synergy = 1.34 if active >= 3 else 1.13 if active == 2 else 1.0
        score = float(risk_scores.get(key, 0))

        # forecaster bumps fire/explosion if gas is forecast to rise
        if forecast and key in ("fire", "explosion") and forecast.get("trend") == "rising":
            score = min(100, score + 8)
        # anomaly nudges anything the rules/labels never saw
        if anomaly.get("is_anomaly"):
            score = min(100, score + 0.15 * anomaly.get("anomaly_score", 0))
        # graph intelligence (e.g. inexperienced worker + prior incident here)
        score = min(100, score + graph_boost)

        sev = ("critical" if score >= 80 else "high" if score >= 60
               else "elevated" if score >= 35 else "normal")
        risks.append({
            "key": key, "category": key.replace("_", " ").title(),
            "zone": ZONE_OF[key], "score": round(score, 1), "severity": sev,
            "synergy": synergy, "active_factors": active,
            "contributors": contributors,
        })
    risks.sort(key=lambda r: r["score"], reverse=True)
    top = risks[0] if risks else None
    return {
        "risks": risks,
        "top_risk": top,
        "plant_risk_index": round(top["score"], 1) if top else 0.0,
        "anomaly": anomaly,
        "forecast": forecast or {},
    }
