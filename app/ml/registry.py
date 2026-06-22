"""Lazy singletons for the ML models so they load once per process."""
from __future__ import annotations
from functools import lru_cache

from app.ml.risk_model import RiskModel
from app.ml.anomaly_model import AnomalyModel
from app.ml.forecaster import Forecaster


@lru_cache(maxsize=1)
def risk_model() -> RiskModel:
    return RiskModel()


@lru_cache(maxsize=1)
def anomaly_model() -> AnomalyModel:
    return AnomalyModel()


@lru_cache(maxsize=1)
def forecaster() -> Forecaster:
    return Forecaster()


def status() -> dict:
    return {"risk_trained": risk_model().ready,
            "anomaly_trained": anomaly_model().ready,
            "forecaster_trained": forecaster().ready}
