"""GenAI Safety Advisor.

Turns the fused risk state into a plain-language operations advisory. Uses
LangChain + Anthropic when ANTHROPIC_API_KEY is set; otherwise returns a
deterministic template so the endpoint never fails in a demo.
"""
from __future__ import annotations
import os
from typing import Dict

PROMPT_TEMPLATE = """You are SENTINEL, the safety AI advisor in a chemical plant control room.
Given the fused risk snapshot, write a concise operations advisory (max 90 words):
state the compound mechanism in plain language, why it matters, and two specific
immediate actions for the shift supervisor. No preamble, no markdown headers.

TOP RISK: {category} at {zone} — {score}/100 ({severity}).
Contributing signals: {contributors}.
Synergy multiplier: x{synergy} ({active} co-occurring drivers).
Gas forecast: {forecast}.
Anomaly: {anomaly}.
Shift: {shift_type}, {duty_hours}h continuous duty, fatigue {fatigue}%."""


def _format_prompt(fused: Dict, frame: Dict) -> str:
    top = fused.get("top_risk") or {}
    contribs = ", ".join(f"{c['label']} {c['raw']}" for c in top.get("contributors", []))
    fc = fused.get("forecast", {})
    return PROMPT_TEMPLATE.format(
        category=top.get("category", "n/a"), zone=top.get("zone", "n/a"),
        score=top.get("score", 0), severity=top.get("severity", "normal"),
        contributors=contribs or "none", synergy=top.get("synergy", 1.0),
        active=top.get("active_factors", 0),
        forecast=f"CH4 {fc.get('trend','stable')} ({fc.get('ch4_delta_30m',0)} ppm/30m)",
        anomaly="flagged" if fused.get("anomaly", {}).get("is_anomaly") else "none",
        shift_type=frame.get("shift_type", "Day"),
        duty_hours=frame.get("duty_hours", 8), fatigue=int(frame.get("fatigue", 0.35) * 100),
    )


def _fallback(fused: Dict) -> str:
    top = fused.get("top_risk")
    if not top or top["severity"] == "normal":
        return "All correlated streams nominal. No compound risk condition exceeds threshold."
    contribs = ", ".join(f"{c['label']} {c['raw']}" for c in top["contributors"] if c["active"]) \
        or ", ".join(f"{c['label']} {c['raw']}" for c in top["contributors"])
    acts = {"fire": "Pause hot work and inspect ventilation immediately.",
            "explosion": "Suspend permits and clear the blast radius.",
            "toxic": "Force-ventilate and evacuate the space.",
            "equipment": "Schedule preventive maintenance now.",
            "human_error": "Rotate the crew and re-verify PPE."}.get(top["key"], "Notify the supervisor.")
    return (f"{top['category']} risk at {top['zone']} is {top['severity'].upper()} ({top['score']}/100). "
            f"No single signal alarms, but {top['active_factors']} co-occurring factors compound the hazard "
            f"({contribs}). Recommendation: {acts}")


def advise(fused: Dict, frame: Dict) -> Dict:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return {"advisory": _fallback(fused), "source": "template"}
    try:
        from langchain_anthropic import ChatAnthropic
        from langchain_core.messages import HumanMessage
        llm = ChatAnthropic(model=os.getenv("ADVISOR_MODEL", "claude-sonnet-4-6"),
                            max_tokens=300, temperature=0.2, api_key=key)
        resp = llm.invoke([HumanMessage(content=_format_prompt(fused, frame))])
        text = resp.content if isinstance(resp.content, str) else str(resp.content)
        return {"advisory": text.strip(), "source": "llm"}
    except Exception as e:  # pragma: no cover
        return {"advisory": _fallback(fused), "source": f"template (llm error: {e})"}
