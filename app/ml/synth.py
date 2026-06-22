"""Synthetic data generator.

Real plants don't hand you a labeled incident dataset on day one, and a
hackathon can't wait for one. This module fabricates physically-plausible plant
states AND their risk labels, so the ML models have something real to learn.

The important property: the labels encode COMPOUND, non-linear interactions
(synergy between co-occurring weak signals). XGBoost then *learns* that
interaction from data rather than us hardcoding an if-statement — which is the
entire point of the platform.

Usage:
    python -m app.ml.synth            # writes data/tabular.csv + data/sequences.npz
"""
from __future__ import annotations
import os
import numpy as np
import pandas as pd

from app.ml.features import FEATURE_ORDER, RISK_TARGETS

RNG = np.random.default_rng(7)
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")


def _clip(x, lo, hi):
    return float(np.clip(x, lo, hi))


def _normal_state() -> dict:
    """A nominal plant snapshot with realistic noise."""
    return {
        "ch4": _clip(RNG.normal(800, 120), 350, 1400),
        "h2s": _clip(RNG.normal(1.5, 0.6), 0, 4),
        "o2": _clip(RNG.normal(20.8, 0.2), 20.2, 21.0),
        "temp": _clip(RNG.normal(34, 3), 20, 50),
        "pressure": _clip(RNG.normal(2.1, 0.2), 1.4, 3.0),
        "humidity": _clip(RNG.normal(55, 8), 30, 85),
        "valve_temp": _clip(RNG.normal(38, 4), 25, 60),
        "valve_pos": _clip(RNG.normal(12, 6), 0, 100),
        "pump_vibration": _clip(RNG.normal(2.4, 0.5), 1.0, 5.0),
        "pump_temp": _clip(RNG.normal(47, 5), 35, 70),
        "pump_load": _clip(RNG.normal(64, 10), 30, 95),
        "maint_overdue_days": float(RNG.integers(0, 3)),
        "hot_work": 0.0, "confined_active": float(RNG.random() < 0.3),
        "electrical_active": float(RNG.random() < 0.15),
        "worker_density": _clip(RNG.normal(0.34, 0.1), 0, 1),
        "workers_near_valve": float(RNG.integers(0, 2)),
        "workers_in_confined": 0.0,
        "ppe_violations": float(RNG.random() < 0.15),
        "unauthorized": 0.0, "smoke": 0.0, "fire": 0.0,
        "is_night": float(RNG.random() < 0.5),
        "duty_hours": _clip(RNG.normal(8.5, 1.5), 4, 12),
        "fatigue": _clip(RNG.normal(0.35, 0.12), 0.05, 0.95),
    }


def _inject(state: dict, scenario: str) -> dict:
    """Push a normal state toward a hazardous compound condition."""
    if scenario == "fire":
        state["ch4"] = _clip(RNG.normal(6000, 2000), 1500, 12000)
        state["hot_work"] = 1.0
        state["valve_temp"] = _clip(RNG.normal(90, 18), 55, 130)
        state["workers_near_valve"] = float(RNG.integers(1, 4))
    elif scenario == "toxic":
        state["h2s"] = _clip(RNG.normal(12, 5), 4, 25)
        state["o2"] = _clip(RNG.normal(18.5, 1.2), 15.5, 20.4)
        state["confined_active"] = 1.0
        state["workers_in_confined"] = float(RNG.integers(1, 3))
    elif scenario == "equipment":
        state["pump_vibration"] = _clip(RNG.normal(8.5, 2.0), 5.0, 13)
        state["pump_temp"] = _clip(RNG.normal(85, 10), 65, 110)
        state["maint_overdue_days"] = float(RNG.integers(8, 25))
        state["pump_load"] = _clip(RNG.normal(88, 6), 70, 100)
    elif scenario == "human":
        state["is_night"] = 1.0
        state["duty_hours"] = _clip(RNG.normal(10.8, 0.8), 9.5, 12)
        state["fatigue"] = _clip(RNG.normal(0.78, 0.1), 0.55, 0.98)
        state["ppe_violations"] = float(RNG.integers(1, 4))
    return state


def _label(s: dict) -> dict:
    """Ground-truth risk scores (0-100) with explicit synergy + noise.

    Each risk is a weighted blend of normalized drivers, then amplified when
    multiple drivers co-occur. This non-linear amplification is what the model
    must learn — no single driver alone produces a high score.
    """
    n = lambda v, lo, hi: _clip((v - lo) / (hi - lo), 0, 1)

    fire_drivers = [n(s["ch4"], 800, 9000), s["hot_work"],
                    n(s["valve_temp"], 35, 120), n(s["workers_near_valve"], 0, 3)]
    toxic_drivers = [n(s["h2s"], 2, 20), n(20.9 - s["o2"], 0, 4.9),
                     n(s["workers_in_confined"], 0, 2), s["confined_active"]]
    equip_drivers = [n(s["pump_vibration"], 2.5, 12), n(s["pump_temp"], 50, 105),
                     n(s["maint_overdue_days"], 0, 21), n(s["pump_load"], 60, 100)]
    human_drivers = [n(s["duty_hours"], 8, 12), s["fatigue"],
                     s["is_night"] * 0.6, n(s["ppe_violations"], 0, 3)]

    def score(drivers, weights):
        base = float(np.dot(drivers, weights))
        active = sum(1 for d in drivers if d > 0.4)
        synergy = 1.34 if active >= 3 else (1.13 if active == 2 else 1.0)
        return _clip(base * 100 * synergy + RNG.normal(0, 4), 0, 100)

    fire = score(fire_drivers, [0.34, 0.24, 0.26, 0.16])
    toxic = score(toxic_drivers, [0.4, 0.34, 0.16, 0.10])
    equip = score(equip_drivers, [0.34, 0.26, 0.22, 0.18])
    human = score(human_drivers, [0.30, 0.34, 0.16, 0.20])
    # explosion ~ fire conditioned on confinement/pressure
    explosion = _clip(fire * (0.7 + 0.3 * n(s["pressure"], 1.4, 3.0)), 0, 100)
    return {"fire": fire, "explosion": explosion, "toxic": toxic,
            "equipment": equip, "human_error": human}


def generate_tabular(n: int = 20000) -> pd.DataFrame:
    rows = []
    scenarios = [None, None, None, "fire", "toxic", "equipment", "human"]
    for _ in range(n):
        s = _normal_state()
        sc = RNG.choice(scenarios)
        if sc:
            s = _inject(s, sc)
        s["active_permit_count"] = s["hot_work"] + s["confined_active"] + s["electrical_active"]
        labels = _label(s)
        rows.append({**{k: s[k] for k in FEATURE_ORDER}, **labels})
    return pd.DataFrame(rows)


def generate_sequences(n_series: int = 4000, seq_len: int = 20, horizon: int = 5):
    """Sequences for the LSTM gas forecaster.

    X: (n, seq_len, 4) -> [ch4, valve_temp, pressure, temp]
    y: (n,)            -> ch4 delta `horizon` steps ahead (ppm), the value to predict
    """
    X, y = [], []
    for _ in range(n_series):
        base = RNG.normal(800, 120)
        series = []
        level = base
        ramp = RNG.random() < 0.35  # a third of series contain a developing leak
        rate = RNG.uniform(40, 220) if ramp else 0
        for t in range(seq_len + horizon):
            level = max(300, level + rate + RNG.normal(0, 35))
            vt = _clip(38 + (level - 800) * 0.004 + RNG.normal(0, 2), 25, 130)
            series.append([level, vt, _clip(RNG.normal(2.1, 0.15), 1.4, 3), _clip(RNG.normal(34, 2), 20, 50)])
        series = np.array(series, dtype=np.float32)
        X.append(series[:seq_len])
        y.append(float(series[seq_len + horizon - 1, 0] - series[seq_len - 1, 0]))
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    df = generate_tabular()
    p = os.path.join(DATA_DIR, "tabular.csv")
    df.to_csv(p, index=False)
    print(f"wrote {p}  shape={df.shape}")
    X, yv = generate_sequences()
    sp = os.path.join(DATA_DIR, "sequences.npz")
    np.savez_compressed(sp, X=X, y=yv)
    print(f"wrote {sp}  X={X.shape} y={yv.shape}")


if __name__ == "__main__":
    main()
