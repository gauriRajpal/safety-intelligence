"""Intervention Recommendation Engine.

Maps fused risk severity to concrete, prioritized actions. Thresholds are
deliberately explicit and auditable — a safety system's action logic should be
readable by a human inspector, not buried in a model.
"""
from __future__ import annotations
from typing import Dict, List

# action templates per risk key, in escalation order
ACTIONS = {
    "fire": ["Suspend hot-work permit", "Trigger siren — Zone Tank B",
             "Notify shift supervisor", "Dispatch emergency response team"],
    "explosion": ["Suspend all permits in zone", "Evacuate Tank B radius",
                  "Trigger siren", "Dispatch emergency response team"],
    "toxic": ["Force-ventilate confined space", "Evacuate confined space",
              "Trigger siren — Zone C-7", "Notify supervisor"],
    "equipment": ["Create maintenance ticket", "Throttle pump load to 60%",
                  "Notify maintenance lead", "Schedule shutdown window"],
    "human_error": ["Suggest crew rotation", "Flag PPE re-check at gate",
                    "Notify shift supervisor", "Mandate rest break"],
}


def _count(score: float) -> int:
    if score >= 85:
        return 4
    if score >= 70:
        return 3
    if score >= 55:
        return 2
    return 0


def recommend(fused: Dict) -> List[Dict]:
    out: List[Dict] = []
    for r in fused["risks"]:
        k = _count(r["score"])
        for i, label in enumerate(ACTIONS.get(r["key"], [])[:k]):
            out.append({
                "risk": r["key"], "zone": r["zone"], "action": label,
                "priority": "immediate" if i == 0 else "urgent" if i == 1 else "advisory",
                "auto_execute": r["score"] >= 85 and i == 0,
                "trigger_score": r["score"],
            })
    return out
